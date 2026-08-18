import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { createSupabaseClient } from '../src/common/utils/supabase';

type JsonRecord = Record<string, unknown>;

const API_URL = (process.env.API_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, '');
const CURRENT_DATE = '2026-08-09T00:00:00.000Z';

function directProjectConnectionString(value: string) {
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
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(response: Response) {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function serviceRequest(
  accessToken: string,
  accountId: string,
  serviceMethod: string,
  postData: JsonRecord
) {
  const payload = await readJson(await fetch(`${API_URL}/api/service`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-account-id': accountId
    },
    body: JSON.stringify({ serviceName: 'planning', serviceMethod, postData })
  }));
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error(`Planning API returned an invalid payload: ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function waitForRun(client: Client, accountId: string, runId: string) {
  const deadline = Date.now() + 120_000;
  let latest: JsonRecord | undefined;
  while (Date.now() < deadline) {
    const result = await client.query<JsonRecord>(`
      select
        r.id as run_id, r.status as run_status, r.trigger_run_id, r.output,
        v.id as version_id, v.status as version_status, v.result_summary,
        (select count(*)::int from public.planning_operationplan
          where account_id = $1 and plan_version_id = v.id) as operationplan_count,
        (select count(*)::int from public.planning_operationplanmaterial
          where account_id = $1 and plan_version_id = v.id) as material_count
      from public.planning_run r
      join public.planning_plan_version v
        on v.account_id = r.account_id and v.run_id = r.id
      where r.account_id = $1 and r.id = $2
    `, [accountId, runId]);
    latest = result.rows[0];
    if (latest && ['succeeded', 'failed', 'canceled'].includes(String(latest.run_status))) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Planning API run did not finish: ${JSON.stringify(latest)}`);
}

