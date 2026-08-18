import { resolve } from "node:path";
import { readFile } from "node:fs/promises";

import { it } from "vitest";

import {
  compareMaterialFixture,
  loadMaterialFixture,
  solveMaterialFixture
} from "../src/index.js";

const freppleRoot = "E:/frepple-master";

interface SweepCase {
  readonly directory: string;
  readonly suffix: string;
  readonly mode: "constrained" | "unconstrained";
  readonly constraints?: number;
  readonly autofenceSeconds?: number;
}

const cases: readonly SweepCase[] = [
  ...["constraints_material_2", "constraints_material_3", "constraints_material_4"]
    .flatMap((directory) => [
      { directory, suffix: "1", mode: "constrained" as const, constraints: 15 },
      { directory, suffix: "2", mode: "unconstrained" as const, constraints: 15 },
      { directory, suffix: "3", mode: "unconstrained" as const, constraints: 0 }
    ]),
  ...["constraints_material_5"].flatMap((directory) => [
    {
      directory,
      suffix: "1",
      mode: "constrained" as const,
      constraints: 15,
      autofenceSeconds: 999 * 86_400
    },
    {
      directory,
      suffix: "2",
      mode: "unconstrained" as const,
      constraints: 15,
      autofenceSeconds: 999 * 86_400
    },
    {
      directory,
      suffix: "3",
      mode: "unconstrained" as const,
      constraints: 0,
      autofenceSeconds: 999 * 86_400
    }
  ]),
  ...["constraints_resource_1", "constraints_resource_5", "constraints_resource_6", "constraints_resource_7"]
    .flatMap((directory) => [
      { directory, suffix: "1", mode: "constrained" as const, constraints: 15 },
      { directory, suffix: "2", mode: "unconstrained" as const, constraints: 15 },
      { directory, suffix: "3", mode: "unconstrained" as const, constraints: 0 }
    ]),
  ...["constraints_resource_8", "constraints_resource_9"].flatMap((directory) => [
    { directory, suffix: "1", mode: "constrained" as const, constraints: 15 },
    { directory, suffix: "2", mode: "unconstrained" as const, constraints: 15 }
  ]),
  ...["constraints_combined_1", "constraints_combined_2"].flatMap((directory) => [
    { directory, suffix: "1", mode: "constrained" as const, constraints: 15 },
    { directory, suffix: "2", mode: "unconstrained" as const, constraints: 15 }
  ]),
  ...["constraints_leadtime_1", "constraints_leadtime_2"].flatMap((directory) => [
    { directory, suffix: "1", mode: "constrained" as const, constraints: 15 },
    { directory, suffix: "2", mode: "unconstrained" as const, constraints: 15 },
    { directory, suffix: "3", mode: "unconstrained" as const, constraints: 0 }
  ]),
  ...["constraints_leadtime_3"].flatMap((directory) => [
    { directory, suffix: "1", mode: "constrained" as const, constraints: 16 },
    { directory, suffix: "2", mode: "constrained" as const, constraints: 48 },
    { directory, suffix: "3", mode: "constrained" as const, constraints: 16 },
    { directory, suffix: "4", mode: "constrained" as const, constraints: 48 }
  ]),
  ...["constraints_leadtime_4"].flatMap((directory) => [
    { directory, suffix: "1", mode: "constrained" as const, constraints: 13 },
    { directory, suffix: "2", mode: "constrained" as const, constraints: 13 }
  ]),
  ...["flow_alternate_1", "flow_alternate_2"].flatMap((directory) => [
    { directory, suffix: "1", mode: "constrained" as const, constraints: 15 },
    { directory, suffix: "2", mode: "unconstrained" as const, constraints: 15 }
  ]),
  ...["flow_alternate_3"].flatMap((directory) => [
    { directory, suffix: "1", mode: "constrained" as const, constraints: 13 },
    { directory, suffix: "2", mode: "constrained" as const, constraints: 13, autofenceSeconds: 90 * 86_400 },
    { directory, suffix: "3", mode: "unconstrained" as const, constraints: 13 },
    { directory, suffix: "4", mode: "unconstrained" as const, constraints: 13, autofenceSeconds: 90 * 86_400 }
  ]),
  ...["flow_location", "operation_effective", "operation_pre_post", "operation_routing", "wip_1", "wip_2"]
    .flatMap((directory) => [
      { directory, suffix: "1", mode: "constrained" as const, constraints: 15 },
      { directory, suffix: "2", mode: "unconstrained" as const, constraints: 15 }
    ])
];

const selectedCases = cases.filter((_, index) => {
  const start = Number(process.env.FIXTURE_SWEEP_START ?? 0);
  const limit = Number(process.env.FIXTURE_SWEEP_LIMIT ?? cases.length);
  return index >= start && index < start + limit;
});

it.each(selectedCases)(
  "probes $directory.$suffix ($mode, constraints=$constraints)",
  async (testCase) => {
    const directory = resolve(freppleRoot, "test", testCase.directory);
    console.log(`[fixture-sweep] start ${testCase.directory}.${testCase.suffix}`);
    const input = await loadMaterialFixture(
      resolve(directory, `${testCase.directory}.xml`)
    );
    const plan = solveMaterialFixture({
      ...input,
      mode: testCase.mode,
      ...(testCase.constraints === undefined ? {} : { constraints: testCase.constraints }),
      ...(testCase.autofenceSeconds === undefined
        ? {}
        : { autofenceSeconds: testCase.autofenceSeconds })
    });
    const expectedPath = resolve(
      directory,
      `${testCase.directory}.${testCase.suffix}.expect`
    );
    const expected = await readFile(expectedPath, "utf8");
    if (!expected.split(/\r?\n/).some((line) =>
      /^(BUFFER|DEMAND|OPERATION|RESOURCE)\t/.test(line)
    )) {
      console.log(
        `[fixture-sweep] skipped XML snapshot ${testCase.directory}.${testCase.suffix}`
      );
      return;
    }
    const differences = await compareMaterialFixture(plan, expectedPath);
    console.log(JSON.stringify({
      fixture: `${testCase.directory}.${testCase.suffix}`,
      status: differences.length === 0 ? "passed" : "mismatch",
      differences: differences.slice(0, 3),
      ...(process.env.FIXTURE_SWEEP_VERBOSE === "1"
        ? { allDifferences: differences }
        : {}),
      differenceCount: differences.length,
      events: plan.events.length,
      operations: plan.operationPlans?.length ?? 0,
      purchases: plan.purchases.length,
      resources: plan.resourceEvents?.length ?? 0
    }));
    if (process.env.FIXTURE_SWEEP_VERBOSE === "1") {
      console.log(JSON.stringify({
        actualEvents: plan.events,
        operationPlans: plan.operationPlans,
        purchases: plan.purchases,
        resourceEvents: plan.resourceEvents
      }));
    }
  }
);
