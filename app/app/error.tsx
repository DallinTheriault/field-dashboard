"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

/**
 * Shown inside the app shell when a page's data fails to load. Pages read
 * with .throwOnError(), so a failed query lands here instead of rendering as
 * an empty list that looks like real data (an empty Expenses list hid a
 * broken query for weeks). The code ties this screen to the server log.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="panel px-6 py-12 text-center max-w-md mx-auto mt-6" role="alert">
      <div className="w-12 h-12 mx-auto rounded-full bg-ink-2 border border-status-danger/40 flex items-center justify-center mb-4">
        <AlertTriangle size={18} className="text-status-danger" strokeWidth={1.6} />
      </div>
      <h1 className="text-base font-semibold text-bone-100 mb-2">This page didn&apos;t load</h1>
      <p className="text-sm text-bone-400">
        Something went wrong reading your data, so nothing is shown rather than a list that might be missing things.
      </p>
      <button
        type="button"
        onClick={() => startTransition(() => { router.refresh(); reset(); })}
        className="btn-primary text-sm h-9 mt-5"
      >
        Try again
      </button>
      {error.digest && <p className="text-2xs text-bone-500 mt-4 font-mono">Code {error.digest}</p>}
    </div>
  );
}
