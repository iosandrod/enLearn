import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { validatePlanningEngineResult } from './planning-engine-result';
import { HttpPlanningEngine } from './planning-engine';
import type { PlanningEngineRequest } from './planning-execution.types';

const image = process.env.PLANNING_FREPPLE_DOCKER_IMAGE?.trim() ||
  'frepple-source-runtime:9.18-dev';
const directory = mkdtempSync(join(tmpdir(), 'enlearn-frepple-docker-'));
const bridgePath = resolve(__dirname, 'frepple-engine.py');
const requestPath = join(directory, 'request.json');
const modelPath = join(directory, 'model.json');
const outputPath = join(directory, 'result.json');

const request: PlanningEngineRequest = {
  bucketDates: [
    '2026-08-09T00:00:00.000Z',
    '2026-08-10T00:00:00.000Z',
    '2026-08-11T00:00:00.000Z',
    '2026-08-12T00:00:00.000Z',
    '2026-08-13T00:00:00.000Z',
    '2026-08-14T00:00:00.000Z',
    '2026-08-15T00:00:00.000Z'
  ],
  bucketizedResources: [],
  model: {
    current: '2026-08-09T00:00:00.000Z',
    individualPoolResources: false,
    moveApprovedEarly: 0,
    suppressFlowplanCreation: false,
    calendars: [],
    locations: [{ name: 'Plant' }],
    customers: [],
    suppliers: [{ name: 'Supplier A' }],
    items: [
      { name: 'Purchased item', type: 'item_mts', cost: 2.5 },
      { name: 'Manufactured item', type: 'item_mts', cost: 5 },
      { name: 'Unsupplied item', type: 'item_mts', cost: 1 }
    ],
    setupmatrices: [],
    resources: [{
      type: 'resource_default',
      name: 'Line 1',
      maximum: 1,
      location: { name: 'Plant' }
    }],
    skills: [],
    resourceskills: [],
    operations: [{
      type: 'operation_fixed_time',
      name: 'Make manufactured item',
      item: { name: 'Manufactured item' },
      location: { name: 'Plant' },
      duration: 'PT8H',
      flows: [{
        type: 'flow_end',
        item: { name: 'Manufactured item' },
        location: { name: 'Plant' },
        quantity: 1
      }],
      loads: [{ resource: { name: 'Line 1' }, quantity: 1 }]
    }],
    itemsuppliers: [{
      supplier: { name: 'Supplier A' },
      item: { name: 'Purchased item' },
      location: { name: 'Plant' },
      leadtime: 'P1D',
      size_minimum: 1,
      priority: 1
    }],
    itemdistributions: [],
    buffers: [],
    demands: [
      {
        name: 'Demand 1',
        item: { name: 'Purchased item' },
        location: { name: 'Plant' },
        due: '2026-08-12T00:00:00.000Z',
        status: 'open',
        quantity: 10,
        priority: 10
      },
      {
        name: 'Demand 2',
        item: { name: 'Manufactured item' },
        location: { name: 'Plant' },
        operation: { name: 'Make manufactured item' },
        due: '2026-08-14T00:00:00.000Z',
        status: 'open',
        quantity: 4,
        priority: 20
      },
      {
        name: 'Demand 3',
        item: { name: 'Unsupplied item' },
        location: { name: 'Plant' },
        due: '2026-08-13T00:00:00.000Z',
        status: 'open',
        quantity: 7,
        priority: 30
      }
    ],
    operationplans: []
  },
  parameters: {
    administrativeLeadtime: 0,
    algorithm: 'heuristic',
    autoFence: 0,
    constraints: 52,
    currentDate: '2026-08-09T00:00:00.000Z',
    individualPoolResources: false,
    iterationMax: 0,
    lazyDelay: 86_400,
    logLevel: 0,
    minimumDelay: 3_600,
    moveApprovedEarly: 0,
    planType: 1,
    resourceIterationMax: 500,
    rotateResources: true
  }
};

