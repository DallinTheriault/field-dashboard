"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function MarkRespondedButton({
  messageId,
  initiallyResponded,
}: {
  messageId: number;
  initiallyResponded: boolean;
}) {
  const router = useRouter();
  const [responded, setResponded] = useState(initiallyResponded);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("messages")
      .update({ responded_at: responded ? null : new Date().toISOString() })
      .eq("id", messageId);
    setLoading(false);
    if (!error) {
      setResponded(!responded);
      router.refresh();
    }
  }

  if (responded) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className="btn-ghost text-xs"
      >
        {loading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <RotateCcw size={12} />
        )}
        Undo
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className="btn-primary text-xs"
    >
      {loading ? (
        <>
          <Loader2 size={12} className="animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <Check size={12} />
          Mark responded
        </>
      )}
    </button>
  );
}
