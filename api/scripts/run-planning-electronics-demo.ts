import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { createSupabaseClient } from '../src/common/utils/supabase';
import {
  ELECTRONICS_DEMO_ACCOUNT_CODE,
  ELECTRONICS_DEMO_CURRENT_DATE,
  ELECTRONICS_DEMO_SOURCE,
  seedElectronicsPlanningDemo
} from './planning-electronics-demo.fixture';

type JsonRecord = Record<string, unknown>;

const API_URL = (process.env.API_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, '');

async function main() {
  const accountCode = readArgument('--account-code') ?? ELECTRONICS_DEMO_ACCOUNT_CODE;
  const pool = createDemoPool();
  pool.on('connect', (client) => client.on('error', () => undefined));
  pool.on('error', () => undefined);

  const admin = createSupabaseClient('admin');
  const auth = createSupabaseClient('public');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `electronics-planning-${suffix}@example.test`;
  const password = `Electronics-Planning-${suffix}-A9!`;
  const roleId = randomUUID();
  let userId = '';
  let accountId = '';
  let accessToken = '';
  let launchedRunId = '';

  try {
    await waitForApi();
    const fixture = await seedElectronicsPlanningDemo(pool, accountCode);
    accountId = fixture.accountId;

    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error;
    userId = created.data.user.id;
    await pool.query(`
      insert into basejump.account_user (account_id, user_id, account_role)
      values ($1, $2, 'member'::basejump.account_role)
      on conflict (account_id, user_id) do nothing
    `, [accountId, userId]);
    await pool.query(`
      insert into public.admin_roles (id, code, name, status, sort_order, is_system)
      values ($1, $2, '电子制造排产接口执行', 'active', 9998, false)
    `, [roleId, `electronics_planning_${suffix.replace(/[^a-z0-9]/gi, '_')}`]);
    await pool.query(`
      insert into public.admin_role_permissions (role_id, permission_id)
      select $1, id from public.admin_permissions
      where code in ('planning.models.view', 'planning.models.manage') and status = 'active'
    `, [roleId]);
    await pool.query(`
      insert into public.admin_user_roles (user_id, role_id, account_id)
      values ($1, $2, $3)
    `, [userId, roleId, accountId]);

    const signedIn = await auth.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw signedIn.error;
    accessToken = signedIn.data.session.access_token;

    const capabilities = await serviceRequest(accessToken, accountId, 'getPlanningCapabilities', {});
    assert.equal(readRecord(capabilities.engine).available, true, JSON.stringify(capabilities));
    assert.equal(readRecord(capabilities.engine).mode, 'http');
    assert.equal(readRecord(capabilities.trigger).configured, true, JSON.stringify(capabilities));

    const launched = await serviceRequest(accessToken, accountId, 'runSupplyPlan', {
      scenarioId: fixture.scenarioId,
      jobType: 'supply_plan',
      name: `电子制造演示接口排产 ${new Date().toISOString()}`,
      overrides: { currentdate: ELECTRONICS_DEMO_CURRENT_DATE }
    });
    const run = readRecord(launched.run);
    const version = readRecord(launched.version);
    launchedRunId = readString(run.id);
    const planVersionId = readString(version.id);
    const triggerRunId = readString(launched.triggerRunId);
    assert.match(launchedRunId, /^[0-9a-f-]{36}$/i);
    assert.match(planVersionId, /^[0-9a-f-]{36}$/i);
    assert.ok(triggerRunId, 'The planning API did not return a Trigger.dev run id.');

    const verification = await waitForRun(pool, accountId, launchedRunId, planVersionId);
    assert.equal(verification.runStatus, 'succeeded', JSON.stringify(verification));
    assert.equal(verification.versionStatus, 'completed');
    assert.ok(verification.types.MO > 0, 'The demo must generate at least one MO.');
    assert.ok(verification.types.WO > 0, 'The demo must generate at least one WO.');
    assert.ok(verification.types.PO > 0, 'The demo must generate at least one PO.');
    assert.ok(verification.types.DO > 0, 'The demo must generate at least one DO.');
    assert.ok(verification.operationPlanResources > 0, 'The demo must persist resource assignments.');
    assert.ok(verification.operationPlanMaterials > 0, 'The demo must persist material flows.');
    assert.ok(verification.scheduledPlans > 0, 'The demo must persist dated plan rows for the Gantt chart.');

    const runDetail = await serviceRequest(accessToken, accountId, 'getPlanningRunDetail', {
      runId: launchedRunId
    });
    const published = await serviceRequest(accessToken, accountId, 'publishPlanVersion', {
      id: planVersionId
    });
    const publishedState = await pool.query<{ is_current: boolean; status: string }>(`
      select status, is_current from public.planning_plan_version
      where account_id = $1 and id = $2
    `, [accountId, planVersionId]);
    assert.deepEqual(publishedState.rows[0], { is_current: true, status: 'published' });

    console.log(JSON.stringify({
      accountCode,
      accountId,
      apiUrl: API_URL,
      fixture: fixture.counts,
      planVersionId,
      published: {
        current: true,
        code: readString(published.code),
        id: readString(published.id),
        status: 'published'
      },
      runDetail: {
        counts: readRecord(runDetail.counts),
        runStatus: readString(readRecord(runDetail.run).status),
        versionStatus: readString(readRecord(runDetail.version).status)
      },
      runId: launchedRunId,
      triggerRunId,
      verification
    }, null, 2));
  } finally {
    if (launchedRunId && accessToken && accountId) {
      const state = await pool.query<{ status: string }>(
        `select status from public.planning_run where account_id = $1 and id = $2`,
        [accountId, launchedRunId]
      ).catch(() => ({ rows: [] as Array<{ status: string }> }));
      if (['queued', 'running'].includes(state.rows[0]?.status ?? '')) {
        await serviceRequest(accessToken, accountId, 'cancelPlanningRun', { runId: launchedRunId })
          .catch(() => undefined);
      }
    }
    if (userId && accountId) {
      await pool.query(
        `delete from basejump.account_user where account_id = $1 and user_id = $2`,
        [accountId, userId]
      ).catch(() => undefined);
    }
    await pool.query(`delete from public.admin_roles where id = $1`, [roleId]).catch(() => undefined);
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    await pool.end();
  }
}

