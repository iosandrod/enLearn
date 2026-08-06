import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createSupabaseClient } from '../src/common/utils/supabase';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown) {
  return JSON.stringify(value, (_key, nested) => {
    if (!nested || Array.isArray(nested) || typeof nested !== 'object') return nested;
    return Object.fromEntries(
      Object.entries(nested as Record<string, unknown>).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    );
  });
}

async function main() {
  const admin = createSupabaseClient('admin');
  const suffix = Date.now();
  const email = `role-hook-${suffix}@example.test`;
  const password = `RoleHook-${suffix}-A9!`;
  let userId = '';
  let createdRoleId = '';

  try {
    const createdUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (createdUser.error || !createdUser.data.user) throw createdUser.error;
    userId = createdUser.data.user.id;

    const accessResult = await admin.rpc('prepare_api_smoke_test_access', {
      p_user_id: userId,
      p_permission_code: 'lowcode.pages.manage'
    });
    if (accessResult.error) throw accessResult.error;
    const access = isRecord(accessResult.data) ? accessResult.data : {};
    const accountId = typeof access.account_id === 'string' ? access.account_id : '';
    const adminRoleId = typeof access.role_id === 'string' ? access.role_id : '';
    assert.ok(accountId);
    assert.ok(adminRoleId);

    const authClient = createSupabaseClient('public');
    const signedIn = await authClient.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw signedIn.error;
    const userClient = createSupabaseClient('user', {
      authorization: `Bearer ${signedIn.data.session.access_token}`
    });
    const roleCode = `rpc_hook_role_${suffix}`;
    const baseConfig = {
      resource_name: 'admin_roles',
      resources: {
        admin_roles: {
          table_name: 'admin_roles',
          primary_key: 'id',
          owner_field: null,
          account_field: null,
          client_mode: 'user',
          hooks: {
            afterCreate: [{
              function: 'public.dynamic_crud_sync_role_permissions',
              args: {}
            }]
          },
          create: {
            allowed_fields: [
              'code', 'name', 'description', 'status', 'sort_order', 'is_system',
              'created_by', 'updated_by', 'created_at', 'updated_at'
            ],
            input_allowed_fields: [
              'code', 'name', 'description', 'status', 'sort_order', 'is_system'
            ],
            managed_fields: ['created_by', 'updated_by', 'created_at', 'updated_at'],
            hook_input_fields: ['permission_codes', 'permissionCodes'],
            required_fields: ['code', 'name'],
            timestamp: true
          },
          update: null
        }
      },
      detail_relations: {},
      after_save_relations: {}
    };
    const configHash = createHash('sha256').update(stableJson(baseConfig)).digest('hex');
    const config = { ...baseConfig, config_hash: configHash };
    const registration = await admin.rpc('register_dynamic_crud_resource', {
      p_resource_name: 'admin_roles',
      p_table_name: 'admin_roles',
      p_config_hash: configHash,
      p_config: config
    });
    if (registration.error) throw registration.error;

    const now = new Date().toISOString();
    const saved = await userClient.rpc('execute_dynamic_crud', {
      p_action: 'create',
      p_table_name: 'admin_roles',
      p_config: config,
      p_operation: {
        items: [{
          data: {
            code: roleCode,
            name: 'RPC Hook Smoke',
            status: 'active',
            sort_order: 0,
            is_system: false,
            created_by: userId,
            updated_by: userId,
            created_at: now,
            updated_at: now
          },
          details: []
        }],
        after_save: [],
        hook_input: { permission_codes: ['lowcode.pages.manage'] }
      },
      p_account_id: accountId
    });
    if (saved.error) throw saved.error;
    createdRoleId = String((saved.data as Record<string, unknown>).id ?? '');
    assert.ok(createdRoleId);
    assert.deepEqual(
      (saved.data as Record<string, unknown>).permission_codes,
      ['lowcode.pages.manage']
    );

    const mappings = await admin
      .from('admin_role_permissions')
      .select('permission_id, admin_permissions!inner(code)')
      .eq('role_id', createdRoleId);
    if (mappings.error) throw mappings.error;
    assert.equal(
      (mappings.data?.[0]?.admin_permissions as unknown as { code?: string })?.code,
      'lowcode.pages.manage'
    );
    console.log('Dynamic CRUD production role hook smoke test passed.');
  } finally {
    if (createdRoleId) {
      await admin.from('admin_roles').delete().eq('id', createdRoleId);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
