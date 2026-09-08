import { describe, it, expect } from "vitest";
import { rankUsers, redactSecrets } from "./users.js";

describe("redactSecrets", () => {
  it("masks credential fields but keeps everything else", () => {
    const record = { Id: 1, Number: "126", AuthPassword: "s3cret", DeskphonePassword: "d3sk", VMPIN: "1234" };
    expect(redactSecrets(record)).toEqual({
      Id: 1,
      Number: "126",
      AuthPassword: "***redacted***",
      DeskphonePassword: "***redacted***",
      VMPIN: "***redacted***",
    });
  });

  it("passes through records without secrets", () => {
    expect(redactSecrets({ Id: 1, Number: "126" })).toEqual({ Id: 1, Number: "126" });
  });
});

describe("rankUsers", () => {
  it("puts an exact extension match first", () => {
    const users = [
      { Number: "1264", FirstName: "Zoe" },
      { Number: "126", FirstName: "Anna" },
      { Number: "500", EmailAddress: "x@y.z" },
    ];
    expect(rankUsers(users, "126")[0].Number).toBe("126");
  });

  it("ranks startsWith above unrelated matches", () => {
    const users = [
      { Number: "500" },
      { Number: "1264" },
    ];
    expect(rankUsers(users, "126")[0].Number).toBe("1264");
  });

  it("returns the list unchanged for an empty term", () => {
    const users = [{ Number: "b" }, { Number: "a" }];
    expect(rankUsers(users, "")).toEqual(users);
  });
});
