import { writeFile } from 'node:fs/promises';

import { buildFreppleInput } from '../src/planning-service/execution/frepple-input.builder';
import { toCppTypescriptModel } from '../src/planning-service/execution/cpp-typescript-planning-engine';
import { PlanningDataLoader, createPlanningPool } from '../src/planning-service/execution/planning-data-loader';
import { resolvePlanningParameters } from '../src/planning-service/execution/planning-parameters';
import { normalizePlanningSnapshotForEngine } from '../src/planning-service/execution/planning-snapshot-normalizer';

const currentDate = process.argv[2] ?? '2026-08-21T23:06:14.833Z';
const outputPath = process.argv[3] ?? '../artifacts/frontend-current-exact.model.json';

const pool = createPlanningPool();
try {
  const loaded = await new PlanningDataLoader(pool).load(
    '00000000-0000-4000-8000-000000000001'
  );
  const snapshot = normalizePlanningSnapshotForEngine(loaded).snapshot;
  const parameters = resolvePlanningParameters(snapshot, {
    currentdate: currentDate,
    constraints: 52,
    'plan.solver': 'heuristic',
    'plan.iterationmax': 0,
    'plan.resourceiterationmax': 500,
    'plan.rotateResources': true,
    'plan.individualPoolResources': false
  });
  const input = buildFreppleInput(snapshot, parameters);
  const model = toCppTypescriptModel(input.request.model, parameters);
  await writeFile(
    outputPath,
    JSON.stringify(model, null, 2),
    'utf8'
  );
  console.log(JSON.stringify({
    snapshotHash: snapshot.hash,
    current: model.current,
    counts: {
      items: model.items.length,
      operations: model.operations.length,
      demands: model.demands.length,
      buffers: model.buffers.length,
      resources: model.resources.length,
      loads: model.loads.length,
      flows: model.flows.length
    },
    parameters
  }, null, 2));
} finally {
  await pool.end();
}
