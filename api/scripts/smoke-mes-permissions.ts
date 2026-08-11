import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { createSupabaseClient } from '../src/common/utils/supabase';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

type JsonRecord = Record<string, unknown>;
type UserKind = 'manager' | 'viewer' | 'none';

const API_URL = (process.env.API_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, '');
const ACCOUNT_ID = process.env.MES_PERMISSION_ACCOUNT_ID
  ?? '00000000-0000-4000-8000-000000000001';
const MES_ROUTE_CODES = new Set([
  'production-root',
  'production-release',
  'production-execution',
  'production-ledger',
  'production-material-ledger'
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) as unknown : {};
  } catch {
    return { message: text };
  }
}

async function serviceRequest(
  token: string,
  serviceName: string,
  serviceMethod: string,
  postData: JsonRecord,
) {
  const response = await fetch(`${API_URL}/api/service`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-account-id': ACCOUNT_ID,
      'x-request-id': `mes-permission-${randomUUID()}`
    },
    body: JSON.stringify({ serviceName, serviceMethod, postData })
  });
  return { response, payload: await readJson(response) };
}

function responseData(payload: unknown) {
  return isRecord(payload) && 'data' in payload ? payload.data : payload;
}

function flattenBlocks(schema: unknown) {
  const blocks: JsonRecord[] = [];
  const visit = (values: unknown) => {
    if (!Array.isArray(values)) return;
    for (const value of values) {
      if (!isRecord(value)) continue;
      blocks.push(value);
      visit(value.blocks);
      if (Array.isArray(value.tabs)) {
        for (const tab of value.tabs) {
          if (isRecord(tab)) visit(tab.blocks);
        }
      }
      visit(value.overlays);
    }
  };
  if (isRecord(schema)) {
    visit(schema.blocks);
    visit(schema.overlays);
  }
  return blocks;
}

function managementActions(schema: unknown) {
  return flattenBlocks(schema).flatMap((block) => {
    const direct = Array.isArray(block.actions) ? block.actions : [];
    const blockSchema = isRecord(block.schema) ? block.schema : {};
    const rowActions = isRecord(blockSchema.rowActions) ? blockSchema.rowActions : {};
    const rows = Array.isArray(rowActions.actions) ? rowActions.actions : [];
    return [...direct, ...rows]
      .filter(isRecord)
      .filter((action) => action.permissionCode === 'mes.execution.manage');
  });
}

