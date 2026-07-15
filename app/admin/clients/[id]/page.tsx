import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Activity } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClientConfigForm } from "./form";
import { AdminFeatureFlagsForm } from "./feature-flags-form";

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: client } = await supabase
    .from("Clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!client) notFound();

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-1.5 text-xs text-bone-400 hover:text-bone-50 mb-4"
      >
        <ArrowLeft size={12} />
        All clients
      </Link>

      <div className="mb-6">
        <div className="label-eyebrow mb-1">Tenant #{client.id}</div>
        <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
          {client.business_name || "—"}
        </h1>
        <p className="text-sm text-bone-300 mt-1">
          Configure all tokens that feed the system prompt template. Click
          &ldquo;Save &amp; regenerate prompt&rdquo; to write a fresh
          <code className="px-1 mx-0.5 bg-ink-2 rounded-xs font-mono text-2xs">
            system_prompt
          </code>
          to this row.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Link
            href={`/admin/clients/${client.id}/sms-compliance`}
            className="btn-secondary text-xs h-8"
          >
            <ShieldCheck size={11} />
            SMS compliance log
          </Link>
          <Link
            href={`/admin/clients/${client.id}/recent-activity`}
            className="btn-secondary text-xs h-8"
          >
            <Activity size={11} />
            Recent activity
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <AdminFeatureFlagsForm
          clientId={client.id}
          initial={{
            feature_sms_enabled: client.feature_sms_enabled ?? true,
            feature_voice_enabled: client.feature_voice_enabled ?? true,
            feature_calendar_enabled: client.feature_calendar_enabled ?? false,
            feature_billing_enabled: client.feature_billing_enabled ?? true,
            feature_estimator_enabled: client.feature_estimator_enabled ?? false,
            feature_receipt_ai_enabled: client.feature_receipt_ai_enabled ?? false,
          }}
        />
      </div>

      <ClientConfigForm
        client={{
          id: client.id,
          business_name: client.business_name ?? "",
          business_short_name: client.business_short_name ?? "",
          owner_first_name: client.owner_first_name ?? "",
          intake_mode: client.intake_mode ?? "primary",
          service_type: client.service_type ?? "",
          primary_service: client.primary_service ?? "",
          business_phone: client.business_phone ?? "",
          business_website: client.business_website ?? "",
          owner_email: client.owner_email ?? "",
          owner_phone: client.owner_phone ?? "",
          service_area: client.service_area ?? "",
          business_hours: client.business_hours ?? "",
          service_constraints: client.service_constraints ?? "",
          pricing_block: client.pricing_block ?? "",
          scope_values: client.scope_values ?? "",
          escalation_phone: client.escalation_phone ?? "",
          timezone_label: client.timezone_label ?? "Mountain Time",
          twilio_number: client.twilio_number ?? "",
          vapi_assistant_id: client.vapi_assistant_id ?? "",
          calendar_id: client.calendar_id ?? "",
          callback_window: client.callback_window ?? "within the hour",
          notify_email: client.notify_email ?? true,
          notify_dashboard_ping: client.notify_dashboard_ping ?? true,
          notify_sms: client.notify_sms ?? false,
          is_active: client.is_active ?? false,
          is_test: client.is_test ?? false,
        }}
      />
    </div>
  );
}
