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
    .select("id, business_name, is_active")
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

  return (
    <div className="flex min-h-screen">
      <Sidebar
        businessName={client.business_name ?? "—"}
        planStatus={planStatus}
        isAdmin={isAdmin}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          userEmail={user.email ?? ""}
          businessName={client.business_name ?? "—"}
        />

        <main className="flex-1 px-4 md:px-6 py-6 pb-20 md:pb-8">
          <div className="mx-auto max-w-[1200px]">{children}</div>
        </main>
      </div>

      <MobileNav />

      {/* Idle session timeout — logs out after 30 min of inactivity */}
      <IdleTimeout />
    </div>
  );
}
