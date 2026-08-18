import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  solveMaterialFixture,
  type MaterialPlan,
  type MaterialPlanInput
} from "../src/index.js";

interface ScenarioExpect {
  readonly demandQuantity: Readonly<Record<string, number>>;
  readonly demandPlans?: readonly {
    readonly name: string;
    readonly date: number;
    readonly quantity: number;
    readonly originalDue?: number;
  }[];
  readonly operationPlans?: readonly {
    readonly name: string;
    readonly start: number;
    readonly end: number;
    readonly quantity: number;
    readonly confirmed?: boolean;
  }[];
  readonly purchases?: readonly {
    readonly item: string;
    readonly start: number;
    readonly end: number;
    readonly quantity: number;
  }[];
  readonly requiredOperations?: readonly string[];
  readonly forbiddenOperations?: readonly string[];
  readonly requiredPurchases?: readonly string[];
  readonly confirmedOperationNames?: readonly string[];
  readonly maxResourceLoad?: Readonly<Record<string, number>>;
  readonly checks: Readonly<Record<string, boolean>>;
}

interface ScenarioDocument {
  readonly name: string;
  readonly industry: "electronics" | "mechanical";
  readonly input: MaterialPlanInput;
  readonly expect: ScenarioExpect;
}

const fixtureDirectory = resolve("packages/mrp/test/fixtures-json");

async function loadScenarios(): Promise<readonly ScenarioDocument[]> {
  const names = (await readdir(fixtureDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  return Promise.all(names.map(async (name) => {
    const raw = await readFile(resolve(fixtureDirectory, name), "utf8");
    return JSON.parse(raw) as ScenarioDocument;
  }));
}

function demandQuantities(plan: MaterialPlan): Readonly<Record<string, number>> {
  return Object.fromEntries(
    (plan.demandPlans ?? []).map((entry) => [entry.name, entry.quantity])
  );
}

function maximumResourceLoads(plan: MaterialPlan): Readonly<Record<string, number>> {
  const maximums = new Map<string, number>();
  for (const event of plan.resourceEvents ?? []) {
    maximums.set(
      event.resource,
      Math.max(maximums.get(event.resource) ?? 0, event.load)
    );
  }
  return Object.fromEntries(maximums);
}

function operationNames(plan: MaterialPlan): readonly string[] {
  return (plan.operationPlans ?? []).map((entry) => entry.name);
}

function comparableDemandPlans(plan: MaterialPlan): readonly object[] {
  return (plan.demandPlans ?? []).map((entry) => ({
    name: entry.name,
    date: entry.date,
    quantity: entry.quantity,
    ...(entry.originalDue === undefined ? {} : { originalDue: entry.originalDue })
  }));
}

function comparableOperationPlans(plan: MaterialPlan): readonly object[] {
  return (plan.operationPlans ?? []).map((entry) => ({
    name: entry.name,
    start: entry.start,
    end: entry.end,
    quantity: entry.quantity,
    ...(entry.confirmed === undefined ? {} : { confirmed: entry.confirmed })
  }));
}

function comparablePurchases(plan: MaterialPlan): readonly object[] {
  return plan.purchases.map((entry) => ({
    item: entry.item,
    start: entry.start,
    end: entry.end,
    quantity: entry.quantity
  }));
}

function assertFinitePlan(plan: MaterialPlan): void {
  expect(plan.events.every((event) => Number.isFinite(event.onhand))).toBe(true);
  expect(plan.events.every((event) => Number.isFinite(event.periodOfCover))).toBe(true);
  expect(plan.purchases.every((purchase) => purchase.quantity > 0)).toBe(true);
  expect((plan.operationPlans ?? []).every((operation) =>
    operation.quantity > 0 && operation.start <= operation.end
  )).toBe(true);
  expect((plan.resourceEvents ?? []).every((event) => Number.isFinite(event.load))).toBe(true);
}

describe("JSON production planning scenarios", async () => {
  const scenarios = await loadScenarios();

  for (const scenario of scenarios) {
    it(`${scenario.industry}: ${scenario.name}`, () => {
      const first = solveMaterialFixture(scenario.input);
      const second = solveMaterialFixture(scenario.input);
      const expected = scenario.expect;

      expect(second).toEqual(first);
      assertFinitePlan(first);

      if (expected.demandPlans !== undefined) {
        expect(comparableDemandPlans(first)).toEqual(expected.demandPlans);
      }
      if (expected.operationPlans !== undefined) {
        expect(comparableOperationPlans(first)).toEqual(expected.operationPlans);
      }
      if (expected.purchases !== undefined) {
        expect(comparablePurchases(first)).toEqual(expected.purchases);
      }

      const actualDemandQuantities = demandQuantities(first);
      for (const [name, quantity] of Object.entries(expected.demandQuantity)) {
        expect(actualDemandQuantities[name]).toBe(quantity);
      }

      const actualOperationNames = operationNames(first);
      for (const name of expected.requiredOperations ?? []) {
        expect(actualOperationNames).toContain(name);
      }
      for (const name of expected.forbiddenOperations ?? []) {
        expect(actualOperationNames).not.toContain(name);
      }

      const purchasedItems = first.purchases.map((purchase) => purchase.item);
      for (const item of expected.requiredPurchases ?? []) {
        expect(purchasedItems).toContain(item);
      }

      for (const name of expected.confirmedOperationNames ?? []) {
        expect(first.operationPlans?.some((operation) =>
          operation.name === name && operation.confirmed === true
        )).toBe(true);
        expect(first.operationPlans?.filter((operation) => operation.name === name)).toHaveLength(1);
      }

      const loads = maximumResourceLoads(first);
      for (const [resource, maximum] of Object.entries(expected.maxResourceLoad ?? {})) {
        expect(loads[resource] ?? 0).toBeLessThanOrEqual(maximum + 1e-9);
      }

      const resourceMaximums = new Map(
        (scenario.input.resources ?? [])
          .filter((resource) => resource.maximum !== undefined)
          .map((resource) => [resource.name, resource.maximum as number])
      );
      if (expected.checks.resourceCapacityRespected) {
        for (const [resource, maximum] of resourceMaximums) {
          expect(loads[resource] ?? 0).toBeLessThanOrEqual(maximum + 1e-9);
        }
      }
      if (expected.checks.lateDeliveryAllowed) {
        expect((first.demandPlans ?? []).some((plan) =>
          plan.originalDue !== undefined && plan.date > plan.originalDue
        )).toBe(true);
      }
      if (expected.checks.purchaseLeadTimeHonored) {
        for (const purchase of first.purchases) {
          const source = scenario.input.sources.find((candidate) =>
            candidate.item === purchase.item && candidate.supplier === purchase.supplier
          );
          expect(source).toBeDefined();
          expect(purchase.end - purchase.start).toBe(source?.leadTimeSeconds);
        }
      }
      if (expected.checks.noDuplicateUnconfirmedPlan) {
        expect((first.operationPlans ?? []).some((plan) =>
          plan.name === "Assemble confirmed pump" && plan.confirmed !== true
        )).toBe(false);
      }

    });
  }
});
