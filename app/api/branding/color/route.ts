import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: clientUsers } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"])
    .limit(1);

  const clientId = clientUsers?.[0]?.client_id;
  if (!clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { color?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let color: string | null = null;
  if (body.color === null || body.color === undefined || body.color === "") {
    color = null;
  } else if (typeof body.color === "string" && HEX_REGEX.test(body.color)) {
    color = body.color.toUpperCase();
  } else {
    return NextResponse.json(
      { error: "Color must be a 6-digit hex like #4A9D8E or null to reset." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("Clients")
    .update({ brand_primary_color: color })
    .eq("id", clientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, color });
}
