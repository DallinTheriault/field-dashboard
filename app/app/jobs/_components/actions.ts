"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164US } from "@/lib/sms/phone";

const VALID_STATUSES = [
  "lead",
  "estimated",
  "scheduled",
  "in_progress",
  "completed",
  "callback",
  "callback_complete",
  "cancelled",
] as const;

type CreateJobResult =
  | { ok: true; jobId: number }
  | { ok: false; error: string };

/**
 * Manually create a job from the dashboard. Used when an owner is texting
 * with a lead and wants to capture it without waiting for a VAPI call.
 *
 * Required fields per product decision (v0.5.3):
 *   - name      (customer name)
 *   - phone     (E.164-normalizable)
 *   - address   (free text)
 *   - status    (defaults to 'lead')
 *
 * Everything else (service, scope, quoted_price, schedule, notes, email)
 * gets filled in via the detail page after creation.
 */
export async function createJobManual(formData: {
  name: string;
  phone: string;
  address: string;
  status?: string;
}): Promise<CreateJobResult> {
  const name = (formData.name ?? "").trim();
  const rawPhone = (formData.phone ?? "").trim();
  const address = (formData.address ?? "").trim();
  const status = (formData.status ?? "lead").trim();

  if (!name) return { ok: false, error: "Name is required." };
  if (!rawPhone) return { ok: false, error: "Phone is required." };
  if (!address) return { ok: false, error: "Address is required." };

  const phone = toE164US(rawPhone);
  if (!phone) {
    return {
      ok: false,
      error: "Phone must be a 10-digit US number (e.g. 801-555-1234).",
    };
  }

  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return { ok: false, error: "Invalid status." };
  }

  // Auth + tenant scoping
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: memberships } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"]);

  const allowed = memberships ?? [];
  if (allowed.length === 0) {
    return { ok: false, error: "You don't have permission to create jobs." };
  }

  // For V1, every authenticated user belongs to exactly one tenant. If
  // multiple memberships exist later, the UI will need a tenant picker —
  // for now we use the first one.
  const clientId = allowed[0].client_id;

  const admin = createAdminClient();

  // Try to link to an existing contact with this phone, otherwise create one
  const { data: existingContact } = await admin
    .from("contacts")
    .select("id")
    .eq("client_id", clientId)
    .eq("phone", phone)
    .maybeSingle();

  let contactId = existingContact?.id ?? null;

  if (!contactId) {
    const { data: newContact, error: contactErr } = await admin
      .from("contacts")
      .insert({
        client_id: clientId,
        phone,
        name,
        address,
        first_contacted_at: new Date().toISOString(),
        last_contacted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (contactErr) {
      console.error("[create-job] contact create failed", contactErr);
      // Continue without contact_id — job can still be created
    } else {
      contactId = newContact?.id ?? null;
    }
  }

  // Insert job
  const { data: newJob, error: jobErr } = await admin
    .from("jobs")
    .insert({
      client_id: clientId,
      name,
      phone,
      address,
      status,
      contact_id: contactId,
      source: "manual",
    })
    .select("id")
    .single();

  if (jobErr || !newJob) {
    console.error("[create-job] job insert failed", jobErr);
    return {
      ok: false,
      error: jobErr?.message ?? "Failed to create job. Try again.",
    };
  }

  revalidatePath("/app/jobs");
  revalidatePath("/app");
  return { ok: true, jobId: newJob.id };
}

/**
 * Wrapper that creates a job and redirects to its detail page. Use this
 * when called from a form that wants automatic navigation.
 */
export async function createJobAndRedirect(formData: {
  name: string;
  phone: string;
  address: string;
  status?: string;
}) {
  const result = await createJobManual(formData);
  if (!result.ok) return result;
  redirect(`/app/jobs/${result.jobId}`);
}
