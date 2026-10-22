"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter, type WriterAuth } from "@/lib/estimator/auth";
import {
  buildExtraInvoiceRows,
  withoutExtraRows,
  type ExtraItem,
  type InvoiceRow,
} from "@/lib/estimator/expenses";
import { getEstimatorStripe, STRIPE_NOT_CONFIGURED } from "@/lib/estimator/stripe";
import {
  applyMinimum,
  claimsOf,
  coveredRow,
  hasMinimum,
  invoiceTotals,
  laborRow,
  minimumRows,
  needingPrice,
  pickBillingEntity,
  readyToBill,
  taskRow,
  type DraftTask,
} from "@/lib/invoices/job-draft";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; code?: string };
type Supabase = Extract<WriterAuth, { ok: true }>["supabase"];

/**
 * Invoicing from the job (billing slice 3). No estimate needed: a draft is
 * the job's done, billable lines plus its uninvoiced extras. The database
 * claims every line a draft carries (invoice_create_from_job /
 * invoice_set_draft), finalizes them once the invoice goes out, and releases
 * them on void or delete — so a line can't be billed twice.
 *
 * "Sending" happens on the phone's share sheet, not by email: the client
 * shares the PDF (and receipt photos), then confirms with markInvoiceSent.
 */

const TASK_COLS = "id, title, status, sort_order, qty, unit, unit_price, billable, invoice_id";

function toDraftTask(r: Record<string, unknown>): DraftTask {
  return {
    id: r.id as number,
    title: r.title as string,
    status: r.status as "open" | "done",
    sort_order: r.sort_order as number,
    qty: Number(r.qty),
    unit: (r.unit as DraftTask["unit"]) ?? null,
    unit_price: r.unit_price === null ? null : Number(r.unit_price),
    billable: r.billable as boolean,
    invoice_id: (r.invoice_id as number | null) ?? null,
  };
}

async function jobTasks(supabase: Supabase, jobId: number): Promise<DraftTask[]> {
  const { data } = await supabase.from("tasks").select(TASK_COLS).eq("job_id", jobId);
  return (data ?? []).map(toDraftTask);
}

/**
 * A job's extras with the receipt's tax data: its uninvoiced ones, or the
 * given ids whatever their invoice state (the claim RPCs verify availability).
 */
async function loadExtras(supabase: Supabase, jobId: number, ids?: number[]): Promise<ExtraItem[]> {
  if (ids && ids.length === 0) return [];
  let q = supabase
    .from("expenses")
    .select("id, description, qty, unit_price, amount, bill_markup, purchases(tax, subtotal)")
    .eq("job_id", jobId)
    .eq("assignment", "job_extra")
    .order("id");
  q = ids ? q.in("id", ids) : q.is("invoiced_on", null);
  const { data } = await q;
  return (data ?? []).map((it) => {
    const purchase = it.purchases as unknown as { tax: number | string | null; subtotal: number | string | null } | null;
    return {
      id: it.id,
      description: it.description,
      qty: it.qty === null ? null : Number(it.qty),
      unit_price: it.unit_price === null ? null : Number(it.unit_price),
      amount: Number(it.amount),
      purchaseTax: purchase?.tax == null ? null : Number(purchase.tax),
      purchaseSubtotal: purchase?.subtotal == null ? null : Number(purchase.subtotal),
      billMarkup: it.bill_markup as boolean,
    };
  });
}

async function markupPct(supabase: Supabase): Promise<number> {
  const { data } = await supabase.from("pricing_settings").select("material_markup_pct").maybeSingle();
  return Number(data?.material_markup_pct ?? 0);
}

async function pricing(supabase: Supabase) {
  const { data } = await supabase
    .from("pricing_settings")
    .select("material_markup_pct, default_hourly_rate, skilled_hourly_rate, minimum_job_charge")
    .maybeSingle();
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    markup: Number(data?.material_markup_pct ?? 0),
    generalRate: num(data?.default_hourly_rate),
    skilledRate: num(data?.skilled_hourly_rate),
    minimum: Number(data?.minimum_job_charge ?? 0),
  };
}

