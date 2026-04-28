"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertCircle, RotateCcw } from "lucide-react";

const DEFAULT_COLOR = "#4A9D8E";
const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

function normalizeHex(input: string): string | null {
  const v = input.trim();
  if (HEX_REGEX.test(v)) return v.toUpperCase();
  // Accept short form like #ABC -> #AABBCC
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  // Accept missing # prefix
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toUpperCase()}`;
  return null;
}

export function ColorPicker({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState<string>(initial ?? DEFAULT_COLOR);
  const [draft, setDraft] = useState<string>(initial ?? DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const isCustom = value.toUpperCase() !== DEFAULT_COLOR;
  const dirty = draft !== value;
  const draftHex = normalizeHex(draft);
  const draftIsValid = draftHex !== null;

  async function save(target: string | null) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/branding/color", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setValue(target ?? DEFAULT_COLOR);
      setDraft(target ?? DEFAULT_COLOR);
      setSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (!draftIsValid) {
      setError("Enter a valid hex color (e.g. #4A9D8E)");
      return;
    }
    save(draftHex);
  }

  function handleReset() {
    save(null);
  }

  const justSaved = savedAt !== null && Date.now() - savedAt < 2500;

  return (
    <div>
      <div className="label-eyebrow mb-2">Primary color</div>

      <div className="flex items-center gap-2 flex-wrap">
        <label className="relative cursor-pointer">
          <input
            type="color"
            value={draftIsValid ? draftHex : DEFAULT_COLOR}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            className="sr-only"
            disabled={saving}
          />
          <span
            aria-hidden
            className="block w-9 h-9 rounded-sm border border-line-strong shadow-inset-line"
            style={{ background: draftIsValid ? draftHex! : DEFAULT_COLOR }}
          />
        </label>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = normalizeHex(draft);
            if (n) setDraft(n);
          }}
          placeholder="#4A9D8E"
          spellCheck={false}
          className="!bg-ink-2 font-mono text-xs h-9 w-28 uppercase"
          disabled={saving}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty || !draftIsValid}
          className="btn-primary text-xs h-9"
        >
          {saving ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save"
          )}
        </button>
        {isCustom && !saving && (
          <button
            type="button"
            onClick={handleReset}
            className="btn-ghost text-xs h-9"
            title="Reset to default Field teal"
          >
            <RotateCcw size={11} />
            Reset
          </button>
        )}
      </div>

      {!draftIsValid && (
        <div className="mt-2 flex items-start gap-1.5 text-2xs text-status-progress">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          <span>Enter a valid 6-digit hex color (e.g. {DEFAULT_COLOR}).</span>
        </div>
      )}
      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-2xs text-status-danger">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {justSaved && !error && (
        <div className="mt-2 flex items-start gap-1.5 text-2xs text-status-completed">
          <Check size={11} className="shrink-0 mt-0.5" />
          <span>Saved.</span>
        </div>
      )}

      <p className="text-2xs text-bone-400 mt-3 leading-relaxed max-w-md">
        Applied to your dashboard accents — metric card stripes and your
        business logo border. The Field teal stays as the platform brand
        everywhere else.
      </p>
    </div>
  );
}
