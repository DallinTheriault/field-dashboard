import { describe, expect, it } from "vitest";
import { storeName } from "./store-names";

describe("storeName", () => {
  it("saves one name per common store", () => {
    expect(storeName("The Home Depot")).toBe("Home Depot");
    expect(storeName("THE HOME DEPOT #4410")).toBe("Home Depot");
    expect(storeName("Home Depot")).toBe("Home Depot");
    expect(storeName("Lowe's Home Centers, LLC")).toBe("Lowe's");
    expect(storeName("LOWES #1234")).toBe("Lowe's");
    expect(storeName("Sherwin-Williams #8821")).toBe("Sherwin-Williams");
    expect(storeName("WALMART SUPERCENTER")).toBe("Walmart");
  });
  it("leaves other names as read, and never matches a store inside another word", () => {
    expect(storeName("  Smith Plumbing Supply  ")).toBe("Smith Plumbing Supply");
    expect(storeName("Homestead Depot")).toBe("Homestead Depot");
    expect(storeName("Lowell Lumber")).toBe("Lowell Lumber");
    expect(storeName("")).toBe("");
    expect(storeName(null)).toBeNull();
  });
});
