import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';

import { createSupabaseClient } from '../src/common/utils/supabase';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

export const MES_E2E_ACCOUNT_ID = '7aa4fb2f-0aa9-4e21-8a4a-8dc483424955';
export const MES_E2E_ACCOUNT_SLUG = 'mes-e2e-validation';
export const MES_E2E_USER_EMAIL = 'mes-e2e-validation@example.test';

export type MesE2eFixture = {
  accountId: string;
  componentId: string;
  email: string;
  operationPlanId: string;
  password: string;
  runId: string;
  userId: string;
};

export type MesE2eReleasedWorkOrder = {
  workOrderId: string;
  workOrderNo: string;
};

export function directProjectConnectionString(value: string) {
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

export async function createMesE2eDatabase() {
  const env = getEnv();
  const configured = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!configured) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const client = new Client({
    connectionString: directProjectConnectionString(configured),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);
  await client.connect();
  return client;
}

async function ensureUser(database: Client, admin: SupabaseClient, password: string) {
  const existing = await database.query<{ id: string }>(
    'select id from auth.users where lower(email) = lower($1) limit 1',
    [MES_E2E_USER_EMAIL]
  );
  if (existing.rows[0]) {
    const updated = await admin.auth.admin.updateUserById(existing.rows[0].id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: 'MES E2E validation' }
    });
    if (updated.error) throw updated.error;
    return existing.rows[0].id;
  }

  const created = await admin.auth.admin.createUser({
    email: MES_E2E_USER_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'MES E2E validation' }
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error('Could not create the MES E2E user.');
  }
  return created.data.user.id;
}

async function ensureAccount(database: Client, userId: string) {
  const existing = await database.query<{ id: string }>(`
    select id
    from basejump.accounts
    where id = $1 or slug = $2
    order by (id = $1) desc
    limit 1
  `, [MES_E2E_ACCOUNT_ID, MES_E2E_ACCOUNT_SLUG]);
  const accountId = existing.rows[0]?.id ?? MES_E2E_ACCOUNT_ID;

  if (existing.rows[0]) {
    await database.query(`
      update basejump.accounts
      set primary_owner_user_id = $2,
          name = 'MES E2E Validation',
          status = 'active',
          updated_at = timezone('utc'::text, now())
      where id = $1
    `, [accountId, userId]);
  } else {
    await database.query(`
      insert into basejump.accounts (
        id, primary_owner_user_id, name, slug, personal_account, code, status
      ) values ($1, $2, 'MES E2E Validation', $3, false, 'MESE2E', 'active')
    `, [accountId, userId, MES_E2E_ACCOUNT_SLUG]);
  }

  await database.query(`
    insert into basejump.account_user (account_id, user_id, account_role)
    values ($1, $2, 'owner'::basejump.account_role)
    on conflict (user_id, account_id) do update
      set account_role = excluded.account_role
  `, [accountId, userId]);
  await database.query(`
    insert into public.admin_user_roles (account_id, user_id, role_id)
    select $1, $2, role.id
    from public.admin_roles role
    where role.code = 'system_admin' and role.status = 'active'
    on conflict do nothing
  `, [accountId, userId]);
  return accountId;
}

