import { describe, expect, it } from "vitest";

import {
  INFINITE_FUTURE,
  INFINITE_PAST,
  addDuration,
  durationSeconds,
  formatDate,
  parseDate,
  parseDuration
} from "../src/index.js";

describe("date kernel", () => {
  it("parses frePPLe second-precision dates as UTC", () => {
    expect(parseDate("2012-01-02T09:00:00")).toBe(1_325_494_800);
    expect(formatDate(parseDate("2012-01-02T09:00:00"))).toBe(
      "2012-01-02T09:00:00"
    );
  });

  it("implements the frePPLe date boundaries", () => {
    expect(INFINITE_PAST).toBe(parseDate("1971-01-01T00:00:00"));
    expect(INFINITE_FUTURE).toBe(parseDate("2030-12-31T00:00:00"));
    expect(formatDate(INFINITE_FUTURE)).toBe("2030-12-31T00:00:00");
    expect(addDuration(INFINITE_PAST, durationSeconds(-1))).toBe(INFINITE_PAST);
  });

  it("parses calendar durations", () => {
    expect(parseDuration("PT9H")).toBe(32_400);
    expect(parseDuration("P1DT2H30M15S")).toBe(95_415);
  });
});
