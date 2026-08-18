import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareMaterialFixture,
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";

describe("operation split manufacturing", () => {
  for (const [mode, suffix] of [
    ["constrained", "1"],
    ["unconstrained", "2"]
  ] as const) {
    it(`matches operation_split.${suffix}.expect`, async () => {
      const directory = resolve(freppleRoot, "test/operation_split");
      const input = await loadMaterialFixture(
        resolve(directory, "operation_split.xml")
      );
      const plan = solveMaterialFixture({
        ...input,
        mode,
        constraints: 15
      });
      await expect(
        compareMaterialFixture(
          plan,
          resolve(directory, `operation_split.${suffix}.expect`)
        )
      ).resolves.toEqual([]);
    });
  }
});
