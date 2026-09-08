import { describe, it, expect } from "vitest";
import { escapeODataString, buildContainsFilter, buildQuery } from "./odata.js";

describe("escapeODataString", () => {
  it("doubles single quotes (OData injection safety)", () => {
    expect(escapeODataString("O'Brien")).toBe("O''Brien");
    expect(escapeODataString("a'b'c")).toBe("a''b''c");
  });

  it("leaves plain strings untouched", () => {
    expect(escapeODataString("101")).toBe("101");
    expect(escapeODataString("Mueller")).toBe("Mueller");
  });
});

describe("buildContainsFilter", () => {
  it("builds an OR filter across fields and escapes the term", () => {
    expect(buildContainsFilter(["FirstName", "LastName"], "O'Neil")).toBe(
      "contains(FirstName,'O''Neil') or contains(LastName,'O''Neil')",
    );
  });
});

describe("buildQuery", () => {
  it("skips undefined values and encodes params", () => {
    const q = buildQuery({ $top: 5, $skip: undefined });
    expect(q.startsWith("?")).toBe(true);
    expect(decodeURIComponent(q)).toBe("?$top=5");
  });

  it("returns empty string when nothing is set", () => {
    expect(buildQuery({})).toBe("");
    expect(buildQuery({ $filter: undefined })).toBe("");
  });
});
