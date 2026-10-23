import { describe, expect, it } from "vitest";
import { applyWhen, columnsToWhen, withLength, daysCovered, fmtLongDate, whenError, whenText, whenToColumns, zonedIso } from "./schedule";

const TZ = "America/Denver";

describe("zonedIso", () => {
  it("reads a wall-clock time in the business's zone, across daylight saving", () => {
    expect(zonedIso("2026-10-24", "09:00", TZ)).toBe("2026-10-24T15:00:00.000Z"); // MDT, UTC-6
    expect(zonedIso("2026-11-02", "09:00", TZ)).toBe("2026-11-02T16:00:00.000Z"); // MST, UTC-7
    expect(zonedIso("2026-11-01", null, TZ)).toBe("2026-11-01T06:00:00.000Z"); // midnight, the day clocks fall back
    expect(zonedIso("2026-03-08", "12:00", TZ)).toBe("2026-03-08T18:00:00.000Z"); // the day clocks spring forward
  });
});

describe("When ↔ job columns", () => {
  it("a date and time; all day; several days; no date yet", () => {
    expect(whenToColumns({ date: "2026-10-24", time: "09:30", endDate: null }, TZ)).toEqual({
      start_datetime: "2026-10-24T15:30:00.000Z", end_datetime: null, all_day: false,
    });
    expect(whenToColumns({ date: "2026-10-24", time: null, endDate: "2026-10-26" }, TZ)).toEqual({
      start_datetime: "2026-10-24T06:00:00.000Z", end_datetime: "2026-10-26T06:00:00.000Z", all_day: true,
    });
    expect(whenToColumns({ date: "2026-10-24", time: null, endDate: "2026-10-24" }, TZ).end_datetime).toBeNull();
    expect(whenToColumns({ date: null, time: "09:00", endDate: null }, TZ)).toEqual({ start_datetime: null, end_datetime: null, all_day: false });
  });
  it("reads back what it wrote", () => {
    for (const w of [
      { date: "2026-10-24", time: "09:30", endDate: null },
      { date: "2026-10-24", time: null, endDate: "2026-10-26" },
      { date: "2026-10-30", time: "07:00", endDate: "2026-11-03" },
    ]) {
      const c = whenToColumns(w, TZ);
      expect(columnsToWhen(c.start_datetime, c.end_datetime, c.all_day, TZ)).toEqual(w);
    }
    expect(columnsToWhen(null, null, false, TZ)).toEqual({ date: null, time: null, endDate: null });
  });
  it("an unchanged When keeps a same-day end; moving a timed job keeps its length", () => {
    const prev = { start_datetime: "2026-10-24T15:00:00.000Z", end_datetime: "2026-10-24T17:00:00.000Z", all_day: false };
    expect(applyWhen(prev, { date: "2026-10-24", time: "09:00", endDate: null }, TZ)).toBe(prev);
    expect(applyWhen(prev, { date: "2026-10-27", time: "10:00", endDate: null }, TZ)).toEqual({
      start_datetime: "2026-10-27T16:00:00.000Z", end_datetime: "2026-10-27T18:00:00.000Z", all_day: false,
    });
    expect(applyWhen(prev, { date: "2026-10-27", time: null, endDate: null }, TZ)).toEqual({
      start_datetime: "2026-10-27T06:00:00.000Z", end_datetime: null, all_day: true,
    });
    expect(applyWhen(prev, { date: null, time: null, endDate: null }, TZ)).toEqual({ start_datetime: null, end_datetime: null, all_day: false });
  });
  it("the calendar's duration gives a timed day an end; all-day and multi-day jobs keep theirs", () => {
    const timed = whenToColumns({ date: "2026-10-24", time: "09:00", endDate: null }, TZ);
    expect(withLength(timed, 90).end_datetime).toBe("2026-10-24T16:30:00.000Z");
    const allDay = whenToColumns({ date: "2026-10-24", time: null, endDate: null }, TZ);
    expect(withLength(allDay, 90)).toEqual(allDay);
    const multi = whenToColumns({ date: "2026-10-24", time: "09:00", endDate: "2026-10-25" }, TZ);
    expect(withLength(multi, 90)).toEqual(multi);
  });
  it("refuses an end date before the start", () => {
    expect(whenError({ date: "2026-10-24", time: null, endDate: "2026-10-23" })).toBe("The end date is before the start date.");
    expect(whenError({ date: "2026-10-24", time: "25:00", endDate: null })).toMatch(/time/);
    expect(whenError({ date: null, time: null, endDate: null })).toBeNull();
  });
});

describe("days and words", () => {
  it("a job covers every day from its start to its end, in the business's zone", () => {
    expect(daysCovered("2026-10-30T15:00:00Z", "2026-11-02T16:00:00Z", TZ)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(daysCovered("2026-10-25T05:30:00Z", null, TZ)).toEqual(["2026-10-24"]); // 11:30 PM Mountain
  });
  it("prints dates like Oct 22, 2026", () => {
    expect(fmtLongDate("2026-10-22T20:18:41Z", TZ)).toBe("Oct 22, 2026");
    expect(fmtLongDate("2026-10-23T03:00:00Z", TZ)).toBe("Oct 22, 2026"); // still the 22nd in Utah
    expect(whenText("2026-10-24T15:00:00Z", null, false, TZ)).toBe("Oct 24, 2026, 9:00 AM");
    expect(whenText("2026-10-24T06:00:00Z", "2026-10-26T06:00:00Z", true, TZ)).toBe("Oct 24, 2026 – Oct 26, 2026 (all day)");
    expect(whenText("2026-10-24T15:00:00Z", "2026-10-24T17:00:00Z", false, TZ)).toBe("Oct 24, 2026, 9:00 AM – 11:00 AM");
    expect(whenText(null, null, false, TZ)).toBeNull();
  });
});
