import assert from 'node:assert/strict';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPlanningEngine,
  HttpPlanningEngine,
  ProcessPlanningEngine
} from './planning-engine';
import {
  CppTypescriptPlanningEngine,
  toCppTypescriptModel
} from './cpp-typescript-planning-engine';
import {
  PlanningCanceledError,
  type PlanningEngineRequest
} from './planning-execution.types';

const RESULT = {
  operationPlans: [],
  operationPlanMaterials: [],
  operationPlanResources: [],
  problems: [],
  constraints: [],
  resourcePlans: [],
  engine: {
    bridge: 'test',
    references: { buffers: [], demands: [], operations: [] }
  }
};

const REQUEST = {
  bucketDates: [],
  bucketizedResources: [],
  model: {
    current: '2026-08-09T00:00:00.000Z',
    buffers: [], calendars: [], customers: [], demands: [], itemdistributions: [],
    items: [], itemsuppliers: [], locations: [], operationplans: [], operations: [],
    resources: [], resourceskills: [], setupmatrices: [], skills: [], suppliers: []
  },
  parameters: {
    administrativeLeadtime: 0,
    algorithm: 'heuristic',
    autoFence: 0,
    constraints: 0,
    currentDate: '2026-08-09T00:00:00.000Z',
    individualPoolResources: false,
    iterationMax: 0,
    lazyDelay: 0,
    logLevel: 0,
    minimumDelay: 0,
    moveApprovedEarly: 0,
    planType: 1,
    resourceIterationMax: 0,
    rotateResources: false
  }
} satisfies PlanningEngineRequest;

function cppTypescriptModelMappingTests() {
  const mapped = toCppTypescriptModel({
    ...REQUEST.model,
    calendars: [{ name: 'capacity' }],
    items: [{ name: 'Item A' }],
    locations: [{ name: 'Plant' }, { name: 'Origin' }],
    suppliers: [{ name: 'Supplier' }],
    resources: [{ name: 'Line', type: 'resource_buckets', maximum_calendar: { name: 'capacity' } }],
    skills: [{ name: 'Skill' }],
    resourceskills: [{
      resource: { name: 'Line' },
      skill: { name: 'Skill' },
      priority: 2,
      effective_start: '2026-08-01T00:00:00Z'
    }],
    setupmatrices: [],
    itemsuppliers: [{
      supplier: { name: 'Supplier' },
      item: { name: 'Item A' },
      location: { name: 'Plant' },
      resource: { name: 'Line' },
      resource_qty: 3,
      leadtime: 86_400,
      hard_safety_leadtime: 3_600,
      extra_safety_leadtime: 1_800,
      batchwindow: 7_200,
      fence: 900
    }],
    itemdistributions: [{
      item: { name: 'Item A' },
      origin: { name: 'Origin' },
      destination: { name: 'Plant' },
      resource: { name: 'Line' },
      resource_qty: 4,
      leadtime: 14_400,
      batchwindow: 1_200,
      fence: 300
    }],
    buffers: [{
      name: 'Item A @ Plant',
      item: { name: 'Item A' },
      location: { name: 'Plant' },
      minimum_calendar: { name: 'capacity' },
      maximum_calendar: { name: 'capacity' }
    }],
    operations: [{
      name: 'Make Item A',
      type: 'operation_time_per',
      item: { name: 'Item A' },
      location: { name: 'Plant' },
      priority: 5,
      effective_start: '2026-08-01T00:00:00Z',
      fence: 600,
      size_minimum_calendar: { name: 'capacity' },
      flows: [{
        type: 'flow_end',
        item: { name: 'Item A' },
        location: { name: 'Plant' },
        quantity: 1,
        quantity_fixed: 2,
        offset: 60,
        search: 'MINCOST'
      }],
      loads: [{
        type: 'load_bucketized_from_start',
        resource: { name: 'Line' },
        skill: { name: 'Skill' },
        quantity: 1,
        quantity_fixed: 0.5,
        offset: 120,
        search: 'PRIORITY'
      }]
    }],
    operationplans: [{
      reference: 'PO-1',
      ordertype: 'PO',
      item: { name: 'Item A' },
      location: { name: 'Plant' },
      supplier: { name: 'Supplier' },
      quantity: 10,
      statusNoPropagation: 'confirmed',
      resources: ['Line'],
      remark: 'locked purchase'
    }]
  }, REQUEST.parameters) as Record<string, any>;

  assert.equal(mapped.operations[0].priority, 5);
  assert.equal(mapped.operations[0].fence, 600);
  assert.equal(mapped.operations[0].sizeMinimumCalendar, 'capacity');
  assert.equal(mapped.flows[0].offset, 60);
  assert.equal(mapped.loads[0].type, 'bucketized_from_start');
  assert.equal(mapped.loads[0].quantityFixed, 0.5);
  assert.equal(mapped.resources[0].maximumCalendar, 'capacity');
  assert.equal(mapped.resourceSkills[0].effectiveStart, '2026-08-01T00:00:00Z');
  assert.equal(mapped.itemSuppliers[0].resource, 'Line');
  assert.equal(mapped.itemSuppliers[0].resourceQuantity, 3);
  assert.equal(mapped.itemDistributions[0].resourceQuantity, 4);
  assert.equal(mapped.buffers[0].minimumCalendar, 'capacity');
  assert.equal(mapped.operationPlans[0].orderType, 'PO');
  assert.deepEqual(mapped.operationPlans[0].assignedResources, ['Line']);
}

