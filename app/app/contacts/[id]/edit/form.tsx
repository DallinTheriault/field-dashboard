"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TagPicker } from "@/components/tags/tag-picker";
import { AssignmentSelect } from "@/components/assignment/assignment-select";
import type { Tag } from "@/lib/tags/types";
import type { TeamMember } from "@/lib/team/types";

type ContactInput = {
  id: string | number;
  client_id: number;
  name: string;
  email: string;
  address: string;
  company: string;
  is_property_manager: boolean;
  notes: string;
  assigned_user_id: string | null;
};

export function ContactEditForm({
  contact,
  initialTags = [],
  allTags = [],
  teamMembers = [],
}: {
  contact: ContactInput;
  initialTags?: Tag[];
  allTags?: Tag[];
  teamMembers?: TeamMember[];
}) {
  const router = useRouter();
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email);
  const [address, setAddress] = useState(contact.address);
  const [company, setCompany] = useState(contact.company);
  const [isManager, setIsManager] = useState(contact.is_property_manager);
  const [notes, setNotes] = useState(contact.notes);
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [assignedUserId, setAssignedUserId] = useState<string | null>(
    contact.assigned_user_id ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const supabase = createClient();

    // 1. Update contact basics
    const { error: updateErr } = await supabase
      .from("contacts")
      .update({
        name: name || null,
        email: email || null,
        address: address || null,
        company: company.trim() || null,
        is_property_manager: isManager,
        notes: notes || null,
        assigned_user_id: assignedUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contact.id);
    if (updateErr) {
      setSaving(false);
      setErr(updateErr.message);
      return;
    }

    // 2. Diff tags: detach removed, attach new
    const initialIds = new Set(initialTags.map((t) => t.id));
    const currentIds = new Set(tags.map((t) => t.id));
    const toRemove = initialTags.filter((t) => !currentIds.has(t.id));
    const toAdd = tags.filter((t) => !initialIds.has(t.id));

    if (toRemove.length > 0) {
      await supabase
        .from("contact_tags")
        .delete()
        .eq("contact_id", contact.id)
        .in("tag_id", toRemove.map((t) => t.id));
    }
    if (toAdd.length > 0) {
      await supabase.from("contact_tags").insert(
        toAdd.map((t) => ({
          contact_id: contact.id,
          tag_id: t.id,
          client_id: contact.client_id,
        })),
      );
    }

    setSaving(false);
    router.push(`/app/contacts/${contact.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="form-card space-y-4">
      <div className="field-group">
        <label className="field-label">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Company</label>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Printed under the name on invoices"
          className="w-full"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-bone-100 min-h-[44px]">
        <input
          type="checkbox"
          checked={isManager}
          onChange={(e) => setIsManager(e.target.checked)}
          className="w-5 h-5"
        />
        Property manager (sends work orders; their jobs skip customer approval)
      </label>

      <div className="field-group">
        <label className="field-label">Address</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full"
        />
      </div>

      <TagPicker
        clientId={contact.client_id}
        allTags={allTags}
        selected={tags}
        onChange={setTags}
      />

      <AssignmentSelect
        value={assignedUserId}
        onChange={setAssignedUserId}
        members={teamMembers}
      />

      {err && <div className="form-error">{err}</div>}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/app/contacts/${contact.id}`)}
          className="btn-ghost text-sm"
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary text-sm" disabled={saving}>
          {saving ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </div>
    </form>
  );
}
