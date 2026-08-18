import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareMaterialFixture,
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";

describe("material MRP", () => {
  it("matches frePPLe period_of_cover material events", async () => {
    const directory = resolve(freppleRoot, "test/period_of_cover");
    const input = await loadMaterialFixture(resolve(directory, "period_of_cover.xml"));
    const plan = solveMaterialFixture(input);

    await expect(
      compareMaterialFixture(plan, resolve(directory, "period_of_cover.1.expect"))
    ).resolves.toEqual([]);
  });

  it("matches frePPLe unconstrained supplier procurement output", async () => {
    const directory = resolve(freppleRoot, "test/supplier");
    const input = await loadMaterialFixture(resolve(directory, "supplier.xml"));
    const plan = solveMaterialFixture({ ...input, mode: "unconstrained" });

    await expect(
      compareMaterialFixture(plan, resolve(directory, "supplier.3.expect"))
    ).resolves.toEqual([]);
  });

  it("matches frePPLe constrained supplier procurement output", async () => {
    const directory = resolve(freppleRoot, "test/supplier");
    const input = await loadMaterialFixture(resolve(directory, "supplier.xml"));
    const plan = solveMaterialFixture(input);

    await expect(
      compareMaterialFixture(plan, resolve(directory, "supplier.2.expect"))
    ).resolves.toEqual([]);
  });
});
