import { describe, expect, it } from "vitest";
import { SolverGuard } from "../src/solver-state.js";
import { runSolverPipeline } from "../src/solver-architecture.js";

describe("solver propagation pipeline", () => {
  it("runs native-style phases in deterministic order", () => {
    const calls: string[] = [];
    const result = runSolverPipeline(new SolverGuard(), [
      { name: "load-confirmed", run: () => calls.push("load") },
      { name: "propagate-demand", run: () => calls.push("demand") },
      { name: "propagate-buffer", run: () => calls.push("buffer") },
      { name: "propagate-resource", run: () => calls.push("resource") }
    ]);

    expect(calls).toEqual(["load", "demand", "buffer", "resource"]);
    expect(result.completedPhases).toBe(4);
  });

  it("stops a non-finite pipeline instead of running without a bound", () => {
    const guard = new SolverGuard({ maximumVisits: 1 });
    expect(() => runSolverPipeline(guard, [
      { name: "load-confirmed", run: () => undefined },
      { name: "propagate-demand", run: () => undefined }
    ])).toThrow("Solver visit limit 1 exceeded");
  });
});
