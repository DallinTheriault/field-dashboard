"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { rejectIntake } from "./reject-intake-action";

/**
 * Reject (delete) a pending intake row. Confirms before deleting since
 * deletion is irreversible. Used only on rows with is_active=false.
 */
export function RejectIntakeButton({
  clientId,
  businessName,
}: {
  clientId: number;
  businessName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (
      !confirm(
        `Reject and delete intake from "${businessName}"? This is permanent.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await rejectIntake(clientId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="btn-ghost text-2xs h-7 whitespace-nowrap hover:!text-status-danger"
        title="Reject and delete this intake"
      >
        {pending ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Trash2 size={11} />
        )}
        Reject
      </button>
      {error && (
        <p className="text-2xs text-status-danger mt-1">{error}</p>
      )}
    </>
  );
}
