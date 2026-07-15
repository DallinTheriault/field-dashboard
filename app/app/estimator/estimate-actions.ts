"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWriter } from "@/lib/estimator/auth";
import {
  jobStatusAfterEstimateCreated,
  jobStatusAfterEstimateAccepted,
} from "@/lib/estimator/job-status";
import { getEstimatorBundle } from "@/lib/estimator/queries";
import {
  buildSavePayload,
  priceEstimate,
  type RawLine,
} from "@/lib/estimator/assemble";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type SaveEstimateInput = {
  estimateId?: number | null;
  /** Estimates always belong to a job — there is no standalone path. */
  jobId: number;
  billingEntityId: number | null;
  travelZoneId: number | null;
  notes: string;
  overridePrice: number | null;
  overrideReason: string;
  rawLines: RawLine[];
};

function sanitizeLines(rawLines: RawLine[]): RawLine[] | string {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return "Add at least one line item.";
  }
  const clean: RawLine[] = [];
  for (const l of rawLines) {
    const description = (l.description ?? "").trim();
    const qty = Number(l.qty);
    if (!description) return "Every line needs a description.";
    if (!Number.isFinite(qty) || qty <= 0) {
      return `"${description}": quantity must be > 0.`;
    }

    if (l.isHardware) {
      const price = Number(l.unitPrice);
      if (!Number.isFinite(price) || price < 0) {
        return `"${description}": unit price must be 0 or more.`;
      }
      clean.push({
        key: String(l.key ?? clean.length),
        serviceId: null,
        description,
        type: "TASK",
        qty,
        unit: null,
        hoursPerUnit: null,
        prepModifierId: null,
        isHardware: true,
        sku: l.sku ? String(l.sku).trim() : null,
        unitPrice: price,
        hardwareMarkup: !!l.hardwareMarkup,
      });
      continue;
    }

    if (!l.serviceId) {
      const hrs = Number(l.hoursPerUnit);
      if (!Number.isFinite(hrs) || hrs <= 0) {
        return `"${description}": labor hours must be > 0.`;
      }
    }
    clean.push({
      key: String(l.key ?? clean.length),
      serviceId: l.serviceId ? Number(l.serviceId) : null,
      description,
      type: l.type === "MEASURED" ? "MEASURED" : "TASK",
      qty,
      unit: l.unit ? String(l.unit) : null,
      hoursPerUnit: l.hoursPerUnit === null ? null : Number(l.hoursPerUnit),
      prepModifierId: l.prepModifierId ? Number(l.prepModifierId) : null,
      isHardware: false,
    });
  }
  return clean;
}

/**
 * Save (or re-save) an estimate. Raw inputs are re-priced HERE with the
 * ported engine — client-side totals are display-only. The snapshot write
 * is one transaction via the estimator_save_estimate RPC (RLS-enforced).
 */