function createDemoPool() {
  const env = getEnv();
  const configured = env.DATABASE_URL ?? env.DIRECT_URL;
  if (!configured?.trim()) throw new Error('DATABASE_URL or DIRECT_URL is required.');
  return new Pool({
    connectionString: normalizePostgresConnectionString(configured),
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    max: 4,
    ssl: { rejectUnauthorized: false }
  });
}

async function waitForApi() {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_URL}/api/auth/account-options?login=admin`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError ?? new Error(`Unable to reach ${API_URL}.`);
}

async function serviceRequest(
  accessToken: string,
  accountId: string,
  serviceMethod: string,
  postData: JsonRecord
) {
  const response = await fetch(`${API_URL}/api/service`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-account-id': accountId
    },
    body: JSON.stringify({ serviceName: 'planning', serviceMethod, postData })
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  const value = isRecord(payload) && 'data' in payload ? payload.data : payload;
  return readRecord(value);
}

async function waitForRun(
  pool: Pool,
  accountId: string,
  runId: string,
  planVersionId: string
) {
  const deadline = Date.now() + 180_000;
  let latest: ReturnType<typeof normalizeVerification> | undefined;
  while (Date.now() < deadline) {
    const result = await pool.query<JsonRecord>(`
      select
        (select status from public.planning_run where account_id = $1 and id = $2) as run_status,
        (select status from public.planning_plan_version where account_id = $1 and id = $3) as version_status,
        (select coalesce(jsonb_object_agg(type, count), '{}'::jsonb) from (
          select type, count(*)::int as count from public.planning_operationplan
          where account_id = $1 and plan_version_id = $3 group by type
        ) typed) as types,
        (select count(*)::int from public.planning_operationplan
          where account_id = $1 and plan_version_id = $3
            and startdate is not null and enddate is not null
            and type in ('MO', 'WO', 'PO', 'DO')) as scheduled_plans,
        (select count(*)::int from public.planning_operationplanmaterial
          where account_id = $1 and plan_version_id = $3) as operationplan_materials,
        (select count(*)::int from public.planning_operationplanresource
          where account_id = $1 and plan_version_id = $3) as operationplan_resources,
        (select count(*)::int from public.planning_problem
          where account_id = $1 and plan_version_id = $3) as problems,
        (select count(*)::int from public.planning_constraint
          where account_id = $1 and plan_version_id = $3) as constraints,
        (select count(*)::int from public.planning_resourceplan
          where account_id = $1 and plan_version_id = $3) as resource_plans
    `, [accountId, runId, planVersionId]);
    latest = normalizeVerification(result.rows[0] ?? {});
    if (['succeeded', 'failed', 'canceled'].includes(latest.runStatus)) return latest;
    await delay(500);
  }
  throw new Error(`Electronics planning API run did not finish: ${JSON.stringify(latest)}`);
}

function normalizeVerification(row: JsonRecord) {
  const rawTypes = isRecord(row.types) ? row.types : {};
  const count = (value: unknown) => Number(value ?? 0);
  return {
    constraints: count(row.constraints),
    operationPlanMaterials: count(row.operationplan_materials),
    operationPlanResources: count(row.operationplan_resources),
    problems: count(row.problems),
    resourcePlans: count(row.resource_plans),
    runStatus: readString(row.run_status),
    scheduledPlans: count(row.scheduled_plans),
    types: {
      DLVR: count(rawTypes.DLVR),
      DO: count(rawTypes.DO),
      MO: count(rawTypes.MO),
      PO: count(rawTypes.PO),
      STCK: count(rawTypes.STCK),
      WO: count(rawTypes.WO)
    },
    versionStatus: readString(row.version_status)
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function readArgument(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1]?.trim();
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
