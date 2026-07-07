"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Entity = {
  id: number;
  name: string;
  invoice_prefix: string;
  license_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  payment_instructions: string | null;
  default_footer_text: string | null;
  logo_path: string | null;
  is_default: boolean;
  active: boolean;
};

type Draft = Omit<Entity, "id" | "is_default" | "active" | "logo_path">;

const EMPTY: Draft = {
  name: "",
  invoice_prefix: "",
  license_number: "",
  address: "",
  phone: "",
  email: "",
  payment_instructions: "",
  default_footer_text: "",
};

/**
 * Billing entities — the letterheads a tenant estimates/invoices under
 * (e.g. an LLC plus its DBA). Invoice numbering is per-entity per-year
 * (PREFIX-2026-001). Logo upload arrives with document generation (M-D).
 */
export function EntitiesManager({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("billing_entities")
      .select(
        "id, name, invoice_prefix, license_number, address, phone, email, payment_instructions, default_footer_text, logo_path, is_default, active",
      )
      .order("created_at", { ascending: true });
    setEntities(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(e: Entity) {
    setEditing(e.id);
    setDraft({
      name: e.name,
      invoice_prefix: e.invoice_prefix,
      license_number: e.license_number ?? "",
      address: e.address ?? "",
      phone: e.phone ?? "",
      email: e.email ?? "",
      payment_instructions: e.payment_instructions ?? "",
      default_footer_text: e.default_footer_text ?? "",
    });
    setErr(null);
  }

  async function save() {
    setErr(null);
    const name = draft.name.trim();
    const prefix = draft.invoice_prefix.trim().toUpperCase();
    if (!name) return setErr("Name is required.");
    if (!/^[A-Z0-9]{1,8}$/.test(prefix)) {
      return setErr("Invoice prefix must be 1–8 letters/digits (e.g. SPC).");
    }
    setSaving(true);
    const row = {
      name,
      invoice_prefix: prefix,
      license_number: draft.license_number?.trim() || null,
      address: draft.address?.trim() || null,
      phone: draft.phone?.trim() || null,
      email: draft.email?.trim() || null,
      payment_instructions: draft.payment_instructions?.trim() || null,
      default_footer_text: draft.default_footer_text?.trim() || null,
    };
    const { error } =
      editing === "new"
        ? await supabase.from("billing_entities").insert({
            client_id: clientId,
            ...row,
            // First entity becomes the default automatically.
            is_default: entities.length === 0,
          })
        : await supabase.from("billing_entities").update(row).eq("id", editing);
    setSaving(false);
    if (error) return setErr(error.message);
    setEditing(null);
    setDraft(EMPTY);
    load();
  }

  async function makeDefault(id: number) {
    // Clear the current default first — a partial unique index allows only
    // one default per tenant.
    const current = entities.find((e) => e.is_default);
    if (current && current.id !== id) {
      const { error } = await supabase
        .from("billing_entities")
        .update({ is_default: false })
        .eq("id", current.id);
      if (error) return setErr(error.message);
    }
    const { error } = await supabase
      .from("billing_entities")
      .update({ is_default: true })
      .eq("id", id);
    if (error) setErr(error.message);
    load();
  }

  async function uploadLogo(e: Entity, file: File) {
    setErr(null);
    const fd = new FormData();
    fd.append("logo", file);
    const res = await fetch(`/api/estimator/entities/${e.id}/logo`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "Logo upload failed.");
      return;
    }
    load();
  }

  async function removeLogo(e: Entity) {
    if (!confirm("Remove this letterhead logo?")) return;
    await fetch(`/api/estimator/entities/${e.id}/logo`, { method: "DELETE" });
    load();
  }

  async function remove(e: Entity) {
    if (
      !confirm(
        `Delete "${e.name}"? Existing estimates/invoices keep their letterhead data, but you can't issue new documents under it.`,
      )
    ) {
      return;
    }
    const { error } = await supabase
      .from("billing_entities")
      .delete()
      .eq("id", e.id);
    if (error) {
      // FK RESTRICT from estimates — deactivate instead of hard delete.
      const { error: e2 } = await supabase
        .from("billing_entities")
        .update({ active: false })
        .eq("id", e.id);
      if (e2) return setErr(e2.message);
    }
    load();
  }

  if (loading) {
    return <div className="px-4 py-4 text-2xs text-bone-400">Loading…</div>;
  }

  const form = (
    <div className="bg-ink-2 border border-line rounded-sm p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="field-group col-span-2 sm:col-span-1">
          <span className="field-label">Business name</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Sharpline Painting Co."
            className="w-full"
          />
        </label>
        <label className="field-group">
          <span className="field-label">Invoice prefix</span>
          <input
            value={draft.invoice_prefix}
            onChange={(e) =>
              setDraft({ ...draft, invoice_prefix: e.target.value.toUpperCase() })
            }
            placeholder="SPC"
            maxLength={8}
            className="w-full"
          />
          <span className="field-hint">Numbering: SPC-2026-001</span>
        </label>
        <label className="field-group">
          <span className="field-label">License #</span>
          <input
            value={draft.license_number ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, license_number: e.target.value })
            }
            className="w-full"
          />
        </label>
        <label className="field-group">
          <span className="field-label">Phone</span>
          <input
            inputMode="tel"
            value={draft.phone ?? ""}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            className="w-full"
          />
        </label>
        <label className="field-group">
          <span className="field-label">Email</span>
          <input
            type="email"
            value={draft.email ?? ""}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            className="w-full"
          />
        </label>
        <label className="field-group col-span-2">
          <span className="field-label">Address</span>
          <input
            value={draft.address ?? ""}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            className="w-full"
          />
        </label>
        <label className="field-group col-span-2">
          <span className="field-label">Payment instructions (shown on invoices)</span>
          <textarea
            value={draft.payment_instructions ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, payment_instructions: e.target.value })
            }
            rows={2}
            className="w-full"
          />
        </label>
        <label className="field-group col-span-2">
          <span className="field-label">Document footer</span>
          <input
            value={draft.default_footer_text ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, default_footer_text: e.target.value })
            }
            placeholder="Sharpline Painting Co. is a DBA of Theriault Property Services LLC."
            className="w-full"
          />
        </label>
      </div>
      {err && <div className="form-error">{err}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setErr(null);
          }}
          className="btn-ghost text-sm"
        >
          <X size={13} />
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary text-sm"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : "Save entity"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="px-4 py-4 space-y-3">
      <ul className="space-y-2">
        {entities.map((e) =>
          editing === e.id ? (
            <li key={e.id}>{form}</li>
          ) : (
            <li
              key={e.id}
              className={`flex items-center gap-2.5 px-3 py-2.5 bg-ink-2 rounded-sm shadow-inset-line ${
                e.active ? "" : "opacity-50"
              }`}
            >
              <button
                type="button"
                onClick={() => makeDefault(e.id)}
                title={e.is_default ? "Default entity" : "Make default"}
                className={
                  e.is_default
                    ? "text-field-500"
                    : "text-bone-500 hover:text-bone-300"
                }
              >
                <Star size={14} fill={e.is_default ? "currentColor" : "none"} />
              </button>
              {/* Light plate — letterhead logos are often dark-on-transparent
                  and vanish on the dark UI without it. */}
              <label
                className="w-11 h-11 shrink-0 rounded-sm bg-white border border-line-strong flex items-center justify-center overflow-hidden cursor-pointer"
                title={e.logo_path ? "Replace logo" : "Upload letterhead logo"}
              >
                {e.logo_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.logo_path}
                    alt={`${e.name} logo`}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <ImagePlus size={14} className="text-ink-3" />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    if (f) uploadLogo(e, f);
                    ev.target.value = "";
                  }}
                />
              </label>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-bone-100 font-medium truncate">
                  {e.name}
                  {!e.active && (
                    <span className="ml-2 text-2xs text-bone-500 uppercase">
                      inactive
                    </span>
                  )}
                </div>
                <div className="text-2xs text-bone-400 font-mono">
                  {e.invoice_prefix}
                  {e.license_number ? ` · Lic. ${e.license_number}` : ""}
                  {e.logo_path && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => removeLogo(e)}
                        className="text-bone-500 hover:text-status-danger"
                      >
                        remove logo
                      </button>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => startEdit(e)}
                className="text-bone-400 hover:text-bone-100 p-1"
                aria-label={`Edit ${e.name}`}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => remove(e)}
                className="text-bone-500 hover:text-status-danger p-1"
                aria-label={`Delete ${e.name}`}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ),
        )}
      </ul>

      {editing === "new" ? (
        form
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditing("new");
            setDraft(EMPTY);
            setErr(null);
          }}
          className="btn-secondary text-sm"
        >
          <Plus size={13} />
          Add entity
        </button>
      )}
    </div>
  );
}
