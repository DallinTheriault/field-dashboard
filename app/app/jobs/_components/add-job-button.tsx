"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, AlertCircle, ChevronDown, Home } from "lucide-react";
import {
  createJob,
  getContactProperties,
  type ContactHit,
  type PropertyHit,
} from "./actions";
import { ContactCombobox } from "./contact-combobox";

const STATUSES = [
  { value: "lead", label: "Lead" },
  { value: "estimated", label: "Estimated" },
  { value: "accepted", label: "Accepted" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "callback", label: "Callback" },
  { value: "cancelled", label: "Cancelled" },
] as const;

/**
 * Format a phone number as the user types. Strips non-digits, caps at 10.
 */
function formatPhoneAsTyped(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function propLabel(p: PropertyHit): string {
  const parts = [p.address];
  if (p.unit) parts.push(`Unit ${p.unit}`);
  const main = parts.join(", ");
  return p.label ? `${main} · ${p.label}` : main;
}

const NEW_PROPERTY = "__new__";

export function AddJobButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contact: combobox. selectedContact === null => manual "create new" path,
  // where contactQuery is the new contact's name (no extra field/keystrokes).
  const [selectedContact, setSelectedContact] = useState<ContactHit | null>(null);
  const [contactQuery, setContactQuery] = useState("");

  // Manual path (no contact selected)
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Existing-contact path
  const [properties, setProperties] = useState<PropertyHit[]>([]);
  const [propsLoading, setPropsLoading] = useState(false);
  const [propertyId, setPropertyId] = useState<string>(NEW_PROPERTY);
  const [newAddress, setNewAddress] = useState("");
  const [unit, setUnit] = useState("");

  // Bill-to (collapsed)
  const [billToOpen, setBillToOpen] = useState(false);
  const [billTo, setBillTo] = useState<ContactHit | null>(null);

  const [status, setStatus] = useState<string>("lead");
  const dialogRef = useRef<HTMLDivElement>(null);

  // Load the picked contact's properties for the selector
  useEffect(() => {
    if (!selectedContact) {
      setProperties([]);
      return;
    }
    setPropsLoading(true);
    getContactProperties(selectedContact.id).then((ps) => {
      setProperties(ps);
      // Default to the first saved property, else the "new property" row.
      setPropertyId(ps.length > 0 ? String(ps[0].id) : NEW_PROPERTY);
      setPropsLoading(false);
    });
  }, [selectedContact]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, submitting]);

  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  function reset() {
    setSelectedContact(null);
    setContactQuery("");
    setPhone("");
    setAddress("");
    setProperties([]);
    setPropertyId(NEW_PROPERTY);
    setNewAddress("");
    setUnit("");
    setBillToOpen(false);
    setBillTo(null);
    setStatus("lead");
    setError(null);
  }

  function close() {
    if (submitting) return;
    setOpen(false);
    reset();
  }

  const existingMode = selectedContact !== null;
  const addingNewProperty = propertyId === NEW_PROPERTY;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const input = existingMode
      ? {
          contactId: selectedContact!.id,
          propertyId: addingNewProperty ? null : Number(propertyId),
          address: addingNewProperty ? newAddress : undefined,
          unit: unit || undefined,
          billToContactId: billTo?.id ?? null,
          status,
        }
      : {
          name: contactQuery,
          phone,
          address,
          billToContactId: billTo?.id ?? null,
          status,
        };

    const result = await createJob(input);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
    router.push(`/app/jobs/${result.jobId}`);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary text-sm h-9"
      >
        <Plus size={14} />
        Add job
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
            onClick={close}
            aria-hidden
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-job-title"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
          >
            <div className="bg-ink-1 border border-line-strong rounded-t-md sm:rounded-md w-full sm:max-w-md max-h-[90vh] overflow-y-auto pointer-events-auto shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                <h2
                  id="add-job-title"
                  className="text-sm font-semibold text-bone-50"
                >
                  New job
                </h2>
                <button
                  type="button"
                  onClick={close}
                  disabled={submitting}
                  aria-label="Close"
                  className="btn-ghost h-8 w-8 px-0"
                >
                  <X size={15} strokeWidth={1.8} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3.5">
                <p className="text-2xs text-bone-400 leading-relaxed">
                  Search an existing customer, or just type a new name to
                  capture a fresh lead.
                </p>

                {/* Contact */}
                <div>
                  <label className="label-eyebrow block mb-1">
                    Customer <span className="text-status-danger">*</span>
                  </label>
                  <ContactCombobox
                    selected={selectedContact}
                    onSelect={setSelectedContact}
                    onQueryChange={setContactQuery}
                    placeholder="Search or type a new name…"
                    allowCreateNew
                    disabled={submitting}
                    autoFocus
                  />
                </div>

                {/* Manual path: phone + address (unchanged speed) */}
                {!existingMode && (
                  <>
                    <div>
                      <label className="label-eyebrow block mb-1">
                        Phone <span className="text-status-danger">*</span>
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) =>
                          setPhone(formatPhoneAsTyped(e.target.value))
                        }
                        disabled={submitting}
                        required
                        placeholder="(801) 555-1234"
                        inputMode="tel"
                        className="!bg-ink-2 w-full text-sm h-9 font-mono"
                      />
                    </div>
                    <div>
                      <label className="label-eyebrow block mb-1">
                        Address / property{" "}
                        <span className="text-status-danger">*</span>
                      </label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        disabled={submitting}
                        required
                        placeholder="e.g. 123 Main St, Provo UT"
                        className="!bg-ink-2 w-full text-sm h-9"
                      />
                    </div>
                  </>
                )}

                {/* Existing-contact path: property selector */}
                {existingMode && (
                  <>
                    <div>
                      <label className="label-eyebrow block mb-1">
                        Property <span className="text-status-danger">*</span>
                      </label>
                      {propsLoading ? (
                        <div className="flex items-center gap-2 h-9 px-2.5 text-2xs text-bone-400">
                          <Loader2 size={13} className="animate-spin" />
                          Loading properties…
                        </div>
                      ) : (
                        <select
                          value={propertyId}
                          onChange={(e) => setPropertyId(e.target.value)}
                          disabled={submitting}
                          className="!bg-ink-2 w-full text-sm h-9"
                        >
                          {properties.map((p) => (
                            <option key={p.id} value={String(p.id)}>
                              {propLabel(p)}
                            </option>
                          ))}
                          <option value={NEW_PROPERTY}>
                            + New property / address
                          </option>
                        </select>
                      )}
                    </div>

                    {addingNewProperty && (
                      <div>
                        <label className="label-eyebrow block mb-1">
                          New address{" "}
                          <span className="text-status-danger">*</span>
                        </label>
                        <input
                          type="text"
                          value={newAddress}
                          onChange={(e) => setNewAddress(e.target.value)}
                          disabled={submitting}
                          required
                          placeholder="e.g. 123 Main St, Provo UT"
                          className="!bg-ink-2 w-full text-sm h-9"
                        />
                      </div>
                    )}

                    <div>
                      <label className="label-eyebrow block mb-1">
                        Unit{" "}
                        <span className="text-bone-500 normal-case tracking-normal">
                          (optional)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        disabled={submitting}
                        placeholder="e.g. 4B"
                        className="!bg-ink-2 w-full text-sm h-9"
                      />
                      <p className="text-2xs text-bone-500 mt-1 flex items-center gap-1">
                        <Home size={10} />
                        A new unit is saved as its own property for next time.
                      </p>
                    </div>
                  </>
                )}

                {/* Bill-to disclosure */}
                <div className="border-t border-line-subtle pt-2">
                  <button
                    type="button"
                    onClick={() => setBillToOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-2xs text-bone-400 hover:text-bone-100"
                  >
                    <ChevronDown
                      size={12}
                      className={`transition-transform ${billToOpen ? "" : "-rotate-90"}`}
                    />
                    Bill to a different contact
                    {billTo && (
                      <span className="text-field-400">· {billTo.name}</span>
                    )}
                  </button>
                  {billToOpen && (
                    <div className="mt-2">
                      <ContactCombobox
                        selected={billTo}
                        onSelect={setBillTo}
                        placeholder="Search a billing contact…"
                        disabled={submitting}
                      />
                      <p className="text-2xs text-bone-500 mt-1">
                        Leave empty to bill the property&apos;s contact.
                      </p>
                    </div>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label className="label-eyebrow block mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={submitting}
                    className="!bg-ink-2 w-full text-sm h-9"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-2 rounded-xs bg-status-danger/[0.08] border border-status-danger/20">
                    <AlertCircle
                      size={12}
                      className="text-status-danger shrink-0 mt-0.5"
                    />
                    <span className="text-2xs text-bone-100 leading-relaxed">
                      {error}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
                  <button
                    type="button"
                    onClick={close}
                    disabled={submitting}
                    className="btn-ghost text-xs h-9"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary text-sm h-9"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        Creating…
                      </>
                    ) : (
                      <>
                        <Plus size={13} />
                        Create job
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
