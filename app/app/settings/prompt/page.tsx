import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function PromptPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("Clients")
    .select("system_prompt, business_name")
    .limit(1);
  const client = clients?.[0];

  return (
    <div>
      <Link
        href="/app/settings"
        className="inline-flex items-center gap-1.5 text-xs text-bone-400 hover:text-bone-50 mb-4"
      >
        <ArrowLeft size={12} />
        Back to settings
      </Link>

      <div className="label-eyebrow mb-1">Settings · Prompt</div>
      <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
        Voice assistant prompt
      </h1>
      <p className="text-sm text-bone-300 mt-1 mb-6">
        Read-only view of your assistant&apos;s system prompt. Email your
        operator to request changes.
      </p>

      <div className="panel max-w-4xl">
        <div className="px-4 h-11 flex items-center justify-between border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">
            {client?.business_name ?? "—"}
          </h2>
          <span className="text-2xs text-bone-400 font-mono">
            {client?.system_prompt?.length ?? 0} chars
          </span>
        </div>
        <div className="px-4 py-4">
          {client?.system_prompt ? (
            <pre className="text-xs text-bone-100 whitespace-pre-wrap font-mono leading-relaxed">
              {client.system_prompt}
            </pre>
          ) : (
            <p className="text-sm text-bone-400 italic">
              No system prompt configured. Your assistant is using VAPI&apos;s
              default behavior — contact your operator.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
