"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Loader2, Save, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Template = {
  id: number;
  label: string;
  body: string;
  sort_order: number;
};

/**
 * Manage SMS reply templates. Renders inline on the Settings page, anchored
 * by `id="sms-templates"` so we can deep-link from the empty-state hint
 * inside the reply box.
 *
 * Operations are simple — no drag reorder yet (sort_order field stored but
 * managed via add-order; reorder is v0.6 polish if it actually matters).
 */
export function ReplyTemplatesManager({ clientId }: { clientId: number }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const supabase = createClient();

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("sms_reply_templates")
      .select("id, label, body, sort_order")
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setTemplates(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(t: Template) {
    setEditing(t.id);
    setDraftLabel(t.label);
    setDraftBody(t.body);
    setErr(null);
  }

  function startNew() {
    setEditing("new");
    setDraftLabel("");
    setDraftBody("");
    setErr(null);
  }

  function cancel() {
    setEditing(null);
    setDraftLabel("");
    setDraftBody("");
    setErr(null);
  }

  async function save() {
    setErr(null);
    const label = draftLabel.trim();
    const body = draftBody.trim();
    if (!label) {
      setErr("Label is required.");
      return;
    }
    if (!body) {
      setErr("Body is required.");
      return;
    }
    if (body.length > 1600) {
      setErr(`Body too long (${body.length}/1600).`);
      return;
    }
    setSaving(true);
    if (editing === "new") {
      const nextOrder =
        templates.length > 0
          ? Math.max(...templates.map((t) => t.sort_order)) + 1
          : 0;
      const { error } = await supabase.from("sms_reply_templates").insert({
        client_id: clientId,
        label,
        body,
        sort_order: nextOrder,
      });
      if (error) {
        setErr(error.message);
        setSaving(false);
        return;
      }
    } else if (typeof editing === "number") {
      const { error } = await supabase
        .from("sms_reply_templates")
        .update({ label, body })
        .eq("id", editing);
      if (error) {
        setErr(error.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    cancel();
    load();
  }

  async function archive(id: number) {
    if (!confirm("Delete this template? It won't be available in the reply box.")) {
      return;
    }
    await supabase
      .from("sms_reply_templates")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    load();
  }

  return (
    <div className="px-4 py-3" id="sms-templates">
      {loading ? (
        <div className="text-2xs text-bone-400 py-2">Loading…</div>
      ) : (
        <>
          {templates.length === 0 && editing !== "new" && (
            <p className="text-xs text-bone-400 mb-3 leading-relaxed">
              Save replies you send often (&ldquo;On my way,&rdquo;
              &ldquo;Running 10 min late,&rdquo; etc.) so you can insert
              them with one tap from the SMS reply box.
            </p>
          )}

          <ul className="space-y-2 mb-3">
            {templates.map((t) =>
              editing === t.id ? (
                <li
                  key={t.id}
                  className="bg-ink-2 border border-line rounded-sm p-3 space-y-2"
                >
                  <input
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    placeholder="Short label (e.g. On my way)"
                    maxLength={40}
                    className="w-full"
                  />
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    placeholder="Full message body"
                    rows={2}
                    maxLength={1600}
                    className="w-full resize-y min-h-[60px]"
                  />
                  {err && (
                    <p className="text-2xs text-status-danger">{err}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={save}
                      disabled={saving}
                      className="btn-primary text-xs h-8"
                    >
                      {saving ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Save size={11} />
                      )}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancel}
                      className="btn-ghost text-xs h-8"
                    >
                      <X size={11} />
                      Cancel
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={t.id}
                  className="flex items-start gap-2 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-bone-100 truncate">
                      {t.label}
                    </div>
                    <div className="text-2xs text-bone-400 truncate">
                      {t.body}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className="btn-ghost text-2xs h-7 px-2"
                    title="Edit"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => archive(t.id)}
                    className="btn-ghost text-2xs h-7 px-2 hover:!text-status-danger"
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                </li>
              ),
            )}
          </ul>

          {editing === "new" ? (
            <div className="bg-ink-2 border border-line rounded-sm p-3 space-y-2">
              <input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="Short label (e.g. On my way)"
                maxLength={40}
                autoFocus
                className="w-full"
              />
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="Full message body"
                rows={2}
                maxLength={1600}
                className="w-full resize-y min-h-[60px]"
              />
              {err && <p className="text-2xs text-status-danger">{err}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="btn-primary text-xs h-8"
                >
                  {saving ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Save size={11} />
                  )}
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  className="btn-ghost text-xs h-8"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startNew}
              className="btn-secondary text-xs h-8"
            >
              <Plus size={11} />
              Add template
            </button>
          )}
        </>
      )}
    </div>
  );
}
