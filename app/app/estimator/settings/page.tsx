import { redirect } from "next/navigation";
import {
  Banknote,
  Building2,
  Hammer,
  Package,
  Percent,
  MapPin,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { PricingSection } from "./pricing-section";
import { EntitiesManager } from "./entities-manager";
import { CatalogManager } from "./catalog-manager";
import { MaterialsManager } from "./materials-manager";
import { ModifiersManager } from "./modifiers-manager";
import { ZonesManager } from "./zones-manager";

/**
 * Estimator settings — the "Settings layer" of the two-layer design.
 * Everything here is edited rarely and deliberately; the estimate builder
 * (job layer) only consumes these values. Pricing internals live on this
 * page, so it is owner/manager-only (members are bounced), mirroring the
 * user_can_write_client RLS gate on the underlying tables.
 */
export default async function EstimatorSettingsPage() {
  const session = await getCurrentUserRole();
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");

  const flags = await getTenantFeatureFlags();
  if (!flags.estimator) {
    return (
      <FeatureDisabledPanel
        featureName="Estimator"
        description="Estimating + invoicing: pricing settings, estimate builder, and job insights."
      />
    );
  }

  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("Clients")
    .select("id")
    .limit(1);
  const clientId = clients?.[0]?.id;
  if (!clientId) redirect("/app");

  const sections = [
    {
      id: "pricing",
      icon: Banknote,
      title: "Pay, hours & margin",
      desc: "What this business should pay you, and the rates derived from it.",
      body: <PricingSection clientId={clientId} />,
    },
    {
      id: "entities",
      icon: Building2,
      title: "Billing entities",
      desc: "Letterheads you estimate and invoice under (LLC, DBA). Each keeps its own invoice numbering.",
      body: <EntitiesManager clientId={clientId} />,
    },
    {
      id: "catalog",
      icon: Hammer,
      title: "Service catalog",
      desc: "Measured work (per sqft/lnft) and task work (flat hours). Consistent prices come from here.",
      body: <CatalogManager clientId={clientId} />,
    },
    {
      id: "materials",
      icon: Package,
      title: "Materials",
      desc: "Prices and coverage for what you buy. Quantities always round up to purchasable units.",
      body: <MaterialsManager clientId={clientId} />,
    },
    {
      id: "modifiers",
      icon: Percent,
      title: "Prep modifiers",
      desc: "Multipliers applied to labor hours only — never to materials.",
      body: <ModifiersManager clientId={clientId} />,
    },
    {
      id: "zones",
      icon: MapPin,
      title: "Travel zones",
      desc: "Flat fee added to job cost by distance. One zone per estimate.",
      body: <ZonesManager clientId={clientId} />,
    },
  ];

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-bone-50">
          Estimator settings
        </h1>
        <p className="text-sm text-bone-400 mt-1">
          Edited rarely, deliberately. Saved estimates never change when these
          do — only new estimates (or an explicit reprice) pick up new values.
        </p>
      </header>

      {sections.map(({ id, icon: Icon, title, desc, body }) => (
        <section key={id} id={id} className="panel">
          <div className="px-4 py-3 border-b border-line flex items-start gap-2.5">
            <Icon size={15} className="text-field-500 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-bone-100">{title}</h2>
              <p className="text-2xs text-bone-400 mt-0.5">{desc}</p>
            </div>
          </div>
          {body}
        </section>
      ))}
    </main>
  );
}
