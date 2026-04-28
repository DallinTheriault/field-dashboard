"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ContactEditForm({
  contact,
}: {
  contact: {
    id: string | number;
    name: string;
    email: string;
    address: string;
    notes: string;
  };
}) {
  const router = useRouter();
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email);
  const [address, setAddress] = useState(contact.address);
  const [notes, setNotes] = useState(contact.notes);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("contacts")
      .update({
        name: name || null,
        email: email || null,
        address: address || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contact.id);
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
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
