import { describe, expect, it } from "vitest";

import { SupplyGraph } from "../src/index.js";

describe("SupplyGraph", () => {
  it("assigns levels from consumption to production", () => {
    const graph = new SupplyGraph();
    graph.ensureBuffer("raw").item = "item";
    graph.addFlow("deliver", "raw", -1);
    graph.addFlow("make", "raw", 1);

    graph.computeLevels();

    expect(graph.operations.get("deliver")?.level).toBe(0);
    expect(graph.operations.get("make")?.level).toBe(1);
    expect(graph.buffers.get("raw")?.level).toBe(1);
    expect(graph.operations.get("deliver")?.cluster).toBe(
      graph.operations.get("make")?.cluster
    );
  });

  it("keeps a dangling operation in cluster zero", () => {
    const graph = new SupplyGraph();
    graph.ensureOperation("unused");

    graph.computeLevels();

    expect(graph.operations.get("unused")?.level).toBe(0);
    expect(graph.operations.get("unused")?.cluster).toBe(0);
  });
});
