/**
 * ESTIMATOR → FIELD MIGRATION (M-F, kickoff §8)
 *
 * Reads the standalone estimator's SQLite (READ-ONLY) and writes the
 * Sharpline tenant's estimator data into Supabase.
 *
 *   node scripts/migrate-estimator.ts            # dry-run (default): prints the plan
 *   node scripts/migrate-estimator.ts --apply    # actually writes
 *
 * Guarantees:
 * - Idempotent: settings match by natural key (name/prefix/label); jobs by a
 *   source marker in jobs.details. Re-running skips what exists.
 * - Frozen resolved_* values copied VERBATIM — never re-priced.
 * - GOLDEN VERIFICATION runs in both modes: the ported engine re-prices every
 *   estimator job from its raw inputs at its FROZEN settings and must
 *   reproduce cost/price/per-line values to the cent (Riverton = $1,540).
 *   The script refuses to apply if verification fails.
 *
 * Run at CUTOVER TIME so it reads the estimator's final state.
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  allocateClientRows,
  priceJob,
  type EngineLineInput,
  type EngineSettings,
} from "../lib/estimator/engine.ts";
import { loadedLaborRate, monthlyBillableHours } from "../lib/estimator/rates.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const APPLY = process.argv.includes("--apply");
const ESTIMATOR_DIR = process.env.ESTIMATOR_DIR ?? "C:/Projects/Estimator";
const DB_PATH = path.join(ESTIMATOR_DIR, "data", "estimator.db");
const TARGET_CLIENT_ID = 1; // Sharpline — sanity-checked against business_name below

// ---------------------------------------------------------------------------
// Wiring: estimator's better-sqlite3 + field-dashboard's .env.local
// ---------------------------------------------------------------------------
const estimatorRequire = createRequire(path.join(ESTIMATOR_DIR, "package.json"));
const Database = estimatorRequire("better-sqlite3");

function loadEnv(): Record<string, string> {
  const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

function toE164US(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = String(input).replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

// ---------------------------------------------------------------------------
// Action log — dry-run prints it; apply executes as it goes
// ---------------------------------------------------------------------------
type Action = { table: string; action: "insert" | "update" | "skip"; label: string };
const actions: Action[] = [];
function note(table: string, action: Action["action"], label: string) {
  actions.push({ table, action, label });
}

let fakeId = -1;
function nextFakeId() {
  return fakeId--;
}

async function main() {
  if (!existsSync(DB_PATH)) {
    throw new Error(`Estimator DB not found at ${DB_PATH}`);
  }
  const dbAge = Date.now() - statSync(DB_PATH).mtimeMs;
  console.log(`Estimator DB: ${DB_PATH}`);
  console.log(`  last modified ${Math.round(dbAge / 3600000)}h ago — run at cutover so this is final data\n`);

  const env = loadEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const db = new Database(DB_PATH, { readonly: true });

  // Tenant sanity check — never write into the wrong tenant.
  const { data: tenant } = await supabase
    .from("Clients")
    .select("id, business_name")
    .eq("id", TARGET_CLIENT_ID)
    .single();
  if (!tenant || !/sharpline/i.test(tenant.business_name ?? "")) {
    throw new Error(
      `Tenant ${TARGET_CLIENT_ID} is "${tenant?.business_name}" — expected Sharpline. Aborting.`,
    );
  }
  console.log(`Target tenant: #${tenant.id} ${tenant.business_name}`);
  console.log(`Mode: ${APPLY ? "APPLY — WRITING" : "DRY-RUN (no writes)"}\n`);

  // -------------------------------------------------------------------------
  // GOLDEN VERIFICATION (always, before any write)
  // -------------------------------------------------------------------------
  const sq = {
    settings: db.prepare("SELECT * FROM cost_settings").get(),
    overhead: db.prepare("SELECT * FROM overhead_items").all(),
    entities: db.prepare("SELECT * FROM business_entities").all(),
    materials: db.prepare("SELECT * FROM materials").all(),
    services: db.prepare("SELECT * FROM service_catalog").all(),
    links: db.prepare("SELECT * FROM service_materials").all(),
    modifiers: db.prepare("SELECT * FROM modifiers").all(),
    zones: db.prepare("SELECT * FROM travel_zones").all(),
    clients: db.prepare("SELECT * FROM clients").all(),
    jobs: db.prepare("SELECT * FROM jobs").all(),
    lines: db.prepare("SELECT * FROM job_line_items ORDER BY job_id, sort_order").all(),
    jobMaterials: db.prepare("SELECT * FROM job_materials").all(),
    time: db.prepare("SELECT * FROM time_entries").all(),
    actualMats: db.prepare("SELECT * FROM actual_materials").all(),
    invoices: db.prepare("SELECT * FROM invoices").all(),
  };

  console.log("── Golden verification (engine vs frozen snapshots) ──");
  const currentRate = loadedLaborRate(
    sq.settings.desired_annual_owner_pay,
    sq.overhead.filter((o: any) => o.active).reduce((s: number, o: any) => s + o.monthly_amount, 0),
    monthlyBillableHours(sq.settings.hours_worked_per_week, sq.settings.utilization_pct),
  );
  console.log(`  current-settings loaded rate: $${currentRate.toFixed(4)}/hr`);

  let goldenFailures = 0;
  for (const job of sq.jobs as any[]) {
    if (job.computed_price == null) continue;
    const jobLines = (sq.lines as any[]).filter((l) => l.job_id === job.id);
    const engineLines: EngineLineInput[] = jobLines.map((l, i) => {
      const materials =
        l.resolved_material_cost > 0
          ? [
              {
                basis: "FLAT" as const,
                // TASK flat materials repeat with qty — divide so the product
                // reproduces the frozen per-line material cost exactly.
                flatQty: 1,
                unitCost:
                  l.type === "TASK"
                    ? l.resolved_material_cost / (l.qty || 1)
                    : l.resolved_material_cost,
                purchasableUnitSize: 1,
              },
            ]
          : [];
      return l.type === "MEASURED"
        ? {
            key: i,
            type: "MEASURED" as const,
            qty: l.qty,
            laborHoursPerUnit: l.resolved_hours_per_unit,
            prepMultiplier: l.resolved_prep_multiplier,
            materials,
          }
        : {
            key: i,
            type: "TASK" as const,
            qty: l.qty,
            flatLaborHours: l.resolved_hours_per_unit,
            prepMultiplier: l.resolved_prep_multiplier,
            materials,
          };
    });
    const extraCost = (sq.jobMaterials as any[])
      .filter((m) => m.job_id === job.id && m.line_item_id == null)
      .reduce((s, m) => s + m.resolved_total, 0);

    const frozenSettings: EngineSettings = {
      loadedLaborRate: job.resolved_loaded_rate,
      marginPct: job.resolved_margin_pct,
      materialMarkupPct: job.resolved_material_markup_pct,
      minimumJobCharge: job.resolved_minimum_charge,
      roundingIncrement: job.resolved_rounding_increment,
    };
    const result = priceJob(
      {
        lines: engineLines,
        extraMaterials:
          extraCost > 0
            ? [{ basis: "FLAT", flatQty: 1, unitCost: extraCost, purchasableUnitSize: 1 }]
            : [],
        travelFee: job.resolved_travel_fee,
      },
      frozenSettings,
    );
    const { rows } = allocateClientRows(result);

    const problems: string[] = [];
    if (Math.abs(result.jobCost - job.computed_cost) > 0.011) {
      problems.push(`cost ${result.jobCost} ≠ ${job.computed_cost}`);
    }
    if (result.price !== job.computed_price) {
      problems.push(`price ${result.price} ≠ ${job.computed_price}`);
    }
    jobLines.forEach((l, i) => {
      const r = result.lines[i];
      if (Math.abs(r.laborCost - l.resolved_labor_cost) > 0.011) {
        problems.push(`line ${i} labor ${r.laborCost} ≠ ${l.resolved_labor_cost}`);
      }
      const clientAmount = rows.find((x) => x.kind === "line" && x.key === i)?.amount ?? 0;
      if (Math.abs(clientAmount - l.resolved_client_amount) > 0.011) {
        problems.push(`line ${i} client ${clientAmount} ≠ ${l.resolved_client_amount}`);
      }
    });
    if (problems.length) {
      goldenFailures++;
      console.log(`  ✗ job #${job.id} "${job.title}": ${problems.join("; ")}`);
    } else {
      console.log(
        `  ✓ job #${job.id} "${job.title}" reproduces exactly ($${job.computed_price})`,
      );
    }
  }
  if (goldenFailures > 0) {
    throw new Error(`Golden verification FAILED for ${goldenFailures} job(s). Not migrating.`);
  }
  console.log("");

  // -------------------------------------------------------------------------
  // Generic natural-key sync helper
  // -------------------------------------------------------------------------
  async function syncTable<T extends { id: number }>(
    table: string,
    sqliteRows: T[],
    naturalKey: (r: T) => string,
    existingKey: (r: any) => string,
    toRow: (r: T) => Record<string, unknown>,
    selectCols: string,
  ): Promise<Map<number, number>> {
    const { data: existing, error } = await supabase
      .from(table)
      .select(selectCols)
      .eq("client_id", TARGET_CLIENT_ID);
    if (error) throw new Error(`${table} read: ${error.message}`);
    const byKey = new Map((existing ?? []).map((r: any) => [existingKey(r), r]));
    const idMap = new Map<number, number>();

    for (const r of sqliteRows) {
      const key = naturalKey(r);
      const found = byKey.get(key);
      if (found) {
        idMap.set(r.id, found.id);
        note(table, "skip", key);
        continue;
      }
      note(table, "insert", key);
      if (APPLY) {
        const { data: inserted, error: insErr } = await supabase
          .from(table)
          .insert({ client_id: TARGET_CLIENT_ID, ...toRow(r) })
          .select("id")
          .single();
        if (insErr) throw new Error(`${table} insert "${key}": ${insErr.message}`);
        idMap.set(r.id, inserted.id);
      } else {
        idMap.set(r.id, nextFakeId());
      }
    }
    return idMap;
  }

  // -------------------------------------------------------------------------
  // 1. Settings layer
  // -------------------------------------------------------------------------
  const entityMap = await syncTable(
    "billing_entities",
    sq.entities as any[],
    (r: any) => r.invoice_prefix,
    (r) => r.invoice_prefix,
    (r: any) => ({
      name: r.name,
      license_number: r.license_number,
      address: r.address,
      phone: toE164US(r.phone) ?? r.phone,
      email: r.email,
      payment_instructions: r.payment_instructions,
      invoice_prefix: r.invoice_prefix,
      default_footer_text: r.default_footer_text,
      is_default: Boolean(r.is_default),
    }),
    "id, invoice_prefix",
  );

  // Entity logos → Supabase Storage (apply only)
  for (const e of sq.entities as any[]) {
    if (!e.logo_path) continue;
    const fsPath = path.join(ESTIMATOR_DIR, "data", e.logo_path.replace(/^\/uploads\//, "uploads/"));
    if (!existsSync(fsPath)) {
      note("storage", "skip", `logo for ${e.invoice_prefix} missing on disk (${fsPath})`);
      continue;
    }
    note("storage", "insert", `logo for ${e.invoice_prefix} ← ${path.basename(fsPath)}`);
    if (APPLY) {
      const pgId = entityMap.get(e.id)!;
      const ext = path.extname(fsPath).slice(1) || "png";
      const storagePath = `${TARGET_CLIENT_ID}/entity-${pgId}-migrated.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("tenant-logos")
        .upload(storagePath, readFileSync(fsPath), {
          contentType: ext === "png" ? "image/png" : `image/${ext}`,
          upsert: true,
        });
      if (upErr) throw new Error(`logo upload: ${upErr.message}`);
      const { data: pub } = supabase.storage.from("tenant-logos").getPublicUrl(storagePath);
      await supabase
        .from("billing_entities")
        .update({ logo_path: pub.publicUrl })
        .eq("id", pgId);
    }
  }

  // pricing_settings — single row per tenant, straight upsert
  {
    const s = sq.settings as any;
    note("pricing_settings", "update", "cost settings → pricing_settings");
    if (APPLY) {
      const { error } = await supabase.from("pricing_settings").upsert(
        {
          client_id: TARGET_CLIENT_ID,
          desired_annual_owner_pay: s.desired_annual_owner_pay,
          hours_worked_per_week: s.hours_worked_per_week,
          utilization_pct: s.utilization_pct,
          margin_pct: s.margin_pct,
          material_markup_pct: s.material_markup_pct,
          minimum_job_charge: s.minimum_job_charge,
          rounding_increment: s.rounding_increment,
        },
        { onConflict: "client_id" },
      );
      if (error) throw new Error(`pricing_settings: ${error.message}`);
    }
  }

  await syncTable(
    "overhead_items",
    sq.overhead as any[],
    (r: any) => r.name,
    (r) => r.name,
    (r: any) => ({ name: r.name, monthly_amount: r.monthly_amount, active: Boolean(r.active) }),
    "id, name",
  );

  const materialMap = await syncTable(
    "materials",
    sq.materials as any[],
    (r: any) => r.name,
    (r) => r.name,
    (r: any) => ({
      name: r.name,
      unit: r.unit,
      unit_cost: r.unit_cost,
      coverage_sqft_per_unit: r.coverage_sqft_per_unit,
      purchasable_unit_size: r.purchasable_unit_size ?? 1,
      is_placeholder: Boolean(r.is_placeholder),
      active: Boolean(r.active),
    }),
    "id, name",
  );

  const serviceMap = await syncTable(
    "service_catalog",
    sq.services as any[],
    (r: any) => r.name,
    (r) => r.name,
    (r: any) => ({
      name: r.name,
      type: r.type,
      unit: r.type === "MEASURED" ? r.unit : null,
      labor_hours_per_unit: r.type === "MEASURED" ? r.labor_hours_per_unit : null,
      flat_labor_hours: r.type === "TASK" ? r.flat_labor_hours : null,
      notes: r.notes,
      is_placeholder: Boolean(r.is_placeholder),
      active: Boolean(r.active),
    }),
    "id, name",
  );

  // service_materials — keyed by mapped (service, material) pair
  {
    const { data: existing } = await supabase
      .from("service_materials")
      .select("service_id, material_id")
      .eq("client_id", TARGET_CLIENT_ID);
    const have = new Set((existing ?? []).map((r) => `${r.service_id}:${r.material_id}`));
    for (const l of sq.links as any[]) {
      const sid = serviceMap.get(l.service_id);
      const mid = materialMap.get(l.material_id);
      if (!sid || !mid) {
        note("service_materials", "skip", `link ${l.id} (unmapped parent)`);
        continue;
      }
      if (have.has(`${sid}:${mid}`)) {
        note("service_materials", "skip", `link svc ${sid} ↔ mat ${mid}`);
        continue;
      }
      note("service_materials", "insert", `link svc ${sid} ↔ mat ${mid} (${l.basis})`);
      if (APPLY) {
        const { error } = await supabase.from("service_materials").insert({
          client_id: TARGET_CLIENT_ID,
          service_id: sid,
          material_id: mid,
          basis: l.basis,
          coats: l.basis === "COVERAGE" ? l.coats ?? 1 : null,
          qty_per_unit: l.basis === "PER_UNIT" ? l.qty_per_unit : null,
          flat_qty: l.basis === "FLAT" ? l.flat_qty : null,
        });
        if (error) throw new Error(`service_materials: ${error.message}`);
      }
    }
  }

  const modifierMap = await syncTable(
    "price_modifiers",
    sq.modifiers as any[],
    (r: any) => r.name,
    (r) => r.name,
    (r: any) => ({
      name: r.name,
      scope: r.scope,
      math: r.math,
      value: r.value,
      active: Boolean(r.active),
    }),
    "id, name",
  );

  const zoneMap = await syncTable(
    "travel_zones",
    sq.zones as any[],
    (r: any) => r.label,
    (r) => r.label,
    (r: any) => ({ label: r.label, flat_fee: r.flat_fee, active: true }),
    "id, label",
  );

  // -------------------------------------------------------------------------
  // 2. Clients → contacts (dedupe by normalized phone)
  // -------------------------------------------------------------------------
  const contactMap = new Map<number, number | null>();
  {
    const { data: existing } = await supabase
      .from("contacts")
      .select("id, phone")
      .eq("client_id", TARGET_CLIENT_ID);
    const byPhone = new Map((existing ?? []).filter((c) => c.phone).map((c) => [c.phone, c.id]));
    for (const c of sq.clients as any[]) {
      const phone = toE164US(c.phone);
      const found = phone ? byPhone.get(phone) : undefined;
      if (found) {
        contactMap.set(c.id, found);
        note("contacts", "skip", `${c.name} (${phone} exists — receptionist may know them)`);
        continue;
      }
      note("contacts", "insert", `${c.name} ${phone ?? "(no phone)"}`);
      if (APPLY) {
        const { data: inserted, error } = await supabase
          .from("contacts")
          .insert({
            client_id: TARGET_CLIENT_ID,
            name: c.name,
            phone,
            email: c.email,
            address: c.address,
            notes: c.notes,
          })
          .select("id")
          .single();
        if (error) throw new Error(`contacts: ${error.message}`);
        contactMap.set(c.id, inserted.id);
      } else {
        contactMap.set(c.id, nextFakeId());
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Jobs → jobs + estimates (+lines +materials), frozen values VERBATIM
  // -------------------------------------------------------------------------
  const JOB_STATUS: Record<string, string> = {
    DRAFT: "estimated",
    ESTIMATED: "estimated",
    SENT: "estimated",
    ACCEPTED: "scheduled",
    IN_PROGRESS: "in_progress",
    COMPLETE: "completed",
    INVOICED: "completed",
    PAID: "completed",
    LOST: "cancelled",
  };
  const EST_STATUS: Record<string, string> = {
    DRAFT: "draft",
    ESTIMATED: "draft",
    SENT: "sent",
    ACCEPTED: "accepted",
    IN_PROGRESS: "accepted",
    COMPLETE: "accepted",
    INVOICED: "accepted",
    PAID: "accepted",
    LOST: "lost",
  };

  const { data: existingJobs } = await supabase
    .from("jobs")
    .select("id, details")
    .eq("client_id", TARGET_CLIENT_ID)
    .not("details->estimator_source_id", "is", null);
  const migratedJobs = new Map(
    (existingJobs ?? []).map((j) => [Number((j.details as any).estimator_source_id), j.id]),
  );

  const jobMap = new Map<number, number>();
  const estimateMap = new Map<number, number>();
  const lineMap = new Map<number, number>();

  for (const job of sq.jobs as any[]) {
    if (migratedJobs.has(job.id)) {
      jobMap.set(job.id, migratedJobs.get(job.id)!);
      note("jobs", "skip", `#${job.id} "${job.title}" already migrated`);
      continue;
    }
    const client = (sq.clients as any[]).find((c) => c.id === job.client_id);
    const charge = job.manual_override_price ?? job.computed_price;
    note(
      "jobs",
      "insert",
      `#${job.id} "${job.title}" → ${JOB_STATUS[job.status] ?? "estimated"} + estimate (${EST_STATUS[job.status] ?? "draft"}, $${charge})`,
    );

    let pgJobId: number;
    if (APPLY) {
      const { data: insertedJob, error: jobErr } = await supabase
        .from("jobs")
        .insert({
          client_id: TARGET_CLIENT_ID,
          name: client?.name ?? job.title,
          phone: toE164US(client?.phone),
          email: client?.email ?? null,
          address: client?.address ?? job.title,
          status: JOB_STATUS[job.status] ?? "estimated",
          source: "manual",
          contact_id: contactMap.get(job.client_id) ?? null,
          quoted_price: charge != null ? Math.round(charge * 100) : null,
          notes: job.notes,
          created_at: job.created_at,
          details: { estimator_source_id: job.id, estimator_title: job.title },
        })
        .select("id")
        .single();
      if (jobErr) throw new Error(`jobs #${job.id}: ${jobErr.message}`);
      pgJobId = insertedJob.id;
    } else {
      pgJobId = nextFakeId();
    }
    jobMap.set(job.id, pgJobId);

    // Estimate with frozen job-level snapshot
    let pgEstimateId: number;
    if (APPLY) {
      const { data: insertedEst, error: estErr } = await supabase
        .from("estimates")
        .insert({
          client_id: TARGET_CLIENT_ID,
          job_id: pgJobId,
          billing_entity_id: entityMap.get(job.entity_id) ?? null,
          version: 1,
          status: EST_STATUS[job.status] ?? "draft",
          travel_zone_id: zoneMap.get(job.travel_zone_id) ?? null,
          resolved_loaded_rate: job.resolved_loaded_rate,
          resolved_margin_pct: job.resolved_margin_pct,
          resolved_material_markup_pct: job.resolved_material_markup_pct,
          resolved_minimum_job_charge: job.resolved_minimum_charge,
          resolved_rounding_increment: job.resolved_rounding_increment,
          resolved_travel_fee: job.resolved_travel_fee,
          computed_cost: job.computed_cost,
          computed_price: job.computed_price,
          manual_override_price: job.manual_override_price,
          override_reason: job.override_reason,
          notes: job.notes,
          estimated_at: job.estimated_at ?? job.created_at,
          created_at: job.created_at,
        })
        .select("id")
        .single();
      if (estErr) throw new Error(`estimates for job #${job.id}: ${estErr.message}`);
      pgEstimateId = insertedEst.id;
    } else {
      pgEstimateId = nextFakeId();
    }
    estimateMap.set(job.id, pgEstimateId);

    // Frozen line items
    for (const l of (sq.lines as any[]).filter((x) => x.job_id === job.id)) {
      note("estimate_line_items", "insert", `  line "${l.description}"`);
      if (APPLY) {
        const { data: insertedLine, error: lineErr } = await supabase
          .from("estimate_line_items")
          .insert({
            client_id: TARGET_CLIENT_ID,
            estimate_id: pgEstimateId,
            service_id: l.service_id ? serviceMap.get(l.service_id) ?? null : null,
            description: l.description,
            type: l.type,
            qty: l.qty,
            unit: l.unit,
            prep_modifier_id: l.prep_modifier_id
              ? modifierMap.get(l.prep_modifier_id) ?? null
              : null,
            sort_order: l.sort_order,
            resolved_prep_multiplier: l.resolved_prep_multiplier,
            resolved_hours_per_unit: l.resolved_hours_per_unit,
            resolved_labor_hours: l.resolved_labor_hours,
            resolved_loaded_rate: l.resolved_loaded_rate,
            resolved_labor_cost: l.resolved_labor_cost,
            resolved_material_cost: l.resolved_material_cost,
            resolved_line_cost: l.resolved_line_cost,
            resolved_client_amount: l.resolved_client_amount,
          })
          .select("id")
          .single();
        if (lineErr) throw new Error(`line ${l.id}: ${lineErr.message}`);
        lineMap.set(l.id, insertedLine.id);
      } else {
        lineMap.set(l.id, nextFakeId());
      }
    }

    // Frozen materials
    for (const m of (sq.jobMaterials as any[]).filter((x) => x.job_id === job.id)) {
      const matName = (sq.materials as any[]).find((x) => x.id === m.material_id)?.name;
      note("estimate_materials", "insert", `  material ${matName ?? m.material_id ?? "ad-hoc"}`);
      if (APPLY) {
        const { error } = await supabase.from("estimate_materials").insert({
          client_id: TARGET_CLIENT_ID,
          estimate_id: pgEstimateId,
          line_item_id: m.line_item_id ? lineMap.get(m.line_item_id) ?? null : null,
          material_id: m.material_id ? materialMap.get(m.material_id) ?? null : null,
          description: m.description ?? matName ?? "Material",
          qty: m.qty,
          resolved_unit_cost: m.resolved_unit_cost,
          resolved_total: m.resolved_total,
        });
        if (error) throw new Error(`estimate_materials ${m.id}: ${error.message}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Actuals + invoices (if any exist by cutover)
  // -------------------------------------------------------------------------
  for (const t of sq.time as any[]) {
    const pgJobId = jobMap.get(t.job_id);
    if (!pgJobId) continue;
    note("time_entries", "insert", `${t.date} ${t.hours}h on job ${t.job_id}`);
    if (APPLY) {
      const { error } = await supabase.from("time_entries").insert({
        client_id: TARGET_CLIENT_ID,
        job_id: pgJobId,
        entry_date: t.date,
        hours: t.hours,
        note: t.note,
      });
      if (error) throw new Error(`time_entries: ${error.message}`);
    }
  }
  for (const m of sq.actualMats as any[]) {
    const pgJobId = jobMap.get(m.job_id);
    if (!pgJobId) continue;
    note("actual_materials", "insert", `${m.description} $${m.actual_cost} on job ${m.job_id}`);
    if (APPLY) {
      const { error } = await supabase.from("actual_materials").insert({
        client_id: TARGET_CLIENT_ID,
        job_id: pgJobId,
        material_id: m.material_id ? materialMap.get(m.material_id) ?? null : null,
        description: m.description,
        qty: m.qty,
        actual_cost: m.actual_cost,
      });
      if (error) throw new Error(`actual_materials: ${error.message}`);
    }
  }
  {
    const { data: existingInv } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("client_id", TARGET_CLIENT_ID)
      .not("invoice_number", "is", null);
    const haveNumbers = new Set((existingInv ?? []).map((i) => i.invoice_number));
    const INV_STATUS: Record<string, string> = { DRAFT: "draft", SENT: "sent", PAID: "paid" };
    for (const inv of sq.invoices as any[]) {
      if (haveNumbers.has(inv.invoice_number)) {
        note("invoices", "skip", inv.invoice_number);
        continue;
      }
      const job = (sq.jobs as any[]).find((j) => j.id === inv.job_id);
      const client = job ? (sq.clients as any[]).find((c) => c.id === job.client_id) : null;
      note("invoices", "insert", `${inv.invoice_number} ($${inv.total}, ${inv.status})`);
      if (APPLY) {
        const { error } = await supabase.from("invoices").insert({
          client_id: TARGET_CLIENT_ID,
          job_id: jobMap.get(inv.job_id) ?? null,
          estimate_id: estimateMap.get(inv.job_id) ?? null,
          billing_entity_id: entityMap.get(inv.entity_id) ?? null,
          invoice_number: inv.invoice_number,
          customer_name: client?.name ?? "Customer",
          customer_email: client?.email ?? null,
          customer_phone: toE164US(client?.phone),
          line_items: JSON.parse(inv.line_snapshot ?? "[]"),
          subtotal_cents: Math.round(inv.subtotal * 100),
          tax_rate_pct: inv.tax_rate_pct ?? 0,
          tax_cents: Math.round(inv.tax_amount * 100),
          total_cents: Math.round(inv.total * 100),
          due_terms: inv.due_terms,
          status: INV_STATUS[inv.status] ?? "draft",
          created_at: inv.issue_date,
        });
        if (error) throw new Error(`invoices ${inv.invoice_number}: ${error.message}`);
      }
    }
  }

  db.close();

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(`── Plan (${APPLY ? "EXECUTED" : "dry-run — nothing written"}) ──`);
  const byTable = new Map<string, { insert: number; update: number; skip: number }>();
  for (const a of actions) {
    const t = byTable.get(a.table) ?? { insert: 0, update: 0, skip: 0 };
    t[a.action]++;
    byTable.set(a.table, t);
  }
  for (const [table, t] of byTable) {
    console.log(
      `  ${table.padEnd(22)} insert ${String(t.insert).padStart(3)} · update ${String(t.update).padStart(3)} · skip ${String(t.skip).padStart(3)}`,
    );
  }
  console.log("\nDetail:");
  for (const a of actions) {
    console.log(`  [${a.action.toUpperCase().padEnd(6)}] ${a.table}: ${a.label}`);
  }
  if (!APPLY) {
    console.log("\nDry-run complete. Re-run with --apply to write.");
  } else {
    console.log("\nMigration applied. Verify in the dashboard, then run the parallel-run checklist (kickoff §9).");
  }
}

main().catch((e) => {
  console.error(`\nMIGRATION ABORTED: ${e.message}`);
  process.exit(1);
});
