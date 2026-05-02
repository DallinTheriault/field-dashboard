import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listTagsForClient } from "@/lib/tags/server";
import { getTeamMembers } from "@/lib/team/members";
import { NewContactForm } from "./form";

export default async function NewContactPage() {
  const supabase = await createClient();

  // Need the current user's tenant to scope tags + team members
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="panel p-6 max-w-md">
        <p className="text-sm text-bone-300">You must be signed in.</p>
      </div>
    );
  }

  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .limit(1)
    .maybeSingle();

  const clientId = (clientUser as { client_id?: number } | null)?.client_id;
  if (!clientId) {
    return (
      <div className="panel p-6 max-w-md">
        <p className="text-sm text-bone-300">
          You&apos;re signed in but not on a team yet.
        </p>
      </div>
    );
  }

  const [allTags, teamMembers] = await Promise.all([
    listTagsForClient(clientId),
    getTeamMembers(clientId),
  ]);

  return (
    <div className="max-w-2xl">
      <Link
        href="/app/contacts"
        className="inline-flex items-center gap-1.5 text-xs text-bone-400 hover:text-bone-50 mb-4"
      >
        <ArrowLeft size={12} />
        Back to contacts
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <UserPlus size={14} className="text-field-500" />
          <span className="label-eyebrow">New contact</span>
        </div>
        <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
          Add a contact
        </h1>
        <p className="text-sm text-bone-300 mt-1">
          Manually create a contact. Most contacts are added automatically
          when calls or texts come in.
        </p>
      </div>

      <NewContactForm
        clientId={clientId}
        allTags={allTags}
        teamMembers={teamMembers}
      />
    </div>
  );
}