export async function saveEstimate(
  input: SaveEstimateInput,
): Promise<Result<{ estimateId: number; jobId: number }>> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, clientId } = auth;

  const lines = sanitizeLines(input.rawLines);
  if (typeof lines === "string") return { ok: false, error: lines };

  const overridePrice =
    input.overridePrice === null || input.overridePrice === undefined
      ? null
      : Number(input.overridePrice);
  const overrideReason = (input.overrideReason ?? "").trim();
  if (overridePrice !== null) {
    if (!Number.isFinite(overridePrice) || overridePrice <= 0) {
      return { ok: false, error: "Override price must be > 0." };
    }
    if (!overrideReason) {
      return { ok: false, error: "A manual override requires a reason." };
    }
  }

  // Jobs are the root object: an estimate cannot exist without one.
  const jobId = Number(input.jobId);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return { ok: false, error: "An estimate needs a job — open the job and start from there." };
  }
  // RLS check: the job must be visible to this user.
  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { ok: false, error: "Job not found." };

  // Authoritative pricing from tenant settings.
  const bundle = await getEstimatorBundle(supabase);
  if (!bundle.settings) {
    return {
      ok: false,
      error: "Set up pricing settings (pay, hours, margin) before estimating.",
    };
  }
  for (const l of lines) {
    if (l.serviceId && !bundle.services.some((s) => s.id === l.serviceId)) {
      return { ok: false, error: `Unknown catalog service on "${l.description}".` };
    }
  }
  if (
    input.travelZoneId &&
    !bundle.zones.some((z) => z.id === Number(input.travelZoneId))
  ) {
    return { ok: false, error: "Unknown travel zone." };
  }
  if (
    input.billingEntityId &&
    !bundle.entities.some((e) => e.id === Number(input.billingEntityId))
  ) {
    return { ok: false, error: "Unknown billing entity." };
  }

  const priced = priceEstimate(
    lines,
    input.travelZoneId ? Number(input.travelZoneId) : null,
    bundle,
  );
  const payload = buildSavePayload({
    estimateId: input.estimateId ?? null,
    clientId,
    jobId,
    billingEntityId: input.billingEntityId ? Number(input.billingEntityId) : null,
    travelZoneId: input.travelZoneId ? Number(input.travelZoneId) : null,
    notes: (input.notes ?? "").trim() || null,
    overridePrice,
    overrideReason: overridePrice !== null ? overrideReason : null,
    rawLines: lines,
    priced,
  });

  const { data: estimateId, error } = await supabase.rpc(
    "estimator_save_estimate",
    { p: payload },
  );
  if (error || !estimateId) {
    return { ok: false, error: error?.message ?? "Save failed." };
  }

  await syncJobAfterEstimate(
    supabase,
    jobId,
    priced.result.price,
    overridePrice,
    input.estimateId == null, // status moves only when an estimate is CREATED
  );

  revalidatePath("/app/estimator");
  revalidatePath(`/app/jobs/${jobId}`);
  return { ok: true, data: { estimateId: Number(estimateId), jobId } };
}

/** Derive the job pipeline from the estimate (decision §6.3-2, light touch). */
async function syncJobAfterEstimate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: number,
  computedPrice: number,
  overridePrice: number | null,
  isNewEstimate: boolean,
) {
  const charge = overridePrice ?? computedPrice;
  const { data: job } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  const update: Record<string, unknown> = {
    quoted_price: Math.round(charge * 100), // jobs.quoted_price is cents
  };
  if (isNewEstimate && job) {
    const next = jobStatusAfterEstimateCreated(job.status);
    if (next) update.status = next;
  }
  await supabase.from("jobs").update(update).eq("id", jobId);
}

const ESTIMATE_STATUSES = ["draft", "sent", "accepted", "lost"] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export async function setEstimateStatus(
  estimateId: number,
  status: EstimateStatus,
): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  if (!ESTIMATE_STATUSES.includes(status)) {
    return { ok: false, error: "Invalid status." };
  }
  const stamp: Record<string, string> = {};
  if (status === "sent") stamp.sent_at = new Date().toISOString();
  if (status === "accepted") stamp.accepted_at = new Date().toISOString();
  if (status === "lost") stamp.lost_at = new Date().toISOString();

  const { error } = await supabase
    .from("estimates")
    .update({ status, ...stamp })
    .eq("id", estimateId);
  if (error) return { ok: false, error: error.message };

  // Acceptance rolls the job forward (lead/estimated → accepted, only).
  // Best-effort like syncJobAfterEstimate: the estimate update is the
  // primary action and never fails on the job sync.
  if (status === "accepted") {
    const { data: est } = await supabase
      .from("estimates")
      .select("job_id, jobs(status)")
      .eq("id", estimateId)
      .maybeSingle();
    const job = est?.jobs as unknown as { status: string } | null;
    const next = job ? jobStatusAfterEstimateAccepted(job.status) : null;
    if (next && est) {
      await supabase.from("jobs").update({ status: next }).eq("id", est.job_id);
    }
    if (est) revalidatePath(`/app/jobs/${est.job_id}`);
  }

  revalidatePath("/app/estimator");
  revalidatePath(`/app/estimator/${estimateId}`);
  return { ok: true };
}

