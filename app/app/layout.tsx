import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { IdleTimeout } from "@/components/shell/idle-timeout";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clients } = await supabase
    .from("Clients")
    .select("id, business_name, business_short_name, is_active, brand_logo_url, brand_primary_color")
    .order("id")
    .limit(1);

  const client = clients?.[0];

  if (!client) {
    return (
      <main className="max-w-md mx-auto mt-20 p-6">
        <div className="panel p-6">
          <h1 className="text-lg font-semibold text-bone-50 mb-2">
            Account not provisioned
          </h1>
          <p className="text-sm text-bone-300 mb-4">
            Your user isn&apos;t linked to a business yet. Reach out to your Field operator to finish setup.
          </p>
          <form action="/auth/logout" method="POST">
            <button type="submit" className="btn-secondary">
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("client_id", client.id)
    .maybeSingle();

  const planStatus = (sub?.status ?? "incomplete") as
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
      />

      <div className="flex-1 flex flex-col min-w-0 max-w-full">
        <Topbar
          userEmail={user.email ?? ""}
          businessName={client.business_name ?? "—"}
          businessShortName={client.business_short_name ?? null}
          brandLogoUrl={client.brand_logo_url ?? null}
        />

        <main className="flex-1 px-4 md:px-6 py-6 pb-20 md:pb-8 min-w-0 max-w-full overflow-x-hidden">
          <div className="mx-auto max-w-[1200px] min-w-0">{children}</div>
        </main>
      </div>

      <MobileNav />

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