/** Logged hours on the job that no invoice has billed or covered. */
async function unbilledHours(supabase: Supabase, jobId: number) {
  const { data } = await supabase
    .from("time_entries")
    .select("id, hours")
    .eq("job_id", jobId)
    .is("invoice_id", null)
    .is("covered_at", null)
    .order("id");
  return (data ?? []).map((h) => ({ id: Number(h.id), hours: Number(h.hours) }));
}

/** Receipt lines on the job no invoice has claimed: bill-to-customer and included-in-my-price. */
async function unbilledParts(supabase: Supabase, jobId: number) {
  const { data } = await supabase
    .from("expenses")
    .select("id, description, qty, assignment")
    .eq("job_id", jobId)
    .in("assignment", ["job_extra", "job_in_bid"])
    .is("invoiced_on", null)
    .order("id");
  return (data ?? []).map((e) => ({
    id: Number(e.id),
    description: String(e.description),
    qty: e.qty === null ? null : Number(e.qty),
    assignment: e.assignment as "job_extra" | "job_in_bid",
  }));
}

/**
 * What the builder decided. Itemized: the job's ready lines, the logged hours
 * (when billed) as one labor line, and the ticked receipt lines at cost.
 * Minimum: every work line and part at $0.00 plus the minimum charge.
 * Typed lines become done work lines on the job first.
 */
export type InvoicePlan = {
  mode: "itemized" | "minimum";
  billHours: boolean;
  skilled: boolean;
  /** Receipt lines to bill (itemized): ticked ones. The rest count as included in the price. */
  billPartIds: number[];
  typedLines: string[];
};

function needsPriceError(tasks: DraftTask[], invoiceId: number | null): string | null {
  const waiting = needingPrice(tasks, invoiceId);
  if (waiting.length === 0) return null;
  return `Still needs a price: ${waiting.map((t) => `"${t.title}"`).join(", ")}. Price it on the job or mark it not billable.`;
}

/**
 * Create a draft invoice from the job. Without a plan: its ready lines and
 * uninvoiced extras (as before). With one: as the builder decided.
 */
