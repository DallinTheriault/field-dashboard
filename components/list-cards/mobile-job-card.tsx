import Link from "next/link";
import { Phone, MapPin, CalendarDays, Briefcase } from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { TagChipList } from "@/components/tags/tag-chip";
import type { Tag } from "@/lib/tags/types";

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

export function MobileJobCard({
  job,
  tags = [],
}: {
  job: JobCardData;
  tags?: Tag[];
}) {
  return (
    <Link
      href={`/app/jobs/${job.id}`}
      // Job detail is the most expensive render in the app; letting every
      // visible row prefetch it saturates mobile bandwidth right when the
      // user taps (perf re-plan step 2). The tap itself now shows an
      // instant skeleton instead.
      prefetch={false}
      className="block px-4 py-3 hover:bg-ink-2 active:bg-ink-2 transition-colors"
    >
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="text-sm font-medium text-bone-100 truncate">
          {job.name || "—"}
        </div>
        <StatusChip status={job.status} className="shrink-0" />
      </div>

      {job.phone && (
        <div className="flex items-center gap-1.5 text-xs text-bone-300 font-mono mb-1">
          <Phone size={11} className="text-bone-400 shrink-0" />
          {fmtPhone(job.phone)}
        </div>
      )}

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
              <MapPin size={11} className="text-bone-400 shrink-0 mt-0.5" />
              <span className="truncate">{job.address}</span>
            </span>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-2 mb-1">
          <TagChipList tags={tags} maxVisible={4} size="sm" />
        </div>
      )}

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
