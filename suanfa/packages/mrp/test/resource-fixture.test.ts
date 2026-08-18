import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseMaterialFixture } from "../src/index.js";

const freppleRoot = "E:/frepple-master";

describe("resource fixture parsing", () => {
  it("maps resource-side loads to their operations", async () => {
    const path = resolve(
      freppleRoot,
      "test/constraints_resource_4/constraints_resource_4.xml"
    );
    const fixture = parseMaterialFixture(await readFile(path, "utf8"));
    const operation = fixture.operations?.find(
      (candidate) => candidate.name === "make end item"
    );

    expect(fixture.resources).toEqual([{ name: "Resource", maximum: 3 }]);
    expect(operation?.loads).toEqual([{ resource: "Resource", quantity: 1 }]);
  });

  it("maps operation-side loads and inline resource definitions", () => {
    const fixture = parseMaterialFixture(`
      <plan>
        <current>2009-01-01T00:00:00</current>
        <operations>
          <operation name="make item" xsi:type="operation_fixed_time">
            <loads>
              <load quantity="2">
                <resource name="Assembly line">
                  <maximum>4</maximum>
                </resource>
              </load>
            </loads>
          </operation>
        </operations>
      </plan>
    `);
    const operation = fixture.operations?.find(
      (candidate) => candidate.name === "make item"
    );

    expect(fixture.resources).toEqual([{ name: "Assembly line", maximum: 4 }]);
    expect(operation?.loads).toEqual([{ resource: "Assembly line", quantity: 2 }]);
  });
});
