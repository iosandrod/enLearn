import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareMaterialFixture,
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";

describe("resource constraint regressions", () => {
  for (const testCase of [
    {
      directory: "constraints_resource_2",
      suffix: "1",
      mode: "constrained" as const,
      constraints: 15
    },
    {
      directory: "constraints_resource_2",
      suffix: "2",
      mode: "unconstrained" as const,
      constraints: 15
    },
    {
      directory: "constraints_resource_2",
      suffix: "3",
      mode: "unconstrained" as const,
      constraints: 0
    },
    {
      directory: "constraints_resource_3",
      suffix: "1",
      mode: "constrained" as const,
      constraints: 15
    },
    {
      directory: "constraints_resource_3",
      suffix: "2",
      mode: "unconstrained" as const,
      constraints: 15
    },
    {
      directory: "constraints_resource_3",
      suffix: "3",
      mode: "unconstrained" as const,
      constraints: 0
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
          resolve(
            directory,
            `${testCase.directory}.${testCase.suffix}.expect`
          )
        )
      ).resolves.toEqual([]);
    });
  }
});
