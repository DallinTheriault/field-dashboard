import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/logo";
import { ShieldAlert, ArrowLeft } from "lucide-react";

function parseAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin");

  const adminEmails = parseAdminEmails();
  const userEmail = (user.email ?? "").toLowerCase();
  const isAdmin = adminEmails.includes(userEmail);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="panel-elevated max-w-md w-full p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert
              size={20}
              className="text-status-danger shrink-0 mt-0.5"
            />
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-bone-50">
                Not authorized
              </h1>
              <p className="text-sm text-bone-300 mt-1">
                The admin area is restricted to platform operators. If you
                need access, ask your operator to add{" "}
                <code className="font-mono text-bone-100 bg-ink-3 px-1 py-0.5 rounded-xs text-2xs">
                  {userEmail || "your email"}
                </code>{" "}
                to <code className="font-mono text-bone-100 text-2xs">ADMIN_EMAILS</code>.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <Link href="/app" className="btn-secondary text-xs">
                  <ArrowLeft size={12} /> Back to dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Admin header — distinct from tenant nav so you always know where you are */}
      <header className="h-14 border-b border-field-500/30 bg-field-500/[0.04] sticky top-0 z-20 backdrop-blur-md">
        <div className="h-full max-w-[1100px] mx-auto px-6 flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-2.5 shrink-0">
            <Logo size="sm" />
            <span className="label-eyebrow text-field-500 leading-none">Admin</span>
          </Link>
          <nav className="flex items-center gap-1 ml-3">
            <Link
              href="/admin"
              className="text-xs text-bone-300 hover:text-bone-50 px-2 py-1 rounded-xs"
            >
              Home
            </Link>
            <Link
              href="/admin/payment-links"
              className="text-xs text-bone-300 hover:text-bone-50 px-2 py-1 rounded-xs"
            >
              Payment links
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-2xs text-bone-400 hidden sm:inline">{user.email}</span>
            <Link href="/app" className="btn-ghost text-xs h-7 px-2">
              ← Tenant view
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
