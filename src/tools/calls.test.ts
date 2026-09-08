import { describe, it, expect } from "vitest";
import { localDayRangeToUtc, collapseSegments, matchesExtension } from "./calls.js";

describe("localDayRangeToUtc", () => {
  it("maps a Berlin summer day to the correct UTC instants (CEST = +2)", () => {
    expect(localDayRangeToUtc("2026-07-15", "Europe/Berlin")).toEqual({
      periodFrom: "2026-07-14T22:00:00Z",
      periodTo: "2026-07-15T21:59:59Z",
    });
  });

  it("maps a Berlin winter day to the correct UTC instants (CET = +1)", () => {
    expect(localDayRangeToUtc("2026-01-15", "Europe/Berlin")).toEqual({
      periodFrom: "2026-01-14T23:00:00Z",
      periodTo: "2026-01-15T22:59:59Z",
    });
  });

  it("is identity for UTC", () => {
    expect(localDayRangeToUtc("2026-01-15", "UTC")).toEqual({
      periodFrom: "2026-01-15T00:00:00Z",
      periodTo: "2026-01-15T23:59:59Z",
    });
  });
});

describe("collapseSegments", () => {
  const segments = [
    { MainCallHistoryId: "A", StartTime: "2026-09-08T06:25:55.056Z", Answered: true, Status: "Waiting" },
    { MainCallHistoryId: "A", StartTime: "2026-09-08T06:25:55.145Z", Answered: true, Status: "Answered" },
    { MainCallHistoryId: "B", StartTime: "2026-09-08T05:00:00Z", Answered: false, Status: "Unanswered" },
    // segment leg unanswered, but the overall call WAS answered by someone:
    { MainCallHistoryId: "C", StartTime: "2026-09-08T04:00:00Z", Answered: true, Status: "Unanswered" },
  ];

  it("produces one row per logical call", () => {
    expect(collapseSegments(segments)).toHaveLength(3);
  });

  it("uses the earliest StartTime and the answered status for a multi-segment call", () => {
    const a = collapseSegments(segments).find((c) => c.MainCallHistoryId === "A");
    expect(a?.StartTime).toBe("2026-09-08T06:25:55.056Z");
    expect(a?.Answered).toBe(true);
    expect(a?.Status).toBe("Answered");
  });

  it("counts a call as missed only when NO segment was answered", () => {
    const missed = collapseSegments(segments).filter((c) => c.Answered === false);
    expect(missed.map((c) => c.MainCallHistoryId)).toEqual(["B"]);
  });
});

describe("matchesExtension", () => {
  it("matches source or destination Dn", () => {
    expect(matchesExtension({ SourceDn: "126" }, "126")).toBe(true);
    expect(matchesExtension({ DestinationDn: "804" }, "126")).toBe(false);
  });

  it("returns true when no extension filter is given", () => {
    expect(matchesExtension({ SourceDn: "126" }, undefined)).toBe(true);
  });

  it("matches the 'Ext.NNN' caller-id form", () => {
    expect(matchesExtension({ DestinationCallerId: "Ext.101" }, "101")).toBe(true);
  });
});
