import { describe, it, expect } from "vitest";
import { rankServices } from "./services";

describe("rankServices", () => {
  it("returns distinct values, most used first", () => {
    expect(rankServices(["Turn", "Repaint", "Turn", "Turn", "Repaint", "Deck"]))
      .toEqual(["Turn", "Repaint", "Deck"]);
  });

  it("breaks ties alphabetically so order is stable between renders", () => {
    expect(rankServices(["Zebra", "Alpha"])).toEqual(["Alpha", "Zebra"]);
  });

  it("collapses case variants and offers back the most common spelling", () => {
    // The real Sharpline data: the same job spelled several ways.
    expect(rankServices(["turn", "Turn", "Turn", "TURN"])).toEqual(["Turn"]);
  });

  it("does not collapse genuinely different wordings", () => {
    // "Turn" and "Turn work" are distinct strings; only case folds.
    expect(rankServices(["Turn work", "Turn", "Turn"])).toEqual(["Turn", "Turn work"]);
  });

  it("drops null, undefined, empty and whitespace-only values", () => {
    expect(rankServices([null, undefined, "", "   ", "Turn"])).toEqual(["Turn"]);
  });

  it("trims surrounding whitespace and dedupes on the trimmed value", () => {
    expect(rankServices(["  Turn  ", "Turn"])).toEqual(["Turn"]);
  });

  it("returns an empty list for a tenant with no service values", () => {
    expect(rankServices([])).toEqual([]);
    expect(rankServices([null, null])).toEqual([]);
  });

  it("caps the list so free text cannot balloon the payload", () => {
    const many = Array.from({ length: 120 }, (_, i) => `Service ${i}`);
    expect(rankServices(many)).toHaveLength(50);
  });

  it("carries no vocabulary of its own — output is a subset of the input", () => {
    // The multi-tenant guarantee: a tenant can only be suggested its own words.
    const input = ["Furnace tune-up", "Duct cleaning"];
    for (const value of rankServices(input)) expect(input).toContain(value);
  });
});
