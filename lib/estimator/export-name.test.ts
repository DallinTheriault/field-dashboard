import { describe, expect, it } from "vitest";
import { exportFileName } from "./export-name";

describe("exportFileName", () => {
  it("names the file after the business", () => {
    expect(exportFileName("Cascade HVAC Services LLC", "pnl", 2026)).toBe("cascade-hvac-services-llc-pnl-2026.csv");
    expect(exportFileName("Sharpline", "pnl", 2025)).toBe("sharpline-pnl-2025.csv");
  });

  it("keeps only letters and digits, safe in a download header", () => {
    expect(exportFileName("Joe's Paint & Drywall, Inc.", "pnl", 2026)).toBe("joe-s-paint-and-drywall-inc-pnl-2026.csv");
    expect(exportFileName("Café Ñandú", "pnl", 2026)).toBe("cafe-nandu-pnl-2026.csv");
    expect(exportFileName('A "quoted"\r\nname', "pnl", 2026)).toBe("a-quoted-name-pnl-2026.csv");
  });

  it("falls back to field when there's no usable name", () => {
    expect(exportFileName(null, "pnl", 2026)).toBe("field-pnl-2026.csv");
    expect(exportFileName("  —  ", "pnl", 2026)).toBe("field-pnl-2026.csv");
  });

  it("keeps long names short", () => {
    const name = exportFileName("A".repeat(80), "pnl", 2026);
    expect(name).toBe(`${"a".repeat(40)}-pnl-2026.csv`);
  });
});
