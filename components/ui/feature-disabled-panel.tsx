import { Lock } from "lucide-react";

/**
 * Render this when a tenant has a feature disabled by admin. Used on
 * Messages, Calls, Calendar, Billing pages when their respective flag
 * is off.
 */
export function FeatureDisabledPanel({
  featureName,
  description,
}: {
  featureName: string;
  description?: string;
}) {
  return (
    <div className="panel px-6 py-14 text-center max-w-md mx-auto">
      <div className="w-12 h-12 mx-auto rounded-full bg-ink-2 border border-line-strong flex items-center justify-center mb-4">
        <Lock size={18} className="text-bone-400" strokeWidth={1.6} />
      </div>
      <h2 className="text-base font-semibold text-bone-100 mb-2">
        {featureName} is disabled
      </h2>
      <p className="text-sm text-bone-400 mb-1">
        Your administrator has disabled this feature for your account.
      </p>
      {description && (
        <p className="text-xs text-bone-500 mt-2">{description}</p>
      )}
      <p className="text-xs text-bone-400 mt-4">
        Contact{" "}
        <a
          href="mailto:support@getfield.co"
          className="text-field-500 hover:text-field-400"
        >
          support@getfield.co
        </a>{" "}
        to enable.
      </p>
    </div>
  );
}
