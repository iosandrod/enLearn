import { describe, expect, it } from "vitest";

import {
  PlanningTransactionManager,
  SolverGuard,
  createSolverRequest,
  nextDateReply,
  quantityReply
} from "../src/index.js";

describe("solver request/reply state", () => {
  it("validates quantities and creates native-style replies", () => {
    const request = createSolverRequest({
      qQty: 10,
      qDate: 100,
      currentBuffer: "item @ location"
    });

    expect(quantityReply(request, 4, 1_000)).toMatchObject({
      aQty: 4,
      aDate: 1_000
    });
    expect(nextDateReply(120)).toMatchObject({ aQty: 0, aDate: 120 });
    expect(() => quantityReply(request, 11, 1_000)).toThrow(RangeError);
    expect(() => createSolverRequest({ qQty: Number.NaN, qDate: 100 }))
      .toThrow(RangeError);
  });

  it("rolls back nested planning bookmarks atomically", () => {
    const state = { values: [] as number[] };
    const transactions = new PlanningTransactionManager(
      () => [...state.values],
      (snapshot) => state.values.splice(0, state.values.length, ...snapshot)
    );
    const outer = transactions.setBookmark();
    state.values.push(1);
    const inner = transactions.setBookmark();
    state.values.push(2);

    transactions.rollback(inner);
    expect(state.values).toEqual([1]);
    state.values.push(3);
    transactions.rollback(outer);
    expect(state.values).toEqual([]);
    expect(transactions.depth).toBe(0);
  });

  it("bounds recursion, cycles and total visits", () => {
    const guard = new SolverGuard({ maximumDepth: 2, maximumVisits: 3 });
    expect(() => guard.enter("buffer:A", () =>
      guard.enter("buffer:A", () => undefined)
    )).toThrow(/cycle/i);
    guard.enter("buffer:B", () => undefined);
    expect(() => guard.enter("buffer:C", () => undefined)).toThrow(/visit limit/i);
  });
});
