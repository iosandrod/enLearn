import assert from 'node:assert/strict';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HttpPlanningEngine,
  ProcessPlanningEngine
} from './planning-engine';
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
  await processAdapterTests();
  await httpAdapterTests();
  console.log('planning process and HTTP engine tests passed');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
