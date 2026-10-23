/**
 * When a job happens: a date, an optional time, an optional end date, read
 * and written in the business's time zone. A job with no time is all day.
 * Pure (no server imports), so forms, the calendar and PDFs can all use it.
 */

export type When = {
  /** "YYYY-MM-DD"; null: no date yet. */
  date: string | null;
  /** "HH:MM" (24h); null: all day. */
  time: string | null;
  /** "YYYY-MM-DD", after date; null: one day. */
  endDate: string | null;
};

export type ScheduleColumns = { start_datetime: string | null; end_datetime: string | null; all_day: boolean };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function wallParts(instant: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute"), ss: get("second") };
}

/** The UTC instant of a wall-clock date and time (midnight when no time) in tz. */
export function zonedIso(date: string, time: string | null, tz: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time ?? "00:00").split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (instant: number) => {
    const p = wallParts(instant, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - instant;
  };
  let guess = wall - offset(wall);
  guess = wall - offset(guess);
  return new Date(guess).toISOString();
}

/** "YYYY-MM-DD" of an instant in tz. */
export function dayKey(iso: string, tz: string): string {
  const p = wallParts(new Date(iso).getTime(), tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** "HH:MM" (24h) of an instant in tz. */
export function timeOf(iso: string, tz: string): string {
  const p = wallParts(new Date(iso).getTime(), tz);
  return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}

/** What's wrong with a When, or null. */
export function whenError(w: When): string | null {
  if (!w.date) return null;
  if (!DATE.test(w.date)) return "Pick a date.";
  if (w.time && !TIME.test(w.time)) return "Pick a time, or leave it empty for all day.";
  if (w.endDate && !DATE.test(w.endDate)) return "Pick an end date, or leave it empty.";
  if (w.endDate && w.endDate < w.date) return "The end date is before the start date.";
  return null;
}

/** A When as the job's columns. No date clears the schedule. */
export function whenToColumns(w: When, tz: string): ScheduleColumns {
  if (!w.date) return { start_datetime: null, end_datetime: null, all_day: false };
  const time = w.time || null;
  return {
    start_datetime: zonedIso(w.date, time, tz),
    end_datetime: w.endDate && w.endDate > w.date ? zonedIso(w.endDate, time, tz) : null,
    all_day: !time,
  };
}

/** The job's columns as a When. */
export function columnsToWhen(start: string | null, end: string | null, allDay: boolean, tz: string): When {
  if (!start) return { date: null, time: null, endDate: null };
  const date = dayKey(start, tz);
  const endDay = end ? dayKey(end, tz) : null;
  return { date, time: allDay ? null : timeOf(start, tz), endDate: endDay && endDay > date ? endDay : null };
}

/** Every day a job covers, start to end inclusive (capped, for safety). */
export function daysCovered(start: string, end: string | null, tz: string, cap = 62): string[] {
  const first = dayKey(start, tz);
  const last = end ? dayKey(end, tz) : first;
  const out: string[] = [];
  const d = new Date(`${first}T12:00:00Z`);
  for (let key = first; key <= last && out.length < cap; ) {
    out.push(key);
    d.setUTCDate(d.getUTCDate() + 1);
    key = d.toISOString().slice(0, 10);
  }
  return out;
}

/** "Oct 22, 2026": a date as invoices and job pages print it. */
export function fmtLongDate(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz });
}

/** "Oct 22, 2026" for a "YYYY-MM-DD" day. */
export function fmtDayKey(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "9:00 AM" */
export function fmtTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

/**
 * When, in words: "Oct 24, 2026, 9:00 AM", "Oct 24, 2026 – Oct 26, 2026 (all day)",
 * "Oct 24, 2026, 9:00 AM – 11:00 AM". Null when there's no date.
 */
export function whenText(start: string | null, end: string | null, allDay: boolean, tz: string): string | null {
  if (!start) return null;
  const d1 = fmtLongDate(start, tz);
  const multi = !!end && dayKey(end, tz) > dayKey(start, tz);
  if (allDay) return multi ? `${d1} – ${fmtLongDate(end!, tz)} (all day)` : `${d1} (all day)`;
  const t1 = fmtTime(start, tz);
  if (!end) return `${d1}, ${t1}`;
  return multi ? `${d1}, ${t1} – ${fmtLongDate(end, tz)}` : `${d1}, ${t1} – ${fmtTime(end, tz)}`;
}

/**
 * The columns to save for an edited When. An unchanged When keeps the job's
 * columns as they are (so a same-day end time the When can't show survives a
 * save), and moving a timed job's date or time keeps its same-day length.
 */
export function applyWhen(prev: ScheduleColumns, w: When, tz: string): ScheduleColumns {
  const before = columnsToWhen(prev.start_datetime, prev.end_datetime, prev.all_day, tz);
  if (before.date === w.date && before.time === (w.time || null) && before.endDate === (w.endDate || null)) return prev;
  const next = whenToColumns(w, tz);
  const ps = prev.start_datetime ? new Date(prev.start_datetime).getTime() : NaN;
  const pe = prev.end_datetime ? new Date(prev.end_datetime).getTime() : NaN;
  const sameDayLength =
    !prev.all_day && pe > ps && dayKey(prev.end_datetime!, tz) === dayKey(prev.start_datetime!, tz) ? pe - ps : 0;
  if (next.start_datetime && !next.all_day && !next.end_datetime && sameDayLength > 0) {
    next.end_datetime = new Date(new Date(next.start_datetime).getTime() + sameDayLength).toISOString();
  }
  return next;
}

/** A timed one-day schedule with no end gets one `minutes` long (the calendar's duration). */
export function withLength(c: ScheduleColumns, minutes: number | null | undefined): ScheduleColumns {
  if (!c.start_datetime || c.all_day || c.end_datetime || !minutes || minutes <= 0) return c;
  return { ...c, end_datetime: new Date(new Date(c.start_datetime).getTime() + minutes * 60000).toISOString() };
}
