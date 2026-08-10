import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const client = new Client({
    connectionString: normalizePostgresConnectionString(env.DATABASE_URL ?? env.DIRECT_URL!),
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);
  await client.connect();
  try {
    const result = await client.query(`
      select u.id, u.email,
        array_agg(distinct role.code) filter (where role.code is not null) as roles
      from auth.users u
      left join public.admin_user_roles user_role
        on user_role.user_id = u.id
       and user_role.account_id = '00000000-0000-4000-8000-000000000001'
      left join public.admin_roles role on role.id = user_role.role_id
      group by u.id, u.email
      order by u.created_at
    `);
    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    await client.end();
  }
}

void main();
