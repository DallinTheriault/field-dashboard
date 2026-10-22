"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, Download, ExternalLink, Home, Loader2, Pencil, Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { mapsUrl, type RatePeriod, type YearTotal } from "@/lib/mileage/plan";
import type { BaseRecord, TripRecord } from "@/lib/mileage/trips";
import {
  createTrip,
  deleteBase,
  deleteRatePeriod,
  deleteTrip,
  restoreTrip,
  checkMapServices,
  saveBase,
  saveRatePeriod,
  syncTripsNow,
  updateTrip,
} from "./mileage-actions";
import { MapCredit } from "./map-credit";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const num1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

const KIND_LABEL: Record<TripRecord["kind"], string> = {
  auto: "Automatic",
  edited: "Edited",
  manual: "Added by hand",
  removed: "Removed",
};

export function MileageClient({
  year,
  today,
  trips,
  totals,
  bases,
  rates,
  catchUpCount,
}: {
  year: number;
  today: string;
  trips: TripRecord[];
  totals: YearTotal;
  bases: BaseRecord[];
  rates: Array<RatePeriod & { note: string | null }>;
  catchUpCount: number;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const live = trips.filter((t) => t.kind !== "removed");
  const removed = trips.filter((t) => t.kind === "removed");
  const attention = live.filter((t) => t.miles === null && t.status !== "pending");
  const pendingCount = live.filter((t) => t.status === "pending").length;

  // Work out trips that need a lookup, one batch per request (each ends well
  // inside the server's time limit), showing them as they land. Stops when
  // none are pending, or when a batch got no answers (the services are busy
  // or down): "Try again" or the next visit picks up from there.
  const alive = useRef(true);
  const running = useRef(false);
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const runBatches = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setWorking(true);
    setStalled(false);
    for (let i = 0; i < 50 && alive.current; i++) {
      const r = await syncTripsNow();
      if (!alive.current) break;
      router.refresh();
      if (!r.ok) {
        setErr(r.error);
        break;
      }
      if (!r.data || r.data.pending === 0) break;
      if (r.data.lookups === 0) {
        setStalled(true);
        break;
      }
    }
    running.current = false;
    if (alive.current) setWorking(false);
  }, [router]);
  useEffect(() => {
    if (pendingCount > 0) void runBatches();
  }, [pendingCount, runBatches]);

  const retry = () => {
    setErr(null);
    void runBatches();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-ink-1 rounded-md px-3 py-3 shadow-inset-line">
          <div className="label-eyebrow">{year} miles</div>
          <div className="num text-lg mt-0.5 text-bone-50" data-testid="year-miles">{num1.format(totals.miles)}</div>
          <div className="text-2xs text-bone-500 mt-0.5">{live.length} trip{live.length === 1 ? "" : "s"}</div>
        </div>
        <div className="bg-ink-1 rounded-md px-3 py-3 shadow-inset-line">
          <div className="label-eyebrow">Deduction</div>
          <div className="num text-lg mt-0.5 text-status-completed" data-testid="year-deduction">{usd.format(totals.dollars)}</div>
          <div className="text-2xs text-bone-500 mt-0.5">miles × the IRS rate on each trip&apos;s date</div>
        </div>
      </div>

      {working ? (
        <div className="flex items-center gap-2 text-2xs text-bone-400" data-testid="miles-working">
          <Loader2 size={12} className="animate-spin" />
          Working out miles…
        </div>
      ) : (
        stalled &&
        pendingCount > 0 && (
          <div className="flex items-center gap-2 text-2xs text-status-lead" data-testid="miles-stalled">
            <span className="flex-1">
              The map services are busy. {pendingCount} {pendingCount === 1 ? "trip still needs" : "trips still need"} miles.
            </span>
            <button type="button" onClick={retry} className="btn-ghost text-2xs min-h-[36px]">
              <RotateCcw size={11} />
              Try again
            </button>
          </div>
        )
      )}
      {totals.unpricedMiles > 0 && (
        <p className="text-2xs text-status-lead">
          {num1.format(totals.unpricedMiles)} miles are before the first rate below, so they aren&apos;t in the deduction.
        </p>
      )}
      {err && <div className="form-error">{err}</div>}

      {catchUpCount > 0 && (
        <Link
          href={`/app/estimator/mileage/catch-up?y=${year}`}
          className="panel px-4 py-3 flex items-center gap-2 text-sm text-bone-100 hover:bg-ink-2"
          data-testid="catch-up-link"
        >
          <CalendarCheck size={14} className="text-field-500 shrink-0" />
          <span className="flex-1">
            {catchUpCount} {year} job{catchUpCount === 1 ? " has" : "s have"} no days on site. Fill them in.
          </span>
          <span className="text-2xs text-bone-400">Catch up</span>
        </Link>
      )}

      {attention.length > 0 && (
        <section className="panel border-status-lead/40" data-testid="needs-miles">
          <div className="px-4 py-3 border-b border-line flex items-center gap-2">
            <TriangleAlert size={13} className="text-status-lead" />
            <h2 className="text-sm font-semibold text-bone-100 flex-1">
              {attention.length} trip{attention.length === 1 ? "" : "s"} without miles
            </h2>
            <button type="button" onClick={retry} disabled={working} className="btn-secondary text-xs min-h-[36px]">
              {working ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
              Try again
            </button>
          </div>
          <ul className="divide-y divide-line-subtle">
            {attention.map((t) => (
              <TripItem key={t.id} trip={t} onError={setErr} />
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <div className="px-4 py-3 border-b border-line flex items-center gap-2">
          <h2 className="text-sm font-semibold text-bone-100 flex-1">By month</h2>
          <a href={`/api/estimator/mileage/csv?y=${year}`} className="btn-secondary text-xs min-h-[36px]">
            <Download size={11} />
            CSV
          </a>
        </div>
        <table className="w-full text-sm" data-testid="by-month">
          <thead>
            <tr className="text-2xs text-bone-400">
              <th className="text-left font-normal px-4 py-1.5">Month</th>
              <th className="text-right font-normal px-2 py-1.5">Miles</th>
              <th className="text-right font-normal px-4 py-1.5">Deduction</th>
            </tr>
          </thead>
          <tbody>
            {totals.months
              .filter((m) => m.miles > 0)
              .map((m) => (
                <tr key={m.month} className="border-t border-line-subtle" data-month={m.month}>
                  <td className="px-4 py-1.5 text-bone-100">{MONTHS[m.month - 1]}</td>
                  <td className="px-2 py-1.5 text-right num text-bone-100">{num1.format(m.miles)}</td>
                  <td className="px-4 py-1.5 text-right num text-bone-100">{usd.format(m.dollars)}</td>
                </tr>
              ))}
            <tr className="border-t border-line font-medium">
              <td className="px-4 py-1.5 text-bone-50">{year}</td>
              <td className="px-2 py-1.5 text-right num text-bone-50">{num1.format(totals.miles)}</td>
              <td className="px-4 py-1.5 text-right num text-bone-50">{usd.format(totals.dollars)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <AddTrip today={today} onError={setErr} />

      <section className="panel">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">Trips, {year}</h2>
          <p className="text-2xs text-bone-400 mt-0.5">
            Date, start, destination, purpose and miles: what the IRS expects in a log. Trips you edit or add are never
            recalculated.
          </p>
        </div>
        {live.length === 0 ? (
          <p className="px-4 py-4 text-2xs text-bone-400">No trips in {year} yet. They appear as you log hours on jobs.</p>
        ) : (
          <ul className="divide-y divide-line-subtle" data-testid="trips">
            {[...live].reverse().map((t) => (
              <TripItem key={t.id} trip={t} onError={setErr} />
            ))}
          </ul>
        )}
        {removed.length > 0 && (
          <details className="border-t border-line-subtle">
            <summary className="px-4 min-h-[44px] flex items-center text-2xs text-bone-400 cursor-pointer">
              {removed.length} removed trip{removed.length === 1 ? "" : "s"}
            </summary>
            <ul className="divide-y divide-line-subtle">
              {removed.map((t) => (
                <TripItem key={t.id} trip={t} onError={setErr} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <Bases bases={bases} onError={setErr} />
      <Rates rates={rates} onError={setErr} />
      <MapCredit className="px-1" />
    </div>
  );
}

/* ---------- one trip ---------- */

function TripItem({ trip: t, onError }: { trip: TripRecord; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [miles, setMiles] = useState("");
  const [pending, start] = useTransition();
  const stopAddresses = t.stops.length > 0 ? t.stops.map((s) => s.address).filter((a): a is string => !!a) : [t.destination];
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      onError(null);
      const r = await fn();
      if (!r.ok) onError(r.error ?? "Something went wrong.");
      router.refresh();
    });

  return (
    <li className="px-4 py-2.5 space-y-1.5" data-trip={t.id} data-kind={t.kind} data-date={t.date}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xs text-bone-400 num w-24 shrink-0">{fmtDay(t.date)}</span>
            <span className="chip normal-case tracking-normal border-line-strong text-bone-400">{KIND_LABEL[t.kind]}</span>
          </div>
          <div className="text-sm text-bone-100 break-words leading-snug mt-0.5">{t.purpose}</div>
          <div className="text-2xs text-bone-400 break-words">
            {t.startAddress ?? "(no start)"} → {t.destination}
            {t.kind !== "manual" && " → back"}
          </div>
        </div>
        <span className="num text-sm text-bone-50 shrink-0" data-testid="trip-miles">
          {t.miles === null ? "—" : `${num1.format(t.miles)} mi`}
        </span>
      </div>

      {t.miles === null && t.status && t.status !== "ok" && (
        <div className="space-y-1.5">
          <p className="text-2xs text-status-lead" data-testid="trip-note">
            {t.status === "pending" ? "Working out miles…" : t.note ?? "Couldn't calculate miles, try again later."}
          </p>
          {t.status !== "pending" && (
            <div className="flex items-center gap-2">
              <input
                inputMode="decimal"
                value={miles}
                onChange={(e) => setMiles(e.target.value)}
                placeholder="Miles, round trip"
                aria-label="Type the miles"
                className="w-36 min-h-[40px]"
              />
              <button
                type="button"
                disabled={pending || !miles}
                onClick={() => run(() => updateTrip(t.id, { miles }))}
                className="btn-primary text-xs min-h-[40px]"
              >
                Save miles
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {t.startAddress && stopAddresses.length > 0 && (
          <a
            href={mapsUrl(t.startAddress, stopAddresses, t.kind !== "manual")}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost text-2xs min-h-[36px]"
          >
            <ExternalLink size={11} />
            Check in Google Maps
          </a>
        )}
        {t.kind !== "removed" && (
          <button type="button" onClick={() => setEditing((v) => !v)} className="btn-ghost text-2xs min-h-[36px]">
            <Pencil size={11} />
            Edit
          </button>
        )}
        {(t.kind === "edited" || t.kind === "removed") && (
          <button type="button" disabled={pending} onClick={() => run(() => restoreTrip(t.id))} className="btn-ghost text-2xs min-h-[36px]">
            <RotateCcw size={11} />
            Put back automatic trip
          </button>
        )}
        {t.kind !== "removed" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(t.kind === "manual" ? "Delete this trip?" : "Remove this trip? It won't be made again unless you put it back."))
                run(() => deleteTrip(t.id));
            }}
            className="btn-ghost text-2xs min-h-[36px] text-bone-500 hover:text-status-danger"
            aria-label="Delete trip"
          >
            <Trash2 size={11} />
          </button>
        )}
        {pending && <Loader2 size={12} className="animate-spin text-bone-400" />}
      </div>

      {editing && <EditTrip trip={t} onDone={() => setEditing(false)} onError={onError} />}
    </li>
  );
}

function EditTrip({ trip: t, onDone, onError }: { trip: TripRecord; onDone: () => void; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [date, setDate] = useState(t.date);
  const [startAddr, setStartAddr] = useState(t.startAddress ?? "");
  const [destination, setDestination] = useState(t.destination);
  const [purpose, setPurpose] = useState(t.purpose);
  const [miles, setMiles] = useState(t.miles === null ? "" : String(t.miles));
  const [pending, start] = useTransition();
  return (
    <div className="bg-ink-2 rounded-sm shadow-inset-line p-2.5 space-y-2" data-testid="edit-trip">
      {t.kind === "auto" && (
        <p className="text-2xs text-bone-400">Saving makes this an edited trip: Field won&apos;t recalculate it.</p>
      )}
      {t.kind === "manual" && (
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="w-full min-h-[40px]" />
      )}
      <input value={startAddr} onChange={(e) => setStartAddr(e.target.value)} aria-label="Start" placeholder="Start" className="w-full min-h-[40px]" />
      <input value={destination} onChange={(e) => setDestination(e.target.value)} aria-label="Destination" placeholder="Destination" className="w-full min-h-[40px]" />
      <input value={purpose} onChange={(e) => setPurpose(e.target.value)} aria-label="Purpose" placeholder="Purpose" className="w-full min-h-[40px]" />
      <input inputMode="decimal" value={miles} onChange={(e) => setMiles(e.target.value)} aria-label="Miles" placeholder="Miles" className="w-36 min-h-[40px]" />
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="btn-ghost text-xs min-h-[40px]">
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              onError(null);
              const r = await updateTrip(t.id, {
                ...(t.kind === "manual" && date !== t.date ? { tripDate: date } : {}),
                ...(startAddr !== (t.startAddress ?? "") ? { startAddress: startAddr } : {}),
                ...(destination !== t.destination ? { destination } : {}),
                ...(purpose !== t.purpose ? { purpose } : {}),
                ...(miles !== (t.miles === null ? "" : String(t.miles)) ? { miles } : {}),
              });
              if (!r.ok) return onError(r.error);
              onDone();
              router.refresh();
            })
          }
          className="btn-primary text-xs min-h-[40px] ml-auto"
        >
          {pending ? <Loader2 size={11} className="animate-spin" /> : "Save trip"}
        </button>
      </div>
    </div>
  );
}

/* ---------- add by hand ---------- */

function AddTrip({ today, onError }: { today: string; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [startAddr, setStartAddr] = useState("");
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [miles, setMiles] = useState("");
  const [pending, start] = useTransition();
  return (
    <section className="panel">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full px-4 min-h-[48px] flex items-center gap-2 text-left">
        <Plus size={13} className="text-field-500" />
        <span className="text-sm font-semibold text-bone-100">Add a trip by hand</span>
        <span className="text-2xs text-bone-400">supply runs, work from before Field</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-line-subtle pt-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="w-full min-h-[44px]" />
          <input
            value={startAddr}
            onChange={(e) => setStartAddr(e.target.value)}
            placeholder="Start (blank: your base that day)"
            aria-label="Start"
            className="w-full min-h-[44px]"
          />
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destination" aria-label="Destination" className="w-full min-h-[44px]" />
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose (e.g. Paint run, Home Depot)" aria-label="Purpose" className="w-full min-h-[44px]" />
          <input inputMode="decimal" value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="Miles" aria-label="Miles" className="w-36 min-h-[44px]" />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  onError(null);
                  const r = await createTrip({ tripDate: date, startAddress: startAddr, destination, purpose, miles });
                  if (!r.ok) return onError(r.error);
                  setDestination("");
                  setPurpose("");
                  setMiles("");
                  setStartAddr("");
                  setOpen(false);
                  router.refresh();
                })
              }
              className="btn-primary text-sm min-h-[44px]"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : "Add trip"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- bases ---------- */

function Bases({ bases, onError }: { bases: BaseRecord[]; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [editId, setEditId] = useState<number | "new" | null>(bases.length === 0 ? "new" : null);
  const [address, setAddress] = useState("");
  const [from, setFrom] = useState("");
  const [pending, start] = useTransition();
  const open = (b: BaseRecord | null) => {
    setEditId(b ? b.id : "new");
    setAddress(b?.address ?? "");
    setFrom(b?.effectiveFrom ?? "");
  };
  return (
    <section className="panel" data-testid="bases">
      <div className="px-4 py-3 border-b border-line flex items-center gap-2">
        <Home size={13} className="text-bone-400" />
        <h2 className="text-sm font-semibold text-bone-100 flex-1">Bases</h2>
        <button type="button" onClick={() => open(null)} className="btn-secondary text-xs min-h-[36px]">
          <Plus size={11} />
          Add a base
        </button>
      </div>
      <p className="px-4 pt-2 text-2xs text-bone-400">
        Where your trips start. Each trip starts from the base in effect on its date. Changing one recalculates the
        automatic trips it covers.
      </p>
      <ul className="divide-y divide-line-subtle">
        {bases.map((b) => (
          <li key={b.id} className="px-4 py-2.5 flex items-start gap-2" data-base={b.id}>
            <div className="flex-1 min-w-0">
              <div className="text-2xs text-bone-400">From {fmtDate(b.effectiveFrom)}</div>
              <div className="text-sm text-bone-100 break-words">{b.address}</div>
            </div>
            <button type="button" onClick={() => open(b)} className="btn-ghost text-2xs min-h-[36px]" aria-label="Edit base">
              <Pencil size={11} />
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm("Delete this base? Automatic trips it covers are recalculated.")) return;
                start(async () => {
                  const r = await deleteBase(b.id);
                  if (!r.ok) onError(r.error);
                  router.refresh();
                });
              }}
              className="btn-ghost text-2xs min-h-[36px] text-bone-500 hover:text-status-danger"
              aria-label="Delete base"
            >
              <Trash2 size={11} />
            </button>
          </li>
        ))}
      </ul>
      {bases.length > 0 && <ServiceCheckRow />}
      {editId !== null && (
        <div className="px-4 pb-4 pt-2 space-y-2 border-t border-line-subtle">
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, state, ZIP" aria-label="Base address" className="w-full min-h-[44px]" />
          <label className="flex items-center gap-2 text-sm text-bone-300">
            Starts on
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Starts on" className="min-h-[44px]" />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditId(null)} className="btn-ghost text-xs min-h-[40px]">
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  onError(null);
                  const r = await saveBase({ id: editId === "new" ? null : editId, address, effectiveFrom: from });
                  if (!r.ok) return onError(r.error);
                  setEditId(null);
                  router.refresh();
                })
              }
              className="btn-primary text-xs min-h-[40px] ml-auto"
            >
              {pending ? <Loader2 size={11} className="animate-spin" /> : "Save base"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** "Check map services": one request to each, from today's base. */
function ServiceCheckRow() {
  const [result, setResult] = useState<Awaited<ReturnType<typeof checkMapServices>> | null>(null);
  const [pending, start] = useTransition();
  const NAMES = { census: "US Census geocoder", nominatim: "OpenStreetMap (Nominatim)", valhalla: "Valhalla routing" };
  const SAID = { ok: "Reached", failed: "Couldn't reach", busy: "Didn't ask", off: "Not using" };
  return (
    <div className="px-4 py-3 border-t border-line-subtle space-y-2" data-testid="service-check">
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await checkMapServices()))} className="btn-ghost text-xs min-h-[36px]">
        {pending ? <Loader2 size={11} className="animate-spin" /> : null}
        Check map services
      </button>
      {result && !result.ok && <div className="form-error">{result.error}</div>}
      {result?.ok && result.data && (
        <ul className="space-y-1 text-2xs">
          {result.data.checks.map((c) => (
            <li
              key={c.service}
              data-service={c.service}
              data-state={c.state}
              className={c.state === "ok" || c.state === "off" ? "text-bone-300" : "text-status-danger"}
            >
              {SAID[c.state]} {NAMES[c.service]}
              {c.state === "ok" || c.state === "failed" ? ` (${c.ms} ms)` : ""}: {c.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- rates ---------- */

function Rates({ rates, onError }: { rates: Array<RatePeriod & { note: string | null }>; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [rate, setRate] = useState("");
  const [pending, start] = useTransition();
  return (
    <section className="panel" data-testid="rates">
      <div className="px-4 py-3 border-b border-line flex items-center gap-2">
        <h2 className="text-sm font-semibold text-bone-100 flex-1">IRS rates</h2>
        <button type="button" onClick={() => setOpen((v) => !v)} className="btn-secondary text-xs min-h-[36px]">
          <Plus size={11} />
          Add a rate
        </button>
      </div>
      <ul className="divide-y divide-line-subtle">
        {rates.map((r) => (
          <li key={r.effectiveFrom} className="px-4 py-2.5 flex items-start gap-2" data-rate={r.effectiveFrom}>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-bone-100">
                From {fmtDate(r.effectiveFrom)}: <span className="num">${r.rate}</span> a mile
              </div>
              {r.note && <div className="text-2xs text-bone-400">{r.note}</div>}
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm("Delete this rate?")) return;
                start(async () => {
                  const res = await deleteRatePeriod(r.effectiveFrom);
                  if (!res.ok) onError(res.error);
                  router.refresh();
                });
              }}
              className="btn-ghost text-2xs min-h-[36px] text-bone-500 hover:text-status-danger"
              aria-label="Delete rate"
            >
              <Trash2 size={11} />
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="px-4 pb-4 pt-2 space-y-2 border-t border-line-subtle">
          <label className="flex items-center gap-2 text-sm text-bone-300">
            Starts on
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Rate starts on" className="min-h-[44px]" />
          </label>
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Dollars a mile, e.g. 0.76" aria-label="Rate" className="w-48 min-h-[44px]" />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  onError(null);
                  const r = await saveRatePeriod({ effectiveFrom: from, rate });
                  if (!r.ok) return onError(r.error);
                  setOpen(false);
                  setFrom("");
                  setRate("");
                  router.refresh();
                })
              }
              className="btn-primary text-xs min-h-[40px]"
            >
              {pending ? <Loader2 size={11} className="animate-spin" /> : "Save rate"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
