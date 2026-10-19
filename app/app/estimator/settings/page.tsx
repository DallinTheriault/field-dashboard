import { redirect } from "next/navigation";
import {
  Banknote,
  Building2,
  Hammer,
  Package,
  Percent,
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

/**
 * Pricing: your rates, billing entities, the price book, and the old
 * estimate builder's materials, modifiers and zones. Owner/manager-only
 * (members are bounced), mirroring the user_can_write_client RLS gate on the
 * underlying tables.
 */
export default async function EstimatorSettingsPage() {
  const [session, flags] = await Promise.all([
    getCurrentUserRole(),
    getTenantFeatureFlags(),
  ]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");
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
      title: "Your rates",
      desc: "What you charge per hour, your smallest job, and markup on materials.",
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
      title: "Price book",
      desc: "Work you sell often. Its price is typical hours × your rate, unless you set your own. Changing a price never changes a job, estimate or invoice already written.",
      body: <CatalogManager clientId={clientId} />,
    },
    {
      id: "materials",
      icon: Package,
      title: "Materials",
      desc: "Old estimate builder only: prices and coverage for what you buy. Quantities round up to what you can buy.",
      body: <MaterialsManager clientId={clientId} />,
    },
    {
      id: "modifiers",
      icon: Percent,
      title: "Prep modifiers",
      desc: "Old estimate builder only: extra labor hours for harder jobs (never materials).",
      body: <ModifiersManager clientId={clientId} />,
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-bone-50">
          Pricing
        </h1>
        <p className="text-sm text-bone-400 mt-1">
          Changing these never changes a job line, estimate or invoice already
          written. New lines pick up new prices.
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
    </div>
  );
}
