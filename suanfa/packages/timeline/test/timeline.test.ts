import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  Timeline,
  TimelineEventType
} from "../src/index.js";
import { epochSeconds } from "../../kernel/src/index.js";

describe("Timeline", () => {
  it("orders same-date production before consumption", () => {
    const timeline = new Timeline();
    const consume = timeline.insert({
      date: epochSeconds(100),
      quantity: -10
    });
    const produce = timeline.insert({
      date: epochSeconds(100),
      quantity: 10
    });

    expect(timeline.toArray()).toEqual([produce, consume]);
    expect(consume.onhand).toBe(0);
    expect(consume.onhandBeforeDate).toBe(0);
    expect(produce.onhandAfterDate).toBe(0);
    expect(timeline.check()).toBe(true);
  });

  it("resets onhand while retaining cumulative production", () => {
    const timeline = new Timeline();
    timeline.insert({ date: epochSeconds(1), quantity: 12 });
    const set = timeline.insert({
      date: epochSeconds(2),
      type: TimelineEventType.SetOnhand,
      setOnhand: 4
    });
    const consume = timeline.insert({ date: epochSeconds(3), quantity: -3 });

    expect(set.onhand).toBe(4);
    expect(consume.onhand).toBe(1);
    expect(consume.cumulativeProduced).toBe(12);
    expect(timeline.check()).toBe(true);
  });

  it("updates event position and caches", () => {
    const timeline = new Timeline();
    const later = timeline.insert({ date: epochSeconds(20), quantity: -2 });
    timeline.insert({ date: epochSeconds(10), quantity: 5 });

    timeline.update(later, { date: epochSeconds(5), quantity: -1 });

    expect(timeline.toArray().map((event) => event.quantity)).toEqual([-1, 5]);
    expect(timeline.toArray().map((event) => event.onhand)).toEqual([-1, 4]);
    expect(timeline.check()).toBe(true);
  });

  it("keeps cache values equivalent to a full recomputation", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            date: fc.integer({ min: 1, max: 30 }),
            quantity: fc.integer({ min: -25, max: 25 })
          }),
          { maxLength: 100 }
        ),
        (inputs) => {
          const timeline = new Timeline();
          for (const input of inputs) {
            timeline.insert({
              date: epochSeconds(input.date),
              quantity: input.quantity
            });
          }
          return timeline.check();
        }
      )
    );
  });
});
