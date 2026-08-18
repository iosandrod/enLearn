import assert from 'node:assert/strict';
import { Client, type ClientConfig } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;
if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

const clientConfig: ClientConfig = {
  connectionString: connectionString(rawConnectionString),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30_000,
};

async function connectedClient() {
  const client = new Client(clientConfig);
  client.on('error', () => undefined);
  await client.connect();
  return client;
}

async function main() {
  const admin = await connectedClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let ownerId = '';
  let accountA = '';
  let accountB = '';
  let ruleA = '';

  try {
    const owner = await admin.query<{ id: string }>(`
      select id from auth.users order by created_at asc limit 1
    `);
    ownerId = owner.rows[0]?.id ?? '';
    assert.ok(ownerId, 'A database user is required for the smoke test.');

    const accounts = await admin.query<{ id: string; code: string }>(`
      insert into basejump.accounts (
        primary_owner_user_id, name, slug, personal_account, code, status
      ) values
        ($1, $2, $3, false, $4, 'active'),
        ($1, $5, $6, false, $7, 'active')
      returning id, code
    `, [
      ownerId,
      `Document number smoke A ${suffix}`,
      `document-number-smoke-a-${suffix}`,
      `DNA${Date.now().toString().slice(-8)}`,
      `Document number smoke B ${suffix}`,
      `document-number-smoke-b-${suffix}`,
      `DNB${Date.now().toString().slice(-8)}`,
    ]);
    [accountA, accountB] = accounts.rows.map((row) => row.id);
    assert.ok(accountA && accountB);

    await admin.query(`
      insert into basejump.account_user (account_id, user_id, account_role)
      values ($1, $3, 'owner'), ($2, $3, 'owner')
      on conflict (user_id, account_id) do update set account_role = excluded.account_role
    `, [accountA, accountB, ownerId]);

    const rule = await admin.query<{ id: string }>(`
      insert into public.document_number_rules (
        account_id, code, name, prefix, number_format, date_pattern,
        serial_width, reset_period, start_value, increment_by, is_default
      ) values (
        $1, 'TEST', 'Concurrency test', 'T-',
        '{PREFIX}{DATE}-{SERIAL}{SUFFIX}', 'YYYYMMDD',
        4, 'daily', 7, 3, false
      )
      on conflict (account_id, code) do update set
        name = excluded.name,
        prefix = excluded.prefix,
        number_format = excluded.number_format,
        date_pattern = excluded.date_pattern,
        serial_width = excluded.serial_width,
        reset_period = excluded.reset_period,
        start_value = excluded.start_value,
        increment_by = excluded.increment_by,
        enabled = true
      returning id
    `, [accountA]);
    ruleA = rule.rows[0]?.id ?? '';
    assert.ok(ruleA);

    await admin.query(
      `select set_config('request.jwt.claim.sub', $1, false),
              set_config('request.jwt.claim.role', 'authenticated', false),
              set_config('request.jwt.claims', $2, false)`,
      [ownerId, JSON.stringify({ sub: ownerId, role: 'authenticated' })],
    );

    const calls = 24;
    const runCall = async () => {
      const client = await connectedClient();
      try {
        await client.query('begin');
        await client.query('set local role authenticated');
        await client.query(
          `select set_config('request.jwt.claim.sub', $1, true),
                  set_config('request.jwt.claim.role', 'authenticated', true),
                  set_config('request.jwt.claims', $2, true)`,
          [ownerId, JSON.stringify({ sub: ownerId, role: 'authenticated' })],
        );
        const result = await client.query<{ value: string }>(`
          select public.generate_document_number(
            jsonb_build_object(
              'accountId', $1::text,
              'ruleCode', 'TEST',
              'businessDate', '2026-08-12',
              'blockId', 'smoke-form',
              'field', 'doc_no'
            )
          ) as value
        `, [accountA]);
        await client.query('commit');
        return result.rows[0]?.value ?? '';
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    };
    const generated: string[] = [];
    for (let offset = 0; offset < calls; offset += 8) {
      generated.push(...await Promise.all(
        Array.from({ length: Math.min(8, calls - offset) }, runCall),
      ));
    }

    assert.equal(new Set(generated).size, calls, 'Concurrent numbers must be unique.');
    const expected = Array.from({ length: calls }, (_, index) => 7 + index * 3);
    const actual = generated
      .map((value) => Number(value.slice(-4)))
      .sort((left, right) => left - right);
    assert.deepEqual(actual, expected);
    assert.ok(generated.every((value) => /^T-20260812-\d{4}$/.test(value)));

    const nextPeriod = await admin.query<{ value: string }>(`
      select public.generate_document_number(
        jsonb_build_object(
          'accountId', $1::text,
          'ruleCode', 'TEST',
          'businessDate', '2026-08-13'
        )
      ) as value
    `, [accountA]);
    assert.equal(nextPeriod.rows[0]?.value, 'T-20260813-0007');

    const otherAccount = await admin.query<{ value: string }>(`
      select public.generate_document_number(
        jsonb_build_object(
          'accountId', $1::text,
          'ruleCode', 'STD-SO',
          'businessDate', '2026-08-12'
        )
      ) as value
    `, [accountB]);
    assert.equal(otherAccount.rows[0]?.value, 'SO202608120001');

    const outsider = await admin.query<{ id: string }>(`
      select users.id
      from auth.users users
      where users.id <> $1
        and not exists (
          select 1
          from basejump.account_user memberships
          where memberships.user_id = users.id
            and memberships.account_id = $2
        )
      order by users.created_at
      limit 1
    `, [ownerId, accountA]);
    const outsiderId = outsider.rows[0]?.id;
    if (outsiderId) {
      const outsiderClient = await connectedClient();
      try {
        await outsiderClient.query('begin');
        await outsiderClient.query('set local role authenticated');
        await outsiderClient.query(
          `select set_config('request.jwt.claim.sub', $1, true),
                  set_config('request.jwt.claim.role', 'authenticated', true),
                  set_config('request.jwt.claims', $2, true)`,
          [outsiderId, JSON.stringify({ sub: outsiderId, role: 'authenticated' })],
        );
        await assert.rejects(
          () => outsiderClient.query(`
            select public.generate_document_number(
              jsonb_build_object('accountId', $1::text, 'ruleCode', 'TEST')
            )
          `, [accountA]),
          /membership is required/,
        );
        await outsiderClient.query('rollback');
      } finally {
        await outsiderClient.query('rollback').catch(() => undefined);
        await outsiderClient.end();
      }
    }

    await assert.rejects(
      () => admin.query(`
        select public.generate_document_number(
          jsonb_build_object('accountId', $1::text, 'ruleCode', 'MISSING')
        )
      `, [accountA]),
      /was not found/,
    );

    const allocation = await admin.query<{ count: string; max_value: string }>(`
      select count(*)::text, max(sequence_value)::text as max_value
      from public.document_number_allocations
      where rule_id = $1 and period_key = '20260812'
    `, [ruleA]);
    assert.equal(allocation.rows[0]?.count, String(calls));
    assert.equal(allocation.rows[0]?.max_value, String(expected.at(-1)));

    console.log(JSON.stringify({
      concurrentCount: calls,
      uniqueCount: new Set(generated).size,
      first: generated.sort()[0],
      nextPeriod: nextPeriod.rows[0]?.value,
      accountIsolation: otherAccount.rows[0]?.value,
      unauthorizedRejected: Boolean(outsiderId),
    }));
  } finally {
    if (accountA || accountB) {
      await admin.query(
        'delete from basejump.accounts where id = any($1::uuid[])',
        [[accountA, accountB].filter(Boolean)],
      ).catch(() => undefined);
    }
    await admin.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
