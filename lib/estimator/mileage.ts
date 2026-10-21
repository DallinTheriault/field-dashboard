/**
 * Mileage lives in lib/mileage (v101: trips from days on site, rates by
 * date). This is the one line both money screens show next to it.
 *
 * Mileage is deliberately NOT part of summarizePnl: standard mileage and
 * actual vehicle costs are alternative deduction methods and must never be
 * summed into one number.
 */

/** The neutral, non-advisory note shown wherever both figures appear (§6.3). */
export const ALTERNATIVE_METHODS_NOTE =
  "These are alternative methods. Your tax preparer will choose one.";
