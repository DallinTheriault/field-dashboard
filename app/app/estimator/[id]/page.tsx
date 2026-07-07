import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Briefcase, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { EstimateStatusChip } from "../estimate-status";
import { EstimateActionsBar } from "./estimate-actions-bar";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Estimate detail. Two strictly-separated views on one page:
 * the owner internals (frozen rates, hours, costs, margin) and the
 * client-facing document preview (descriptions + amounts, nothing else).
 */
export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentUserRole();
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");

  const { id } = await params;
  const estimateId = Number(id);
  if (!Number.isInteger(estimateId)) notFound();

  const supabase = await createClient();
  const [{ data: est }, { data: lines }, { data: materials }, { data: invoice }] =
    await Promise.all([
      supabase
        .from("estimates")
        .select(
          "*, jobs(id, name, address, status), billing_entities(name, invoice_prefix), travel_zones(label)",
        )
        .eq("id", estimateId)
        .maybeSingle(),
      supabase
        .from("estimate_line_items")
        .select("*")
        .eq("estimate_id", estimateId)
        .order("sort_order"),
      supabase
        .from("estimate_materials")
        .select("*")
        .eq("estimate_id", estimateId),
      supabase
        .from("invoices")
        .select("id")
        .eq("estimate_id", estimateId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (!est) notFound();

  const job = est.jobs as unknown as {
    id: number;
    name: string | null;
    address: string | null;
    status: string;
  } | null;
  const entity = est.billing_entities as unknown as {
    name: string;
    invoice_prefix: string;
  } | null;
  const zone = est.travel_zones as unknown as { label: string } | null;

  const lineRows = lines ?? [];
  const computedPrice = Number(est.computed_price ?? 0);
  const override =
    est.manual_override_price === null ? null : Number(est.manual_override_price);
  const charge = override ?? computedPrice;
  const margin = Number(est.resolved_margin_pct ?? 0);
  const travelFee = Number(est.resolved_travel_fee ?? 0);

  // Client rows: stored per-line amounts; the travel row absorbs whatever
  // remains so rows always sum exactly to the computed price (the allocator
  // guaranteed this at freeze time).
  const lineAmountSum = lineRows.reduce(
    (s, l) => s + Number(l.resolved_client_amount ?? 0),
    0,
  );
  const travelClientAmount =
    travelFee > 0 ? Math.round((computedPrice - lineAmountSum) * 100) / 100 : 0;

  const totalHours = lineRows.reduce(
    (s, l) => s + Number(l.resolved_labor_hours ?? 0),
    0,
  );

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <Link
        href="/app/estimator"
        className="inline-flex items-center gap-1.5 text-2xs text-bone-400 hover:text-bone-100"
      >
        <ArrowLeft size={12} />
        Estimates
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-bone-50">
            {job?.name || `Job #${est.job_id}`}
            {est.version > 1 && (
              <span className="ml-2 text-sm text-bone-400 font-mono">
                v{est.version}
              </span>
            )}
          </h1>
          <div className="text-2xs text-bone-400 mt-1">
            {job?.address && <span>{job.address} · </span>}
            {entity && <span>{entity.name} · </span>}
            Frozen {fmtDate(est.estimated_at)}
          </div>
        </div>
        <EstimateStatusChip status={est.status} />
      </header>

      {job && (
        <Link
          href={`/app/jobs/${job.id}`}
          className="inline-flex items-center gap-1.5 text-2xs text-field-500 hover:text-field-400"
        >
          <Briefcase size={12} />
          Open job
        </Link>
      )}

      {override !== null && (
        <div className="form-error flex items-start gap-2">
          <TriangleAlert size={14} className="shrink-0 mt-0.5" />
          <span>
            <strong>OVERRIDDEN.</strong> Charging {usd.format(override)} instead
            of the computed {usd.format(computedPrice)}.
            {est.override_reason && <> Reason: {est.override_reason}</>}{" "}
            Reporting uses the computed number.
          </span>
        </div>
      )}

      {/* Client-facing document preview */}
      <section className="panel">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">
            What the client sees
          </h2>
        </div>
        <div className="px-4 py-3">
          <table className="w-full text-sm">
            <tbody>
              {lineRows.map((l) => (
                <tr key={l.id} className="border-b border-line-subtle last:border-0">
                  <td className="py-2 text-bone-100">
                    {l.description}
                    {Number(l.qty) !== 1 && (
                      <span className="text-2xs text-bone-400">
                        {" "}
                        × {Number(l.qty)}
                        {l.unit ? ` ${l.unit}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right num text-bone-100">
                    {usd.format(Number(l.resolved_client_amount ?? 0))}
                  </td>
                </tr>
              ))}
              {travelFee > 0 && (
                <tr className="border-b border-line-subtle">
                  <td className="py-2 text-bone-100">
                    Travel{zone ? ` (${zone.label})` : ""}
                  </td>
                  <td className="py-2 text-right num text-bone-100">
                    {usd.format(travelClientAmount)}
                  </td>
                </tr>
              )}
              {override !== null && (
                <tr className="border-b border-line-subtle">
                  <td className="py-2 text-bone-100">Price adjustment</td>
                  <td className="py-2 text-right num text-bone-100">
                    {usd.format(override - computedPrice)}
                  </td>
                </tr>
              )}
              <tr>
                <td className="py-2.5 font-semibold text-bone-50">Total</td>
                <td className="py-2.5 text-right num font-semibold text-bone-50">
                  {usd.format(charge)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Owner internals — never leaves this page */}
      <section className="panel">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">
            Internals{" "}
            <span className="text-2xs text-bone-400 font-normal">
              (owner only — frozen at save)
            </span>
          </h2>
        </div>
        <div className="px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Cost", value: usd.format(Number(est.computed_cost ?? 0)) },
              { label: "Margin", value: `${Math.round(margin * 100)}%` },
              {
                label: "Loaded rate",
                value: `${usd.format(Number(est.resolved_loaded_rate ?? 0))}/hr`,
              },
              { label: "Labor hours", value: totalHours.toFixed(1) },
            ].map((m) => (
              <div key={m.label} className="bg-ink-2 rounded-sm px-3 py-2 shadow-inset-line">
                <div className="label-eyebrow">{m.label}</div>
                <div className="num text-sm text-bone-50 mt-0.5">{m.value}</div>
              </div>
            ))}
          </div>

          <table className="w-full text-2xs">
            <thead>
              <tr className="text-bone-400">
                <th className="text-left font-medium py-1">Line</th>
                <th className="text-right font-medium py-1">Hrs</th>
                <th className="text-right font-medium py-1">Labor</th>
                <th className="text-right font-medium py-1">Materials</th>
                <th className="text-right font-medium py-1">Cost</th>
              </tr>
            </thead>
            <tbody className="text-bone-300">
              {lineRows.map((l) => (
                <tr key={l.id} className="border-t border-line-subtle">
                  <td className="py-1.5 pr-2 text-bone-100">
                    {l.description}
                    {Number(l.resolved_prep_multiplier) !== 1 && (
                      <span className="text-bone-400">
                        {" "}
                        · prep ×{Number(l.resolved_prep_multiplier)}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right num">
                    {Number(l.resolved_labor_hours).toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right num">
                    {usd.format(Number(l.resolved_labor_cost))}
                  </td>
                  <td className="py-1.5 text-right num">
                    {usd.format(Number(l.resolved_material_cost))}
                  </td>
                  <td className="py-1.5 text-right num">
                    {usd.format(Number(l.resolved_line_cost))}
                  </td>
                </tr>
              ))}
              {(materials ?? []).length > 0 && (
                <tr className="border-t border-line-subtle text-bone-400">
                  <td colSpan={5} className="py-1.5">
                    Materials:{" "}
                    {(materials ?? [])
                      .map(
                        (m) =>
                          `${m.description} ×${Number(m.qty)} (${usd.format(Number(m.resolved_total))})`,
                      )
                      .join(" · ")}
                  </td>
                </tr>
              )}
              {travelFee > 0 && (
                <tr className="border-t border-line-subtle">
                  <td className="py-1.5 text-bone-100">Travel fee</td>
                  <td colSpan={4} className="py-1.5 text-right num">
                    {usd.format(travelFee)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {est.notes && (
            <p className="text-2xs text-bone-400 border-t border-line-subtle pt-2">
              {est.notes}
            </p>
          )}
        </div>
      </section>

      <EstimateActionsBar
        estimateId={est.id}
        status={est.status}
        invoiceId={invoice?.id ?? null}
      />
    </main>
  );
}
