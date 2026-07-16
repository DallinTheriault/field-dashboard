import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getTenantContext } from "@/lib/supabase/request-cache";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NavDrawer } from "@/components/shell/nav-drawer";
import { IdleTimeout } from "@/components/shell/idle-timeout";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Shared per-request auth lookup — pages and permission helpers reuse
  // this same round-trip instead of repeating it.
  const user = await getAuthUser();
  if (!user) redirect("/login");

  // Parallel fetch — tenant context + subscriptions independently. The
  // context is the request-shared Clients row (branding, timezone, flags),
  // so pages calling getTenantTimezone()/getTenantFeatureFlags() reuse
  // this same round-trip instead of re-querying Clients.
  const [client, { data: sub }] = await Promise.all([
    getTenantContext(),
    // We don't yet know client.id, but subscriptions is RLS-scoped so this
    // returns the caller's tenant subscription regardless. Wait — RLS uses
    // client_id IN (SELECT current_user_client_ids()), so this works.
    supabase.from("subscriptions").select("status, client_id").limit(1),
  ]);

  if (!client) {
    return (
      <main className="max-w-md mx-auto mt-20 p-6">
        <div className="panel p-6">
          <h1 className="text-lg font-semibold text-bone-50 mb-2">
            You&apos;re signed in, but not on a team yet
          </h1>
          <p className="text-sm text-bone-300 mb-2">
            Your account is created but hasn&apos;t been added to a business
            dashboard.
          </p>
          <p className="text-sm text-bone-300 mb-4">
            If a team owner invited you, ask them to go to{" "}
            <span className="font-mono text-bone-100">Settings → Team</span>{" "}
            and add{" "}
            <span className="font-mono text-bone-100">{user.email}</span>.
          </p>
          <p className="text-xs text-bone-400 mb-4">
            If you&apos;re a new business owner setting up Field, the public
            intake form is at{" "}
            <a
              href="/onboard"
              className="text-bone-100 underline underline-offset-2"
            >
              /onboard
            </a>
            .
          </p>
          <form action="/auth/logout" method="POST">
            <button type="submit" className="btn-secondary text-xs h-8">
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  // sub was fetched in parallel with clients above; just normalize the type
  const subRow = (sub as Array<{ status?: string }> | null)?.[0];
  const planStatus = (subRow?.status ?? "incomplete") as
    | "active"
    | "past_due"
    | "paused"
    | "cancelled"
    | "trialing"
    | "incomplete";

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminEmails.includes((user.email ?? "").toLowerCase());

  // Tenant accent color — converted to RGB triplet for use in
  // rgb(var(--tenant-accent) / opacity) syntax. Falls back to the field-500
  // default when the tenant hasn't set a custom color.
  const tenantAccentRgb = hexToRgbTriplet(client.brand_primary_color);

  const featureFlags = {
    voice: client.feature_voice_enabled ?? true,
    sms: client.feature_sms_enabled ?? true,
    calendar: client.feature_calendar_enabled ?? false,
    billing: client.feature_billing_enabled ?? true,
    estimator: client.feature_estimator_enabled ?? false,
  };

  return (
    <div
      className="flex min-h-screen w-full overflow-x-hidden"
      style={
        tenantAccentRgb
          ? ({ ["--tenant-accent" as string]: tenantAccentRgb } as React.CSSProperties)
          : undefined
      }
    >
      <Sidebar
        businessName={client.business_name ?? "—"}
        planStatus={planStatus}
        isAdmin={isAdmin}
        featureFlags={featureFlags}
      />

      <div className="flex-1 flex flex-col min-w-0 max-w-full">
        <Topbar
          userEmail={user.email ?? ""}
          businessName={client.business_name ?? "—"}
          businessShortName={client.business_short_name ?? null}
          brandLogoUrl={client.brand_logo_url ?? null}
        />

        <main className="flex-1 px-4 md:px-6 py-6 pb-28 md:pb-8 min-w-0 max-w-full overflow-x-hidden">
          <div className="mx-auto max-w-[1200px] min-w-0">{children}</div>
        </main>
      </div>

      <MobileNav featureFlags={featureFlags} />

      {/* Mobile nav drawer — mounted as a layout-root sibling so it can use
          position:fixed without being trapped by the topbar's containing
          block (backdrop-blur on the topbar otherwise breaks fixed children). */}
      <NavDrawer userEmail={user.email ?? ""} isAdmin={isAdmin} featureFlags={featureFlags} />

      {/* Idle session timeout — logs out after 30 min of inactivity */}
      <IdleTimeout />
    </div>
  );
}

/**
 * Convert a 6-digit hex color (e.g. "#4A9D8E") to a space-separated RGB
 * triplet ("74 157 142"). Returns null for invalid input so the caller can
 * fall back to the field-500 default.
 */
function hexToRgbTriplet(hex: string | null | undefined): string | null {
  if (!hex || typeof hex !== "string") return null;
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `${r} ${g} ${b}`;
}
