import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTeamMembers } from "@/lib/team/members";
import { getJobTags, listTagsForClient } from "@/lib/tags/server";
import { listServiceSuggestions } from "@/lib/jobs/services";
import { JobEditForm } from "./form";

export default async function JobEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!job) notFound();

  const [allTags, jobTags, teamMembers, serviceOptions] = await Promise.all([
    listTagsForClient(job.client_id),
    getJobTags(Number(job.id)),
    getTeamMembers(job.client_id),
    listServiceSuggestions(job.client_id),
  ]);

  return (
    <div>
      <Link
        href={`/app/jobs/${job.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-bone-400 hover:text-bone-50 mb-4"
      >
        <ArrowLeft size={12} />
        Back to job
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase size={14} className="text-field-500" />
          <span className="label-eyebrow">Edit job #{job.id}</span>
        </div>
        <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
          {job.name || "Untitled"}
        </h1>
        <p className="text-sm text-bone-300 mt-1">
          Make changes and hit save. Click Cancel to return without saving.
        </p>
      </div>

      <JobEditForm
        job={{
          id: job.id,
          client_id: job.client_id,
          name: job.name ?? "",
          phone: job.phone ?? "",
          email: job.email ?? "",
          address: job.address ?? "",
          service: job.service ?? "",
          scope: job.scope ?? "",
          quoted_price: job.quoted_price ?? null,
          start_datetime: job.start_datetime ?? null,
          end_datetime: job.end_datetime ?? null,
          status: job.status ?? "lead",
          notes: job.notes ?? "",
          assigned_user_id: job.assigned_user_id ?? null,
        }}
        initialJobTags={jobTags}
        allTags={allTags}
        teamMembers={teamMembers}
        serviceOptions={serviceOptions}
      />
    </div>
  );
}
