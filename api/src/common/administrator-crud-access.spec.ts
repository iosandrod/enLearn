import assert from 'node:assert/strict';
import type { ResourceConfigMap } from './base.service';
import type { ServiceContext } from './interfaces/service-executor';

const USER_ID = '00000000-0000-4000-8000-000000000111';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000222';
const OTHER_ACCOUNT_ID = '00000000-0000-4000-8000-000000000333';

async function main() {
  const originalFetch = globalThis.fetch;
  const envKeys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  process.env.SUPABASE_URL = 'https://administrator-crud.test';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  let profileRole = 'user';
  let assignedRole: { code: string; status: string; accountId: string | null } | undefined;
  let emptyWrite = false;
  const requests: Array<{ url: URL; authorization: string | null; body: any }> = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.hostname, 'administrator-crud.test', 'tests must never contact a real database');
    const body = request.method === 'GET' ? undefined : await request.json();
    const authorization = request.headers.get('authorization');
    requests.push({ url, authorization, body });
    const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') {
      return json({ id: USER_ID, aud: 'authenticated', user_metadata: { role: 'admin' } });
    }
    if (url.pathname === '/rest/v1/users') return json({ id: USER_ID, role: profileRole });
    if (url.pathname === '/rest/v1/admin_user_roles') {
      assert.equal(authorization, 'Bearer test-service-role-key');
      assert.equal(url.searchParams.get('user_id'), `eq.${USER_ID}`);
      assert.equal(url.searchParams.get('account_id'), 'is.null');
      assert.equal(url.searchParams.get('admin_roles.code'), 'eq.admin');
      assert.equal(url.searchParams.get('admin_roles.status'), 'eq.active');
      const matches = assignedRole?.code === 'admin' && assignedRole.status === 'active' && assignedRole.accountId === null;
      return json(matches ? [{ admin_roles: { code: 'admin', status: 'active' } }] : []);
    }
    if (url.pathname.endsWith('/rpc/current_user_permission_codes')) return json(['ordinary.permission']);
    if (url.pathname.endsWith('/rpc/get_accounts')) return json([]);
    if (url.pathname.endsWith('/rpc/get_dynamic_crud_resource_hash')) return json(null);
    if (url.pathname.endsWith('/rpc/register_dynamic_crud_resource')) return json(null);
    if (url.pathname.endsWith('/rpc/execute_dynamic_crud')) {
      return json(emptyWrite ? null : { id: 'row-1', ...(body.p_operation.data ?? body.p_operation.items?.[0]?.data) });
    }
    if (url.pathname === '/rest/v1/test_rows' || url.pathname === '/rest/v1/generic_rows') {
      return json(request.method === 'GET' ? [] : { id: 'row-1', ...body });
    }
    throw new Error(`Unexpected mock request: ${url.pathname}`);
  };
  try {
    const { BaseService } = await import('./base.service');
    const { AdminService } = await import('../admin-service/admin.service');
    const { isSystemAdministrator } = await import('./utils/supabase');
    const context: ServiceContext = { authorization: 'Bearer test-user', accountId: ACCOUNT_ID };
    assert.equal(await isSystemAdministrator({}), false);
    assert.equal(requests.length, 0, 'guests must not cause privileged role lookups');
    assert.equal(await isSystemAdministrator(context), false, 'user_metadata cannot grant administrator access');
    profileRole = 'admin';
    assert.equal(await isSystemAdministrator(context), true);
    profileRole = 'user';
    for (const role of [
      { code: 'admin', status: 'inactive', accountId: null },
      { code: 'admin', status: 'active', accountId: ACCOUNT_ID },
      { code: 'editor', status: 'active', accountId: null },
    ]) {
      assignedRole = role;
      assert.equal(await isSystemAdministrator(context), false);
    }
    assignedRole = { code: 'admin', status: 'active', accountId: null };
    assert.equal(await isSystemAdministrator(context), true);
    assignedRole = undefined;
    assert.equal(await isSystemAdministrator(context), false, 'role revocation must apply without waiting for auth caches');

    class TestService extends BaseService {
      protected override resources(): ResourceConfigMap {
        return { test_rows: {
          tableName: 'test_rows', clientMode: 'user', ownerField: 'user_id', accountField: 'account_id',
          permissions: { update: 'restricted.update', delete: 'restricted.delete' },
          create: { allowedFields: ['name'], timestamp: false },
          update: { allowedFields: ['name', 'account_id'], timestamp: false,
            userFields: { owner: 'user_id', updatedBy: 'updated_by' } },
          delete: { softDelete: false },
        } };
      }
      protected override async inspectTableHasUserIdColumn() { return true; }
      protected override async inspectTableHasAccessLevelColumn() { return false; }
    }
    const service = new TestService();
    for (const adminKind of ['legacy', 'global-role']) {
      profileRole = adminKind === 'legacy' ? 'admin' : 'user';
      assignedRole = adminKind === 'global-role' ? { code: 'admin', status: 'active', accountId: null } : undefined;
      requests.length = 0;
      await service.execute('saveItem', { resource: 'test_rows', id: 'row-1', data: { name: 'admin edit', ignored: 'discard' } }, context);
      const rpc = requests.find((item) => item.url.pathname.endsWith('/rpc/execute_dynamic_crud'))!;
      assert.equal(rpc.authorization, 'Bearer test-service-role-key');
      assert.deepEqual(rpc.body.p_operation.data, { name: 'admin edit', updated_by: USER_ID });
      assert.equal(rpc.body.p_operation.actor_user_id, USER_ID);
      const config = rpc.body.p_config.resources.test_rows;
      assert.equal(config.client_mode, 'admin');
      assert.equal(config.owner_field, null);
      assert.equal(config.account_field, null);
      assert.equal(requests.some((item) => item.url.pathname.includes('register_dynamic_crud_resource')), false,
        'administrator overrides must never be registered for ordinary authenticated users');
      await service.execute('updateItem', { resource: 'test_rows', id: 'row-1', data: { name: 'cross-account', account_id: OTHER_ACCOUNT_ID } }, context);
      assert.equal(requests.at(-1)!.body.p_operation.data.account_id, OTHER_ACCOUNT_ID);
      await service.execute('deleteItem', { resource: 'test_rows', id: 'row-1' }, context);
      assert.equal(requests.at(-1)!.authorization, 'Bearer test-service-role-key');
      assert.equal(requests.at(-1)!.body.p_action, 'delete');
      await service.execute('listItems', { resource: 'test_rows' }, context);
      const list = requests.at(-1)!;
      assert.equal(list.authorization, 'Bearer test-service-role-key');
      assert.equal(list.url.searchParams.has('user_id'), false);
      assert.equal(list.url.searchParams.has('or'), false);
      assert.equal(list.url.searchParams.has('account_id'), false);
      emptyWrite = true;
      await assert.rejects(service.execute('saveItem', { resource: 'test_rows', id: 'row-1', data: { name: 'missing' } }, context), /保存失败/);
      emptyWrite = false;
    }

    profileRole = 'user';
    assignedRole = undefined;
    requests.length = 0;
    emptyWrite = true; // Simulate RLS rejecting an update to another user's row.
    await assert.rejects(service.execute('updateItem', {
      resource: 'test_rows', id: 'row-1', isAdministrator: true, clientMode: 'admin',
      meta: { isAdministrator: true }, data: { name: 'forged administrator' },
    }, context), /保存失败/);
    assert.equal(requests.at(-1)!.authorization, context.authorization, 'request fields cannot bypass RLS');
    assert.equal(requests.at(-1)!.body.p_config.resources.test_rows.owner_field, 'user_id');
    emptyWrite = false;
    await assert.rejects(service.execute('updateItem', {
      resource: 'test_rows', id: 'row-1', data: { name: 'forged account', account_id: OTHER_ACCOUNT_ID },
    }, context), /different account/);
    requests.length = 0;
    await service.execute('createItem', { resource: 'test_rows', data: { name: 'ordinary create' } }, context);
    const ordinary = requests.at(-1)!;
    assert.equal(ordinary.authorization, context.authorization);
    assert.equal(ordinary.body.p_operation.items[0].data.account_id, ACCOUNT_ID);
    assert.equal(ordinary.body.p_operation.items[0].data.user_id, USER_ID);
    assert.equal(ordinary.body.p_config.resources.test_rows.client_mode, 'user');
    assert.equal(ordinary.body.p_config.resources.test_rows.owner_field, 'user_id');
    assert.equal(ordinary.body.p_config.resources.test_rows.account_field, 'account_id');
    assert.ok(requests.some((item) => item.url.pathname.endsWith('/rpc/register_dynamic_crud_resource')));

    class GenericService extends AdminService {
      protected override async resolveGenericTableColumns() { return new Set(['id', 'name', 'account_id', 'user_id']); }
      save(data: Record<string, unknown>) { return this.saveGenericTableItem('generic_rows', data, context); }
    }
    const generic = new GenericService();
    for (const admin of [true, false]) {
      profileRole = admin ? 'admin' : 'user';
      await generic.save({ id: 'row-1', data: { name: 'generic edit' } });
      const write = requests.at(-1)!;
      assert.equal(write.authorization, admin ? 'Bearer test-service-role-key' : context.authorization);
      assert.deepEqual(write.body, admin ? { name: 'generic edit' } : { name: 'generic edit', account_id: ACCOUNT_ID });
      if (admin) {
        await generic.save({ id: 'row-1', data: { name: 'cross-account', account_id: OTHER_ACCOUNT_ID } });
        assert.equal(requests.at(-1)!.body.account_id, OTHER_ACCOUNT_ID);
      } else {
        await assert.rejects(generic.save({ id: 'row-1', data: { account_id: OTHER_ACCOUNT_ID } }), /different account/);
      }
    }
    console.log('Administrator identity, CRUD bypass, audit attribution, and ordinary-user isolation tests passed.');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
