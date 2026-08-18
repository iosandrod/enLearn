import { resolve } from "node:path";
import { it } from "vitest";
import {
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

it("debug operation split plans", async () => {
  const directory = resolve("E:/frepple-master/test/operation_split");
  const input = await loadMaterialFixture(resolve(directory, "operation_split.xml"));
  for (const mode of ["constrained", "unconstrained"] as const) {
    const plan = solveMaterialFixture({
      ...input,
      mode,
      constraints: mode === "constrained" ? 15 : 0
    });
    console.log(`MODE ${mode}`);
    console.log(
      JSON.stringify(
        plan.operationPlans?.filter((entry) =>
          entry.name.includes("make item")
        ),
        null,
        2
      )
    );
    console.log(
      JSON.stringify(
        plan.purchases.filter((entry) =>
          entry.item.includes("component 4")
        ),
        null,
        2
      )
    );
  }
});