async function main() {
try {
  writeFileSync(requestPath, JSON.stringify({
    bucketDates: request.bucketDates,
    bucketizedResources: request.bucketizedResources,
    parameters: request.parameters
  }));
  writeFileSync(modelPath, JSON.stringify(request.model));
  const result = spawnSync('docker', [
    'run', '--rm', '--entrypoint', 'sh',
    '-v', `${dockerPath(bridgePath)}:/work/frepple-engine.py:ro`,
    '-v', `${dockerPath(directory)}:/work/io`,
    '-e', `ENLEARN_FREPPLE_REQUEST=/work/io/${basename(requestPath)}`,
    '-e', `ENLEARN_FREPPLE_MODEL=/work/io/${basename(modelPath)}`,
    '-e', `ENLEARN_FREPPLE_OUTPUT=/work/io/${basename(outputPath)}`,
    image, '-lc', '/usr/bin/frepple /work/frepple-engine.py'
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const output = validatePlanningEngineResult(JSON.parse(readFileSync(outputPath, 'utf8')));
  assert.ok(output.operationPlans.some((row) => row.type === 'PO'));
  assert.ok(output.operationPlans.some((row) => row.type === 'MO'));
  assert.ok(output.operationPlanMaterials.length > 0);
  assert.ok(output.operationPlanResources.some((row) => row.resource === 'Line 1'));
  assert.ok(output.problems.some((row) => row.owner === 'Unsupplied item @ Plant'));
  assert.ok(output.constraints.some((row) => row.demand === 'Demand 3'));
  assert.ok(output.resourcePlans.some((row) => row.resource === 'Line 1'));
  assert.ok(output.engine.references.operations.some((row) =>
    row.hidden && row.name.startsWith('Purchase Purchased item @ Plant')
  ));
  const resultDates = [
    ...output.operationPlans.flatMap((row) => [row.start, row.end, row.due]),
    ...output.operationPlanMaterials.map((row) => row.date),
    ...output.problems.flatMap((row) => [row.start, row.end]),
    ...output.constraints.flatMap((row) => [row.start, row.end]),
    ...output.resourcePlans.map((row) => row.start)
  ].filter((value): value is string => Boolean(value));
  assert.ok(resultDates.length > 0);
  for (const value of resultDates) {
    assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  }
  assert.deepEqual(
    output.resourcePlans
      .filter((row) => row.resource === 'Line 1')
      .map((row) => Date.parse(row.start)),
    request.bucketDates.slice(0, -1).map((value) => Date.parse(value))
  );
  const manufacturedDelivery = output.operationPlans.find((row) => row.demand === 'Demand 2');
  assert.ok(manufacturedDelivery?.due);
  assert.equal(Date.parse(manufacturedDelivery.due), Date.parse('2026-08-14T00:00:00.000Z'));
  const sidecarEndpoint = process.env.PLANNING_FREPPLE_SIDECAR_ENDPOINT?.trim();
  if (sidecarEndpoint) {
    const sidecarOutput = await new HttpPlanningEngine({
      endpoint: sidecarEndpoint,
      token: process.env.PLANNING_ENGINE_TOKEN?.trim()
    }).solve(request);
    assert.deepEqual(normalizeEngineMetadata(sidecarOutput), normalizeEngineMetadata(output));
  }
  console.log(JSON.stringify({
    image,
    ...(sidecarEndpoint ? { sidecarEndpoint } : {}),
    operationPlans: output.operationPlans.length,
    operationPlanMaterials: output.operationPlanMaterials.length,
    operationPlanResources: output.operationPlanResources.length,
    problems: output.problems.length,
    constraints: output.constraints.length,
    resourcePlans: output.resourcePlans.length
  }));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
}

function dockerPath(path: string) {
  const normalized = resolve(path).replace(/\\/g, '/');
  return /^[A-Za-z]:\//.test(normalized)
    ? `/${normalized[0].toLowerCase()}${normalized.slice(2)}`
    : normalized;
}

function normalizeEngineMetadata<T extends { engine: Record<string, unknown> }>(value: T) {
  return {
    ...value,
    engine: {
      bridge: value.engine.bridge,
      references: value.engine.references
    }
  };
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
