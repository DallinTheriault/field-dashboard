"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164US } from "@/lib/sms/phone";

/**
 * Open the SMS thread for a phone number. If a thread already exists for
 * (current tenant, that phone), redirect to it. Otherwise create one and
 * redirect.
 *
 * Used by "Text" buttons on Job, Voicemail, and Contact detail pages so
 * tapping them lands the user inside Field's dashboard SMS view rather
 * than the iOS Messages app.
 *
 * If you want to use your phone's native SMS app instead, every "Text"
 * button has a paired "Copy" button next to it that copies the formatted
 * number to your clipboard.
 */
export async function openSmsThread(phoneInput: string, contactId?: number | null) {
  const phone = toE164US(phoneInput);
  if (!phone) {
    redirect("/app/messages?error=invalid-phone");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"]);

  const allowed = memberships ?? [];
  if (allowed.length === 0) redirect("/app/messages?error=no-permission");

  const clientId = allowed[0].client_id;
  const admin = createAdminClient();

  // Find tenant's twilio number — the "from" side of the thread
  const { data: client } = await admin
    .from("Clients")
    .select("twilio_number")
    .eq("id", clientId)
    .maybeSingle();

  const tenantPhone = toE164US(client?.twilio_number ?? "");
  if (!tenantPhone) {
    redirect("/app/messages?error=no-tenant-number");
  }

  // If we don't have a contactId, try to resolve from phone
  let resolvedContactId = contactId ?? null;
  if (!resolvedContactId) {
    const { data: contact } = await admin
      .from("contacts")
      .select("id, name")
      .eq("client_id", clientId)
      .eq("phone", phone)
      .maybeSingle();
    resolvedContactId = contact?.id ?? null;
  }

  // Try to find a display name from the contact for the thread label
  let displayName: string | null = null;
  if (resolvedContactId) {
    const { data: contact } = await admin
      .from("contacts")
      .select("name")
      .eq("id", resolvedContactId)
      .maybeSingle();
    displayName = contact?.name ?? null;
  }

  // Upsert by the unique key. archived_at: null in case a stale archived row exists.
  const { data: thread, error: threadErr } = await admin
    .from("sms_threads")
    .upsert(
      {
        client_id: clientId,
        tenant_phone: tenantPhone,
        contact_phone: phone,
        contact_id: resolvedContactId,
        display_name: displayName,
        archived_at: null,
      },
      {
        onConflict: "client_id,tenant_phone,contact_phone",
        ignoreDuplicates: false,
      },
    )
    .select("id")
    .single();

  if (threadErr || !thread) {
    console.error("[open-sms-thread] upsert failed", threadErr);
    redirect("/app/messages?error=thread-create-failed");
  }

  redirect(`/app/messages/${thread.id}`);
}
