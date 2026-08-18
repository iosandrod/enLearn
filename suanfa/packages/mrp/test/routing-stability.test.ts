import { resolve } from "node:path";

import { expect, it } from "vitest";

import {
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";

it("keeps routing plan expansion bounded", async () => {
  const directory = resolve(freppleRoot, "test/operation_routing");
  const input = await loadMaterialFixture(
    resolve(directory, "operation_routing.xml")
  );
  const demandIndex = Number(process.env.ROUTING_DEMAND_INDEX ?? 0);
  const demand = input.demands[demandIndex];
  expect(demand).toBeDefined();

  const variantInput = input;
  const selectedDemands = process.env.ROUTING_DEMAND_INDEX === undefined
    ? input.demands
    : demand
      ? [demand]
      : [];
  const plan = solveMaterialFixture({
    ...variantInput,
    demands: selectedDemands,
    mode: "constrained",
    constraints: 15
  });

  expect(plan.events.length).toBeLessThan(1_000);
  expect(plan.operationPlans?.length ?? 0).toBeLessThan(1_000);
  expect(plan.purchases.length).toBeLessThan(1_000);
});
