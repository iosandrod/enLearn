import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createPlanningPool } from '../src/planning-service/execution/planning-data-loader';

const [runId, expectedPath] = process.argv.slice(2);
if (!runId || !expectedPath) {
  throw new Error('Usage: tsx scripts/verify-planning-run-result.mts <run-id> <expected-result.json>');
}

const expected = JSON.parse(await readFile(expectedPath, 'utf8')) as Record<string, unknown[]>;
const pool = createPlanningPool();
const client = await pool.connect();

try {
  const version = await client.query<{ account_id: string; id: string }>(`
    select v.account_id::text, v.id::text
    from public.planning_plan_version v
    where v.run_id = $1
  `, [runId]);
  assert.equal(version.rowCount, 1, `Expected one plan version for run ${runId}.`);
  const accountId = version.rows[0].account_id;
  const versionId = version.rows[0].id;
  const scope = [accountId, versionId];

  const operationPlans = await client.query(`
        select jsonb_build_object(
          'reference', p.reference, 'type', p.type, 'quantity', p.quantity::double precision,
          'quantityCompleted', p.quantity_completed::double precision, 'status', p.status,
          'start', to_char(p.startdate at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end', to_char(p.enddate at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'criticality', p.criticality::double precision,
          'delay', extract(epoch from p.delay)::double precision,
          'operation', operation.name, 'owner', owner.reference, 'item', item.name,
          'origin', origin.name, 'destination', destination.name, 'supplier', supplier.name,
          'location', location.name, 'demand', demand.name,
          'due', case when p.due is null then null else
            to_char(p.due at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
          'name', p.name, 'batch', nullif(p.batch, ''), 'remark', nullif(p.remark, ''),
          'color', p.color::double precision, 'plan', p.plan
        ) as row
        from public.planning_operationplan p
        left join public.planning_operation operation on operation.id = p.operation_id
          and operation.account_id = p.account_id
        left join public.planning_operationplan owner on owner.id = p.owner_id
          and owner.account_id = p.account_id
        left join public.planning_item item on item.id = p.item_id and item.account_id = p.account_id
        left join public.planning_location origin on origin.id = p.origin_id and origin.account_id = p.account_id
        left join public.planning_location destination on destination.id = p.destination_id
          and destination.account_id = p.account_id
        left join public.planning_supplier supplier on supplier.id = p.supplier_id
          and supplier.account_id = p.account_id
        left join public.planning_location location on location.id = p.location_id
          and location.account_id = p.account_id
        left join public.planning_demand demand on demand.id = p.demand_id
          and demand.account_id = p.account_id
        where p.account_id = $1 and p.plan_version_id = $2
      `, scope);
  const materials = await client.query(`
        select jsonb_build_object(
          'operationPlanReference', plan.reference, 'item', item.name, 'location', location.name,
          'quantity', material.quantity::double precision,
          'date', to_char(material.flowdate at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'onhand', material.onhand::double precision, 'minimum', material.minimum::double precision,
          'periodOfCover', material.periodofcover::double precision,
          'status', material.status
        ) as row
        from public.planning_operationplanmaterial material
        join public.planning_operationplan plan on plan.id = material.operationplan_id
          and plan.account_id = material.account_id
        join public.planning_item item on item.id = material.item_id and item.account_id = material.account_id
        join public.planning_location location on location.id = material.location_id
          and location.account_id = material.account_id
        where material.account_id = $1 and material.plan_version_id = $2
      `, scope);
  const resources = await client.query(`
        select jsonb_build_object(
          'operationPlanReference', plan.reference, 'resource', resource.name,
          'quantity', assignment.quantity::double precision, 'setup', nullif(assignment.setup, ''),
          'status', assignment.status
        ) as row
        from public.planning_operationplanresource assignment
        join public.planning_operationplan plan on plan.id = assignment.operationplan_id
          and plan.account_id = assignment.account_id
        join public.planning_resource resource on resource.id = assignment.resource_id
          and resource.account_id = assignment.account_id
        where assignment.account_id = $1 and assignment.plan_version_id = $2
      `, scope);
  const problems = await client.query(`
        select jsonb_build_object(
          'entity', entity, 'owner', owner, 'name', name, 'description', description,
          'start', to_char(startdate at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end', to_char(enddate at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ) as row
        from public.planning_problem
        where account_id = $1 and plan_version_id = $2
      `, scope);
  const constraints = await client.query(`
        select jsonb_build_object(
          'demand', demand.name, 'forecast', null, 'item', item.name,
          'entity', constraint_row.entity, 'owner', constraint_row.owner,
          'name', constraint_row.name, 'description', constraint_row.description,
          'start', to_char(constraint_row.startdate at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end', to_char(constraint_row.enddate at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ) as row
        from public.planning_constraint constraint_row
        left join public.planning_demand demand on demand.id = constraint_row.demand_id
          and demand.account_id = constraint_row.account_id
        left join public.planning_item item on item.id = constraint_row.item_id
          and item.account_id = constraint_row.account_id
        where constraint_row.account_id = $1 and constraint_row.plan_version_id = $2
      `, scope);
  const resourcePlans = await client.query(`
        select jsonb_build_object(
          'resource', resource.name,
          'start', to_char(plan.startdate at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'available', plan.available::double precision,
          'unavailable', plan.unavailable::double precision,
          'setup', plan.setup::double precision, 'load', plan.load::double precision,
          'free', plan.free::double precision,
          'loadConfirmed', plan.load_confirmed::double precision
        ) as row
        from public.planning_resourceplan plan
        join public.planning_resource resource on resource.id = plan.resource_id
          and resource.account_id = plan.account_id
        where plan.account_id = $1 and plan.plan_version_id = $2
      `, scope);

  const actual = {
    operationPlans: operationPlans.rows.map(({ row }) => row),
    operationPlanMaterials: materials.rows.map(({ row }) => row),
    operationPlanResources: resources.rows.map(({ row }) => row),
    problems: problems.rows.map(({ row }) => row),
    constraints: constraints.rows.map(({ row }) => row),
    resourcePlans: resourcePlans.rows.map(({ row }) => row)
  };

  for (const [key, rows] of Object.entries(actual)) {
    assert.deepEqual(canonical(rows), canonical(expected[key] ?? []), `${key} differs from worker output`);
  }
  console.log(JSON.stringify({
    identical: true,
    runId,
    versionId,
    counts: Object.fromEntries(Object.entries(actual).map(([key, rows]) => [key, rows.length]))
  }, null, 2));
} finally {
  client.release();
  await pool.end();
}

function canonical(rows: unknown[]) {
  return rows.map((row) => stableStringify(normalizeDatabasePrecision(row))).sort();
}

function normalizeDatabasePrecision(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeDatabasePrecision);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, normalizeDatabasePrecision(entry)]));
  }
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(8))
    : value;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
