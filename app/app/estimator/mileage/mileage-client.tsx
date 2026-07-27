"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Loader2, Pencil, Plus, Settings2, Trash2, TriangleAlert } from "lucide-react";
import type { MileageTotal } from "@/lib/estimator/mileage";
import {
  createTrip,
  deleteTrip,
  setMileageBaseAddress,
  setMileageRate,
  updateTrip,
} from "./mileage-actions";

export type TripRow = {
  id: number;
  trip_date: string;
  jobId: number | null;
  jobNumber: string | null;
  jobName: string | null;
  destination: string;
  purpose: string;
  miles: number;
  vehicle: string | null;
  source: "manual" | "proposed";
  createdAt: string;
};

type JobPick = {
  id: number;
  name: string;
  jobNumber: string | null;
  address: string | null;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const num1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function MileageClient({
  year,
  trips,
  total,
  jobs,
  baseAddress,
  rateForYear,
  todayISO,
}: {
  year: number;
  trips: TripRow[];
  total: MileageTotal;
  jobs: JobPick[];
  baseAddress: string | null;
  rateForYear: number | null;
  todayISO: string;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="space-y-5">
      {/* YTD totals — dollars ONLY when this year's rate is set. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-ink-1 rounded-md px-3 py-3 shadow-inset-line">
          <div className="label-eyebrow">{year} miles</div>
          <div className="num text-lg mt-0.5 text-bone-50">{num1.format(total.miles)}</div>
        </div>
        <div className="bg-ink-1 rounded-md px-3 py-3 shadow-inset-line">
          <div className="label-eyebrow">At the standard rate</div>
          {total.rateSet ? (
            <>
              <div className="num text-lg mt-0.5 text-status-completed">
                {usd.format(total.dollars)}
              </div>
              <div className="text-2xs text-bone-500 num mt-0.5">
                {total.rate}/mile
              </div>
            </>
          ) : (
            <>
              <div className="text-sm mt-1 text-status-lead">Rate not set</div>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="text-2xs text-field-400 hover:text-field-300 underline underline-offset-2 mt-0.5"
              >
                Set the {year} rate
              </button>
            </>
          )}
        </div>
      </div>

      {err && <div className="form-error">{err}</div>}

      <AddTrip
        jobs={jobs}
        baseAddress={baseAddress}
        todayISO={todayISO}
        onSaved={() => router.refresh()}
        onError={setErr}
      />

      {/* Settings: base address + this year's rate */}
      <section className="panel">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center gap-2 text-left"
        >
          <Settings2 size={13} className="text-bone-400" />
          <span className="text-sm font-semibold text-bone-100">Mileage settings</span>
          <span className="text-2xs text-bone-400 ml-auto">
            {baseAddress ? "base set" : "no base address"} ·{" "}
            {rateForYear === null ? `${year} rate not set` : `${year}: ${rateForYear}/mi`}
          </span>
        </button>
        {settingsOpen && (
          <MileageSettings
            year={year}
            baseAddress={baseAddress}
            rateForYear={rateForYear}
            onSaved={() => router.refresh()}
            onError={setErr}
          />
        )}
      </section>

      {/* The log */}
      <section className="panel">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">Trips — {year}</h2>
          <p className="text-2xs text-bone-400 mt-0.5">
            {trips.length} trip{trips.length === 1 ? "" : "s"}. Date, destination,
            purpose and miles are what the IRS expects in a log.
          </p>
        </div>
        {trips.length === 0 ? (
          <p className="px-4 py-4 text-2xs text-bone-400">
            No trips logged for {year} yet.
          </p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {trips.map((t) => (
              <TripItem
                key={t.id}
                trip={t}
                onChanged={() => router.refresh()}
                onError={setErr}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------- add ---------- */

function AddTrip({
  jobs,
  baseAddress,
  todayISO,
  onSaved,
  onError,
}: {
  jobs: JobPick[];
  baseAddress: string | null;
  todayISO: string;
  onSaved: () => void;
  onError: (m: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO);
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [miles, setMiles] = useState("");
  const [jobId, setJobId] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    onError(null);
    setBusy(true);
    const r = await createTrip({
      tripDate: date,
      destination,
      purpose,
      miles,
      jobId: jobId ? Number(jobId) : null,
      vehicle,
      source: "manual",
    });
    setBusy(false);
    if (!r.ok) return onError(r.error);
    setDestination("");
    setPurpose("");
    setMiles("");
    setJobId("");
    setOpen(false);
    onSaved();
  }

  return (
    <section className="panel">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center gap-2 text-left"
      >
        <Car size={14} className="text-field-500" />
        <span className="text-sm font-semibold text-bone-100">Log a trip</span>
        <span className="text-2xs text-bone-400">
          {baseAddress ? `from ${baseAddress}` : "set a base address for one-tap trips"}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-line-subtle pt-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-36"
              aria-label="Trip date"
            />
            <input
              inputMode="decimal"
              value={miles}
              onChange={(e) => setMiles(e.target.value)}
              placeholder="miles"
              className="w-24"
              aria-label="Miles"
            />
            <select
              value={jobId}
              onChange={(e) => {
                setJobId(e.target.value);
                const j = jobs.find((x) => String(x.id) === e.target.value);
                if (j && !destination) setDestination(j.address ?? "");
              }}
              className="flex-1 min-w-40 text-sm"
              aria-label="Job"
            >
              <option value="">No job link</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {[j.jobNumber, j.address, j.name].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </div>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Destination (address or description)"
            className="w-full"
          />
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Business purpose (e.g. Turn work — patch and paint)"
            className="w-full"
          />
          <div className="flex items-center gap-2">
            <input
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              placeholder="Vehicle (optional)"
              className="w-40"
            />
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="btn-primary text-sm min-h-[42px] ml-auto"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Log trip
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- one row, editable ---------- */

function TripItem({
  trip,
  onChanged,
  onError,
}: {
  trip: TripRow;
  onChanged: () => void;
  onError: (m: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(trip.trip_date);
  const [destination, setDestination] = useState(trip.destination);
  const [purpose, setPurpose] = useState(trip.purpose);
  const [miles, setMiles] = useState(String(trip.miles));
  const [busy, setBusy] = useState(false);

  async function save() {
    onError(null);
    setBusy(true);
    const r = await updateTrip(trip.id, { tripDate: date, destination, purpose, miles });
    setBusy(false);
    if (!r.ok) return onError(r.error);
    setEditing(false);
    onChanged();
  }

  async function remove() {
    if (!confirm(`Delete the ${trip.trip_date} trip to ${trip.destination}?`)) return;
    onError(null);
    const r = await deleteTrip(trip.id);
    if (!r.ok) return onError(r.error);
    onChanged();
  }

  const loggedLate = trip.createdAt.slice(0, 10) !== trip.trip_date;

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start gap-2">
        <span className="font-mono text-2xs text-bone-400 w-11 shrink-0 pt-0.5">
          {trip.trip_date.slice(5)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-bone-100 break-words leading-snug">
            {trip.destination}
          </div>
          <div className="text-2xs text-bone-400 break-words">{trip.purpose}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-2xs text-bone-500 mt-0.5">
            {trip.jobNumber && <span className="font-mono text-field-400">{trip.jobNumber}</span>}
            {!trip.jobNumber && trip.jobName && <span className="text-field-400">{trip.jobName}</span>}
            {trip.vehicle && <span>{trip.vehicle}</span>}
            {trip.source === "proposed" && <span>auto-proposed</span>}
            {loggedLate && (
              <span title={`Logged ${trip.createdAt.slice(0, 10)}`}>
                logged {trip.createdAt.slice(0, 10)}
              </span>
            )}
          </div>
        </div>
        <span className="num text-sm text-bone-100 shrink-0">
          {num1.format(trip.miles)} mi
        </span>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-bone-500 hover:text-bone-100 p-1 shrink-0"
          aria-label={`Edit ${trip.destination}`}
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          onClick={remove}
          className="text-bone-500 hover:text-status-danger p-1 shrink-0"
          aria-label={`Delete ${trip.destination}`}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {editing && (
        <div className="mt-2 space-y-2 bg-ink-2 rounded-sm shadow-inset-line p-2.5">
          <div className="flex flex-wrap gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-36" aria-label="Trip date" />
            <input inputMode="decimal" value={miles} onChange={(e) => setMiles(e.target.value)} className="w-24" aria-label="Miles" />
          </div>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} className="w-full" aria-label="Destination" />
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-full" aria-label="Purpose" />
          <p className="text-2xs text-bone-500">
            Editing miles here does not change the saved distance for the property.
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost text-xs h-8">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy} className="btn-primary text-xs h-8 ml-auto">
              {busy ? <Loader2 size={11} className="animate-spin" /> : "Save"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/* ---------- settings ---------- */

function MileageSettings({
  year,
  baseAddress,
  rateForYear,
  onSaved,
  onError,
}: {
  year: number;
  baseAddress: string | null;
  rateForYear: number | null;
  onSaved: () => void;
  onError: (m: string | null) => void;
}) {
  const [addr, setAddr] = useState(baseAddress ?? "");
  const [rate, setRate] = useState(rateForYear === null ? "" : String(rateForYear));
  const [busy, setBusy] = useState(false);

  async function save() {
    onError(null);
    setBusy(true);
    const a = await setMileageBaseAddress(addr);
    const r = await setMileageRate(year, rate === "" ? null : rate);
    setBusy(false);
    if (!a.ok) return onError(a.error);
    if (!r.ok) return onError(r.error);
    onSaved();
  }

  return (
    <div className="px-4 pb-4 space-y-3 border-t border-line-subtle pt-3">
      <div>
        <label className="label-eyebrow block mb-1">Base address (home or shop)</label>
        <input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="e.g. 123 Shop Way, Provo UT"
          className="w-full"
        />
        {baseAddress && addr.trim() !== baseAddress && (
          <p className="text-2xs text-status-lead mt-1 flex items-start gap-1.5">
            <TriangleAlert size={11} className="shrink-0 mt-0.5" />
            Saved property distances aren&apos;t recalculated — review them if
            this move changes your usual drives.
          </p>
        )}
      </div>
      <div>
        <label className="label-eyebrow block mb-1">{year} rate per mile</label>
        <input
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="e.g. 0.70"
          className="w-32"
        />
        <p className="text-2xs text-bone-500 mt-1">
          The IRS sets this each year — enter the rate for {year}. Leave empty
          and totals show miles only.
        </p>
      </div>
      <button type="button" onClick={save} disabled={busy} className="btn-primary text-sm min-h-[42px]">
        {busy ? <Loader2 size={13} className="animate-spin" /> : "Save settings"}
      </button>
    </div>
  );
}
