import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareMaterialFixture,
  loadMaterialFixture,
  parseMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";

describe("confirmed purchase orders", () => {
  for (const suffix of ["2", "3"] as const) {
    it("matches constraints_material_5." + suffix + ".expect", async () => {
      const directory = resolve(freppleRoot, "test/constraints_material_5");
      const input = await loadMaterialFixture(
        resolve(directory, "constraints_material_5.xml")
      );
      const plan = solveMaterialFixture({
        ...input,
        mode: "unconstrained",
        constraints: suffix === "2" ? 15 : 0,
        autofenceSeconds: 999 * 86_400
      });

      await expect(
        compareMaterialFixture(
          plan,
          resolve(directory, "constraints_material_5." + suffix + ".expect")
        )
      ).resolves.toEqual([]);
    });
  }

  it("derives confirmed PO starts from the matching supplier lead time", async () => {
    const path = resolve(
      freppleRoot,
      "test/constraints_material_5/constraints_material_5.xml"
    );
    const fixture = parseMaterialFixture(await readFile(path, "utf8"));

    expect(fixture.confirmedPurchases?.map((purchase) => ({
      start: purchase.start,
      end: purchase.end,
      confirmed: purchase.confirmed
    }))).toEqual([
      { start: 1_648_166_400, end: 1_648_771_200, confirmed: true },
      { start: 1_648_944_000, end: 1_649_548_800, confirmed: true }
    ]);
  });

  it("keeps confirmed POs zero-duration when the explicit supplier does not match", async () => {
    const path = resolve(freppleRoot, "test/supplier/supplier.xml");
    const fixture = parseMaterialFixture(await readFile(path, "utf8"));

    expect(fixture.confirmedPurchases?.map((purchase) => ({
      start: purchase.start,
      end: purchase.end,
      supplier: purchase.supplier
    }))).toEqual([
      {
        start: 1_433_548_800,
        end: 1_433_548_800,
        supplier: "Supplier of component B"
      },
      {
        start: 1_591_401_600,
        end: 1_591_401_600,
        supplier: "Supplier of component B"
      }
    ]);
  });

  it("preserves zero-duration fallback when no supplier rule can be matched", () => {
    const fixture = parseMaterialFixture(
      "<plan>" +
      "<current>2025-01-01T00:00:00</current>" +
      "<operationplans>" +
      "<operationplan ordertype=\"PO\" end=\"2025-02-01T00:00:00\" quantity=\"4\" status=\"confirmed\">" +
      "<item name=\"item\"/><location name=\"warehouse\"/><supplier name=\"supplier\"/>" +
      "</operationplan></operationplans></plan>"
    );

    expect(fixture.confirmedPurchases?.[0]?.start).toBe(
      fixture.confirmedPurchases?.[0]?.end
    );
  });
});
