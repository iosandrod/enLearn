import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareMaterialFixture,
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";

describe("constrained resource scheduling", () => {
  it("matches constraints_resource_4.1.expect", async () => {
    const directory = resolve(freppleRoot, "test/constraints_resource_4");
    const input = await loadMaterialFixture(
      resolve(directory, "constraints_resource_4.xml")
    );
    const plan = solveMaterialFixture({
      ...input,
      mode: "constrained",
      constraints: 15
    });

    await expect(
      compareMaterialFixture(
        plan,
        resolve(directory, "constraints_resource_4.1.expect")
      )
    ).resolves.toEqual([]);
  });
});
