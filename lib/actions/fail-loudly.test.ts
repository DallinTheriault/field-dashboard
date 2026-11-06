import { describe, expect, it } from "vitest";
import { failLoudly, failureMessage } from "./fail-loudly";

describe("failLoudly", () => {
  it("passes a result through", async () => {
    expect(await failLoudly(async () => ({ ok: true as const, data: 1 }))).toEqual({ ok: true, data: 1 });
  });
  it("turns a thrown query error into { ok: false, error }", async () => {
    const pgError = Object.assign(new Error('permission denied for table "jobs"'), { code: "42501" });
    expect(await failLoudly(async () => { throw pgError; })).toEqual({ ok: false, error: 'permission denied for table "jobs"' });
  });
  it("has a sentence even when the error has none", () => {
    expect(failureMessage({})).toMatch(/Nothing was saved/);
  });
});

describe("secondStep", async () => {
  const { secondStep } = await import("./fail-loudly");
  it("says what didn't happen and why, or nothing when it worked", () => {
    expect(secondStep({ error: null }, "Saved, but x didn't")).toBeUndefined();
    expect(secondStep({ error: { message: "permission denied" } }, "Saved, but the job didn't update"))
      .toBe("Saved, but the job didn't update: permission denied");
  });
});
