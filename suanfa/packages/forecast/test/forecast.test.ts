import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareForecastFixture,
  loadForecastFixture,
  solveForecastPlan
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";

describe("Forecast", () => {
  it("matches frePPLe forecast_4 discrete override distribution", async () => {
    const plan = await loadForecastFixture(
      resolve(freppleRoot, "test/forecast_4/forecast_4.xml")
    );

    await expect(
      compareForecastFixture(
        plan,
        resolve(freppleRoot, "test/forecast_4/forecast_4.1.expect")
      )
    ).resolves.toEqual([]);
  });

  it("matches frePPLe forecast_5 baseline forecasts", async () => {
    const plan = await loadForecastFixture(
      resolve(freppleRoot, "test/forecast_5/forecast_5.xml")
    );
    solveForecastPlan(plan);

    await expect(
      compareForecastFixture(
        plan,
        resolve(freppleRoot, "test/forecast_5/forecast_5.1.expect")
      )
    ).resolves.toEqual([]);
  });

  it.each([2, 3])(
    "matches frePPLe forecast_%s netting",
    async (fixtureNumber) => {
      const directory = resolve(freppleRoot, `test/forecast_${fixtureNumber}`);
      const plan = await loadForecastFixture(
        resolve(directory, `forecast_${fixtureNumber}.xml`)
      );
      solveForecastPlan(plan);

      await expect(
        compareForecastFixture(
          plan,
          resolve(directory, `forecast_${fixtureNumber}.1.expect`)
        )
      ).resolves.toEqual([]);
    }
  );
});
