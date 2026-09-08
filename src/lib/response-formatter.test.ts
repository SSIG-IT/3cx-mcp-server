import { describe, it, expect } from "vitest";
import { formatListResponse } from "./response-formatter.js";

describe("formatListResponse", () => {
  it("compacts to summary fields and drops everything else", () => {
    const data = { value: [{ Id: 1, Number: "101", Secret: "should-be-gone" }] };
    const result = formatListResponse(data, "user");
    expect(result.items[0]).toEqual({ Id: 1, Number: "101" });
    expect(result.items[0]).not.toHaveProperty("Secret");
  });

  it("uses @odata.count for total and exact hasMore", () => {
    const data = { value: [{ Id: 1 }], "@odata.count": 5 };
    const result = formatListResponse(data, "user", { top: 1 });
    expect(result.summary.total).toBe(5);
    expect(result.summary.hasMore).toBe(true);
  });

  it("reports hasMore=false when the whole set is returned", () => {
    const data = { value: [{ Id: 1 }], "@odata.count": 1 };
    const result = formatListResponse(data, "user");
    expect(result.summary.hasMore).toBe(false);
  });

  it("handles a non-array payload gracefully", () => {
    expect(formatListResponse(null, "user").items).toEqual([]);
  });
});
