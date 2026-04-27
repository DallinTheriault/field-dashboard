"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X, AlertCircle } from "lucide-react";

export function LogoUploader({
  initialUrl,
}: {
  initialUrl: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialUrl);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("logo", file);

    try {
      const res = await fetch("/api/branding/logo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }
      setLogoUrl(data.url);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Remove logo?")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/branding/logo", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove logo");
      }
      setLogoUrl(null);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove logo");
    } finally {
      setLoading(false);
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so the same file can be re-selected after a failed upload
    e.target.value = "";
  }

  return (
    <div>
      <div className="label-eyebrow mb-2">Logo</div>

      <div className="flex items-start gap-4">
        {/* Preview */}
        <div className="w-24 h-24 rounded-sm border border-line-strong bg-ink-2 flex items-center justify-center shrink-0 overflow-hidden">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Brand logo"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <span className="text-2xs text-bone-400">No logo</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 min-w-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onChange={onChange}
            className="hidden"
          />
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="btn-secondary text-xs"
            >
              {loading ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload size={12} />
                  {logoUrl ? "Replace" : "Upload"}
                </>
              )}
            </button>
            {logoUrl && !loading && (
              <button
                type="button"
                onClick={handleRemove}
                className="btn-ghost text-xs text-status-danger"
              >
                <X size={12} />
                Remove
              </button>
            )}
          </div>
          <p className="text-2xs text-bone-400 leading-relaxed">
            PNG, JPEG, SVG, or WebP. 2 MB max. Square or horizontal works best.
          </p>
          {error && (
            <div className="mt-2 flex items-start gap-1.5 text-2xs text-status-danger">
              <AlertCircle size={11} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