async function processAdapterTests() {
  const directory = await mkdtemp(join(tmpdir(), 'planning-engine-spec-'));
  const bridgePath = join(directory, 'bridge.cjs');
  const source = `
const fs = require('node:fs');
const mode = process.env.ENLEARN_ENGINE_TEST_MODE;
if (mode === 'hang') {
  setInterval(() => undefined, 1000);
} else {
  if (mode === 'logs') process.stderr.write('0123456789\\n'.repeat(100));
  const result = ${JSON.stringify(RESULT)};
  fs.writeFileSync(process.env.ENLEARN_FREPPLE_OUTPUT, JSON.stringify(result));
}
`;
  await writeFile(bridgePath, source, 'utf8');
  const previousMode = process.env.ENLEARN_ENGINE_TEST_MODE;
  try {
    process.env.ENLEARN_ENGINE_TEST_MODE = 'logs';
    const logs: string[] = [];
    const logEngine = new ProcessPlanningEngine({
      bridgePath,
      executable: process.execPath,
      maxLogBytes: 64,
      maxLogLines: 100,
      timeoutMs: 5_000
    });
    await logEngine.solve(REQUEST, { onLog: (line) => logs.push(line) });
    assert.ok(logs.some((line) => line.includes('log truncated')));

    process.env.ENLEARN_ENGINE_TEST_MODE = 'hang';
    const timeoutEngine = new ProcessPlanningEngine({
      bridgePath,
      executable: process.execPath,
      timeoutMs: 50
    });
    await assert.rejects(timeoutEngine.solve(REQUEST), /timed out/);

    const controller = new AbortController();
    const cancelEngine = new ProcessPlanningEngine({
      bridgePath,
      executable: process.execPath,
      timeoutMs: 5_000
    });
    await assert.rejects(
      cancelEngine.solve(REQUEST, {
        onProcess: () => controller.abort(),
        signal: controller.signal
      }),
      PlanningCanceledError
    );
  } finally {
    if (previousMode === undefined) delete process.env.ENLEARN_ENGINE_TEST_MODE;
    else process.env.ENLEARN_ENGINE_TEST_MODE = previousMode;
    await rm(directory, { recursive: true, force: true });
  }
}

async function httpAdapterTests() {
  await withServer((_, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    for (let index = 0; index < 20; index += 1) response.write('x'.repeat(128));
    response.end();
  }, async (endpoint) => {
    const engine = new HttpPlanningEngine({ endpoint, maxResponseBytes: 512, timeoutMs: 5_000 });
    await assert.rejects(engine.solve(REQUEST), /exceeds 512 bytes/);
  });

  await withServer((_request, response) => {
    setTimeout(() => {
      if (!response.destroyed) response.end(JSON.stringify(RESULT));
    }, 250);
  }, async (endpoint) => {
    const engine = new HttpPlanningEngine({ endpoint, timeoutMs: 30 });
    await assert.rejects(engine.solve(REQUEST), /timed out/);
  });

  let solveRequestId = '';
  let canceledRequestId = '';
  await withServer((request, response) => {
    if (request.url === '/solve') {
      solveRequestId = String(request.headers['x-planning-request-id'] ?? '');
      request.resume();
      return;
    }
    if (request.url === '/cancel') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        canceledRequestId = String(JSON.parse(body).requestId ?? '');
        response.end('{"canceled":true}');
      });
      return;
    }
    response.writeHead(404).end();
  }, async (endpoint) => {
    const controller = new AbortController();
    const engine = new HttpPlanningEngine({ endpoint: `${endpoint}/solve`, timeoutMs: 5_000 });
    const solving = engine.solve(REQUEST, { signal: controller.signal });
    await waitFor(() => Boolean(solveRequestId));
    controller.abort();
    await assert.rejects(solving, PlanningCanceledError);
    await waitFor(() => Boolean(canceledRequestId));
    assert.equal(canceledRequestId, solveRequestId);
  });
}

async function cppTypescriptAdapterTests() {
  const directory = await mkdtemp(join(tmpdir(), 'planning-cpp-typescript-spec-'));
  const workerPath = join(directory, 'worker.cjs');
  const source = `
const fs = require('node:fs');
fs.readFileSync(process.argv[2], 'utf8');
const result = ${JSON.stringify(RESULT)};
fs.writeFileSync(process.argv[3], JSON.stringify(result));
`;
  try {
    await mkdir(join(directory, 'dist'));
    await writeFile(workerPath, source, 'utf8');

    const engine = new CppTypescriptPlanningEngine({
      timeoutMs: 5_000,
      workerPath,
      workingDirectory: directory
    });
    const result = await engine.solve(REQUEST);
    assert.equal(result.engine.mode, 'cpp-typescript');
    assert.deepEqual(result.operationPlans, []);

    const created = createPlanningEngine({
      PLANNING_CPP_TYPESCRIPT_ROOT: directory,
      PLANNING_CPP_TYPESCRIPT_WORKER: workerPath,
      PLANNING_ENGINE_MODE: 'cpp-typescript'
    });
    assert.equal(created.mode, 'cpp-typescript');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function withServer(
  listener: (request: IncomingMessage, response: ServerResponse) => void,
  test: (endpoint: string) => Promise<void>
) {
  const server: Server = createServer(listener);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server has no TCP address.');
    await test(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for HTTP cancellation.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function main() {
  cppTypescriptModelMappingTests();
  await processAdapterTests();
  await httpAdapterTests();
  await cppTypescriptAdapterTests();
  console.log('planning process, HTTP, and cpp-typescript engine tests passed');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
