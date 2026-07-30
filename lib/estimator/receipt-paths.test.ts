import { describe, it, expect } from "vitest";
import { allStoragePathsFor, isThumbPath, thumbPathFor } from "./receipt-paths";

describe("thumbPathFor", () => {
  it("inserts -thumb before the extension", () => {
    expect(thumbPathFor("8/purchase-3-abc.jpg")).toBe("8/purchase-3-abc-thumb.jpg");
    expect(thumbPathFor("1/x.png")).toBe("1/x-thumb.png");
  });

  it("appends when there is no extension", () => {
    expect(thumbPathFor("8/receipt")).toBe("8/receipt-thumb");
  });

  it("is not confused by a dot in the directory", () => {
    expect(thumbPathFor("a.b/c")).toBe("a.b/c-thumb");
  });
});

describe("isThumbPath", () => {
  it("recognises thumbnails and leaves full images alone", () => {
    expect(isThumbPath("8/p-1-abc-thumb.jpg")).toBe(true);
    expect(isThumbPath("8/p-1-abc.jpg")).toBe(false);
  });
});

describe("allStoragePathsFor — regression: deleting a purchase must not orphan thumbs", () => {
  it("returns every full image AND its thumbnail", () => {
    const paths = allStoragePathsFor({
      receipt_paths: ["1/a.jpg", "1/b.jpg"],
      receipt_path: null,
    });
    expect(paths).toEqual([
      "1/a.jpg",
      "1/a-thumb.jpg",
      "1/b.jpg",
      "1/b-thumb.jpg",
    ]);
  });

  it("includes the legacy single receipt_path and its thumb", () => {
    const paths = allStoragePathsFor({
      receipt_paths: ["1/a.jpg"],
      receipt_path: "1/legacy.png",
    });
    expect(paths).toContain("1/legacy.png");
    expect(paths).toContain("1/legacy-thumb.png");
  });

  it("dedupes when the same path appears twice", () => {
    const paths = allStoragePathsFor({
      receipt_paths: ["1/a.jpg"],
      receipt_path: "1/a.jpg",
    });
    expect(paths).toEqual(["1/a.jpg", "1/a-thumb.jpg"]);
  });

  it("handles a purchase with no photos at all", () => {
    expect(allStoragePathsFor({ receipt_paths: null, receipt_path: null })).toEqual([]);
    expect(allStoragePathsFor({})).toEqual([]);
  });
});
