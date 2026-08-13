import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

const accountId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const pageId = '00000000-0000-4000-8000-000000000003';
const conversationId = '00000000-0000-4000-8000-000000000004';
const runId = '00000000-0000-4000-8000-000000000005';
const proposalId = '00000000-0000-4000-8000-000000000006';

async function main() {
  const url = process.env.AI_TEST_DATABASE_URL;
  if (!url) throw new Error('AI_TEST_DATABASE_URL is required.');
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
  await client.query('begin');
  await client.query(`
    create schema auth;
    create schema basejump;
    create role authenticated;
    create role service_role;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''app.test_user_id'', true), '''')::uuid';
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table basejump.accounts (id uuid primary key);
    create table public.users (id uuid primary key, role text);
    create table public.admin_roles (
      id uuid primary key default gen_random_uuid(),
      code text unique not null,
      status text not null default 'active'
    );
    create table public.admin_permissions (
      id uuid primary key default gen_random_uuid(),
      code text unique not null,
      name text not null,
      description text,
      resource_type text,
      resource_key text,
      action_code text,
      status text,
      sort_order integer,
      updated_at timestamptz default now()
    );
    create table public.admin_role_permissions (
      role_id uuid references public.admin_roles(id),
      permission_id uuid references public.admin_permissions(id),
      unique(role_id, permission_id)
    );
    create table public.lowcode_pages (
      id uuid primary key default gen_random_uuid(),
      code text unique not null,
      route text unique not null,
      title text not null,
      description text,
      layout text not null default 'dashboard',
      status text not null default 'draft',
      keep_alive boolean not null default true,
      page_type text not null default 'custom',
      edit_page_id uuid,
      view_name text,
      table_name text,
      schema jsonb not null,
      version integer not null default 1,
      created_by uuid references auth.users(id),
      updated_by uuid references auth.users(id),
      published_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table public.lowcode_page_versions (
      id uuid primary key default gen_random_uuid(),
      page_id uuid references public.lowcode_pages(id),
      version integer not null,
      schema jsonb not null,
      created_by uuid references auth.users(id),
      published_at timestamptz,
      unique(page_id, version)
    );
    create function public.set_updated_at() returns trigger language plpgsql as
      'begin new.updated_at = now(); return new; end';
    create function public.is_active_account_member(uuid) returns boolean language sql security definer stable
      set search_path = pg_catalog, public as
      'select $1 = ''${accountId}''::uuid and auth.uid() in (
        ''${userId}''::uuid,
        ''00000000-0000-4000-8000-000000000012''::uuid
      )';
    create function public.has_account_permission(uuid, text) returns boolean language sql security definer stable
      set search_path = pg_catalog, public as
      'select public.is_active_account_member($1)';
  `);

  const migration = await readFile(
    resolve(process.cwd(), '..', 'supabase', 'migrations', '20260813150000_ai_assistant.sql'),
    'utf8'
  );
  await client.query(migration);
  await client.query(`select set_config('app.test_user_id', $1, true)`, [userId]);
  await client.query(`insert into auth.users (id) values ($1)`, [userId]);
  await client.query(`insert into basejump.accounts (id) values ($1)`, [accountId]);

  const baseSchema = {
    schemaVersion: 1,
    code: 'ai-smoke-page',
    route: '/dashboard/ai-smoke-page',
    title: 'AI Smoke Page',
    layout: 'dashboard',
    status: 'draft',
    pageType: 'list',
    keepAlive: true,
    dataSources: {},
    blocks: []
  };
  const candidateSchema = { ...baseSchema, title: 'AI Updated Page' };
  await client.query(`
    insert into public.lowcode_pages
      (id, code, route, title, schema, version, created_by, updated_by)
    values ($1, $2, $3, $4, $5, 1, $6, $6)
  `, [pageId, baseSchema.code, baseSchema.route, baseSchema.title, baseSchema, userId]);
  await client.query(`
    insert into public.ai_conversations (id, account_id, created_by, title)
    values ($1, $2, $3, 'AI smoke')
  `, [conversationId, accountId, userId]);
  await client.query(`
    insert into public.ai_runs
      (id, account_id, conversation_id, created_by, request_id, mode, provider, status)
    values ($1, $2, $3, $4, 'smoke-request', 'edit_page', 'mock', 'completed')
  `, [runId, accountId, conversationId, userId]);
  await client.query(`
    insert into public.ai_proposals (
      id, account_id, created_by, conversation_id, run_id, kind, target_page_id,
      base_version, base_schema_hash, base_schema, summary, operations,
      candidate_schema, validation_issues, content_hash, diff, status
    ) values (
      $1, $2, $3, $4, $5, 'edit_page', $6,
      1, 'baseline', $7, 'Smoke update', '[]',
      $8, '[]', 'server-hash', '[]', 'awaiting_approval'
    )
  `, [proposalId, accountId, userId, conversationId, runId, pageId, baseSchema, candidateSchema]);

  await client.query('savepoint tampered_proposal');
  try {
    await client.query(`select public.apply_ai_page_proposal($1, $2)`, [proposalId, 'tampered-hash']);
    assert.fail('Tampered proposal hash should be rejected.');
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), /no longer matches/);
    await client.query('rollback to savepoint tampered_proposal');
  }
  const applied = await client.query<{ result: Record<string, unknown> }>(
    `select public.apply_ai_page_proposal($1, $2) as result`,
    [proposalId, 'server-hash']
  );
  assert.equal(applied.rows[0]?.result.title, 'AI Updated Page');
  assert.equal(applied.rows[0]?.result.version, 2);
  const page = await client.query(`select title, version, schema from public.lowcode_pages where id = $1`, [pageId]);
  assert.equal(page.rows[0]?.title, 'AI Updated Page');
  assert.equal(page.rows[0]?.version, 2);

  await client.query(`
    update public.ai_proposals
    set status = 'awaiting_approval', content_hash = 'conflict-hash'
    where id = $1
  `, [proposalId]);
  const conflict = await client.query<{ result: Record<string, unknown> }>(
    `select public.apply_ai_page_proposal($1, $2) as result`,
    [proposalId, 'conflict-hash']
  );
  assert.equal(conflict.rows[0]?.result.conflict, true);
  assert.equal(conflict.rows[0]?.result.status, 'conflicted');

  const otherUserId = '00000000-0000-4000-8000-000000000012';
  await client.query(`insert into auth.users (id) values ($1)`, [otherUserId]);
  await client.query(`set local role authenticated`);
  await client.query(`select set_config('app.test_user_id', $1, true)`, [otherUserId]);
  const hiddenConversations = await client.query(`select id from public.ai_conversations`);
  const hiddenProposals = await client.query(`select id from public.ai_proposals`);
  assert.equal(hiddenConversations.rowCount, 0, 'RLS must isolate another account user from conversations');
  assert.equal(hiddenProposals.rowCount, 0, 'RLS must isolate another account user from proposals');
  await client.query(`reset role`);

  const applyFunction = await client.query<{ proconfig: string[] }>(`
    select proconfig
    from pg_catalog.pg_proc
    where oid = 'public.apply_ai_page_proposal(uuid,text)'::regprocedure
  `);
  assert.deepEqual(
    applyFunction.rows[0]?.proconfig,
    ['search_path=pg_catalog, public'],
    'atomic apply must pin a trusted search_path'
  );

  console.log('AI assistant local database smoke passed');
  } finally {
    await client.query('rollback').catch(() => undefined);
    await client.end();
  }
}

void main();
