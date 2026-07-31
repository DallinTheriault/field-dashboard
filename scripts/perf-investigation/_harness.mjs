/**
 * Shared smoke harness (architect ruling 2026-07-30).
 *
 * A skip is NOT a pass. A probe that cannot run because a precondition is
 * missing is reported as NOT RUN, is excluded from the pass tally, and makes
 * the run fail — a missing precondition is a defect in the run's setup, not a
 * neutral outcome. "22/22" must mean 22 probes executed and asserted.
 *
 * Scripts must seed their own preconditions; notRun() is the last resort for
 * state a script genuinely cannot create (e.g. an assertion that needs the
 * OTHER tenant's real data, which is read-only).
 */
import { appendFileSync, existsSync, unlinkSync } from "node:fs";
import { OUT_DIR } from "./_config.mjs";

/** Where crash manifests live. One file per run, deleted on clean exit. */
const MANIFEST_DIR = OUT_DIR;

/**
 * Captured-id journal, usable WITHOUT the pass/fail harness.
 *
 * Measurement scripts (perf-*, screenshot helpers) seed and clean rows but
 * assert nothing, so they must not be forced through a pass/fail summary — yet
 * they orphan rows on a crash exactly like the probes do. This gives them the
 * journaling half on its own.
 */
export function createManifest(runLabel = "run") {
  const captured = [];
  const path = `${MANIFEST_DIR}/_ids-${runLabel}-${process.pid}.log`;
  const capture = (table, id) => {
    if (id === null || id === undefined) return id;
    captured.push({ table, id });
    appendFileSync(path, `${table}\t${id}\n`, "utf8");
    return id;
  };
  /** Call after cleanup succeeds; leaves the file behind if anything remains. */
  const done = (clean = true) => {
    if (clean && existsSync(path)) unlinkSync(path);
    else if (existsSync(path)) console.log(`captured-id manifest kept: ${path}`);
  };
  return { capture, capturedRows: () => [...captured], manifest: path, done };
}

export function createHarness(runLabel = "run") {
  let pass = 0;
  let fail = 0;
  const notRunList = [];
  const captured = [];
  const manifest = `${MANIFEST_DIR}/_ids-${runLabel}-${process.pid}.log`;

  const check = (name, ok, extra = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
    ok ? pass++ : fail++;
  };

  /** Precondition missing — counts against the run, never toward pass. */
  const notRun = (name, why) => {
    console.log(`NOT RUN  ${name}  (precondition: ${why})`);
    notRunList.push({ name, why });
  };

  const note = (m) => console.log(`      ${m}`);

  /**
   * Record a row this run created, journaling it to disk BEFORE the script can
   * crash (architect ruling 2026-07-31).
   *
   * The standing cleanup rule allows deleting only ids captured at creation
   * time. An id held solely in a dying process's memory is unrecoverable, which
   * forces report-and-stop and creates exactly the pressure toward a
   * cleanup-by-scope that the rule exists to prevent. Journaling keeps
   * id-based cleanup available after any crash — SIGPIPE, a failed seed, a
   * kill — at the cost of one append per insert.
   *
   * Usage:  const jobId = capture("jobs", data.id);
   */
  const capture = (table, id) => {
    if (id === null || id === undefined) return id;
    captured.push({ table, id });
    appendFileSync(manifest, `${table}\t${id}\n`, "utf8");
    return id;
  };

  /** Everything captured, for cleanup loops: cleanupOrder() -> [{table, id}]. */
  const capturedRows = () => [...captured];

  const summary = () => {
    const parts = [`${pass} passed`, `${fail} failed`];
    if (notRunList.length) parts.push(`${notRunList.length} NOT RUN`);
    console.log(`\n${parts.join(", ")}`);
    if (notRunList.length) {
      console.log("NOT RUN probes (these acceptance points were NOT exercised):");
      for (const n of notRunList) console.log(`  - ${n.name} — ${n.why}`);
    }
    const green = fail === 0 && notRunList.length === 0;
    if (!green && fail === 0) {
      console.log("RUN IS NOT GREEN: probes were skipped; fix the setup and re-run.");
    }
    // The manifest is crash insurance, not a record. Reaching summary() at all
    // means the script ran through its cleanup block, so the file has done its
    // job — a crash is precisely the case where summary() is never reached and
    // the file survives on disk. Keyed on `fail`, not on green: a suite with a
    // standing NOT RUN would otherwise litter a manifest on every single run,
    // and clutter is how a genuine recovery file gets overlooked. A real
    // failure may be a failed residue check, so those are kept.
    if (fail === 0 && existsSync(manifest)) unlinkSync(manifest);
    else if (existsSync(manifest)) {
      console.log(`captured-id manifest kept for recovery: ${manifest}`);
    }
    return green ? 0 : 1;
  };

  return { check, notRun, note, summary, capture, capturedRows, manifest };
}
