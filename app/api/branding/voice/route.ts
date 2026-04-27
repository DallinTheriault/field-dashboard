import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Allowlist of voice IDs we know about. Anything else is rejected to prevent
// arbitrary-data writes via the API. Keep this in sync with the dropdown in
// the Settings page.
const ALLOWED_VOICE_IDS = new Set([
  "21m00Tcm4TlvDq8ikWAM", // Rachel
  "AZnzlk1XvdvUeBnXmlld", // Domi
  "EXAVITQu4vr4xnSDxMaL", // Bella
  "ErXwobaYiN019PkySvjV", // Antoni
  "VR6AewLTigWG4xSOukaG", // Arnold
  "pNInz6obpgDQGcFmaJgB", // Adam
]);

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

  let body: { voice_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const voiceId = body.voice_id;
  if (!voiceId || !ALLOWED_VOICE_IDS.has(voiceId)) {
    return NextResponse.json({ error: "Unsupported voice ID" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("Clients")
    .update({ vapi_voice_id: voiceId })
    .eq("id", clientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Note: changing vapi_voice_id in Supabase doesn't automatically push to VAPI.
  // The VAPI assistant config still has the old voice. Real propagation requires
  // a follow-up call to VAPI's API to update the assistant. For V1 we mark this
  // as "pending operator action" — Dallin sees the change and updates VAPI manually.
  // V0.4 will automate this via VAPI API.
  return NextResponse.json({ ok: true, voice_id: voiceId, note: "pending VAPI sync" });
}
