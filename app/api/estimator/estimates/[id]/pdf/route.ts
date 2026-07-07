import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildClientDocRows } from "@/lib/estimator/client-rows";
import { renderEstimatePdf } from "@/lib/estimator/pdf/render";

/**
 * Client-facing estimate PDF, rendered on demand. Auth via the user's
 * session; RLS scopes every read, so a foreign id simply 404s. Only frozen
 * client-facing values reach the document (see lib/estimator/client-rows).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const estimateId = Number(id);
  if (!Number.isInteger(estimateId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const [{ data: est }, { data: lines }] = await Promise.all([
    supabase
      .from("estimates")
      .select(
        "id, job_id, computed_price, manual_override_price, resolved_travel_fee, estimated_at, created_at, jobs(name, address, phone, email), billing_entities(name, license_number, address, phone, email, default_footer_text, logo_path), travel_zones(label)",
      )
      .eq("id", estimateId)
      .maybeSingle(),
    supabase
      .from("estimate_line_items")
      .select("description, qty, unit, resolved_client_amount")
      .eq("estimate_id", estimateId)
      .order("sort_order"),
  ]);

  if (!est) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const job = est.jobs as unknown as {
    name: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  const entity = est.billing_entities as unknown as {
    name: string;
    license_number: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    default_footer_text: string | null;
    logo_path: string | null;
  } | null;
  const zone = est.travel_zones as unknown as { label: string } | null;

  if (!entity) {
    return NextResponse.json(
      { error: "This estimate has no billing entity — set one in Estimator settings and re-save." },
      { status: 422 },
    );
  }

  const { rows, total } = buildClientDocRows({
    lines: (lines ?? []).map((l) => ({
      description: l.description,
      qty: Number(l.qty),
      unit: l.unit,
      resolved_client_amount: Number(l.resolved_client_amount),
    })),
    travelFee: Number(est.resolved_travel_fee ?? 0),
    zoneLabel: zone?.label ?? null,
    computedPrice: Number(est.computed_price ?? 0),
    overridePrice:
      est.manual_override_price === null
        ? null
        : Number(est.manual_override_price),
  });

  const refNumber = `EST-${String(est.id).padStart(3, "0")}`;
  const pdf = await renderEstimatePdf({
    entity: {
      name: entity.name,
      licenseNumber: entity.license_number,
      address: entity.address,
      phone: entity.phone,
      email: entity.email,
      footerText: entity.default_footer_text,
      logoSrc: entity.logo_path,
    },
    client: {
      name: job?.name ?? "Customer",
      address: job?.address,
      phone: job?.phone,
      email: job?.email,
    },
    rows,
    total,
    refNumber,
    date: (est.estimated_at ?? est.created_at).slice(0, 10),
    jobTitle: job?.address || job?.name || `Job #${est.job_id}`,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // inline → opens in the phone's viewer, share sheet from there.
      "Content-Disposition": `inline; filename="${refNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