export async function createInvoiceFromJob(
  jobId: number,
  opts: { billingEntityId?: number | null; taxRatePct?: number; dueTerms?: string; plan?: InvoicePlan } = {},
): Promise<Result<{ invoiceId: number; invoiceNumber: string }>> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, clientId } = auth;

  const taxRatePct = Number(opts.taxRatePct ?? 0);
  if (!Number.isFinite(taxRatePct) || taxRatePct < 0 || taxRatePct > 30) {
    return { ok: false, error: "Tax rate must be between 0 and 30%." };
  }

  const plan = opts.plan;
  const typed = (plan?.typedLines ?? []).map((l) => String(l ?? "").trim()).filter(Boolean);
  if (typed.length > 20 || typed.some((l) => l.length > 200)) {
    return { ok: false, error: "Keep typed lines to 20, each under 200 characters." };
  }

  const [{ data: job }, { data: estimates }, { data: entities }, price] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, name, email, phone, status, contact_id, bill_to_contact_id, property_id, billing_entity_id")
      .eq("id", jobId)
      .maybeSingle(),
    supabase.from("estimates").select("billing_entity_id").eq("job_id", jobId).order("version", { ascending: false }),
    supabase.from("billing_entities").select("id, is_default, active"),
    pricing(supabase),
  ]);
  if (!job) return { ok: false, error: "Job not found." };
  if (plan?.mode === "minimum" && !(price.minimum > 0)) {
    return { ok: false, error: "Set your minimum job charge in Business › Pricing first." };
  }

  const active = (entities ?? []) as Array<{ id: number; is_default: boolean; active: boolean }>;
  const entityId =
    opts.billingEntityId != null
      ? active.find((e) => e.id === opts.billingEntityId && e.active)?.id ?? null
      : pickBillingEntity(
          (job.billing_entity_id as number | null) ?? null,
          (estimates ?? []).map((e) => (e.billing_entity_id as number | null) ?? null),
          active,
        );
  if (!entityId) {
    return { ok: false, error: "Add a billing entity in Business › Pricing before invoicing." };
  }

  // Bill-to: the job's explicit bill-to, else its contact, else the
  // property's contact; else just the name captured on the job.
  let billToId = (job.bill_to_contact_id as number | null) ?? (job.contact_id as number | null) ?? null;
  if (!billToId && job.property_id) {
    const { data: prop } = await supabase.from("properties").select("contact_id").eq("id", job.property_id).maybeSingle();
    billToId = (prop?.contact_id as number | null) ?? null;
  }
  let billTo = {
    name: (job.name as string | null) ?? "Customer",
    email: (job.email as string | null) ?? null,
    phone: (job.phone as string | null) ?? null,
    company: null as string | null,
  };
  if (billToId) {
    const { data: c } = await supabase.from("contacts").select("name, email, phone, company").eq("id", billToId).maybeSingle();
    if (c) {
      billTo = {
        name: c.name ?? billTo.name,
        email: c.email ?? billTo.email,
        phone: c.phone ?? billTo.phone,
        company: c.company ?? null,
      };
    } else {
      billToId = null;
    }
  }

  // Typed lines become done work lines on the job ($0.00, billable), so the
  // draft claims them like any other line.
  const typedIds: number[] = [];
  if (typed.length > 0) {
    const { data: last } = await supabase
      .from("tasks")
      .select("sort_order")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: false })
      .limit(1);
    const start = Number(last?.[0]?.sort_order ?? 0) + 1;
    const { data: made, error: tErr } = await supabase
      .from("tasks")
      .insert(
        typed.map((title, i) => ({
          client_id: clientId,
          job_id: jobId,
          title,
          status: "done",
          sort_order: start + i,
          qty: 1,
          unit: "each",
          unit_price: 0,
          billable: true,
        })),
      )
      .select("id");
    if (tErr) return { ok: false, error: tErr.message };
    typedIds.push(...(made ?? []).map((t) => Number(t.id)));
  }

  // Receipt lines: ticked ones are billed to the customer, unticked ones are
  // included in the price, and the receipt records follow what the invoice does.
  const switched: Array<{ id: number; from: "job_extra" | "job_in_bid" }> = [];
  const undo = async () => {
    if (typedIds.length) await supabase.from("tasks").delete().in("id", typedIds);
    for (const s of switched) await supabase.from("expenses").update({ assignment: s.from }).eq("id", s.id);
  };
  const parts = await unbilledParts(supabase, jobId);
  if (plan && plan.mode === "itemized") {
    const bill = new Set((plan.billPartIds ?? []).filter(Number.isInteger));
    for (const p of parts) {
      const want = bill.has(p.id) ? "job_extra" : "job_in_bid";
      if (want === p.assignment) continue;
      const { error: aErr } = await supabase.from("expenses").update({ assignment: want }).eq("id", p.id).is("invoiced_on", null);
      if (aErr) {
        await undo();
        return { ok: false, error: aErr.message };
      }
      switched.push({ id: p.id, from: p.assignment });
      p.assignment = want;
    }
  }

  const [tasks, hours, extras] = await Promise.all([
    jobTasks(supabase, jobId),
    unbilledHours(supabase, jobId),
    loadExtras(supabase, jobId),
  ]);
  const work = readyToBill(tasks, job.status === "completed");
  let rows: InvoiceRow[];
  if (plan?.mode === "minimum") {
    rows = minimumRows({
      work,
      billToCustomer: extras,
      included: parts.filter((p) => p.assignment === "job_in_bid"),
      hourIds: hours.map((h) => h.id),
      minimum: price.minimum,
    });
  } else {
    const rate = plan?.skilled ? price.skilledRate : price.generalRate;
    const labor = plan?.billHours ? laborRow(hours, rate ?? 0, !!plan.skilled) : null;
    if (plan?.billHours && hours.length > 0 && !labor) {
      await undo();
      return { ok: false, error: `Set your ${plan.skilled ? "skilled" : "general"} hourly rate in Business › Pricing first.` };
    }
    rows = [...work.map(taskRow), ...(labor ? [labor] : []), ...buildExtraInvoiceRows(extras, price.markup).rows];
  }
  const totals = invoiceTotals(rows, taxRatePct);

  // The RPC claims exactly the lines, extras and hours the rows carry.
  const { data, error } = await supabase.rpc("invoice_create_from_job", {
    p: {
      client_id: clientId,
      job_id: jobId,
      estimate_id: null,
      billing_entity_id: entityId,
      bill_to_contact_id: billToId,
      customer_name: billTo.name,
      customer_email: billTo.email,
      customer_phone: billTo.phone,
      customer_company: billTo.company,
      line_items: rows,
      subtotal_cents: totals.subtotalCents,
      tax_rate_pct: taxRatePct,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
      due_terms: (opts.dueTerms ?? "").trim() || "Due on receipt",
    },
  });
  if (error || !data) {
    await undo();
    return { ok: false, error: error?.message ?? "Invoice creation failed." };
  }

  // The job remembers its letterhead for next time.
  if (job.billing_entity_id !== entityId) {
    await supabase.from("jobs").update({ billing_entity_id: entityId }).eq("id", jobId);
  }

  revalidatePath("/app/estimator/invoices");
  const created = data as { invoice_id: number; invoice_number: string };
  return { ok: true, data: { invoiceId: Number(created.invoice_id), invoiceNumber: created.invoice_number } };
}