async function main() {
  const env = getEnv();
  const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const postgres = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    ssl: { rejectUnauthorized: false }
  });
  const supabaseAdmin = createSupabaseClient('admin');
  const supabasePublic = createSupabaseClient('public');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const accountId = randomUUID();
  const password = `Planning-${suffix}-A9!`;
  const email = `planning-api-real-${suffix}@example.test`;
  let userId = '';
  let roleId = '';
  let accountCreated = false;
  let output: JsonRecord | undefined;

  await postgres.connect();
  try {
    const createdUser = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (createdUser.error || !createdUser.data.user) throw createdUser.error;
    userId = createdUser.data.user.id;

    await postgres.query(`
      insert into basejump.accounts (
        id, primary_owner_user_id, name, slug, personal_account, code, status
      ) values ($1, $2, $3, $4, false, $5, 'active')
    `, [
      accountId,
      userId,
      `Planning API real engine smoke ${suffix}`,
      `planning-api-real-engine-smoke-${suffix}`,
      `PAPI${accountId.replace(/-/g, '').slice(0, 8)}`
    ]);
    accountCreated = true;
    await postgres.query(`
      insert into basejump.account_user (account_id, user_id, account_role)
      values ($1, $2, 'owner'::basejump.account_role)
      on conflict (account_id, user_id) do nothing
    `, [accountId, userId]);

    const role = await postgres.query<{ id: string }>(`
      insert into public.admin_roles (code, name, status, sort_order, is_system)
      values ($1, 'Planning API real engine smoke', 'active', 9999, false)
      returning id
    `, [`planning_api_real_${suffix}`]);
    roleId = role.rows[0].id;
    await postgres.query(`
      insert into public.admin_role_permissions (role_id, permission_id)
      select $1, id from public.admin_permissions
      where code in ('planning.models.view', 'planning.models.manage') and status = 'active'
    `, [roleId]);
    await postgres.query(`
      insert into public.admin_user_roles (user_id, role_id, account_id)
      values ($1, $2, $3)
    `, [userId, roleId, accountId]);

    const location = await postgres.query<{ id: string }>(`
      insert into public.planning_location (account_id, name)
      values ($1, $2) returning id
    `, [accountId, `api-real-location-${suffix}`]);
    const customer = await postgres.query<{ id: string }>(`
      insert into public.planning_customer (account_id, name)
      values ($1, $2) returning id
    `, [accountId, `api-real-customer-${suffix}`]);
    const supplier = await postgres.query<{ id: string }>(`
      insert into public.planning_supplier (account_id, name)
      values ($1, $2) returning id
    `, [accountId, `api-real-supplier-${suffix}`]);
    const item = await postgres.query<{ id: string }>(`
      insert into public.planning_item (account_id, name, display_name, type, cost)
      values ($1, $2, $2, 'make to stock', 2.5) returning id
    `, [accountId, `api-real-item-${suffix}`]);
    await postgres.query(`
      insert into public.planning_itemsupplier (
        account_id, supplier_id, item_id, location_id, leadtime, sizeminimum, priority
      ) values ($1, $2, $3, $4, interval '1 day', 1, 1)
    `, [accountId, supplier.rows[0].id, item.rows[0].id, location.rows[0].id]);
    await postgres.query(`
      insert into public.planning_demand (
        account_id, name, customer_id, item_id, location_id, due,
        status, quantity, priority
      ) values ($1, $2, $3, $4, $5, '2026-08-12T00:00:00Z', 'open', 10, 10)
    `, [
      accountId,
      `api-real-demand-${suffix}`,
      customer.rows[0].id,
      item.rows[0].id,
      location.rows[0].id
    ]);
    const scenario = await postgres.query<{ id: string }>(`
      insert into public.planning_scenario (account_id, name, description, status)
      values ($1, $2, 'API Trigger frePPLe C++ smoke', 'free') returning id
    `, [accountId, `api-real-scenario-${suffix}`]);

    const signedIn = await supabasePublic.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw signedIn.error;
    const accessToken = signedIn.data.session.access_token;
    const capabilities = await serviceRequest(
      accessToken,
      accountId,
      'getPlanningCapabilities',
      {}
    );
    assert.equal((capabilities.engine as JsonRecord)?.mode, 'http');
    assert.equal((capabilities.engine as JsonRecord)?.available, true);
    assert.equal((capabilities.trigger as JsonRecord)?.configured, true);

    const launched = await serviceRequest(accessToken, accountId, 'runSupplyPlan', {
      scenarioId: scenario.rows[0].id,
      jobType: 'supply_plan',
      name: `Planning API real engine E2E ${suffix}`,
      overrides: { currentdate: CURRENT_DATE }
    });
    const run = launched.run;
    assert.ok(isRecord(run) && typeof run.id === 'string', JSON.stringify(launched));
    const finalState = await waitForRun(postgres, accountId, run.id);
    assert.equal(finalState.run_status, 'succeeded', JSON.stringify(finalState));
    assert.equal(finalState.version_status, 'completed');
    assert.ok(finalState.trigger_run_id);
    assert.ok(Number(finalState.operationplan_count) > 0);
    assert.ok(Number(finalState.material_count) > 0);

    output = {
      apiUrl: API_URL,
      runId: finalState.run_id,
      versionId: finalState.version_id,
      triggerRunId: finalState.trigger_run_id,
      operationPlans: finalState.operationplan_count,
      operationPlanMaterials: finalState.material_count,
      runStatus: finalState.run_status,
      versionStatus: finalState.version_status
    };
  } finally {
    if (accountCreated) {
      await postgres.query('delete from basejump.accounts where id = $1', [accountId])
        .catch(() => undefined);
    }
    if (roleId) {
      await postgres.query('delete from public.admin_roles where id = $1', [roleId])
        .catch(() => undefined);
    }
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
    const residue = await postgres.query<{ count: string }>(`
      select count(*)::text as count from basejump.accounts where id = $1
    `, [accountId]).catch(() => ({ rows: [{ count: 'cleanup-query-failed' }] }));
    assert.equal(residue.rows[0]?.count, '0', 'The isolated API E2E account was not removed.');
    await postgres.end();
  }

  console.log(JSON.stringify({
    ...output,
    cleanup: 'verified isolated account and auth user cleanup'
  }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
