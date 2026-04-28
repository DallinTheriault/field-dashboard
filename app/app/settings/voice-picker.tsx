"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertCircle, Volume2 } from "lucide-react";

// Preset list of well-known ElevenLabs default voices. The "Custom" option
// lets users paste in any voice ID — including their own cloned voices or
// community voices not in this list. There's no reliable way to validate an
// arbitrary voice ID without actually calling ElevenLabs, so we accept any
// string that looks like an ElevenLabs ID (20 alphanumeric chars).
const VOICE_PRESETS = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", sample: "Calm, professional, clear (female)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", sample: "Friendly, soft, warm (female)" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", sample: "Strong, confident, mid-pitch (female)" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", sample: "Soft Swedish-accented (female)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", sample: "Soft American (female)" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", sample: "Well-paced, friendly (male)" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", sample: "Australian, casual (male)" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", sample: "Crisp, deliberate (male)" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", sample: "Deep, narrator (male)" },
];

const CUSTOM_OPTION = "__custom__";
const VOICE_ID_REGEX = /^[A-Za-z0-9]{20}$/;

export function VoicePicker({ initialVoiceId }: { initialVoiceId: string | null }) {
  const router = useRouter();

  const initial = initialVoiceId ?? VOICE_PRESETS[0].id;
  const initialIsPreset = VOICE_PRESETS.some((v) => v.id === initial);

  const [voiceId, setVoiceId] = useState<string>(initial);

  // The dropdown picks either a preset id or the special CUSTOM_OPTION.
  const [pendingSelection, setPendingSelection] = useState<string>(
    initialIsPreset ? initial : CUSTOM_OPTION,
  );
  const [pendingCustomId, setPendingCustomId] = useState<string>(
    initialIsPreset ? "" : initial,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const pendingVoiceId =
    pendingSelection === CUSTOM_OPTION ? pendingCustomId.trim() : pendingSelection;

  const dirty = pendingVoiceId !== voiceId && pendingVoiceId.length > 0;
  const customInvalid =
    pendingSelection === CUSTOM_OPTION &&
    pendingCustomId.length > 0 &&
    !VOICE_ID_REGEX.test(pendingCustomId.trim());

  async function handleSave() {
    if (customInvalid) {
      setError("Voice ID must be 20 alphanumeric characters.");
      return;
    }
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

  const currentPreset = VOICE_PRESETS.find((v) => v.id === voiceId);
  const currentLabel = currentPreset?.name ?? "Custom voice";
  const currentSample = currentPreset?.sample ?? voiceId;

  return (
    <div>
      <div className="label-eyebrow mb-3">Currently selected</div>
      <div className="flex items-center gap-2 mb-1">
        <Volume2 size={13} className="text-field-500" />
        <span className="text-sm font-medium text-bone-100">{currentLabel}</span>
      </div>
      <div className="text-xs text-bone-400 mb-4 break-all">{currentSample}</div>

      <label className="label-eyebrow block mb-2">Change voice</label>
      <div className="flex items-start gap-2 flex-wrap">
        <select
          value={pendingSelection}
          onChange={(e) => setPendingSelection(e.target.value)}
          className="!bg-ink-2 h-9 text-xs flex-1 min-w-[260px] max-w-md"
          disabled={loading}
        >
          {VOICE_PRESETS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} — {v.sample}
            </option>
          ))}
          <option value={CUSTOM_OPTION}>Custom — paste any ElevenLabs voice ID</option>
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || loading || customInvalid}
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

      {pendingSelection === CUSTOM_OPTION && (
        <div className="mt-3">
          <input
            type="text"
            value={pendingCustomId}
            onChange={(e) => setPendingCustomId(e.target.value)}
            placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
            className="!bg-ink-2 h-9 text-xs w-full max-w-md font-mono"
            disabled={loading}
          />
          <p className="text-2xs text-bone-400 mt-1.5 leading-relaxed">
            Find voice IDs in your ElevenLabs dashboard under Voices →
            click a voice → ID. 20 alphanumeric characters.
          </p>
          {customInvalid && (
            <div className="mt-2 flex items-start gap-1.5 text-2xs text-status-danger">
              <AlertCircle size={11} className="shrink-0 mt-0.5" />
              <span>Voice ID must be 20 alphanumeric characters.</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-1.5 text-2xs text-status-danger">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {savedAt && !error && (
        <div className="mt-3 flex items-start gap-1.5 text-2xs text-status-completed">
          <Check size={11} className="shrink-0 mt-0.5" />
          <span>Saved. The new voice pushes to your assistant on the next call.</span>
        </div>
      )}

      <p className="text-2xs text-bone-400 mt-4 leading-relaxed">
        Voice changes save to your tenant config. Pushing to VAPI happens
        automatically on the next inbound call (no manual operator step).
      </p>
    </div>
  );
}
