import { Pool } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const configured = env.DATABASE_URL ?? env.DIRECT_URL;
  if (!configured) throw new Error('DATABASE_URL or DIRECT_URL is required.');
  const pool = new Pool({
    connectionString: normalizePostgresConnectionString(configured),
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    max: 2,
    ssl: { rejectUnauthorized: false }
  });
  pool.on('error', () => undefined);
  try {
    const result = await pool.query(`
      select
        auth_user.id as user_id,
        auth_user.email,
        auth_user.created_at,
        role.id as role_id,
        role.code as role_code,
        exists (
          select 1 from basejump.account_user membership
          where membership.account_id = '00000000-0000-4000-8000-000000000001'
            and membership.user_id = auth_user.id
        ) as has_account_membership,
        exists (
          select 1 from public.admin_user_roles user_role
          where user_role.account_id = '00000000-0000-4000-8000-000000000001'
            and user_role.user_id = auth_user.id
        ) as has_role_membership
      from auth.users auth_user
      left join public.admin_user_roles user_role
        on user_role.account_id = '00000000-0000-4000-8000-000000000001'
       and user_role.user_id = auth_user.id
      left join public.admin_roles role on role.id = user_role.role_id
      where auth_user.email like 'electronics-console-%@example.test'
         or role.code like 'electronics_console_%'
      order by auth_user.created_at, auth_user.id
    `);
    const orphanRoles = await pool.query(`
      select id, code, name, created_at
      from public.admin_roles
      where code like 'electronics_console_%'
        and not exists (
          select 1 from public.admin_user_roles user_role where user_role.role_id = admin_roles.id
        )
      order by created_at, id
    `);
    console.log(JSON.stringify({
      user_count: result.rowCount,
      users: result.rows,
      orphan_role_count: orphanRoles.rowCount,
      orphan_roles: orphanRoles.rows
    }, null, 2));
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
