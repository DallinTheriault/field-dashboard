"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertCircle, Volume2 } from "lucide-react";

const VOICE_PRESETS = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", sample: "Calm, professional, clear" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", sample: "Strong, confident, mid-pitch" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", sample: "Friendly, soft, warm" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", sample: "Well-paced, friendly male" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", sample: "Crisp, deliberate male" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", sample: "Deep, narrator male" },
];

export function VoicePicker({ initialVoiceId }: { initialVoiceId: string | null }) {
  const router = useRouter();
  const [voiceId, setVoiceId] = useState<string>(initialVoiceId ?? VOICE_PRESETS[0].id);
  const [pendingVoiceId, setPendingVoiceId] = useState<string>(voiceId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const dirty = pendingVoiceId !== voiceId;

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/branding/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_id: pendingVoiceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update voice");
      }
      setVoiceId(pendingVoiceId);
      setSavedAt(new Date());
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setLoading(false);
    }
  }

  const current = VOICE_PRESETS.find((v) => v.id === voiceId) ?? VOICE_PRESETS[0];

  return (
    <div>
      <div className="label-eyebrow mb-3">Currently selected</div>
      <div className="flex items-center gap-2 mb-1">
        <Volume2 size={13} className="text-salmon-500" />
        <span className="text-sm font-medium text-bone-100">{current.name}</span>
      </div>
      <div className="text-xs text-bone-400 mb-4">{current.sample}</div>

      <label className="label-eyebrow block mb-2">Change voice</label>
      <div className="flex items-center gap-2">
        <select
          value={pendingVoiceId}
          onChange={(e) => setPendingVoiceId(e.target.value)}
          className="!bg-ink-2 h-9 text-xs flex-1 max-w-xs"
          disabled={loading}
        >
          {VOICE_PRESETS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} — {v.sample}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || loading}
          className="btn-primary text-xs h-9"
        >
          {loading ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save"
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-1.5 text-2xs text-status-danger">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {savedAt && !error && (
        <div className="mt-3 flex items-start gap-1.5 text-2xs text-status-completed">
          <Check size={11} className="shrink-0 mt-0.5" />
          <span>Saved. Reach out to your operator to push the new voice to your assistant.</span>
        </div>
      )}

      <p className="text-2xs text-bone-400 mt-4 leading-relaxed">
        Voice changes are saved here, but require a manual push to your VAPI
        assistant. Self-serve voice deployment is coming in v0.4.
      </p>
    </div>
  );
}