async function main() {
  const env = getEnv();
  const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const postgres = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  postgres.on('error', () => undefined);
  const admin = createSupabaseClient('admin');
  const suffix = randomUUID().slice(0, 8);
  const password = `Mes-Permission-${suffix}-A9!`;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  let stage = 'setup';

  await postgres.connect();
  try {
    const permissions = await postgres.query<{ code: string; id: string }>(`
      select id, code
      from public.admin_permissions
      where code in ('mes.execution.view', 'mes.execution.manage')
        and status = 'active'
    `);
    const permissionByCode = new Map(permissions.rows.map((row) => [row.code, row.id]));
    assert.ok(permissionByCode.get('mes.execution.view'));
    assert.ok(permissionByCode.get('mes.execution.manage'));

    const roles = await postgres.query<{ code: string; id: string }>(`
      insert into public.admin_roles (code, name, status, sort_order, is_system)
      values
        ($1, 'MES viewer smoke', 'active', 9997, false),
        ($2, 'MES manager smoke', 'active', 9998, false)
      returning id, code
    `, [`mes_viewer_smoke_${suffix}`, `mes_manager_smoke_${suffix}`]);
    const viewerRoleId = roles.rows.find((row) => row.code.startsWith('mes_viewer_'))?.id ?? '';
    const managerRoleId = roles.rows.find((row) => row.code.startsWith('mes_manager_'))?.id ?? '';
    assert.ok(viewerRoleId);
    assert.ok(managerRoleId);
    createdRoleIds.push(viewerRoleId, managerRoleId);

    await postgres.query(`
      insert into public.admin_role_permissions (role_id, permission_id)
      values ($1, $2), ($3, $2), ($3, $4)
    `, [
      viewerRoleId,
      permissionByCode.get('mes.execution.view'),
      managerRoleId,
      permissionByCode.get('mes.execution.manage')
    ]);

    async function createUser(kind: UserKind) {
      const email = `mes-${kind}-${suffix}@example.test`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (created.error || !created.data.user) throw created.error;
      const userId = created.data.user.id;
      createdUserIds.push(userId);
      await postgres.query(`
        insert into basejump.account_user (account_id, user_id, account_role)
        values ($1, $2, 'member'::basejump.account_role)
      `, [ACCOUNT_ID, userId]);
      const roleId = kind === 'manager'
        ? managerRoleId
        : kind === 'viewer'
          ? viewerRoleId
          : '';
      if (roleId) {
        await postgres.query(`
          insert into public.admin_user_roles (account_id, user_id, role_id)
          values ($1, $2, $3)
        `, [ACCOUNT_ID, userId, roleId]);
      }
      const response = await fetch(`${API_URL}/api/auth/signin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, accountId: ACCOUNT_ID })
      });
      const payload = await readJson(response);
      assert.equal(response.status, 201, JSON.stringify(payload));
      assert.ok(isRecord(payload));
      const session = isRecord(payload.session) ? payload.session : {};
      const token = String(session.access_token ?? '');
      assert.ok(token);
      return token;
    }

    const managerToken = await createUser('manager');
    const viewerToken = await createUser('viewer');
    const deniedToken = await createUser('none');

    for (const [kind, token, expectedRoutes] of [
      ['manager', managerToken, 5],
      ['viewer', viewerToken, 5],
      ['none', deniedToken, 0]
    ] as const) {
      stage = `${kind} navigation`;
      const navigation = await serviceRequest(token, 'admin', 'listNavigationRoutes', {});
      assert.equal(navigation.response.status, 200, JSON.stringify(navigation.payload));
      const data = responseData(navigation.payload);
      const routes = Array.isArray(data) ? data.filter(isRecord) : [];
      assert.equal(
        routes.filter((route) => MES_ROUTE_CODES.has(String(route.code ?? ''))).length,
        expectedRoutes
      );
    }

    stage = 'manager runtime page';
    const managerPage = await serviceRequest(managerToken, 'lowcode', 'getRuntimePage', {
      route: '/dashboard/production/execution'
    });
    assert.equal(managerPage.response.status, 200, JSON.stringify(managerPage.payload));
    const managerPageData = responseData(managerPage.payload);
    assert.ok(isRecord(managerPageData));
    assert.equal(managementActions(managerPageData.schema).length, 9);

    stage = 'viewer runtime page';
    const viewerPage = await serviceRequest(viewerToken, 'lowcode', 'getRuntimePage', {
      route: '/dashboard/production/execution'
    });
    assert.equal(viewerPage.response.status, 200, JSON.stringify(viewerPage.payload));
    const viewerPageData = responseData(viewerPage.payload);
    assert.ok(isRecord(viewerPageData));
    assert.equal(managementActions(viewerPageData.schema).length, 0);

    stage = 'viewer list';
    const viewerList = await serviceRequest(viewerToken, 'mes', 'listItems', {
      resource: 'mes_work_order_runtime_view',
      limit: 1
    });
    assert.equal(viewerList.response.status, 200, JSON.stringify(viewerList.payload));

    stage = 'viewer command';
    const viewerCommand = await serviceRequest(viewerToken, 'mes', 'pauseOperation', {});
    assert.equal(viewerCommand.response.status, 403, JSON.stringify(viewerCommand.payload));

    stage = 'denied runtime page';
    const deniedPage = await serviceRequest(deniedToken, 'lowcode', 'getRuntimePage', {
      route: '/dashboard/production/execution'
    });
    assert.equal(deniedPage.response.status, 403, JSON.stringify(deniedPage.payload));

    stage = 'denied list';
    const deniedList = await serviceRequest(deniedToken, 'mes', 'listItems', {
      resource: 'mes_work_order_runtime_view',
      limit: 1
    });
    assert.equal(deniedList.response.status, 403, JSON.stringify(deniedList.payload));

    console.log(JSON.stringify({
      manager_routes: 5,
      manager_actions: 9,
      viewer_routes: 5,
      viewer_actions: 0,
      viewer_list_status: 200,
      viewer_command_status: 403,
      no_permission_routes: 0,
      no_permission_page_status: 403,
      no_permission_list_status: 403,
      cleanup: 'verified'
    }));
  } catch (error) {
    throw new Error(`${stage}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
    if (createdRoleIds.length) {
      await postgres.query(
        'delete from public.admin_roles where id = any($1::uuid[])',
        [createdRoleIds]
      ).catch(() => undefined);
    }
    await postgres.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
