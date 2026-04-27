import Link from "next/link";
import { Link2, Users, FileText, ChevronRight } from "lucide-react";

const TILES = [
  {
    href: "/admin/payment-links",
    icon: Link2,
    title: "Payment links",
    body: "Generate Stripe payment links for new customer setups. Sets client_reference_id automatically.",
  },
  {
    href: "/admin/clients",
    icon: Users,
    title: "Clients",
    body: "All tenants on the platform, with subscription state and quick links.",
    soon: true,
  },
  {
    href: "/admin/invoices",
    icon: FileText,
    title: "Invoices",
    body: "Cross-tenant invoice activity. Useful for chasing unpaid invoices.",
    soon: true,
  },
];

export default function AdminHome() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
        Admin
      </h1>
      <p className="text-sm text-bone-300 mt-1 mb-8">
        Platform-wide tools. You&apos;re seeing this because your email is in{" "}
        <code className="font-mono text-bone-100 text-2xs">ADMIN_EMAILS</code>.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
        {TILES.map(({ href, icon: Icon, title, body, soon }) => (
          <Link
            key={href}
            href={soon ? "#" : href}
            className={`panel p-4 flex items-start gap-3 transition-colors ${
              soon ? "opacity-50 cursor-not-allowed" : "hover:bg-ink-2"
            }`}
          >
            <Icon size={16} className="text-salmon-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-bone-100">
                  {title}
                </span>
                {soon && (
                  <span className="text-2xs text-bone-400 font-mono">soon</span>
                )}
              </div>
              <p className="text-xs text-bone-400 mt-1 leading-relaxed">
                {body}
              </p>
            </div>
            {!soon && <ChevronRight size={14} className="text-bone-400 shrink-0 mt-1" />}
          </Link>
        ))}
      </div>
    </div>
  );
}
