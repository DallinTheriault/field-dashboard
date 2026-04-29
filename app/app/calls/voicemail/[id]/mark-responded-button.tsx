"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Toggle the responded_at timestamp on a voicemail. RLS allows updates
 * by tenant members so we use the regular client (no admin needed).
 */
export function MarkRespondedButton({
  voicemailId,
  currentlyResponded,
}: {
  voicemailId: number;
  currentlyResponded: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("messages")
      .update({
        responded_at: currentlyResponded ? null : new Date().toISOString(),
      })
      .eq("id", voicemailId);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-2xs text-status-danger">{error}</span>}
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={
          currentlyResponded
            ? "btn-ghost text-xs h-8"
            : "btn-secondary text-xs h-8"
        }
      >
        {busy ? (
          <Loader2 size={11} className="animate-spin" />
        ) : currentlyResponded ? (
          <RotateCcw size={11} />
        ) : (
          <Check size={11} />
        )}
        {currentlyResponded ? "Mark unresponded" : "Mark responded"}
      </button>
    </div>
  );
}
