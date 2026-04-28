import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Validate by shape rather than allowlist. ElevenLabs voice IDs are
// 20 alphanumeric characters. The regex check prevents arbitrary
// data writes to the column without forcing us to maintain a list.
const VOICE_ID_REGEX = /^[A-Za-z0-9]{20}$/;

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
  if (!voiceId || !VOICE_ID_REGEX.test(voiceId)) {
    return NextResponse.json(
      { error: "Voice ID must be 20 alphanumeric characters." },
      { status: 400 },
    );
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
