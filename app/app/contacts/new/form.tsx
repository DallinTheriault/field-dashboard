"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TagPicker } from "@/components/tags/tag-picker";
import { AssignmentSelect } from "@/components/assignment/assignment-select";
import type { Tag } from "@/lib/tags/types";
import type { TeamMember } from "@/lib/team/types";

export function NewContactForm({
  clientId,
  allTags,
  teamMembers,
}: {
  clientId: number;
  allTags: Tag[];
  teamMembers: TeamMember[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [assignedUserId, setAssignedUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim() && !phone.trim()) {
      setErr("Add a name or phone number at minimum.");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    // 1. Insert contact
    const { data: contact, error: insertErr } = await supabase
      .from("contacts")
      .insert({
        client_id: clientId,
        name: name.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        assigned_user_id: assignedUserId,
      })
      .select()
      .single();

    if (insertErr || !contact) {
      setSaving(false);
      setErr(insertErr?.message || "Failed to create contact");
      return;
    }

    const newContactId = (contact as { id: number }).id;

    // 2. Attach tags via join table (if any)
    if (tags.length > 0) {
      const { error: tagErr } = await supabase.from("contact_tags").insert(
        tags.map((t) => ({
          contact_id: newContactId,
          tag_id: t.id,
          client_id: clientId,
        })),
      );
      if (tagErr) {
        // Contact created but tag attach failed — surface but don't block
        console.warn("Tags attach failed:", tagErr.message);
      }
    }

    setSaving(false);
    router.push(`/app/contacts/${newContactId}`);
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
          placeholder="Jane Doe"
          className="w-full"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Phone</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="w-full"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
          className="w-full"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Address</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St"
          className="w-full"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full"
        />
      </div>

      <TagPicker
        clientId={clientId}
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
          onClick={() => router.push("/app/contacts")}
          className="btn-ghost text-sm"
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary text-sm" disabled={saving}>
          {saving ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Creating…
            </>
          ) : (
            "Create contact"
          )}
        </button>
      </div>
    </form>
  );
}
