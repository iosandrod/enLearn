import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareMaterialFixture,
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";

describe("unconstrained resource load timeline", () => {
  it("matches constraints_resource_4.3.expect", async () => {
    const directory = resolve(freppleRoot, "test/constraints_resource_4");
    const input = await loadMaterialFixture(
      resolve(directory, "constraints_resource_4.xml")
    );
    const plan = solveMaterialFixture({
      ...input,
      mode: "unconstrained",
      constraints: 0
    });

    await expect(
      compareMaterialFixture(
        plan,
        resolve(directory, "constraints_resource_4.3.expect")
      )
    ).resolves.toEqual([]);
  });
});
