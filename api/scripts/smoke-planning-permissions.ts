import assert from 'node:assert/strict';
import { Client } from 'pg';

import { createSupabaseClient } from '../src/common/utils/supabase';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { PLANNING_MODEL_DEFINITIONS } from '../src/planning-service/planning.models';

type JsonRecord = Record<string, unknown>;

const apiUrl = (process.env.API_URL ?? 'http://localhost:3002').replace(/\/$/, '');
const accountId = '00000000-0000-4000-8000-000000000001';

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

async function serviceRequest(
  accessToken: string,
  serviceName: string,
  serviceMethod: string,
  postData: JsonRecord
) {
  const response = await fetch(`${apiUrl}/api/service`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-account-id': accountId
    },
    body: JSON.stringify({ serviceName, serviceMethod, postData })
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  return { response, payload };
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
  const admin = createSupabaseClient('admin');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Planning-${suffix}-A9!`;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  let viewerRoleId = '';
  let managerRoleId = '';
  let stage = 'setup';
  const expectedNavigationRoutes = PLANNING_MODEL_DEFINITIONS.length +
    new Set(PLANNING_MODEL_DEFINITIONS.map((model) => model.group)).size + 3;

  await postgres.connect();
  try {
    const permissions = await admin
      .from('admin_permissions')
      .select('id, code')
      .in('code', ['planning.models.view', 'planning.models.manage'])
      .eq('status', 'active');
    if (permissions.error) throw permissions.error;
    const planningPermissionIds = (permissions.data ?? []).map((row) => row.id);
    const viewPermissionId = permissions.data?.find(
      (row) => row.code === 'planning.models.view'
    )?.id;
    assert.ok(viewPermissionId, 'planning.models.view is required.');
    assert.equal(planningPermissionIds.length, 2, 'Both planning permissions are required.');

    const roles = await postgres.query<{ id: string; code: string }>(`
      insert into public.admin_roles (code, name, status, sort_order, is_system)
      values
        ($1, 'Planning viewer smoke', 'active', 9998, false),
        ($2, 'Planning manager smoke', 'active', 9999, false)
      returning id, code
    `, [`planning_viewer_smoke_${suffix}`, `planning_manager_smoke_${suffix}`]);
    viewerRoleId = roles.rows.find((row) => row.code.startsWith('planning_viewer_smoke_'))?.id ?? '';
    managerRoleId = roles.rows.find((row) => row.code.startsWith('planning_manager_smoke_'))?.id ?? '';
    assert.ok(viewerRoleId);
    assert.ok(managerRoleId);
    createdRoleIds.push(viewerRoleId, managerRoleId);
    await postgres.query(`
      insert into public.admin_role_permissions (role_id, permission_id)
      values ($1, $2)
    `, [viewerRoleId, viewPermissionId]);
    await postgres.query(`
      insert into public.admin_role_permissions (role_id, permission_id)
      select $1, permission_id
      from unnest($2::uuid[]) permissions(permission_id)
    `, [managerRoleId, planningPermissionIds]);

    async function createTestUser(kind: 'manager' | 'viewer' | 'none') {
      const email = `planning-${kind}-${suffix}@example.test`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (created.error || !created.data.user) throw created.error;
      const userId = created.data.user.id;

      try {
        await postgres.query(`
          insert into basejump.account_user (account_id, user_id, account_role)
          values ($1, $2, 'member'::basejump.account_role)
        `, [accountId, userId]);
        const roleId = kind === 'manager'
          ? managerRoleId
          : kind === 'viewer'
            ? viewerRoleId
            : '';
        if (roleId) {
          await postgres.query(`
            insert into public.admin_user_roles (user_id, role_id, account_id)
            values ($1, $2, $3)
          `, [userId, roleId, accountId]);
        }
      } catch (error) {
        await admin.auth.admin.deleteUser(userId).catch(() => undefined);
        throw error;
      }
      createdUserIds.push(userId);

      const auth = createSupabaseClient('public');
      const signedIn = await auth.auth.signInWithPassword({ email, password });
      if (signedIn.error || !signedIn.data.session) throw signedIn.error;
      return signedIn.data.session.access_token;
    }

    const managerToken = await createTestUser('manager');
    const viewerToken = await createTestUser('viewer');
    const noPermissionToken = await createTestUser('none');

    stage = 'manager navigation';
    const managerNavigation = await serviceRequest(
      managerToken,
      'admin',
      'listNavigationRoutes',
      {}
    );
    assert.equal(managerNavigation.response.status, 200, JSON.stringify(managerNavigation.payload));
    const managerRoutes = isRecord(managerNavigation.payload) && Array.isArray(managerNavigation.payload.data)
      ? managerNavigation.payload.data as JsonRecord[]
      : [];
    assert.equal(
      managerRoutes.filter((route) => String(route.path ?? '').startsWith('/dashboard/planning')).length,
      expectedNavigationRoutes,
      'A planning manager should receive the root, all groups, and all model pages.'
    );

    stage = 'manager linked edit page';
    const managerEditPage = await serviceRequest(managerToken, 'lowcode', 'getRuntimePage', {
      code: 'planning_calendar-edit',
      fromPage: 'planning_calendar-list'
    });
    assert.equal(managerEditPage.response.status, 200, JSON.stringify(managerEditPage.payload));
    const managerEditData = isRecord(managerEditPage.payload) && isRecord(managerEditPage.payload.data)
      ? managerEditPage.payload.data
      : {};
    const managerEditSchema = isRecord(managerEditData.schema) ? managerEditData.schema : {};
    const managerEditBlocks = Array.isArray(managerEditSchema.blocks) ? managerEditSchema.blocks : [];
    const managerEditActions = managerEditBlocks
      .filter(isRecord)
      .flatMap((block) => Array.isArray(block.actions) ? block.actions : [])
      .filter(isRecord);
    assert.ok(
      managerEditActions.some((action) => action.code === 'save'),
      'The linked edit page must retain the save action for a planning manager.'
    );

    stage = 'manager CRUD';
    const managerCreate = await serviceRequest(managerToken, 'planning', 'createItem', {
      resource: 'planning_calendar',
      data: { name: `planning-manager-smoke-${suffix}` }
    });
    assert.equal(managerCreate.response.status, 200, JSON.stringify(managerCreate.payload));
    const managerCreated = isRecord(managerCreate.payload) && isRecord(managerCreate.payload.data)
      ? managerCreate.payload.data
      : {};
    const managerCreatedId = String(managerCreated.id ?? '');
    assert.ok(managerCreatedId);
    const managerDelete = await serviceRequest(managerToken, 'planning', 'deleteItem', {
      resource: 'planning_calendar',
      id: managerCreatedId
    });
    assert.equal(managerDelete.response.status, 200, JSON.stringify(managerDelete.payload));

    stage = 'viewer navigation';
    const viewerNavigation = await serviceRequest(
      viewerToken,
      'admin',
      'listNavigationRoutes',
      {}
    );
    assert.equal(viewerNavigation.response.status, 200, JSON.stringify(viewerNavigation.payload));
    const viewerRoutes = isRecord(viewerNavigation.payload) && Array.isArray(viewerNavigation.payload.data)
      ? viewerNavigation.payload.data as JsonRecord[]
      : [];
    assert.equal(
      viewerRoutes.filter((route) => String(route.path ?? '').startsWith('/dashboard/planning')).length,
      expectedNavigationRoutes,
      'A planning viewer should receive the root, all groups, and all model pages.'
    );
    assert.equal(
      viewerRoutes.filter((route) => route.path === '/dashboard/advanced/planning-console').length,
      1,
      'A planning viewer should receive the advanced planning console route.'
    );

    stage = 'viewer runtime page';
    const viewerPage = await serviceRequest(viewerToken, 'lowcode', 'getRuntimePage', {
      route: '/dashboard/planning/calendar'
    });
    assert.equal(viewerPage.response.status, 200, JSON.stringify(viewerPage.payload));
    const viewerPageData = isRecord(viewerPage.payload) && isRecord(viewerPage.payload.data)
      ? viewerPage.payload.data
      : {};
    const viewerSchema = isRecord(viewerPageData.schema) ? viewerPageData.schema : {};
    const viewerBlocks = Array.isArray(viewerSchema.blocks) ? viewerSchema.blocks : [];
    const viewerActions = viewerBlocks
      .filter(isRecord)
      .flatMap((block) => Array.isArray(block.actions) ? block.actions : [])
      .filter(isRecord);
    assert.ok(
      !viewerActions.some((action) => action.code === 'create'),
      'The runtime page must remove create actions for a view-only user.'
    );
    const viewerGrid = viewerBlocks.filter(isRecord).find((block) => block.kind === 'grid');
    const viewerGridSchema = viewerGrid && isRecord(viewerGrid.schema) ? viewerGrid.schema : {};
    assert.deepEqual(
      viewerGridSchema.rowActions,
      { edit: false, delete: false, actions: [] },
      'The runtime page must disable edit and delete actions for a view-only user.'
    );

    stage = 'viewer list';
    const viewerList = await serviceRequest(viewerToken, 'planning', 'listItems', {
      resource: 'planning_calendar',
      page: 1,
      pageSize: 10
    });
    assert.equal(viewerList.response.status, 200, 'A planning viewer should be able to list data.');
    stage = 'viewer create';
    const viewerCreate = await serviceRequest(viewerToken, 'planning', 'createItem', {
      resource: 'planning_calendar',
      data: { name: `must-not-create-${suffix}` }
    });
    assert.equal(viewerCreate.response.status, 403, 'A planning viewer must not create data.');

    stage = 'viewer planning console';
    const viewerConsole = await serviceRequest(viewerToken, 'lowcode', 'getRuntimePage', {
      route: '/dashboard/advanced/planning-console'
    });
    assert.equal(viewerConsole.response.status, 200, JSON.stringify(viewerConsole.payload));

    stage = 'denied navigation';
    const deniedNavigation = await serviceRequest(
      noPermissionToken,
      'admin',
      'listNavigationRoutes',
      {}
    );
    assert.equal(deniedNavigation.response.status, 200, JSON.stringify(deniedNavigation.payload));
    const deniedRoutes = isRecord(deniedNavigation.payload) && Array.isArray(deniedNavigation.payload.data)
      ? deniedNavigation.payload.data as JsonRecord[]
      : [];
    assert.equal(
      deniedRoutes.filter((route) => String(route.path ?? '').startsWith('/dashboard/planning')).length,
      0,
      'A user without planning permissions must not receive planning navigation.'
    );
    assert.equal(
      deniedRoutes.filter((route) => route.path === '/dashboard/advanced/planning-console').length,
      0,
      'A user without planning permissions must not receive the advanced planning console route.'
    );
    stage = 'denied runtime page';
    const deniedPage = await serviceRequest(noPermissionToken, 'lowcode', 'getRuntimePage', {
      route: '/dashboard/planning/calendar'
    });
    assert.equal(deniedPage.response.status, 403, 'A user without planning permissions must not load planning pages.');
    stage = 'denied planning console';
    const deniedConsole = await serviceRequest(noPermissionToken, 'lowcode', 'getRuntimePage', {
      route: '/dashboard/advanced/planning-console'
    });
    assert.equal(
      deniedConsole.response.status,
      403,
      'A user without planning permissions must not load the advanced planning console.'
    );
    stage = 'denied list';
    const deniedList = await serviceRequest(noPermissionToken, 'planning', 'listItems', {
      resource: 'planning_calendar',
      page: 1,
      pageSize: 10
    });
    assert.equal(deniedList.response.status, 403, 'A user without planning permissions must not list data.');

    console.log(JSON.stringify({
      manager_navigation_routes: expectedNavigationRoutes,
      manager_edit_page_status: 200,
      manager_crud: 'verified',
      viewer_navigation_routes: expectedNavigationRoutes,
      viewer_runtime_create_action: 'removed',
      viewer_runtime_row_actions: 'read-only',
      viewer_list_status: 200,
      viewer_create_status: 403,
      viewer_console_status: 200,
      no_permission_navigation_routes: 0,
      no_permission_page_status: 403,
      no_permission_console_status: 403,
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
      await postgres.query('delete from public.admin_roles where id = any($1::uuid[])', [createdRoleIds])
        .catch(() => undefined);
    }
    await postgres.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
