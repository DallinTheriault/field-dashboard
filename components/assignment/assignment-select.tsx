"use client";

import { useId } from "react";
import { User, UserCheck } from "lucide-react";
import type { TeamMember } from "@/lib/team/types";
import { formatMemberLabel } from "@/lib/team/types";

/**
 * Dropdown for assigning a lead (job or contact) to a team member.
 *
 * Controlled component — caller owns the `value` (assigned user_id or null)
 * and the `onChange` callback. Renders as a styled native <select> for
 * consistency with the rest of the form fields.
 *
 * Empty option = "Unassigned" — explicit clearing of assignment.
 */
export function AssignmentSelect({
  value,
  onChange,
  members,
  label = "Assigned to",
  disabled = false,
}: {
  value: string | null;
  onChange: (userId: string | null) => void;
  members: TeamMember[];
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="field-group">
      <label htmlFor={id} className="field-label flex items-center gap-1.5">
        {value ? (
          <UserCheck size={12} className="text-field-500" />
        ) : (
          <User size={12} className="text-bone-500" />
        )}
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="w-full"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {formatMemberLabel(m)}
            {m.role !== "member" ? ` · ${m.role}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Inline display chip for showing who a lead is assigned to.
 * Used in list views and detail headers where editing isn't appropriate.
 */
export function AssignmentChip({
  member,
  unassignedLabel = "Unassigned",
}: {
  member: TeamMember | null | undefined;
  unassignedLabel?: string;
}) {
  if (!member) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-bone-500">
        <User size={11} />
        {unassignedLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-bone-300">
      <UserCheck size={11} className="text-field-500" />
      {formatMemberLabel(member)}
    </span>
  );
}
