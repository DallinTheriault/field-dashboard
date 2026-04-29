"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Soft-delete a contact (sets archived_at). Linked jobs and SMS threads
 * remain intact — only the contact disappears from default views. Mirrors
 * the delete-job pattern from v0.4.8.
 */
export function DeleteContactButton({ contactId }: { contactId: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleArchive() {
    setErr(null);
    setArchiving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("contacts")
      .update({
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId);
    setArchiving(false);
    if (error) {
      setErr(error.message);
      setConfirming(false);
      return;
    }
    router.push("/app/contacts");
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="rounded-sm border border-status-danger/40 bg-status-danger/[0.06] px-3 py-2.5 flex items-start gap-2 mb-4">
        <AlertTriangle size={14} className="text-status-danger shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-bone-100 font-medium leading-snug">
            Delete this contact?
          </p>
          <p className="text-2xs text-bone-300 mt-0.5 leading-relaxed">
            The contact will be hidden from your views. Linked jobs, calls,
            and SMS threads stay intact for your records. An operator can
            restore it if needed.
          </p>
          {err && (
            <p className="text-2xs text-status-danger mt-1">{err}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={handleArchive}
              disabled={archiving}
              className="btn-primary text-xs h-7 !bg-status-danger hover:!bg-status-danger/90"
            >
              {archiving ? (
                <>
                  <Loader2 size={11} className="animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 size={11} />
                  Yes, delete
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={archiving}
              className="btn-ghost text-xs h-7"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="btn-ghost text-xs h-8 text-status-danger hover:!bg-status-danger/[0.08]"
    >
      <Trash2 size={12} />
      Delete contact
    </button>
  );
}