async function insertPlanningFixture(
  database: Client,
  accountId: string,
  userId: string,
  runId: string
) {
  const locationId = randomUUID();
  const outputItemId = randomUUID();
  const componentItemId = randomUUID();
  const routeId = randomUUID();
  const firstStepId = randomUUID();
  const secondStepId = randomUUID();
  const operationMaterialId = randomUUID();
  const scenarioId = randomUUID();
  const versionId = randomUUID();
  const operationPlanId = randomUUID();

  await database.query(
    `select set_config('request.jwt.claim.sub', $1, false),
            set_config('request.jwt.claim.role', 'authenticated', false)`,
    [userId]
  );
  await database.query(`
    insert into public.planning_location (id, account_id, name)
    values ($1, $2, $3)
  `, [locationId, accountId, `MES E2E Location ${runId}`]);
  await database.query(`
    insert into public.planning_item (id, account_id, name, uom)
    values
      ($1, $2, $3, 'EA'),
      ($4, $2, $5, 'EA')
  `, [
    outputItemId,
    accountId,
    `MES E2E Output ${runId}`,
    componentItemId,
    `MES E2E Component ${runId}`
  ]);
  await database.query(`
    insert into public.planning_operation (
      id, account_id, name, type, location_id, priority
    ) values
      ($1, $2, $3, 'routing', $4, 1),
      ($5, $2, $6, 'fixed_time', $4, 1),
      ($7, $2, $8, 'fixed_time', $4, 2)
  `, [
    routeId,
    accountId,
    `MES E2E Route ${runId}`,
    locationId,
    firstStepId,
    `MES E2E Step 1 ${runId}`,
    secondStepId,
    `MES E2E Step 2 ${runId}`
  ]);
  await database.query(`
    insert into public.planning_suboperation (
      account_id, operation_id, suboperation_id, priority
    ) values ($1, $2, $3, 1), ($1, $2, $4, 2)
  `, [accountId, routeId, firstStepId, secondStepId]);
  await database.query(`
    insert into public.planning_operationmaterial (
      id, account_id, operation_id, item_id, location_id, quantity
    ) values ($1, $2, $3, $4, $5, -2)
  `, [
    operationMaterialId,
    accountId,
    firstStepId,
    componentItemId,
    locationId
  ]);
  await database.query(`
    insert into public.planning_scenario (id, account_id, name)
    values ($1, $2, $3)
  `, [scenarioId, accountId, `MES E2E Scenario ${runId}`]);
  await database.query(`select set_config('planning.system_version_write', 'on', false)`);
  try {
    await database.query(`
      insert into public.planning_plan_version (
        id, account_id, code, name, scenario_id, status, completed_at
      ) values (
        $1, $2, $3, $4, $5, 'completed', timezone('utc'::text, now())
      )
    `, [
      versionId,
      accountId,
      `MES-E2E-${runId}`,
      `MES E2E Version ${runId}`,
      scenarioId
    ]);
  } finally {
    await database.query(`select set_config('planning.system_version_write', '', false)`);
  }
  await database.query(`
    insert into public.planning_operationplan (
      id, account_id, reference, status, type, quantity, operation_id,
      item_id, location_id, plan_version_id, startdate, enddate
    ) values (
      $1, $2, $3, 'proposed', 'MO', 10, $4, $5, $6, $7,
      timezone('utc'::text, now()), timezone('utc'::text, now()) + interval '1 day'
    )
  `, [
    operationPlanId,
    accountId,
    `MES-E2E-OP-${runId}`,
    routeId,
    outputItemId,
    locationId,
    versionId
  ]);
  await database.query(
    'select public.planning_publish_plan_version($1, $2)',
    [accountId, versionId]
  );

  return { componentItemId, operationPlanId };
}

export async function createMesE2eFixture(database: Client): Promise<MesE2eFixture> {
  const admin = createSupabaseClient('admin');
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `Mes-E2E-${randomUUID()}-A9!`;
  const userId = await ensureUser(database, admin, password);
  const accountId = await ensureAccount(database, userId);
  const fixture = await insertPlanningFixture(database, accountId, userId, runId);
  return {
    accountId,
    componentId: fixture.componentItemId,
    email: MES_E2E_USER_EMAIL,
    operationPlanId: fixture.operationPlanId,
    password,
    runId,
    userId
  };
}

export async function releaseMesE2eWorkOrder(
  database: Client,
  fixture: MesE2eFixture
): Promise<MesE2eReleasedWorkOrder> {
  const commandId = randomUUID();
  const result = await database.query<{ result: unknown }>(`
    select public.mes_release_work_order(
      $1::uuid,
      $2::uuid,
      $3::uuid,
      $4::text,
      $5::uuid,
      null,
      $6::numeric,
      $7::text,
      $8::bigint,
      null
    ) as result
  `, [
    fixture.accountId,
    fixture.operationPlanId,
    commandId,
    'a'.repeat(64),
    fixture.userId,
    10,
    `mes-e2e-prepare-${fixture.runId}`,
    1
  ]);
  const payload = result.rows[0]?.result as {
    workOrder?: { id?: unknown; work_order_no?: unknown };
  } | undefined;
  const workOrderId = String(payload?.workOrder?.id ?? '');
  const workOrderNo = String(payload?.workOrder?.work_order_no ?? '');
  if (!workOrderId || !workOrderNo) {
    throw new Error('MES E2E work-order release did not return an id and number.');
  }
  return { workOrderId, workOrderNo };
}
