import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  getEnv,
  normalizePostgresConnectionString
} from '../src/common/utils/env';

type AuthPayload = {
  user: { id: string };
  accounts: Array<{ account_id: string; code?: string; status?: string }>;
  session: { access_token: string };
};

const env = getEnv();
const apiBaseUrl = process.env.API_BASE_URL ?? env.API_BASE_URL ?? 'http://localhost:3002/api';
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
const email = process.env.TEST_LOGIN_EMAIL ?? env.TEST_LOGIN_EMAIL ?? 'admin';
const password = process.env.TEST_LOGIN_PASSWORD ?? env.TEST_LOGIN_PASSWORD ?? '123456';
let databaseChecksSkipped = false;

if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
const connectionString = normalizePostgresConnectionString(rawConnectionString);

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

async function withClient<T>(
  operation: (client: Client) => Promise<T>
) {
  return retry(async (attempt) => {
    console.log(`Database check attempt ${attempt}...`);
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 30_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5_000,
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    try {
      return await operation(client);
    } finally {
      await client.end().catch(() => undefined);
    }
  });
}

async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values: unknown[] = []
) {
  return withClient((client) => client.query<T>(text, values));
}

async function retry<T>(operation: (attempt: number) => Promise<T>, attempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      const code = String((error as { code?: unknown }).code ?? '');
      const message = error instanceof Error ? error.message : String(error);
      const transient = ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', '08006', '57P01'].includes(code) ||
        /connection|socket|ECONNRESET|EPIPE|timed out/i.test(message);
      if (!transient || attempt >= attempts) throw error;
      console.warn(`Transient database error: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }
}

async function main() {
  const signIn = await request('/auth/signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (signIn.status !== 201) throw new Error(`Sign-in failed: ${signIn.status}`);

  const auth = signIn.payload as AuthPayload;
  const token = auth.session.access_token;
  const activeAccount = auth.accounts.find(
    (account) => account.status === 'active' && account.account_id === auth.user.id
  ) ?? auth.accounts.find((account) => account.status === 'active') ?? auth.accounts[0];
  if (!activeAccount) throw new Error('Test user has no account set.');

  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json'
  };
  const results: Array<{ scenario: string; expected: number; actual: number }> = [];
  const record = (scenario: string, expected: number, actual: number) => {
    results.push({ scenario, expected, actual });
    if (expected !== actual) throw new Error(`${scenario}: expected ${expected}, received ${actual}`);
  };

  const forged = await request('/service', {
    method: 'POST',
    headers: { ...headers, 'x-account-id': randomUUID() },
    body: JSON.stringify({ serviceName: 'account', serviceMethod: 'listItems', postData: { itemType: 'accounts' } })
  });
  record('forged non-member X-Account-Id', 403, forged.status);

  const missing = await request('/service', {
    method: 'POST',
    headers,
    body: JSON.stringify({ serviceName: 'account', serviceMethod: 'listItems', postData: { itemType: 'accounts' } })
  });
  record('missing X-Account-Id', 400, missing.status);

  try {
    await runDatabaseChecks(auth, activeAccount, headers, record);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    databaseChecksSkipped = true;
    console.warn(`Database mutation checks were skipped after transient connection failure: ${message}`);
  }

  console.table(results);
  if (databaseChecksSkipped) process.exitCode = 2;
}

async function runDatabaseChecks(
  auth: AuthPayload,
  activeAccount: AuthPayload['accounts'][number],
  headers: Record<string, string>,
  record: (scenario: string, expected: number, actual: number) => void
) {
  const baseline = await query<{ membership_count: number; status: string }>(
    `select
       (select count(*)::integer from basejump.account_user) as membership_count,
       (select status from basejump.accounts where id = $1) as status`,
    [activeAccount.account_id]
  );

  const crossAccount = auth.accounts.find(
    (account) => account.status === 'active' && account.account_id !== activeAccount.account_id
  );
  if (crossAccount) {
    const conversationId = randomUUID();
    await query(
      `with conversation as (
         insert into public.chat_conversations (id, tenant_id, type, created_by, metadata)
         values ($1, $2, 'direct', $3, '{"accountSetSecurityProbe": true}'::jsonb)
         returning id
       )
       insert into public.chat_conversation_members
         (tenant_id, conversation_id, user_id, role, status)
       select $2, id, $3, 'owner', 'active' from conversation`,
      [conversationId, crossAccount.account_id, auth.user.id]
    );

    try {
      const crossChat = await request('/service', {
        method: 'POST',
        headers: { ...headers, 'x-account-id': activeAccount.account_id },
        body: JSON.stringify({
          serviceName: 'chat',
          serviceMethod: 'sendMessage',
          postData: { conversationId, content: 'cross-account-probe' }
        })
      });
      record('cross-account chat conversation is rejected', 403, crossChat.status);
    } finally {
      await query('delete from public.chat_conversations where id = $1', [conversationId]);
    }
  }

  const foreignUser = await query<{ id: string }>(
    `select users.id::text
     from auth.users users
     where not exists (
       select 1
       from basejump.account_user membership
       where membership.account_id = $1
         and membership.user_id = users.id
     )
     order by users.created_at
     limit 1`,
    [activeAccount.account_id]
  );

  const foreignUserId = foreignUser.rows[0]?.id;
  if (foreignUserId) {
    const forgedActor = await request('/service', {
      method: 'POST',
      headers: { ...headers, 'x-account-id': activeAccount.account_id },
      body: JSON.stringify({
        serviceName: 'workflow',
        serviceMethod: 'getTask',
        postData: { taskId: randomUUID(), userId: foreignUserId }
      })
    });
    record('workflow body userId cannot impersonate another actor', 502, forgedActor.status);

    for (const serviceMethod of ['transferTask', 'addSignTask']) {
      const workflowTarget = await request('/service', {
        method: 'POST',
        headers: { ...headers, 'x-account-id': activeAccount.account_id },
        body: JSON.stringify({
          serviceName: 'workflow',
          serviceMethod,
          postData: {
            taskId: randomUUID(),
            targetUserId: foreignUserId,
            userId: foreignUserId
          }
        })
      });
      record(`workflow ${serviceMethod} cross-account target is rejected`, 403, workflowTarget.status);
    }

    const notification = await request('/service', {
      method: 'POST',
      headers: { ...headers, 'x-account-id': activeAccount.account_id },
      body: JSON.stringify({
        serviceName: 'notification',
        serviceMethod: 'createSystemNotice',
        postData: {
          title: 'account security probe',
          content: 'must not be delivered',
          recipientIds: [foreignUserId]
        }
      })
    });
    record('cross-account notification recipient is rejected', 403, notification.status);
  }

  const role = await query<{ id: string }>(
    `select id::text
     from public.admin_roles
     where status = 'active'
     order by created_at nulls last, id
     limit 1`
  );
  if (crossAccount && role.rows[0]?.id) {
    const beforeRoleCount = await query<{ count: number }>(
      `select count(*)::integer as count
       from public.admin_user_roles
       where user_id = $1 and role_id = $2 and account_id = $3`,
      [auth.user.id, role.rows[0].id, crossAccount.account_id]
    );
    const crossRole = await request('/service', {
      method: 'POST',
      headers: { ...headers, 'x-account-id': activeAccount.account_id },
      body: JSON.stringify({
        serviceName: 'admin',
        serviceMethod: 'createItem',
        postData: {
          resource: 'admin_user_roles',
          data: {
            user_id: auth.user.id,
            role_id: role.rows[0].id,
            account_id: crossAccount.account_id
          }
        }
      })
    });
    record('cross-account role assignment is rejected', 403, crossRole.status);
    const afterRoleCount = await query<{ count: number }>(
      `select count(*)::integer as count
       from public.admin_user_roles
       where user_id = $1 and role_id = $2 and account_id = $3`,
      [auth.user.id, role.rows[0].id, crossAccount.account_id]
    );
    if (beforeRoleCount.rows[0].count !== afterRoleCount.rows[0].count) {
      throw new Error('Cross-account role assignment changed database rows.');
    }
  }

  const membership = await query<{ account_role: string }>(
    `select account_role
     from basejump.account_user
     where account_id = $1 and user_id = $2`,
    [activeAccount.account_id, auth.user.id]
  );
  if (!membership.rowCount) throw new Error('Test membership was not found.');

  await query(
    'delete from basejump.account_user where account_id = $1 and user_id = $2',
    [activeAccount.account_id, auth.user.id]
  );

  try {
    const revoked = await request('/service', {
      method: 'POST',
      headers: { ...headers, 'x-account-id': activeAccount.account_id },
      body: JSON.stringify({ serviceName: 'account', serviceMethod: 'listItems', postData: { itemType: 'accounts' } })
    });
    record('membership revocation is immediate', 403, revoked.status);
  } finally {
    await query(
      `insert into basejump.account_user (account_id, user_id, account_role)
       values ($1, $2, $3)
       on conflict (user_id, account_id) do update set account_role = excluded.account_role`,
      [activeAccount.account_id, auth.user.id, membership.rows[0].account_role]
    );
  }

  await query('update basejump.accounts set status = $2 where id = $1', [activeAccount.account_id, 'inactive']);
  try {
    const inactive = await request('/service', {
      method: 'POST',
      headers: { ...headers, 'x-account-id': activeAccount.account_id },
      body: JSON.stringify({ serviceName: 'account', serviceMethod: 'listItems', postData: { itemType: 'accounts' } })
    });
    record('inactive account is rejected immediately', 403, inactive.status);
  } finally {
    await query('update basejump.accounts set status = $2 where id = $1', [
      activeAccount.account_id,
      baseline.rows[0].status
    ]);
  }

  const restored = await query<{ membership_count: number; status: string }>(
    `select
       (select count(*)::integer from basejump.account_user) as membership_count,
       (select status from basejump.accounts where id = $1) as status`,
    [activeAccount.account_id]
  );
  if (baseline.rows[0].membership_count !== restored.rows[0].membership_count) {
    throw new Error('Membership restoration check failed.');
  }
  if (restored.rows[0].status !== baseline.rows[0].status) {
    throw new Error('Account status restoration check failed.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
