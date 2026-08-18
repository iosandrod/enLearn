import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareMaterialFixture,
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";
const day = 86_400;

describe("manufacturing MRP buffer maximum", () => {
  for (const testCase of [
    { suffix: "1", mode: "constrained" as const, constraints: 15, autofenceSeconds: 0 },
    { suffix: "2", mode: "unconstrained" as const, constraints: 15, autofenceSeconds: 0 },
    { suffix: "3", mode: "unconstrained" as const, constraints: 0, autofenceSeconds: 0 },
    { suffix: "4", mode: "constrained" as const, constraints: 15, autofenceSeconds: 900 * day },
    { suffix: "5", mode: "unconstrained" as const, constraints: 15, autofenceSeconds: 900 * day },
    { suffix: "6", mode: "unconstrained" as const, constraints: 0, autofenceSeconds: 900 * day }
  ]) {
    it(`matches buffer_max.${testCase.suffix}.expect`, async () => {
      const directory = resolve(freppleRoot, "test/buffer_max");
      const input = await loadMaterialFixture(
        resolve(directory, "buffer_max.xml")
      );
      const plan = solveMaterialFixture({
        ...input,
        mode: testCase.mode,
        constraints: testCase.constraints,
        autofenceSeconds: testCase.autofenceSeconds
      });
      await expect(
        compareMaterialFixture(
          plan,
          resolve(directory, `buffer_max.${testCase.suffix}.expect`)
        )
      ).resolves.toEqual([]);
    });
  }
});
