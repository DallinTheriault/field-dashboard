import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
        <p className="text-sm text-bone-300 mt-1">Feature flags and the platform-managed details.</p>
      </div>

      <div className="mb-4">
        <AdminFeatureFlagsForm
          clientId={client.id}
          initial={{
            feature_calendar_enabled: client.feature_calendar_enabled ?? false,
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
          business_phone: client.business_phone ?? "",
          business_website: client.business_website ?? "",
          owner_email: client.owner_email ?? "",
          owner_phone: client.owner_phone ?? "",
          timezone_label: client.timezone_label ?? "Mountain Time",
          calendar_id: client.calendar_id ?? "",
          is_active: client.is_active ?? false,
          is_test: client.is_test ?? false,
        }}
      />
    </div>
  );
}
