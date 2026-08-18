import { describe, expect, it } from "vitest";

import {
  Calendar,
  type CalendarBucketInput
} from "../src/index.js";
import {
  formatDate,
  parseDate,
  parseDuration
} from "../../kernel/src/index.js";

function bucket(
  start: string,
  end: string,
  value: number,
  partial: Partial<Omit<CalendarBucketInput, "start" | "end" | "value">> = {}
): CalendarBucketInput {
  return {
    start: parseDate(start),
    end: parseDate(end),
    value,
    ...partial
  };
}

describe("Calendar", () => {
  it("uses the lowest effective priority", () => {
    const calendar = new Calendar("priority", 0, [
      bucket("2012-01-01T00:00:00", "2012-01-20T00:00:00", 10, {
        priority: 5
      }),
      bucket("2012-01-11T00:00:00", "2012-01-15T00:00:00", 8, {
        priority: 1
      })
    ]);

    expect(calendar.valueAt(parseDate("2012-01-10T12:00:00"))).toBe(10);
    expect(calendar.valueAt(parseDate("2012-01-11T12:00:00"))).toBe(8);
    expect(calendar.valueAt(parseDate("2012-01-15T00:00:00"))).toBe(10);
  });

  it("honors weekday and daily time windows", () => {
    const calendar = new Calendar("hours", 0, [
      bucket("2012-01-01T00:00:00", "2012-01-10T00:00:00", 1, {
        days: 62,
        startTime: parseDuration("PT9H"),
        endTime: parseDuration("PT17H")
      })
    ]);

    expect(calendar.valueAt(parseDate("2012-01-02T08:59:59"))).toBe(0);
    expect(calendar.valueAt(parseDate("2012-01-02T09:00:00"))).toBe(1);
    expect(calendar.valueAt(parseDate("2012-01-02T17:00:00"))).toBe(0);
    expect(calendar.valueAt(parseDate("2012-01-07T12:00:00"))).toBe(0);
  });

  it("keeps bucket identity changes with identical values as events", () => {
    const calendar = new Calendar("holiday", 0, [
      bucket("2012-01-01T00:00:00", "2012-01-10T00:00:00", 1, {
        days: 62,
        startTime: parseDuration("PT9H"),
        endTime: parseDuration("PT17H"),
        priority: 10
      }),
      bucket("2012-01-02T00:00:00", "2012-01-03T00:00:00", 0, {
        priority: 1
      })
    ]);

    expect(
      calendar
        .events()
        .map((event) => [formatDate(event.date), event.value])
    ).toContainEqual(["2012-01-02T00:00:00", 0]);
  });
});
