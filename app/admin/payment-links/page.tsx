import { createAdminClient } from "@/lib/supabase/admin";
import { GenerateLinkButton } from "./generate-link-button";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_COLOR: Record<string, string> = {
  active: "text-status-completed",
  trialing: "text-status-scheduled",
  past_due: "text-status-danger",
  cancelled: "text-status-cancelled",
  paused: "text-bone-400",
  incomplete: "text-status-lead",
};

export default async function PaymentLinksPage() {
  const admin = createAdminClient();

  // Fetch all clients EXCEPT the platform sentinel row
  const { data: clients, error: clientsErr } = await admin
    .from("Clients")
    .select("id, business_name, owner_email, is_active, created_at")
    .neq("business_name", "__platform__")
    .order("id");

  // Fetch all subscriptions
  const { data: subs } = await admin
    .from("subscriptions")
    .select("client_id, status, current_period_end, monthly_price_cents");

  const subByClient = new Map(
    (subs ?? []).map((s) => [s.client_id, s]),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
        Payment links
      </h1>
      <p className="text-sm text-bone-300 mt-1 mb-6 max-w-2xl">
        Generate Stripe payment links for new customer setups. Each link bakes
        the tenant&apos;s <code className="font-mono text-bone-100 text-2xs bg-ink-3 px-1 py-0.5 rounded-xs">client_id</code>{" "}
        into <code className="font-mono text-bone-100 text-2xs bg-ink-3 px-1 py-0.5 rounded-xs">client_reference_id</code> so
        the webhook activates the right tenant automatically.
      </p>

      {clientsErr && (
        <div className="panel border border-status-danger/30 p-4 mb-6">
          <div className="text-sm text-status-danger font-medium">
            Couldn&apos;t load clients
          </div>
          <div className="text-xs text-bone-400 mt-1 font-mono">
            {clientsErr.message}
          </div>
        </div>
      )}

      <div className="panel overflow-hidden">
        <table className="table-pro">
          <thead>
            <tr>
              <th>ID</th>
              <th>Business</th>
              <th>Owner</th>
              <th>Active</th>
              <th>Subscription</th>
              <th className="text-right">Created</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(clients ?? []).map((c) => {
              const sub = subByClient.get(c.id);
              const subColor = sub
                ? STATUS_COLOR[sub.status] ?? "text-bone-400"
                : "text-bone-400";
              return (
                <tr key={c.id}>
                  <td className="num text-bone-300">{c.id}</td>
                  <td className="font-medium text-bone-100">
                    {c.business_name || "—"}
                  </td>
                  <td className="text-bone-300 text-xs">
                    {c.owner_email || "—"}
                  </td>
                  <td>
                    {c.is_active ? (
                      <span className="text-2xs text-status-completed">●  active</span>
                    ) : (
                      <span className="text-2xs text-bone-400">○ inactive</span>
                    )}
                  </td>
                  <td className={`text-xs ${subColor}`}>
                    {sub ? sub.status.replace("_", " ") : "—"}
                  </td>
                  <td className="num text-2xs text-bone-400 text-right">
                    {fmtDate(c.created_at)}
                  </td>
                  <td className="text-right">
                    <GenerateLinkButton
                      clientId={c.id}
                      businessName={c.business_name ?? ""}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-xs text-bone-400 max-w-2xl space-y-2">
        <p>
          <strong className="text-bone-300">How it works:</strong> Click{" "}
          <em>Generate setup link</em>, copy the URL, send it to the customer via
          text or email. They pay via Stripe&apos;s hosted page; the webhook
          fires; their subscription row appears in the database; their
          assistant flips to active. No further action needed.
        </p>
        <p>
          Test mode card:{" "}
          <code className="font-mono bg-ink-3 px-1 py-0.5 rounded-xs text-bone-100">
            4242 4242 4242 4242
          </code>{" "}
          / any future expiry / any 3-digit CVC.
        </p>
      </div>
    </div>
  );
}
