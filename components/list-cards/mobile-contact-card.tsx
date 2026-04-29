import Link from "next/link";
import { Phone, Mail, MapPin } from "lucide-react";

type ContactCardData = {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  updated_at: string | null;
  created_at: string;
};

function fmtPhone(p: string | null): string {
  if (!p) return "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p);
  if (!m) return p;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MobileContactCard({ contact }: { contact: ContactCardData }) {
  return (
    <Link
      href={`/app/contacts/${contact.id}`}
      className="block px-4 py-3 hover:bg-ink-2 active:bg-ink-2 transition-colors"
    >
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="text-sm font-medium text-bone-100 truncate">
          {contact.name || "—"}
        </div>
        <div className="text-2xs text-bone-400 shrink-0">
          {fmtDate(contact.updated_at ?? contact.created_at)}
        </div>
      </div>

      {contact.phone && (
        <div className="flex items-center gap-1.5 text-xs text-bone-300 font-mono mb-1">
          <Phone size={11} className="text-bone-400 shrink-0" />
          {fmtPhone(contact.phone)}
        </div>
      )}

      {contact.email && (
        <div className="flex items-center gap-1.5 text-xs text-bone-300 mb-1 truncate">
          <Mail size={11} className="text-bone-400 shrink-0" />
          <span className="truncate">{contact.email}</span>
        </div>
      )}

      {contact.address && (
        <div className="flex items-start gap-1.5 text-xs text-bone-300">
          <MapPin size={11} className="text-bone-400 shrink-0 mt-0.5" />
          <span className="truncate">{contact.address}</span>
        </div>
      )}
    </Link>
  );
}
