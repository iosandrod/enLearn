import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const directory = resolve("E:/frepple-master/test/operation_effective");

describe("date-effective minimum operation sizes", () => {
  it("uses the winning calendar bucket at the production end date", async () => {
    const input = await loadMaterialFixture(
      resolve(directory, "operation_effective.xml")
    );
    const plan = solveMaterialFixture({
      ...input,
      mode: "constrained",
      constraints: 15
    });

    expect(plan.operationPlans?.filter(
      (entry) => entry.name === "4. make end item"
    )).toEqual([
      { name: "4. make end item", start: 1420070400, end: 1420675200, quantity: 40 },
      { name: "4. make end item", start: 1420156800, end: 1420761600, quantity: 20 },
      { name: "4. make end item", start: 1420502400, end: 1421107200, quantity: 20 },
      { name: "4. make end item", start: 1420848000, end: 1421452800, quantity: 30 },
      { name: "4. make end item", start: 1421366400, end: 1421971200, quantity: 40 }
    ]);
    expect(plan.operationPlans?.filter(
      (entry) => entry.name === "5. make end item"
    )).toEqual([
      { name: "5. make end item", start: 1420070400, end: 1420675200, quantity: 40 },
      { name: "5. make end item", start: 1420156800, end: 1420761600, quantity: 40 },
      { name: "5. make end item", start: 1420848000, end: 1421452800, quantity: 30 },
      { name: "5. make end item", start: 1421366400, end: 1421971200, quantity: 20 },
      { name: "5. make end item", start: 1421712000, end: 1422316800, quantity: 20 }
    ]);
  });
});
