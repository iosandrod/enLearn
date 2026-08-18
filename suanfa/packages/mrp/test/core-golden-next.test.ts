import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareMaterialFixture,
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";

describe("next manufacturing golden fixtures", () => {
  const cases = [
    {
      directory: "flow_effective",
      suffixes: ["1", "2"] as const
    },
    {
      directory: "flow_offset",
      suffixes: ["1", "2"] as const
    },
    {
      directory: "constraints_material_1",
      suffixes: ["1", "2", "3"] as const
    }
  ];

  for (const testCase of cases) {
    for (const suffix of testCase.suffixes) {
      it(`matches ${testCase.directory}.${suffix}.expect`, async () => {
        const directory = resolve(freppleRoot, "test", testCase.directory);
        const input = await loadMaterialFixture(
          resolve(directory, `${testCase.directory}.xml`)
        );
        const mode = suffix === "1" ? "constrained" : "unconstrained";
        const plan = solveMaterialFixture({
          ...input,
          mode,
          ...(testCase.directory === "constraints_material_1" && suffix === "3"
            ? { constraints: 0 }
            : {})
        });
        await expect(
          compareMaterialFixture(
            plan,
            resolve(directory, `${testCase.directory}.${suffix}.expect`)
          )
        ).resolves.toEqual([]);
      });
    }
  }
});
