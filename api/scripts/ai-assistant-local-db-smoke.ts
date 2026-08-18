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
const temporaryConversationId = '00000000-0000-4000-8000-000000000007';
const temporaryRunId = '00000000-0000-4000-8000-000000000008';
const temporaryProposalId = '00000000-0000-4000-8000-000000000009';
const temporaryMessageId = '00000000-0000-4000-8000-00000000000a';

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
    do $bootstrap$
    begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role;
      end if;
    end
    $bootstrap$;
    create table auth.users (
      id uuid primary key,
      email text,
      created_at timestamptz default now()
    );
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''app.test_user_id'', true), '''')::uuid';
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table basejump.accounts (
      id uuid primary key,
      primary_owner_user_id uuid,
      name text,
      slug text,
      personal_account boolean not null default false,
      created_at timestamptz default now()
    );
    create table basejump.account_user (
      account_id uuid references basejump.accounts(id),
      user_id uuid references auth.users(id),
      account_role text not null default 'member'
    );
    create table public.users (
      id uuid primary key,
      full_name text,
      avatar_url text,
      phone text,
      nickname text,
      role text not null default 'user',
      city text,
      english_level text,
      learning_goal text,
      source_channel text,
      lead_status text,
      assigned_consultant_id uuid,
      updated_at timestamptz default now()
    );
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
    create table public.admin_user_roles (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id),
      role_id uuid references public.admin_roles(id),
      unique(user_id, role_id)
    );
    create table public.dynamic_crud_resource_registry (
      resource_name text primary key,
      table_name text not null,
      config_hash text not null,
      config jsonb not null,
      updated_at timestamptz default now()
    );
    create table public.system_option_sources (
      id uuid primary key default gen_random_uuid(),
      code text unique not null,
      name text not null,
      description text,
      source_config jsonb not null default '{}'::jsonb
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
    create table public.entity_design_tables (
      id uuid primary key default gen_random_uuid(),
      code text unique not null,
      schema_name text not null default 'public',
      table_name text not null,
      title text not null,
      description text,
      unique(schema_name, table_name)
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
    create function public.has_app_permission(text) returns boolean language sql security definer stable
      set search_path = pg_catalog, public as
      'select true';

    create table public.ai_scenarios (
      id uuid primary key default gen_random_uuid()
    );
    create table public.ai_conversations (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id),
      scenario_id uuid references public.ai_scenarios(id),
      title text,
      status text not null default 'active',
      score numeric,
      feedback text,
      started_at timestamptz default now(),
      ended_at timestamptz,
      updated_at timestamptz default now()
    );
    create table public.ai_messages (
      id uuid primary key default gen_random_uuid(),
      conversation_id uuid not null references public.ai_conversations(id),
      role text not null,
      content text not null,
      audio_url text,
      pronunciation_score numeric,
      grammar_feedback text,
      vocabulary_feedback text,
      created_at timestamptz default now()
    );
    create table public.speech_assessments (
      id uuid primary key default gen_random_uuid(),
      message_id uuid references public.ai_messages(id)
    );
    create table public.courses (id uuid primary key default gen_random_uuid());
    create table public.course_sections (
      id uuid primary key default gen_random_uuid(),
      course_id uuid references public.courses(id)
    );
    create table public.lessons (
      id uuid primary key default gen_random_uuid(),
      course_id uuid references public.courses(id),
      section_id uuid references public.course_sections(id)
    );
    create table public.course_enrollments (
      id uuid primary key default gen_random_uuid(),
      course_id uuid references public.courses(id)
    );
    create table public.lesson_progress (
      id uuid primary key default gen_random_uuid(),
      lesson_id uuid references public.lessons(id)
    );
    create table public.teachers (id uuid primary key default gen_random_uuid());
    create table public.campuses (id uuid primary key default gen_random_uuid());
    create table public.trial_classes (
      id uuid primary key default gen_random_uuid(),
      campus_id uuid references public.campuses(id),
      course_id uuid references public.courses(id),
      teacher_id uuid references public.teachers(id)
    );
    create table public.trial_bookings (
      id uuid primary key default gen_random_uuid(),
      trial_class_id uuid references public.trial_classes(id),
      campus_id uuid references public.campuses(id)
    );
    create table public.consultant_tasks (
      id uuid primary key default gen_random_uuid(),
      booking_id uuid references public.trial_bookings(id)
    );
    create table public.conversion_records (
      id uuid primary key default gen_random_uuid(),
      booking_id uuid references public.trial_bookings(id)
    );
    create table public.lead_events (id uuid primary key default gen_random_uuid());
    create table public.chat_sessions (id uuid primary key default gen_random_uuid());
    create table public.chat_messages (
      id uuid primary key default gen_random_uuid(),
      session_id uuid references public.chat_sessions(id),
      sender_id uuid not null references auth.users(id) on delete cascade,
      message_type text not null default 'text'
        check (message_type in ('text', 'image', 'audio', 'file', 'system')),
      content text,
      media_url text,
      read_at timestamptz,
      account_id uuid not null,
      conversation_id uuid,
      attachment_ids uuid[] not null default array[]::uuid[],
      reply_to_id uuid,
      status text not null default 'sent',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      edited_at timestamptz,
      deleted_at timestamptz
    );
    create table public.chat_conversations (id uuid primary key default gen_random_uuid());
    alter table public.chat_messages
      add constraint chat_messages_conversation_id_fkey
      foreign key (conversation_id) references public.chat_conversations(id) on delete cascade;
    create policy "Chat participants can view messages" on public.chat_messages for select using (true);
    create policy "Chat participants can send messages" on public.chat_messages for insert with check (true);

    create table public.ai_assistant_conversations (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references basejump.accounts(id) on delete cascade,
      created_by uuid not null references auth.users(id) on delete cascade,
      title text not null default 'New conversation',
      mode text not null default 'ask',
      page_ref jsonb not null default '{}'::jsonb,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table public.ai_assistant_messages (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references basejump.accounts(id) on delete cascade,
      conversation_id uuid not null references public.ai_assistant_conversations(id) on delete cascade,
      role text not null,
      content text not null default '',
      tool_call_id text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create table public.ai_runs (
      id uuid primary key,
      account_id uuid not null references basejump.accounts(id) on delete cascade,
      conversation_id uuid not null references public.ai_assistant_conversations(id) on delete cascade,
      created_by uuid not null references auth.users(id) on delete cascade,
      request_id text not null,
      mode text not null,
      provider text not null,
      status text not null default 'running',
      error_code text,
      error_message text,
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      unique(account_id, created_by, request_id)
    );
    create table public.ai_proposals (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references basejump.accounts(id) on delete cascade,
      created_by uuid not null references auth.users(id) on delete cascade,
      conversation_id uuid not null references public.ai_assistant_conversations(id) on delete cascade,
      run_id uuid references public.ai_runs(id) on delete set null,
      kind text not null,
      target_page_id uuid references public.lowcode_pages(id) on delete restrict,
      base_version integer,
      base_schema_hash text,
      base_schema jsonb,
      summary text not null,
      operations jsonb not null default '[]'::jsonb,
      candidate_schema jsonb not null,
      validation_issues jsonb not null default '[]'::jsonb,
      content_hash text not null,
      diff jsonb not null default '[]'::jsonb,
      status text not null default 'draft',
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default (now() + interval '24 hours'),
      applied_at timestamptz
    );

    insert into auth.users (id, email) values ('${userId}', 'ai-smoke@example.test');
    insert into basejump.accounts (id, primary_owner_user_id, name, slug)
      values ('${accountId}', '${userId}', 'AI Smoke', 'ai-smoke');
    insert into public.ai_assistant_conversations (
      id, account_id, created_by, title, created_at, updated_at
    ) values (
      '${temporaryConversationId}', '${accountId}', '${userId}', 'Temporary deployment',
      '2026-08-13 00:00:00+00', '2026-08-13 00:00:00+00'
    );
    insert into public.ai_assistant_messages (
      id, account_id, conversation_id, role, content, created_at
    ) values (
      '${temporaryMessageId}', '${accountId}', '${temporaryConversationId}',
      'user', 'Preserve this message', '2026-08-13 00:01:00+00'
    );
    insert into public.ai_runs (
      id, account_id, conversation_id, created_by, request_id, mode, provider, status
    ) values (
      '${temporaryRunId}', '${accountId}', '${temporaryConversationId}', '${userId}',
      'temporary-request', 'ask', 'mock', 'completed'
    );
    insert into public.ai_proposals (
      id, account_id, created_by, conversation_id, run_id, kind, summary,
      candidate_schema, content_hash, status
    ) values (
      '${temporaryProposalId}', '${accountId}', '${userId}', '${temporaryConversationId}',
      '${temporaryRunId}', 'create_page', 'Preserve this proposal',
      '{"code":"temporary-page"}'::jsonb, 'temporary-hash', 'draft'
    );

    insert into public.entity_design_tables (code, table_name, title)
      values ('courses', 'courses', 'Retired courses');
    insert into public.dynamic_crud_resource_registry (
      resource_name, table_name, config_hash, config
    ) values (
      'trial_bookings', 'public.trial_bookings', 'legacy',
      '{"resource_name":"trial_bookings"}'::jsonb
    );

    comment on table public.chat_messages is
      '{"title":"聊天消息","description":"统一保存课程聊天与账套会话中的文本、媒体、附件、回复和状态，是聊天内容的核心明细表。","relation":[]}' ;
    comment on table public.users is
      '{"title":"用户资料","description":"扩展认证用户的姓名、联系方式、学习目标、线索状态和顾问分配，是应用用户的公开业务档案。","relation":[]}' ;
    `);

    const migration = await readFile(
      resolve(process.cwd(), '..', 'supabase', 'migrations', '20260813150000_ai_assistant.sql'),
      'utf8'
    );
    await client.query(migration);
    const cleanup = await client.query<{
      canonical_conversation: string | null;
      canonical_message: string | null;
      legacy_table_exists: boolean;
      legacy_profile_column_exists: boolean;
      legacy_chat_column_exists: boolean;
      chat_schema_invalid: boolean;
      temporary_tables_exist: boolean;
      temporary_rows_preserved: boolean;
      canonical_foreign_keys: boolean;
      legacy_metadata_exists: boolean;
      legacy_comments_exist: boolean;
    }>(`
    select
      to_regclass('public.ai_conversations')::text as canonical_conversation,
      to_regclass('public.ai_messages')::text as canonical_message,
      to_regclass('public.ai_scenarios') is not null
        or to_regclass('public.chat_sessions') is not null as legacy_table_exists,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'users'
          and column_name in ('english_level', 'learning_goal', 'lead_status')
      ) as legacy_profile_column_exists,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'chat_messages'
          and column_name in ('session_id', 'media_url', 'read_at')
      ) as legacy_chat_column_exists,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'chat_messages'
          and (
            (column_name in ('content', 'conversation_id') and is_nullable = 'YES')
            or (column_name = 'sender_id' and is_nullable = 'NO')
          )
      ) as chat_schema_invalid,
      to_regclass('public.ai_assistant_conversations') is not null
        or to_regclass('public.ai_assistant_messages') is not null as temporary_tables_exist,
      exists (
        select 1
        from public.ai_conversations conversations
        join public.ai_messages messages on messages.conversation_id = conversations.id
        join public.ai_runs runs on runs.conversation_id = conversations.id
        join public.ai_proposals proposals on proposals.conversation_id = conversations.id
        where conversations.id = '${temporaryConversationId}'
          and messages.id = '${temporaryMessageId}'
          and runs.id = '${temporaryRunId}'
          and proposals.id = '${temporaryProposalId}'
      ) as temporary_rows_preserved,
      not exists (
        select 1
        from pg_constraint constraints
        where constraints.contype = 'f'
          and constraints.conrelid in (
            'public.ai_messages'::regclass,
            'public.ai_runs'::regclass,
            'public.ai_proposals'::regclass
          )
          and constraints.confrelid <> 'public.ai_conversations'::regclass
          and constraints.conname like '%conversation%'
      ) as canonical_foreign_keys,
      exists (select 1 from public.entity_design_tables where table_name = 'courses')
        or exists (
          select 1 from public.dynamic_crud_resource_registry
          where resource_name = 'trial_bookings'
        ) as legacy_metadata_exists,
      exists (
        select 1
        from pg_class classes
        join pg_namespace namespaces on namespaces.oid = classes.relnamespace
        where namespaces.nspname = 'public'
          and classes.relname in ('ai_conversations', 'ai_messages', 'chat_messages', 'users')
          and coalesce(obj_description(classes.oid, 'pg_class'), '') ~
            '(AI 练习|口语训练|课程聊天|学习目标|线索状态|顾问分配)'
      ) as legacy_comments_exist
    `);
    assert.deepEqual(cleanup.rows[0], {
      canonical_conversation: 'ai_conversations',
      canonical_message: 'ai_messages',
      legacy_table_exists: false,
      legacy_profile_column_exists: false,
      legacy_chat_column_exists: false,
      chat_schema_invalid: false,
      temporary_tables_exist: false,
      temporary_rows_preserved: true,
      canonical_foreign_keys: true,
      legacy_metadata_exists: false,
      legacy_comments_exist: false
    });
    await client.query(`select set_config('app.test_user_id', $1, true)`, [userId]);

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
