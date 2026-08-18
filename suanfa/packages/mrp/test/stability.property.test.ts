import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { epochSeconds } from "../../kernel/src/index.js";
import {
  solveMaterialPlan,
  type MaterialPlanInput
} from "../src/index.js";

const DAY = 86_400;

interface GeneratedDemand {
  readonly id: number;
  readonly dueDay: number;
  readonly quantity: number;
  readonly priority: number;
  readonly minimumShipment: number;
}

function inputFor(
  demands: readonly GeneratedDemand[],
  onhand: number,
  minimumQuantity: number,
  multipleQuantity: number
): MaterialPlanInput {
  const current = epochSeconds(1_735_689_600);
  return {
    current,
    mode: "unconstrained",
    buffers: [{
      name: "item @ warehouse",
      item: "item",
      location: "warehouse",
      onhand
    }],
    sources: [{
      item: "item",
      supplier: "supplier",
      location: "warehouse",
      leadTimeSeconds: 2 * DAY,
      extraSafetyLeadTimeSeconds: 0,
      hardSafetyLeadTimeSeconds: 0,
      minimumQuantity,
      multipleQuantity,
      priority: 1
    }],
    demands: demands.map((demand) => ({
      name: "demand-" + demand.id,
      item: "item",
      location: "warehouse",
      due: epochSeconds(current + demand.dueDay * DAY),
      quantity: demand.quantity,
      minimumShipment: demand.minimumShipment,
      priority: demand.priority
    })),
    confirmedReceipts: []
  };
}

describe("MRP stability properties", () => {
  const demandArbitrary = fc.record({
    id: fc.integer({ min: 0, max: 10_000 }),
    dueDay: fc.integer({ min: 1, max: 120 }),
    quantity: fc.integer({ min: 1, max: 200 }),
    priority: fc.integer({ min: 0, max: 20 }),
    minimumShipment: fc.integer({ min: 1, max: 200 })
  });

  it("is deterministic and conserves every generated demand", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(demandArbitrary, {
          minLength: 1,
          maxLength: 80,
          selector: (demand) => demand.id
        }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 25 }),
        (demands, onhand, minimumQuantity, multipleQuantity) => {
          const input = inputFor(
            demands,
            onhand,
            minimumQuantity,
            multipleQuantity
          );
          const first = solveMaterialPlan(input);
          const second = solveMaterialPlan(input);

          expect(second).toEqual(first);
          expect(
            first.demandPlans?.reduce((sum, plan) => sum + plan.quantity, 0)
          ).toBe(
            demands.reduce(
              (sum, demand) =>
                sum + Math.max(demand.quantity, demand.minimumShipment),
              0
            )
          );
          expect(first.events.every((event) => Number.isFinite(event.onhand))).toBe(true);
          expect(first.purchases.every((purchase) => purchase.quantity > 0)).toBe(true);
          if (multipleQuantity > 0) {
            expect(
              first.purchases.every(
                (purchase) =>
                  Math.abs(
                    purchase.quantity / multipleQuantity -
                    Math.round(purchase.quantity / multipleQuantity)
                  ) < 1e-9
              )
            ).toBe(true);
          }
        }
      ),
      { numRuns: 1_000 }
    );
  });

  it("does not mutate reusable input objects", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(demandArbitrary, {
          minLength: 1,
          maxLength: 30,
          selector: (demand) => demand.id
        }),
        (demands) => {
          const input = inputFor(demands, 10, 5, 5);
          const snapshot = structuredClone(input);
          solveMaterialPlan(input);
          expect(input).toEqual(snapshot);
        }
      ),
      { numRuns: 200 }
    );
  });
});
