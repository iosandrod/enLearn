import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareMaterialFixture,
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";

describe("additional fixture golden coverage", () => {
  for (const testCase of [
    {
      directory: "constraints_resource_1",
      suffix: "1",
      mode: "constrained" as const,
      constraints: 15
    },
    {
      directory: "constraints_resource_1",
      suffix: "3",
      mode: "unconstrained" as const,
      constraints: 0
    },
    {
      directory: "constraints_resource_5",
      suffix: "2",
      mode: "unconstrained" as const,
      constraints: 15
    },
    {
      directory: "constraints_resource_5",
      suffix: "3",
      mode: "unconstrained" as const,
      constraints: 0
    },
    {
      directory: "constraints_leadtime_2",
      suffix: "2",
      mode: "unconstrained" as const,
      constraints: 15
    },
    {
      directory: "constraints_leadtime_2",
      suffix: "3",
      mode: "unconstrained" as const,
      constraints: 0
    },
    {
      directory: "constraints_material_4",
      suffix: "1",
      mode: "constrained" as const,
      constraints: 15
    },
    {
      directory: "constraints_material_4",
      suffix: "3",
      mode: "unconstrained" as const,
      constraints: 0
    },
    {
      directory: "constraints_combined_1",
      suffix: "2",
      mode: "unconstrained" as const,
      constraints: 15
    },
    {
      directory: "constraints_leadtime_3",
      suffix: "1",
      mode: "constrained" as const,
      constraints: 16
    },
    {
      directory: "constraints_leadtime_3",
      suffix: "2",
      mode: "constrained" as const,
      constraints: 48
    }
  ]) {
    it(`matches ${testCase.directory}.${testCase.suffix}.expect`, async () => {
      const directory = resolve(freppleRoot, "test", testCase.directory);
      const input = await loadMaterialFixture(
        resolve(directory, `${testCase.directory}.xml`)
      );
      const plan = solveMaterialFixture({
        ...input,
        mode: testCase.mode,
        constraints: testCase.constraints
      });

      await expect(
        compareMaterialFixture(
          plan,
          resolve(directory, `${testCase.directory}.${testCase.suffix}.expect`)
        )
      ).resolves.toEqual([]);
    });
  }
});
