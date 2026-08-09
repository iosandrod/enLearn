import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { PlanningEngineRequest } from '../src/planning-service/execution/planning-execution.types';

const execFileAsync = promisify(execFile);
const endpoint = process.env.PLANNING_ENGINE_ENDPOINT?.trim() || 'http://127.0.0.1:8088/solve';

async function main() {
  const requestId = `real-frepple-cancel-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const demandCount = 75_000;
  const request: PlanningEngineRequest = {
    bucketDates: [],
    bucketizedResources: [],
    model: {
      current: '2026-08-09T00:00:00.000Z',
      calendars: [],
      locations: [{ name: 'Cancel plant' }],
      customers: [{ name: 'Cancel customer' }],
      suppliers: [],
      items: [{ name: 'Cancel item', type: 'item_mts', cost: 1 }],
      setupmatrices: [],
      resources: [],
      skills: [],
      resourceskills: [],
      operations: [],
      itemsuppliers: [],
      itemdistributions: [],
      buffers: [],
      demands: Array.from({ length: demandCount }, (_, index) => ({
        name: `Cancel demand ${index}`,
        item: { name: 'Cancel item' },
        location: { name: 'Cancel plant' },
        customer: { name: 'Cancel customer' },
        due: '2026-08-12T00:00:00.000Z',
        status: 'open',
        quantity: 1,
        priority: 10
      })),
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

  const solvePromise = fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Planning-Request-Id': requestId
    },
    body: JSON.stringify(request)
  });
  await waitFor(async () => {
    const current = await health();
    return current.active === 1 && /\/usr\/bin\/frepple\s/.test(await dockerTop());
  }, 60_000);
  const before = await dockerTop();

  const cancelUrl = new URL(endpoint);
  cancelUrl.pathname = cancelUrl.pathname.replace(/\/solve\/?$/, '/cancel');
  const cancelResponse = await fetch(cancelUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId })
  });
  const canceled = await cancelResponse.json() as { canceled?: boolean };
  assert.equal(cancelResponse.status, 200);
  assert.equal(canceled.canceled, true);

  const solveResponse = await solvePromise;
  const solveBody = await solveResponse.text();
  assert.equal(solveResponse.status, 409, solveBody);
  assert.match(solveBody, /canceled/i);
  await waitFor(async () => (await health()).active === 0, 10_000);
  const after = await dockerTop();
  assert.doesNotMatch(after, /\/usr\/bin\/frepple\s/);

  console.log(JSON.stringify({
    endpoint,
    requestId,
    cancelAcknowledged: true,
    solveStatus: solveResponse.status,
    activeAfter: 0,
    processTreeTerminated: true
  }));
}

async function health() {
  const url = new URL(endpoint);
  url.pathname = '/health';
  const response = await fetch(url);
  assert.equal(response.status, 200);
  return response.json() as Promise<{ active: number }>;
}

async function dockerTop() {
  const result = await execFileAsync(
    'docker',
    ['top', 'enlearn-planning-frepple-sidecar-1', '-eo', 'pid,ppid,args'],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 }
  );
  return result.stdout;
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for the real frePPLe sidecar state transition.');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
