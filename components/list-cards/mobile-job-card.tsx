import Link from "next/link";
import { Phone, MapPin, CalendarDays, Briefcase } from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";

type JobCardData = {
  id: number;
  name: string | null;
  phone: string | null;
  service: string | null;
  address: string | null;
  status: string;
  quoted_price: number | null;
  start_datetime: string | null;
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
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Mobile-only card representation of a job row. Renders below `md:` where
 * the wide table would otherwise force horizontal scroll. Designed for
 * fast scanning: name + status visible at glance, phone + key info
 * underneath, dates pushed to a low-emphasis footer row.
 */
export function MobileJobCard({ job }: { job: JobCardData }) {
  return (
    <Link
      href={`/app/jobs/${job.id}`}
      className="block px-4 py-3 hover:bg-ink-2 active:bg-ink-2 transition-colors"
    >
      {/* Row 1: Name | Status */}
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="text-sm font-medium text-bone-100 truncate">
          {job.name || "—"}
        </div>
        <StatusChip status={job.status} className="shrink-0" />
      </div>

      {/* Row 2: Phone */}
      {job.phone && (
        <div className="flex items-center gap-1.5 text-xs text-bone-300 font-mono mb-1">
          <Phone size={11} className="text-bone-400 shrink-0" />
          {fmtPhone(job.phone)}
        </div>
      )}

      {/* Row 3: Service + address (whichever exist) */}
      {(job.service || job.address) && (
        <div className="flex items-start gap-1.5 text-xs text-bone-300 mb-1">
          {job.service && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <Briefcase size={11} className="text-bone-400" />
              {job.service}
            </span>
          )}
          {job.service && job.address && (
            <span className="text-bone-500">·</span>
          )}
          {job.address && (
            <span className="inline-flex items-start gap-1 min-w-0">
              <MapPin
                size={11}
                className="text-bone-400 shrink-0 mt-0.5"
              />
              <span className="truncate">{job.address}</span>
            </span>
          )}
        </div>
      )}

      {/* Row 4: Footer — start datetime + created */}
      <div className="flex items-center gap-3 text-2xs text-bone-400 mt-1.5">
        {job.start_datetime && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={10} />
            {fmtDate(job.start_datetime)}
          </span>
        )}
        <span className="ml-auto">Created {fmtDate(job.created_at)}</span>
      </div>
    </Link>
  );
}
