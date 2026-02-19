import { describe, expect, it } from "vitest";

import { clampSeconds, formatTimestamp, parseTimestamp } from "./time";

describe("time utilities", () => {
  it("parses timestamp text", () => {
    expect(parseTimestamp("00:01:03.500")).toBeCloseTo(63.5, 5);
    expect(parseTimestamp("01:03.250")).toBeCloseTo(63.25, 5);
    expect(parseTimestamp("8.5")).toBeCloseTo(8.5, 5);
  });

  it("rejects invalid timestamp text", () => {
    expect(parseTimestamp("-1")).toBeNull();
    expect(parseTimestamp("00:99:00")).toBeNull();
    expect(parseTimestamp("nope")).toBeNull();
  });

  it("formats timestamps", () => {
    expect(formatTimestamp(63.5)).toBe("00:01:03.500");
    expect(formatTimestamp(0)).toBe("00:00:00.000");
  });

  it("clamps values", () => {
    expect(clampSeconds(5, 0, 10)).toBe(5);
    expect(clampSeconds(-1, 0, 10)).toBe(0);
    expect(clampSeconds(11, 0, 10)).toBe(10);
  });
});
