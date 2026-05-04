import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keep-warm endpoint. n8n WF13 should hit this every 5 minutes.
 *
 * Workaround for Supabase free-tier auto-pause behavior — projects pause
 * after 7 days of inactivity, and the first request after pause takes
 * 30-60 seconds to spin back up. By pinging every 5 minutes we prevent
 * the project from ever going idle.
 *
 * This is a temporary measure. The real fix is upgrading to Supabase Pro
 * ($25/mo) which has no auto-pause. We'll switch off this cron once on Pro.
 *
 * What it does: a single SELECT count(*) against a tiny table. Cheap,
 * doesn't touch RLS (uses admin client), but enough to register activity.
 *
 * Auth: shared secret in `x-cron-secret` header. Same pattern as WF12.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const start = Date.now();

  // Tiny query — counts rows in Clients (always has at least 1).
  // Service role bypasses RLS so this stays O(1) regardless of tenant count.
  const { error } = await supabase
    .from("Clients")
    .select("id", { count: "exact", head: true });

  const elapsedMs = Date.now() - start;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, elapsedMs },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, elapsedMs });
}

// GET also allowed for easier manual testing in browser dev tools
export async function GET(req: NextRequest) {
  return POST(req);
}
