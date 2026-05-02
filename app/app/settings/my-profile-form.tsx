"use client";

import { useState } from "react";
import { Loader2, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * User-level profile editor. Saves to auth.users.raw_user_meta_data.display_name
 * via supabase.auth.updateUser. This is the name that appears on assignment
 * dropdowns and activity timeline events instead of the email prefix.
 */
export function MyProfileForm({
  initialDisplayName,
  email,
}: {
  initialDisplayName: string;
  email: string;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setErr(null);
    setSaved(false);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName.trim() || null },
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="form-card space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <User size={14} className="text-field-500" />
        <h2 className="text-sm font-semibold text-bone-100">My profile</h2>
      </div>

      <div className="field-group">
        <label className="field-label">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={email.split("@")[0]}
          className="w-full"
        />
        <p className="text-2xs text-bone-400 mt-1">
          Shown on activity timeline events and assignment dropdowns. Defaults
          to your email prefix if blank.
        </p>
      </div>

      <div className="field-group">
        <label className="field-label">Email</label>
        <input value={email} readOnly disabled className="w-full opacity-60" />
        <p className="text-2xs text-bone-400 mt-1">
          Contact support to change your sign-in email.
        </p>
      </div>

      {err && <div className="form-error">{err}</div>}

      <div className="flex items-center justify-end gap-2 pt-2">
        {saved && (
          <span className="text-2xs text-field-500">Saved.</span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary text-sm"
        >
          {saving ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save profile"
          )}
        </button>
      </div>
    </div>
  );
}
