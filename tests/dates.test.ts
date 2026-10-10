import { describe, expect, it } from "vitest";
import { addDays, daysBetween, fromDateKey, toDateKey, todayKey } from "../src/domain/dates";

describe("toDateKey", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(toDateKey(new Date(2026, 9, 8, 23, 59, 59))).toBe("2026-10-08");
  });

  it("uses the local day, not UTC, around midnight", () => {
    // 本地 00:05 与本地 23:55 必须落回各自当地日期
    expect(toDateKey(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
    expect(toDateKey(new Date(2026, 0, 1, 23, 55))).toBe("2026-01-01");
  });

  it("zero-pads month and day", () => {
    expect(toDateKey(new Date(2026, 2, 5, 12, 0))).toBe("2026-03-05");
  });
});

describe("fromDateKey", () => {
  it("returns local midnight for the given key", () => {
    const d = fromDateKey("2026-10-08");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
});

describe("daysBetween", () => {
  it("is 0 for the same day", () => {
    expect(daysBetween("2026-10-08", "2026-10-08")).toBe(0);
  });

  it("is positive when the second key is later", () => {
    expect(daysBetween("2026-10-08", "2026-10-11")).toBe(3);
  });

  it("is negative when the second key is earlier (overdue)", () => {
    expect(daysBetween("2026-10-08", "2026-10-05")).toBe(-3);
  });

  it("is unaffected by DST-style month boundaries", () => {
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
});

describe("addDays", () => {
  it("adds days across a month boundary", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("subtracts days across a year boundary", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("todayKey", () => {
  it("derives today from an injected clock", () => {
    expect(todayKey(new Date(2026, 9, 8, 7, 30))).toBe("2026-10-08");
  });
});
