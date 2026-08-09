import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client, Pool } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { HttpPlanningEngine } from '../src/planning-service/execution/planning-engine';
import { PlanningOrchestrator } from '../src/planning-service/execution/planning-orchestrator';
import { PlanningPreflightError } from '../src/planning-service/execution/planning-execution.types';
import {
  assertTransactionActive,
  unwrapMigrationTransaction
} from './planning-migration-transaction';

const MIGRATION_FILES = [
  'supabase/migrations/20260807140000_planning_service.sql',
  'supabase/migrations/20260808150000_planning_diagnostic_tables.sql',
  'supabase/migrations/20260808160000_planning_extended_models.sql',
  'supabase/migrations/20260808170000_planning_execution_runtime.sql',
  'supabase/migrations/20260810110000_unify_sales_order_status.sql'
];

function directProjectConnectionString(value: string) {
  try {
    const url = new URL(normalizePostgresConnectionString(value));
    const match = url.username.match(/^postgres\.([a-z0-9]+)$/i);
    if (match && url.hostname.includes('.pooler.supabase.com')) {
      url.hostname = `db.${match[1]}.supabase.co`;
      url.port = '5432';
      url.username = 'postgres';
    }
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    return url.toString();
  } catch {
    return normalizePostgresConnectionString(value);
  }
}

