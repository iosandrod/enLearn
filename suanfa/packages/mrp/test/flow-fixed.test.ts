import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareMaterialFixture,
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";

describe("manufacturing MRP fixed flows", () => {
  for (const [mode, suffix] of [
    ["constrained", "1"],
    ["unconstrained", "2"]
  ] as const) {
    it(`matches flow_fixed.${suffix}.expect`, async () => {
      const directory = resolve(freppleRoot, "test/flow_fixed");
      const input = await loadMaterialFixture(
        resolve(directory, "flow_fixed.xml")
      );
      const plan = solveMaterialFixture({ ...input, mode });
      await expect(
        compareMaterialFixture(
          plan,
          resolve(directory, `flow_fixed.${suffix}.expect`)
        )
      ).resolves.toEqual([]);
    });
  }
});