/** Replace a draft's rows; lines dropped are released, lines added claimed. */
async function setDraft(supabase: Supabase, invoiceId: number, rows: InvoiceRow[], taxRatePct: number): Promise<Result> {
  const totals = invoiceTotals(rows, taxRatePct);
  const { error } = await supabase.rpc("invoice_set_draft", {
    p: {
      invoice_id: invoiceId,
      line_items: rows,
      subtotal_cents: totals.subtotalCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
    },
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/app/estimator/invoices/${invoiceId}`);
  return { ok: true };
}

async function draftInvoice(supabase: Supabase, invoiceId: number) {
  const { data: inv } = await supabase
    .from("invoices")
    .select("id, job_id, status, stripe_invoice_id, tax_rate_pct, line_items")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { error: "Invoice not found." } as const;
  if (inv.status !== "draft" || inv.stripe_invoice_id) {
    return { error: "Only draft invoices can be edited; this one went out." } as const;
  }
  return { inv } as const;
}

/**
 * Edit a draft's rows in place. Amounts and descriptions change on the
 * invoice only, never on the job; removing a row that came from a job line
 * or extra releases it so a later invoice can bill it.
 */
export async function updateDraftInvoiceRows(
  invoiceId: number,
  rows: Array<
    Pick<InvoiceRow, "task_id" | "extra_expense_id" | "time_entry_ids" | "rate" | "kind" | "covered"> & {
      description: string;
      qtyLabel?: string | null;
      amount: number;
    }
  >,
): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const d = await draftInvoice(auth.supabase, invoiceId);
  if ("error" in d) return { ok: false, error: d.error as string };

  if (!Array.isArray(rows)) return { ok: false, error: "Bad lines." };
  const clean: InvoiceRow[] = [];
  for (const r of rows) {
    const description = (r.description ?? "").trim();
    const amount = Number(r.amount);
    if (!description) return { ok: false, error: "Every line needs a description." };
    if (!Number.isFinite(amount)) return { ok: false, error: `"${description}": amount must be a number.` };
    clean.push({
      description,
      qtyLabel: r.qtyLabel ? String(r.qtyLabel) : null,
      amount: Math.round(amount * 100) / 100,
      ...(Number.isInteger(r.task_id) ? { task_id: Number(r.task_id) } : {}),
      ...(Number.isInteger(r.extra_expense_id) ? { extra_expense_id: Number(r.extra_expense_id) } : {}),
      ...(Array.isArray(r.time_entry_ids)
        ? { time_entry_ids: [...new Set(r.time_entry_ids.map(Number).filter(Number.isInteger))] }
        : {}),
      ...(Number.isFinite(Number(r.rate)) && Number(r.rate) > 0 ? { rate: Number(r.rate) } : {}),
      ...(r.kind === "labor" || r.kind === "minimum" ? { kind: r.kind } : {}),
      ...(r.covered === true ? { covered: true } : {}),
    });
  }
  return setDraft(auth.supabase, invoiceId, clean, Number(d.inv.tax_rate_pct ?? 0));
}

/**
 * "Add minimum trip charge": every other line on the draft goes to $0.00
 * (keeping what it claims) and the minimum from pricing settings is added.
 */
export async function applyMinimumCharge(invoiceId: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const d = await draftInvoice(auth.supabase, invoiceId);
  if ("error" in d) return { ok: false, error: d.error as string };
  const { minimum } = await pricing(auth.supabase);
  if (!(minimum > 0)) return { ok: false, error: "Set your minimum job charge in Business › Pricing first." };
  const rows = applyMinimum((d.inv.line_items ?? []) as InvoiceRow[], minimum);
  return setDraft(auth.supabase, invoiceId, rows, Number(d.inv.tax_rate_pct ?? 0));
}

/** Add job lines (done or not) and extras that aren't on any invoice yet. */
export async function addToDraftInvoice(
  invoiceId: number,
  add: { taskIds?: number[]; expenseIds?: number[] },
): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const d = await draftInvoice(supabase, invoiceId);
  if ("error" in d) return { ok: false, error: d.error as string };
  if (!d.inv.job_id) return { ok: false, error: "This invoice isn't tied to a job." };

  // A repeat tap finds the line already on this draft and adds nothing.
  const carried = claimsOf((d.inv.line_items ?? []) as InvoiceRow[]);
  const taskIds = (add.taskIds ?? []).filter((id) => Number.isInteger(id) && !carried.taskIds.includes(id));
  const expenseIds = (add.expenseIds ?? []).filter((id) => Number.isInteger(id) && !carried.expenseIds.includes(id));
  if (taskIds.length === 0 && expenseIds.length === 0) return { ok: true };
  const tasks = (await jobTasks(supabase, d.inv.job_id)).filter((t) => taskIds.includes(t.id));
  if (tasks.some((t) => t.invoice_id !== null || !t.billable)) {
    return { ok: false, error: "That line is already on an invoice or isn't billable." };
  }
  const unpriced = tasks.find((t) => t.unit_price === null);
  if (unpriced) return { ok: false, error: `"${unpriced.title}" needs a price first.` };
  const extras = await loadExtras(supabase, d.inv.job_id, expenseIds);

  // On a minimum invoice, what's added is covered by the minimum ($0.00).
  const current = (d.inv.line_items ?? []) as InvoiceRow[];
  const minimum = hasMinimum(current);
  const added = [
    ...tasks.sort((a, b) => a.sort_order - b.sort_order).map(taskRow),
    ...buildExtraInvoiceRows(extras, await markupPct(supabase)).rows,
  ].map((r) => (minimum ? coveredRow(r) : r));
  const rows: InvoiceRow[] = [
    ...current.filter((r) => r.kind !== "minimum"),
    ...added,
    ...current.filter((r) => r.kind === "minimum"),
  ];
  return setDraft(supabase, invoiceId, rows, Number(d.inv.tax_rate_pct ?? 0));
}

/**
 * Re-pull extras onto a draft: the ones it already carries are re-priced
 * (markup may have changed) and any new uninvoiced extras on the job join.
 */
export async function refreshDraftExtras(invoiceId: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const d = await draftInvoice(supabase, invoiceId);
  if ("error" in d) return { ok: false, error: d.error as string };
  if (!d.inv.job_id) return { ok: false, error: "This invoice isn't tied to a job." };

  const current = (d.inv.line_items ?? []) as InvoiceRow[];
  const carried = claimsOf(current).expenseIds;
  const [carriedNow, fresh] = await Promise.all([
    // Ones it carries that are still extras on this job (reassigned or
    // deleted items drop off), plus new uninvoiced ones.
    loadExtras(supabase, d.inv.job_id, carried),
    loadExtras(supabase, d.inv.job_id),
  ]);
  const extras = [...carriedNow, ...fresh.filter((f) => !carried.includes(f.id))];
  // Extras the minimum covers stay at $0.00 (and on a minimum invoice, so do new ones).
  const minimum = hasMinimum(current);
  const covered = new Set(current.filter((r) => r.covered).map((r) => r.extra_expense_id));
  const rebuilt = buildExtraInvoiceRows(extras, await markupPct(supabase)).rows.map((r) =>
    minimum || covered.has(r.extra_expense_id) ? coveredRow(r) : r,
  );
  const rest = withoutExtraRows(current);
  const rows = [...rest.filter((r) => r.kind !== "minimum"), ...rebuilt, ...rest.filter((r) => r.kind === "minimum")];
  return setDraft(supabase, invoiceId, rows, Number(d.inv.tax_rate_pct ?? 0));
}

/**
 * Turn on the card payment link: issue the invoice through Stripe (finalized,
 * not emailed; the link goes out in the share text). This is the point of no
 * return: a Stripe-issued invoice is final, and changing it means voiding it.
 * Stripe needs an email; one typed here is saved to the bill-to contact.
 */
export async function createCardPayLink(
  invoiceId: number,
  email?: string,
): Promise<Result<{ hostedUrl: string }>> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id, job_id, invoice_number, status, updated_at, bill_to_contact_id, customer_name, customer_email, customer_phone, line_items, tax_rate_pct, tax_cents, due_terms, stripe_invoice_id, stripe_hosted_invoice_url, billing_entities(name)",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status === "voided") return { ok: false, error: "This invoice was voided." };
  if (inv.stripe_invoice_id) return { ok: true, data: { hostedUrl: inv.stripe_hosted_invoice_url ?? "" } };
  if (inv.status !== "draft") return { ok: false, error: "This invoice already went out." };

  const rows = (inv.line_items ?? []) as InvoiceRow[];
  if (rows.length === 0) return { ok: false, error: "The invoice has no lines." };
  if (inv.job_id) {
    const blocked = needsPriceError(await jobTasks(supabase, inv.job_id), invoiceId);
    if (blocked) return { ok: false, error: blocked };
  }

  let customerEmail = inv.customer_email as string | null;
  // The Stripe result is saved only if the draft is still exactly this one.
  let readAt = inv.updated_at as string;
  if (!customerEmail) {
    const typed = (email ?? "").trim();
    if (!typed) {
      return { ok: false, code: "needs-email", error: "A card payment link needs the customer's email." };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) return { ok: false, error: "That email doesn't look right." };
    customerEmail = typed;
    const { data: withEmail } = await supabase
      .from("invoices")
      .update({ customer_email: typed })
      .eq("id", invoiceId)
      .eq("updated_at", readAt)
      .select("updated_at");
    if (!withEmail?.length) return { ok: false, error: "The invoice changed; reload it and try again." };
    readAt = withEmail[0].updated_at as string;
    if (inv.bill_to_contact_id) {
      await supabase.from("contacts").update({ email: typed }).eq("id", inv.bill_to_contact_id).is("email", null);
    }
  }

  const stripe = getEstimatorStripe();
  if (!stripe) return { ok: false, error: STRIPE_NOT_CONFIGURED };
  const entity = inv.billing_entities as unknown as { name: string } | null;

  let finalizedId: string | null = null;
  try {
    const customer = await stripe.customers.create({
      name: inv.customer_name,
      email: customerEmail,
      phone: inv.customer_phone ?? undefined,
      metadata: { field_invoice: inv.invoice_number ?? String(inv.id) },
    });
    const draft = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: 7,
      currency: "usd",
      description: `${entity?.name ?? ""} — ${inv.invoice_number}`.trim(),
      footer: inv.due_terms ?? undefined,
      metadata: { field_invoice_id: String(inv.id), field_invoice_number: inv.invoice_number ?? "" },
      auto_advance: false,
    });
    for (const row of rows) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: draft.id,
        amount: Math.round(row.amount * 100),
        currency: "usd",
        description: row.qtyLabel ? `${row.description} (${row.qtyLabel})` : row.description,
      });
    }
    if (Number(inv.tax_cents) > 0) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: draft.id,
        amount: Number(inv.tax_cents),
        currency: "usd",
        description: `Tax (${Number(inv.tax_rate_pct)}%)`,
      });
    }
    const finalized = await stripe.invoices.finalizeInvoice(draft.id!);
    finalizedId = finalized.id ?? null;
    const hostedUrl = finalized.hosted_invoice_url;
    if (!hostedUrl) {
      // Never share "with a card link" that has no link.
      await stripe.invoices.voidInvoice(finalized.id!).catch(() => undefined);
      return { ok: false, error: "Stripe didn't return a payment link. Nothing was sent; try again." };
    }

    // Only onto the draft exactly as read: a second tap, a delete or an edit
    // made while Stripe was working means Stripe billed something else.
    const { data: saved, error } = await supabase
      .from("invoices")
      .update({ stripe_invoice_id: finalized.id, stripe_hosted_invoice_url: hostedUrl })
      .eq("id", invoiceId)
      .eq("status", "draft")
      .is("stripe_invoice_id", null)
      .eq("updated_at", readAt)
      .select("id");
    if (error || !saved?.length) {
      // Don't leave a payable Stripe invoice behind for one we couldn't record.
      await stripe.invoices.voidInvoice(finalized.id!).catch(() => undefined);
      return {
        ok: false,
        error: error?.message ?? "The invoice changed while the card link was being made. Nothing was sent; reload and try again.",
      };
    }
    if (inv.bill_to_contact_id) {
      await supabase.from("contacts").update({ card_link_default: true }).eq("id", inv.bill_to_contact_id);
    }
    revalidatePath(`/app/estimator/invoices/${invoiceId}`);
    return { ok: true, data: { hostedUrl } };
  } catch (e) {
    if (finalizedId) await stripe.invoices.voidInvoice(finalizedId).catch(() => undefined);
    return { ok: false, error: e instanceof Error ? `Stripe: ${e.message}` : "Stripe call failed." };
  }
}

/**
 * Confirm the invoice went out (after the share sheet, or after sending the
 * PDF another way). It's final from here: its lines keep their price.
 */
export async function markInvoiceSent(invoiceId: number, opts: { cardLink: boolean }): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { data: inv } = await supabase
    .from("invoices")
    .select("id, job_id, status, bill_to_contact_id, line_items")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status === "voided") return { ok: false, error: "This invoice was voided." };
  if (inv.status !== "draft") return { ok: true };
  if (((inv.line_items ?? []) as InvoiceRow[]).length === 0) {
    return { ok: false, error: "The invoice has no lines." };
  }
  if (inv.job_id) {
    const blocked = needsPriceError(await jobTasks(supabase, inv.job_id), invoiceId);
    if (blocked) return { ok: false, error: blocked };
  }

  const { data: sent, error } = await supabase
    .from("invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!sent?.length) return { ok: false, error: "This invoice changed; reload it." };
  if (inv.bill_to_contact_id) {
    await supabase.from("contacts").update({ card_link_default: opts.cardLink }).eq("id", inv.bill_to_contact_id);
  }
  revalidatePath(`/app/estimator/invoices/${invoiceId}`);
  revalidatePath("/app/estimator/invoices");
  return { ok: true };
}

/**
 * Void an invoice that went out: its lines and extras become billable again.
 * A Stripe-issued invoice is voided in Stripe first so its pay link dies.
 */
export async function voidInvoice(invoiceId: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  // The void runs as server code, so check here what RLS would: the caller
  // can see the invoice AND write its tenant (a member can read invoices).
  const { data: inv } = await supabase
    .from("invoices")
    .select("id, client_id, status, stripe_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };
  const { data: canWrite } = await supabase.rpc("user_can_write_client", { target_client_id: inv.client_id });
  if (canWrite !== true) return { ok: false, error: "You don't have permission to do this." };
  // Before Stripe: voiding there can't be undone, and money already recorded
  // means this isn't voided (the database refuses too).
  const { count: paymentCount } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);
  if ((paymentCount ?? 0) > 0) {
    return { ok: false, error: "This invoice has payments recorded. Remove them first if they were a mistake." };
  }
  if (inv.status === "paid") return { ok: false, error: "A paid invoice can't be voided." };

  if (inv.stripe_invoice_id) {
    const stripe = getEstimatorStripe();
    if (!stripe) return { ok: false, error: STRIPE_NOT_CONFIGURED };
    try {
      const s = await stripe.invoices.retrieve(inv.stripe_invoice_id);
      if (s.status === "paid") return { ok: false, error: "Stripe shows this invoice paid; it can't be voided." };
      if (s.status === "open" || s.status === "uncollectible") await stripe.invoices.voidInvoice(inv.stripe_invoice_id);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? `Stripe: ${e.message}` : "Stripe call failed." };
    }
  }

  const { error } = await createAdminClient().rpc("invoice_void", { p_invoice_id: invoiceId });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/app/estimator/invoices/${invoiceId}`);
  revalidatePath("/app/estimator/invoices");
  return { ok: true };
}