async function main() {
  const env = getEnv();
  const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const endpoint = process.env.PLANNING_ENGINE_ENDPOINT?.trim() || 'http://127.0.0.1:8088/solve';
  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = (await Promise.all(
    MIGRATION_FILES.map(async (file) => unwrapMigrationTransaction(
      await readFile(resolve(repoRoot, file), 'utf8')
    ))
  )).join('\n\n');
  const connectionString = directProjectConnectionString(rawConnectionString);
  const admin = new Client({
    connectionString,
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    max: 4,
    ssl: { rejectUnauthorized: false }
  });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const accountId = randomUUID();
  let accountCreated = false;
  let outputSummary: Record<string, unknown> | undefined;

  await admin.connect();
  try {
    // Schema changes are verified in a rollback-only transaction. Runtime services use
    // independent connections and therefore exercise their real transaction boundaries.
    await admin.query('begin');
    await admin.query(migration);
    await assertTransactionActive(admin);
    await admin.query('rollback');

    const owner = await admin.query<{ id: string }>(
      'select id from auth.users order by created_at, id limit 1'
    );
    const ownerId = owner.rows[0]?.id;
    assert.ok(ownerId, 'An auth user is required to create an isolated planning smoke account.');
    await admin.query(`
      insert into basejump.accounts (
        id, primary_owner_user_id, name, slug, personal_account, code, status
      ) values ($1, $2, $3, $4, false, $5, 'active')
    `, [
      accountId,
      ownerId,
      `Planning real engine smoke ${suffix}`,
      `planning-real-engine-smoke-${suffix}`,
      `PRES${accountId.replace(/-/g, '').slice(0, 8)}`
    ]);
    accountCreated = true;

    const location = await pool.query<{ id: string }>(`
      insert into public.planning_location (account_id, name)
      values ($1, $2) returning id
    `, [accountId, `real-engine-location-${suffix}`]);
    const customer = await pool.query<{ id: string }>(`
      insert into public.planning_customer (account_id, name)
      values ($1, $2) returning id
    `, [accountId, `real-engine-customer-${suffix}`]);
    const supplier = await pool.query<{ id: string }>(`
      insert into public.planning_supplier (account_id, name)
      values ($1, $2) returning id
    `, [accountId, `real-engine-supplier-${suffix}`]);
    const item = await pool.query<{ id: string }>(`
      insert into public.planning_item (account_id, name, type, cost)
      values ($1, $2, 'make to stock', 2.5) returning id
    `, [accountId, `real-engine-item-${suffix}`]);
    await pool.query(`
      insert into public.planning_itemsupplier (
        account_id, supplier_id, item_id, location_id, leadtime,
        sizeminimum, priority
      ) values ($1, $2, $3, $4, interval '1 day', 1, 1)
    `, [accountId, supplier.rows[0].id, item.rows[0].id, location.rows[0].id]);
    await pool.query(`
      insert into public.planning_demand (
        account_id, name, customer_id, item_id, location_id, due,
        status, quantity, priority
      ) values ($1, $2, $3, $4, $5, '2026-08-12T00:00:00Z', 'open', 10, 10)
    `, [
      accountId,
      `real-engine-demand-${suffix}`,
      customer.rows[0].id,
      item.rows[0].id,
      location.rows[0].id
    ]);

    const scenario = await pool.query<{ id: string }>(`
      insert into public.planning_scenario (account_id, name, description, status)
      values ($1, $2, 'real frePPLe cleanup smoke', 'free') returning id
    `, [accountId, `real-engine-scenario-${suffix}`]);
    const created = await pool.query<{
      result: { run: { id: string }; version: { id: string } };
    }>(`
      select public.planning_create_supply_run(
        $1, $2, $3, $4::jsonb, null, 'supply_plan'
      ) as result
    `, [
      accountId,
      scenario.rows[0].id,
      `Real engine smoke ${suffix}`,
      JSON.stringify({
        jobType: 'supply_plan',
        overrides: { currentdate: '2026-08-09T00:00:00.000Z' }
      })
    ]);
    const runId = created.rows[0].result.run.id;
    const planVersionId = created.rows[0].result.version.id;

    let output;
    try {
      output = await new PlanningOrchestrator(
        pool,
        undefined,
        new HttpPlanningEngine({
          endpoint,
          token: process.env.PLANNING_ENGINE_TOKEN?.trim()
        })
      ).run({
        accountId,
        jobType: 'supply_plan',
        overrides: { currentdate: '2026-08-09T00:00:00.000Z' },
        planVersionId,
        runId,
        scenarioId: scenario.rows[0].id,
        triggerRunId: `real-engine-smoke-${suffix}`
      });
    } catch (error) {
      if (error instanceof PlanningPreflightError) {
        throw new Error(`Smoke fixture failed planning preflight: ${JSON.stringify(error.report.errors)}`);
      }
      throw error;
    }

    const persisted = await pool.query<{
      constraint_count: string;
      operationplan_count: string;
      operationplanmaterial_count: string;
      operationplanresource_count: string;
      problem_count: string;
      resourceplan_count: string;
      run_status: string;
      version_status: string;
    }>(`
      select
        (select count(*)::text from public.planning_operationplan where account_id = $1 and plan_version_id = $3) operationplan_count,
        (select count(*)::text from public.planning_operationplanmaterial where account_id = $1 and plan_version_id = $3) operationplanmaterial_count,
        (select count(*)::text from public.planning_operationplanresource where account_id = $1 and plan_version_id = $3) operationplanresource_count,
        (select count(*)::text from public.planning_problem where account_id = $1 and plan_version_id = $3) problem_count,
        (select count(*)::text from public.planning_constraint where account_id = $1 and plan_version_id = $3) constraint_count,
        (select count(*)::text from public.planning_resourceplan where account_id = $1 and plan_version_id = $3) resourceplan_count,
        (select status from public.planning_run where account_id = $1 and id = $2) run_status,
        (select status from public.planning_plan_version where account_id = $1 and id = $3) version_status
    `, [accountId, runId, planVersionId]);
    const row = persisted.rows[0];
    assert.equal(row.run_status, 'succeeded');
    assert.equal(row.version_status, 'completed');
    assert.equal(Number(row.operationplan_count), output.operationPlanCount);
    assert.equal(Number(row.operationplanmaterial_count), output.operationPlanMaterialCount);
    assert.equal(Number(row.operationplanresource_count), output.operationPlanResourceCount);
    assert.equal(Number(row.problem_count), output.problemCount);
    assert.equal(Number(row.constraint_count), output.constraintCount);
    assert.equal(Number(row.resourceplan_count), output.resourcePlanCount);
    assert.ok(output.operationPlanCount > 0, 'The real solver must persist at least one operation plan.');
    assert.ok(
      output.operationPlanMaterialCount > 0,
      'The real solver must persist at least one material flow plan.'
    );

    outputSummary = {
      endpoint,
      snapshotHash: output.inputSnapshot.hash,
      operationPlans: output.operationPlanCount,
      operationPlanMaterials: output.operationPlanMaterialCount,
      operationPlanResources: output.operationPlanResourceCount,
      problems: output.problemCount,
      constraints: output.constraintCount,
      resourcePlans: output.resourcePlanCount
    };
  } finally {
    await pool.end().catch(() => undefined);
    if (accountCreated) {
      await admin.query('delete from basejump.accounts where id = $1', [accountId]);
      const residue = await admin.query<{ count: string }>(`
        select count(*)::text as count from basejump.accounts where id = $1
      `, [accountId]);
      assert.equal(residue.rows[0]?.count, '0', 'The isolated planning smoke account was not removed.');
    }
    await admin.end();
  }
  console.log(JSON.stringify({
    ...outputSummary,
    cleanup: 'verified isolated account cascade'
  }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