/**
 * "Reprice at current settings" — the ONLY sanctioned re-snapshot outside
 * editing. Rebuilds raw inputs from the stored line items, re-prices with
 * today's settings, and rewrites the frozen snapshot in one transaction.
 */
export async function repriceEstimate(estimateId: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, clientId } = auth;

  const [{ data: est }, { data: lineRows }] = await Promise.all([
    supabase
      .from("estimates")
      .select(
        "id, job_id, billing_entity_id, travel_zone_id, notes, manual_override_price, override_reason",
      )
      .eq("id", estimateId)
      .maybeSingle(),
    supabase
      .from("estimate_line_items")
      .select(
        "service_id, description, type, qty, unit, prep_modifier_id, resolved_hours_per_unit, sort_order, is_hardware, sku, resolved_unit_price, hardware_markup",
      )
      .eq("estimate_id", estimateId)
      .order("sort_order"),
  ]);
  if (!est) return { ok: false, error: "Estimate not found." };

  const rawLines: RawLine[] = (lineRows ?? []).map((r, i) =>
    r.is_hardware
      ? {
          key: String(i),
          serviceId: null,
          description: r.description,
          type: "TASK",
          qty: Number(r.qty),
          unit: null,
          hoursPerUnit: null,
          prepModifierId: null,
          isHardware: true,
          sku: r.sku,
          unitPrice:
            r.resolved_unit_price === null ? 0 : Number(r.resolved_unit_price),
          hardwareMarkup: !!r.hardware_markup,
        }
      : {
          key: String(i),
          serviceId: r.service_id,
          description: r.description,
          type: r.type as RawLine["type"],
          qty: Number(r.qty),
          unit: r.unit,
          hoursPerUnit:
            r.service_id === null
              ? r.resolved_hours_per_unit === null
                ? null
                : Number(r.resolved_hours_per_unit)
              : null,
          prepModifierId: r.prep_modifier_id,
          isHardware: false,
        },
  );

  const bundle = await getEstimatorBundle(supabase);
  if (!bundle.settings) {
    return { ok: false, error: "Pricing settings are missing." };
  }
  // A catalog line whose service was deleted reprices as ad-hoc using its
  // frozen hours — flag it instead of silently changing meaning.
  for (const l of rawLines) {
    if (l.serviceId && !bundle.services.some((s) => s.id === l.serviceId)) {
      return {
        ok: false,
        error: `"${l.description}" references a deleted catalog service — edit the estimate instead.`,
      };
    }
  }

  const overridePrice =
    est.manual_override_price === null ? null : Number(est.manual_override_price);
  const priced = priceEstimate(rawLines, est.travel_zone_id, bundle);
  const payload = buildSavePayload({
    estimateId,
    clientId,
    jobId: est.job_id,
    billingEntityId: est.billing_entity_id,
    travelZoneId: est.travel_zone_id,
    notes: est.notes,
    overridePrice,
    overrideReason: est.override_reason,
    rawLines,
    priced,
  });

  const { error } = await supabase.rpc("estimator_save_estimate", { p: payload });
  if (error) return { ok: false, error: error.message };

  // Reprice touches an existing estimate — quoted_price refreshes, status doesn't.
  await syncJobAfterEstimate(supabase, est.job_id, priced.result.price, overridePrice, false);
  revalidatePath("/app/estimator");
  revalidatePath(`/app/estimator/${estimateId}`);
  return { ok: true };
}

export async function deleteEstimate(estimateId: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const { data: est } = await supabase
    .from("estimates")
    .select("id, status")
    .eq("id", estimateId)
    .maybeSingle();
  if (!est) return { ok: false, error: "Estimate not found." };
  if (est.status !== "draft") {
    return { ok: false, error: "Only draft estimates can be deleted." };
  }
  const { error } = await supabase.from("estimates").delete().eq("id", estimateId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/estimator");
  return { ok: true };
}
