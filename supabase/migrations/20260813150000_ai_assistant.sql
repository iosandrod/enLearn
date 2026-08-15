-- Account-scoped AI conversations and guarded low-code page proposals.
-- This migration also removes the retired English-training domain that used
-- incompatible versions of ai_conversations, ai_messages, and chat_messages.

do $$
declare
  dependent_record record;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_conversations'
      and column_name = 'user_id'
  ) or exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_messages'
      and column_name = 'audio_url'
  ) then
    -- The legacy AI tables must not own current-module foreign keys. Abort
    -- instead of silently cascading into an unrelated table.
    for dependent_record in
      select
        constraints.conrelid::regclass::text as table_name,
        constraints.conname
      from pg_constraint constraints
      where constraints.contype = 'f'
        and (
          constraints.confrelid = to_regclass('public.ai_conversations')
          or constraints.confrelid = to_regclass('public.ai_messages')
        )
        and constraints.conrelid <>
          coalesce(to_regclass('public.ai_messages')::oid, 0::oid)
        and constraints.conrelid <>
          coalesce(to_regclass('public.speech_assessments')::oid, 0::oid)
    loop
      raise exception
        'Refusing to remove legacy AI tables: %.% still depends on them.',
        dependent_record.table_name,
        dependent_record.conname;
    end loop;

    drop table if exists public.speech_assessments;
    drop table if exists public.ai_messages;
    drop table if exists public.ai_conversations;
  end if;
end $$;

do $$
begin
  if to_regclass('public.chat_messages') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'chat_messages'
         and column_name = 'session_id'
     )
     and not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'chat_messages'
         and column_name = 'account_id'
     ) then
    -- This is the untouched English-training table, not application chat.
    drop table public.chat_messages;
  elsif to_regclass('public.chat_messages') is not null then
    drop policy if exists "Chat participants can view messages" on public.chat_messages;
    drop policy if exists "Chat participants can send messages" on public.chat_messages;

    alter table public.chat_messages
      drop column if exists session_id,
      drop column if exists media_url,
      drop column if exists read_at;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'chat_messages'
        and column_name = 'account_id'
    ) or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'chat_messages'
        and column_name = 'conversation_id'
    ) then
      raise exception 'public.chat_messages has an unsupported non-application schema.';
    end if;

    if exists (
      select 1
      from public.chat_messages
      where conversation_id is null
    ) then
      raise exception
        'Cannot normalize public.chat_messages: current chat rows with a null conversation_id exist.';
    end if;

    update public.chat_messages set content = '' where content is null;
    alter table public.chat_messages alter column content set default '';
    alter table public.chat_messages alter column content set not null;
    alter table public.chat_messages alter column conversation_id set not null;
    alter table public.chat_messages alter column sender_id drop not null;
    alter table public.chat_messages drop constraint if exists chat_messages_message_type_check;
    alter table public.chat_messages
      add constraint chat_messages_message_type_check
      check (message_type in ('text', 'image', 'file', 'system'));
    alter table public.chat_messages drop constraint if exists chat_messages_sender_id_fkey;
    alter table public.chat_messages
      add constraint chat_messages_sender_id_fkey
      foreign key (sender_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- Dependency order is explicit so an unknown current-module dependency aborts
-- the transaction instead of being removed through CASCADE.
drop table if exists public.conversion_records;
drop table if exists public.consultant_tasks;
drop table if exists public.trial_bookings;
drop table if exists public.trial_classes;
drop table if exists public.campuses;
drop table if exists public.chat_sessions;
drop table if exists public.teachers;
drop table if exists public.speech_assessments;
drop table if exists public.lesson_progress;
drop table if exists public.course_enrollments;
drop table if exists public.lessons;
drop table if exists public.course_sections;
drop table if exists public.courses;
drop table if exists public.lead_events;
drop table if exists public.ai_scenarios;

-- Remove metadata imported from the retired English-training relations. The
-- physical tables are gone, so keeping designer rows would continue exposing
-- them as selectable business objects in the current low-code module.
do $$
declare
  legacy_tables constant text[] := array[
    'lead_events', 'courses', 'course_sections', 'lessons',
    'course_enrollments', 'lesson_progress', 'ai_scenarios',
    'speech_assessments', 'teachers', 'chat_sessions', 'campuses',
    'trial_classes', 'trial_bookings', 'consultant_tasks', 'conversion_records'
  ];
begin
  if to_regclass('public.entity_design_tables') is not null then
    delete from public.entity_design_tables
    where schema_name = 'public'
      and table_name = any(legacy_tables);
  end if;

  if to_regclass('public.dynamic_crud_resource_registry') is not null then
    delete from public.dynamic_crud_resource_registry
    where resource_name = any(legacy_tables)
       or regexp_replace(table_name, '^public\.', '') = any(legacy_tables);
  end if;

  if to_regclass('public.admin_entities') is not null then
    delete from public.admin_entities
    where code = any(legacy_tables)
       or regexp_replace(table_name, '^public\.', '') = any(legacy_tables);
  end if;

  if to_regclass('public.lowcode_pages') is not null then
    delete from public.lowcode_pages pages
    where pages.code = any(legacy_tables)
       or regexp_replace(coalesce(pages.table_name, ''), '^public\.', '') = any(legacy_tables)
       or exists (
         select 1
         from unnest(legacy_tables) legacy(table_name)
         where pages.schema::text ilike '%public.' || legacy.table_name || '%'
            or pages.schema::text ilike '%"tableName":"' || legacy.table_name || '"%'
            or pages.schema::text ilike '%"table_name":"' || legacy.table_name || '"%'
       );
  end if;
end $$;

delete from public.admin_user_roles
where role_id in (
  select id from public.admin_roles
  where code in ('consultant_manager', 'teaching_manager')
);
delete from public.admin_role_permissions
where role_id in (
  select id from public.admin_roles
  where code in ('consultant_manager', 'teaching_manager')
);
delete from public.admin_roles
where code in ('consultant_manager', 'teaching_manager');

drop function if exists public.get_admin_user_permission_rows();
create or replace function public.get_admin_user_permission_rows()
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  nickname text,
  legacy_profile_role text,
  updated_at timestamp with time zone,
  app_role_codes text[],
  app_role_names text,
  role_codes text[],
  role_names text,
  permission_codes text[],
  permission_names text,
  permission_count integer,
  account_ids uuid[],
  account_names text,
  account_roles text[],
  account_count integer,
  is_primary_account_owner boolean
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
begin
  if not public.has_app_permission('admin.users.manage') then
    raise exception 'Admin users permission required';
  end if;

  return query
  with role_summary as (
    select
      user_roles.user_id,
      array_agg(distinct roles.code order by roles.code) as role_codes,
      string_agg(distinct roles.name, ', ' order by roles.name) as role_names
    from public.admin_user_roles user_roles
    join public.admin_roles roles on roles.id = user_roles.role_id
    where roles.status = 'active'
    group by user_roles.user_id
  ),
  permission_summary as (
    select
      user_roles.user_id,
      array_agg(distinct permissions.code order by permissions.code) as permission_codes,
      string_agg(distinct permissions.name, ', ' order by permissions.name) as permission_names,
      count(distinct permissions.id)::integer as permission_count
    from public.admin_user_roles user_roles
    join public.admin_roles roles on roles.id = user_roles.role_id
    join public.admin_role_permissions role_permissions on role_permissions.role_id = roles.id
    join public.admin_permissions permissions on permissions.id = role_permissions.permission_id
    where roles.status = 'active'
      and permissions.status = 'active'
    group by user_roles.user_id
  ),
  account_summary as (
    select
      memberships.user_id,
      array_agg(accounts.id order by accounts.created_at asc) as account_ids,
      string_agg(
        coalesce(accounts.name, accounts.slug, accounts.id::text),
        ', ' order by accounts.created_at asc
      ) as account_names,
      array_agg(distinct memberships.account_role::text order by memberships.account_role::text) as account_roles,
      count(*)::integer as account_count,
      bool_or(accounts.primary_owner_user_id = memberships.user_id) as is_primary_account_owner
    from basejump.account_user memberships
    join basejump.accounts accounts on accounts.id = memberships.account_id
    where accounts.personal_account = false
    group by memberships.user_id
  )
  select
    users.id,
    users.id as user_id,
    auth_users.email::text,
    users.full_name,
    users.avatar_url,
    users.phone,
    users.nickname,
    users.role as legacy_profile_role,
    users.updated_at,
    coalesce(role_summary.role_codes, '{}'::text[]) as app_role_codes,
    coalesce(role_summary.role_names, '') as app_role_names,
    coalesce(role_summary.role_codes, '{}'::text[]) as role_codes,
    coalesce(role_summary.role_names, '') as role_names,
    coalesce(permission_summary.permission_codes, '{}'::text[]) as permission_codes,
    coalesce(permission_summary.permission_names, '') as permission_names,
    coalesce(permission_summary.permission_count, 0) as permission_count,
    coalesce(account_summary.account_ids, '{}'::uuid[]) as account_ids,
    coalesce(account_summary.account_names, '') as account_names,
    coalesce(account_summary.account_roles, '{}'::text[]) as account_roles,
    coalesce(account_summary.account_count, 0) as account_count,
    coalesce(account_summary.is_primary_account_owner, false) as is_primary_account_owner
  from public.users users
  left join auth.users auth_users on auth_users.id = users.id
  left join role_summary on role_summary.user_id = users.id
  left join permission_summary on permission_summary.user_id = users.id
  left join account_summary on account_summary.user_id = users.id
  order by users.updated_at desc nulls last, auth_users.created_at desc;
end;
$$;

grant execute on function public.get_admin_user_permission_rows() to authenticated;

alter table public.users
  drop column if exists assigned_consultant_id,
  drop column if exists lead_status,
  drop column if exists source_channel,
  drop column if exists learning_goal,
  drop column if exists english_level,
  drop column if exists city;

alter table public.users
  drop constraint if exists users_role_check;
update public.users set role = 'user' where role <> 'admin';
alter table public.users alter column role set default 'user';
alter table public.users
  add constraint users_role_check check (role in ('user', 'admin'));

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  mode text not null default 'ask'
    check (mode in ('ask', 'create_page', 'edit_page', 'generate_button', 'generate_function')),
  page_ref jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content text not null default '',
  tool_call_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Fold any short-lived ai_assistant_* deployment back into the canonical
-- names before removing those temporary relations.
do $$
declare
  temporary_conversation_count bigint;
  migrated_conversation_count bigint;
  temporary_message_count bigint;
  migrated_message_count bigint;
  dependent_record record;
begin
  if to_regclass('public.ai_conversations') is not null
     and to_regclass('public.ai_assistant_conversations') is not null then
    execute $sql$
      insert into public.ai_conversations (
        id, account_id, created_by, title, mode, page_ref, status, created_at, updated_at
      )
      select id, account_id, created_by, title, mode, page_ref, status, created_at, updated_at
      from public.ai_assistant_conversations
      on conflict (id) do nothing
    $sql$;

    execute 'select count(*) from public.ai_assistant_conversations'
      into temporary_conversation_count;
    execute $sql$
      select count(*)
      from public.ai_assistant_conversations temporary
      join public.ai_conversations canonical on canonical.id = temporary.id
      where canonical.account_id = temporary.account_id
        and canonical.created_by = temporary.created_by
        and canonical.title = temporary.title
        and canonical.mode = temporary.mode
        and canonical.page_ref = temporary.page_ref
        and canonical.status = temporary.status
        and canonical.created_at = temporary.created_at
        and canonical.updated_at = temporary.updated_at
    $sql$ into migrated_conversation_count;
    if migrated_conversation_count <> temporary_conversation_count then
      raise exception
        'Refusing to remove temporary AI conversations: % of % rows were verified.',
        migrated_conversation_count,
        temporary_conversation_count;
    end if;
  end if;

  if to_regclass('public.ai_messages') is not null
     and to_regclass('public.ai_assistant_messages') is not null then
    execute $sql$
      insert into public.ai_messages (
        id, account_id, conversation_id, role, content, tool_call_id, metadata, created_at
      )
      select id, account_id, conversation_id, role, content, tool_call_id, metadata, created_at
      from public.ai_assistant_messages
      on conflict (id) do nothing
    $sql$;

    execute 'select count(*) from public.ai_assistant_messages'
      into temporary_message_count;
    execute $sql$
      select count(*)
      from public.ai_assistant_messages temporary
      join public.ai_messages canonical on canonical.id = temporary.id
      where canonical.account_id = temporary.account_id
        and canonical.conversation_id = temporary.conversation_id
        and canonical.role = temporary.role
        and canonical.content = temporary.content
        and canonical.tool_call_id is not distinct from temporary.tool_call_id
        and canonical.metadata = temporary.metadata
        and canonical.created_at = temporary.created_at
    $sql$ into migrated_message_count;
    if migrated_message_count <> temporary_message_count then
      raise exception
        'Refusing to remove temporary AI messages: % of % rows were verified.',
        migrated_message_count,
        temporary_message_count;
    end if;
  end if;

  for dependent_record in
    select
      constraints.conrelid::regclass::text as table_name,
      constraints.conname
    from pg_constraint constraints
    where constraints.contype = 'f'
      and (
        constraints.confrelid = to_regclass('public.ai_assistant_conversations')
        or constraints.confrelid = to_regclass('public.ai_assistant_messages')
      )
      and constraints.conrelid <>
        coalesce(to_regclass('public.ai_assistant_messages')::oid, 0::oid)
      and constraints.conrelid <>
        coalesce(to_regclass('public.ai_runs')::oid, 0::oid)
      and constraints.conrelid <>
        coalesce(to_regclass('public.ai_proposals')::oid, 0::oid)
  loop
    raise exception
      'Refusing to remove temporary AI tables: %.% still depends on them.',
      dependent_record.table_name,
      dependent_record.conname;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.ai_conversations') is not null
     and not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'ai_conversations'
         and column_name = 'account_id'
     ) then
    raise exception 'public.ai_conversations has an unsupported legacy schema.';
  end if;
  if to_regclass('public.ai_messages') is not null
     and not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'ai_messages'
         and column_name = 'account_id'
     ) then
    raise exception 'public.ai_messages has an unsupported legacy schema.';
  end if;
end $$;

create index if not exists ai_conversations_account_user_updated_idx
  on public.ai_conversations (account_id, created_by, updated_at desc);

create index if not exists ai_conversations_updated_retention_idx
  on public.ai_conversations (updated_at);

drop trigger if exists set_ai_assistant_conversations_updated_at on public.ai_conversations;
drop trigger if exists set_ai_conversations_updated_at on public.ai_conversations;
create trigger set_ai_conversations_updated_at
before update on public.ai_conversations
for each row execute function public.set_updated_at();

create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages (account_id, conversation_id, created_at);

create table if not exists public.ai_runs (
  id uuid primary key,
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  mode text not null
    check (mode in ('ask', 'create_page', 'edit_page', 'generate_button', 'generate_function')),
  provider text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'cancelled')),
  error_code text,
  error_message text,
  started_at timestamp with time zone not null default timezone('utc'::text, now()),
  completed_at timestamp with time zone,
  unique (account_id, created_by, request_id)
);

create table if not exists public.ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  run_id uuid not null references public.ai_runs(id) on delete cascade,
  tool_call_id text not null,
  tool_name text not null,
  arguments jsonb not null default '{}'::jsonb,
  result_summary jsonb,
  status text not null default 'started'
    check (status in ('started', 'completed', 'failed')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  completed_at timestamp with time zone,
  unique (run_id, tool_call_id)
);

create table if not exists public.ai_proposals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  run_id uuid references public.ai_runs(id) on delete set null,
  kind text not null
    check (kind in ('create_page', 'edit_page', 'create_button', 'create_page_function')),
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
  status text not null default 'draft'
    check (status in ('draft', 'validated', 'awaiting_approval', 'applied', 'rejected', 'expired', 'conflicted')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  expires_at timestamp with time zone not null default (timezone('utc'::text, now()) + interval '24 hours'),
  applied_at timestamp with time zone,
  check (
    (kind = 'create_page' and target_page_id is null and base_version is null)
    or
    (kind <> 'create_page' and target_page_id is not null and base_version is not null and base_schema_hash is not null)
  )
);

create index if not exists ai_proposals_account_user_created_idx
  on public.ai_proposals (account_id, created_by, created_at desc);

create index if not exists ai_runs_started_retention_idx
  on public.ai_runs (started_at);

create index if not exists ai_proposals_expires_status_idx
  on public.ai_proposals (expires_at, status);

create table if not exists public.ai_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  proposal_id uuid references public.ai_proposals(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Rebuild conversation foreign keys because a short-lived deployment may
-- still point these current tables at the temporary conversation relation.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.ai_messages'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.ai_messages'::regclass and attname = 'conversation_id')
      ]::smallint[]
  loop
    execute format('alter table public.ai_messages drop constraint %I', constraint_name);
  end loop;
  alter table public.ai_messages
    add constraint ai_messages_conversation_id_fkey
    foreign key (conversation_id) references public.ai_conversations(id) on delete cascade;

  if to_regclass('public.ai_runs') is not null then
    for constraint_name in
      select conname from pg_constraint
      where conrelid = 'public.ai_runs'::regclass
        and contype = 'f'
        and conkey = array[
          (select attnum from pg_attribute
           where attrelid = 'public.ai_runs'::regclass and attname = 'conversation_id')
        ]::smallint[]
    loop
      execute format('alter table public.ai_runs drop constraint %I', constraint_name);
    end loop;
    alter table public.ai_runs
      add constraint ai_runs_conversation_id_fkey
      foreign key (conversation_id) references public.ai_conversations(id) on delete cascade;
  end if;

  if to_regclass('public.ai_proposals') is not null then
    for constraint_name in
      select conname from pg_constraint
      where conrelid = 'public.ai_proposals'::regclass
        and contype = 'f'
        and conkey = array[
          (select attnum from pg_attribute
           where attrelid = 'public.ai_proposals'::regclass and attname = 'conversation_id')
        ]::smallint[]
    loop
      execute format('alter table public.ai_proposals drop constraint %I', constraint_name);
    end loop;
    alter table public.ai_proposals
      add constraint ai_proposals_conversation_id_fkey
      foreign key (conversation_id) references public.ai_conversations(id) on delete cascade;
  end if;
end $$;

drop table if exists public.ai_assistant_messages;
drop table if exists public.ai_assistant_conversations;

-- Refresh descriptions that may have been written while these table names
-- still belonged to the retired training module.
do $$
declare
  table_record record;
  title text;
  description text;
  relations jsonb;
begin
  for table_record in
    select classes.oid, classes.relname
    from pg_class classes
    join pg_namespace namespaces on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'public'
      and classes.relname in ('ai_conversations', 'ai_messages', 'chat_messages', 'users')
  loop
    select
      case table_record.relname
        when 'ai_conversations' then 'AI 助手会话'
        when 'ai_messages' then 'AI 助手消息'
        when 'chat_messages' then '聊天消息'
        when 'users' then '用户资料'
      end,
      case table_record.relname
        when 'ai_conversations' then '记录账套内用户与 AI 助手的页面问答和页面生成会话上下文。'
        when 'ai_messages' then '保存 AI 助手会话中的用户、助手、系统及工具消息。'
        when 'chat_messages' then '统一保存账套会话中的文本、附件、回复和状态，是聊天内容的核心明细表。'
        when 'users' then '扩展认证用户的姓名、联系方式和应用角色，是应用用户的公开资料。'
      end
    into title, description;

    select coalesce(jsonb_agg(relation order by relation->>'table', relation->>'type'), '[]'::jsonb)
    into relations
    from (
      select jsonb_build_object(
        'table', target_namespace.nspname || '.' || target_class.relname,
        'type', 'references',
        'localColumns', (
          select jsonb_agg(local_attribute.attname order by local_key.ordinality)
          from unnest(constraint_record.conkey) with ordinality local_key(attnum, ordinality)
          join pg_attribute local_attribute
            on local_attribute.attrelid = constraint_record.conrelid
           and local_attribute.attnum = local_key.attnum
        ),
        'relatedColumns', (
          select jsonb_agg(target_attribute.attname order by target_key.ordinality)
          from unnest(constraint_record.confkey) with ordinality target_key(attnum, ordinality)
          join pg_attribute target_attribute
            on target_attribute.attrelid = constraint_record.confrelid
           and target_attribute.attnum = target_key.attnum
        ),
        'constraint', constraint_record.conname,
        'onDelete', case constraint_record.confdeltype
          when 'c' then 'CASCADE'
          when 'r' then 'RESTRICT'
          when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT'
          else 'NO ACTION'
        end
      ) as relation
      from pg_constraint constraint_record
      join pg_class target_class on target_class.oid = constraint_record.confrelid
      join pg_namespace target_namespace on target_namespace.oid = target_class.relnamespace
      where constraint_record.contype = 'f'
        and constraint_record.conrelid = table_record.oid

      union all

      select jsonb_build_object(
        'table', source_namespace.nspname || '.' || source_class.relname,
        'type', 'referenced_by',
        'localColumns', (
          select jsonb_agg(local_attribute.attname order by local_key.ordinality)
          from unnest(constraint_record.confkey) with ordinality local_key(attnum, ordinality)
          join pg_attribute local_attribute
            on local_attribute.attrelid = constraint_record.confrelid
           and local_attribute.attnum = local_key.attnum
        ),
        'relatedColumns', (
          select jsonb_agg(source_attribute.attname order by source_key.ordinality)
          from unnest(constraint_record.conkey) with ordinality source_key(attnum, ordinality)
          join pg_attribute source_attribute
            on source_attribute.attrelid = constraint_record.conrelid
           and source_attribute.attnum = source_key.attnum
        ),
        'constraint', constraint_record.conname,
        'onDelete', case constraint_record.confdeltype
          when 'c' then 'CASCADE'
          when 'r' then 'RESTRICT'
          when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT'
          else 'NO ACTION'
        end
      ) as relation
      from pg_constraint constraint_record
      join pg_class source_class on source_class.oid = constraint_record.conrelid
      join pg_namespace source_namespace on source_namespace.oid = source_class.relnamespace
      where constraint_record.contype = 'f'
        and constraint_record.confrelid = table_record.oid
    ) relation_rows;

    execute format(
      'comment on table public.%I is %L',
      table_record.relname,
      jsonb_build_object(
        'title', title,
        'description', description,
        'relation', relations
      )::text
    );
  end loop;
end $$;

grant select, insert, update on public.ai_conversations to authenticated, service_role;
grant select, insert on public.ai_messages to authenticated, service_role;
grant select, insert, update on public.ai_runs to authenticated, service_role;
grant select, insert, update on public.ai_tool_calls to authenticated, service_role;
grant select, insert, update on public.ai_proposals to authenticated, service_role;
grant select, insert on public.ai_audit_events to authenticated, service_role;

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_runs enable row level security;
alter table public.ai_tool_calls enable row level security;
alter table public.ai_proposals enable row level security;
alter table public.ai_audit_events enable row level security;

drop policy if exists "Account users can manage own AI conversations" on public.ai_conversations;
create policy "Account users can manage own AI conversations"
on public.ai_conversations for all to authenticated
using (
  created_by = auth.uid()
  and public.is_active_account_member(account_id)
  and public.has_account_permission(account_id, 'ai.assistant.use')
)
with check (
  created_by = auth.uid()
  and public.is_active_account_member(account_id)
  and public.has_account_permission(account_id, 'ai.assistant.use')
);

drop policy if exists "Account users can manage own AI messages" on public.ai_messages;
create policy "Account users can manage own AI messages"
on public.ai_messages for all to authenticated
using (
  public.is_active_account_member(account_id)
  and public.has_account_permission(account_id, 'ai.assistant.use')
  and exists (
    select 1 from public.ai_conversations conversations
    where conversations.id = ai_messages.conversation_id
      and conversations.account_id = ai_messages.account_id
      and conversations.created_by = auth.uid()
  )
)
with check (
  public.is_active_account_member(account_id)
  and public.has_account_permission(account_id, 'ai.assistant.use')
  and exists (
    select 1 from public.ai_conversations conversations
    where conversations.id = ai_messages.conversation_id
      and conversations.account_id = ai_messages.account_id
      and conversations.created_by = auth.uid()
  )
);

drop policy if exists "Account users can read own AI runs" on public.ai_runs;
create policy "Account users can read own AI runs"
on public.ai_runs for select to authenticated
using (
  created_by = auth.uid()
  and public.is_active_account_member(account_id)
  and public.has_account_permission(account_id, 'ai.assistant.use')
);

drop policy if exists "Account users can read own AI tool calls" on public.ai_tool_calls;
create policy "Account users can read own AI tool calls"
on public.ai_tool_calls for select to authenticated
using (
  public.is_active_account_member(account_id)
  and exists (
    select 1 from public.ai_runs runs
    where runs.id = ai_tool_calls.run_id
      and runs.account_id = ai_tool_calls.account_id
      and runs.created_by = auth.uid()
  )
);

drop policy if exists "Account users can read own AI proposals" on public.ai_proposals;
create policy "Account users can read own AI proposals"
on public.ai_proposals for select to authenticated
using (
  created_by = auth.uid()
  and public.is_active_account_member(account_id)
  and public.has_account_permission(account_id, 'ai.assistant.use')
);

drop policy if exists "Account users can read own AI audit" on public.ai_audit_events;
create policy "Account users can read own AI audit"
on public.ai_audit_events for select to authenticated
using (
  user_id = auth.uid()
  and public.is_active_account_member(account_id)
);

insert into public.admin_permissions (
  code, name, description, resource_type, resource_key, action_code, status, sort_order
) values
  ('ai.assistant.use', 'Use AI Assistant', 'Use the account-scoped AI assistant.', 'api', 'ai', 'use', 'active', 710),
  ('ai.page.propose', 'Propose AI Page Changes', 'Create low-code page proposals with AI.', 'action', 'ai_page', 'propose', 'active', 720),
  ('ai.page.apply', 'Apply AI Page Changes', 'Approve and atomically apply validated AI page proposals.', 'action', 'ai_page', 'apply', 'active', 730),
  ('ai.config.manage', 'Manage AI Configuration', 'Manage AI provider configuration without exposing secrets.', 'entity', 'ai_config', 'manage', 'active', 740)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  resource_key = excluded.resource_key,
  action_code = excluded.action_code,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions on permissions.code in (
  'ai.assistant.use', 'ai.page.propose', 'ai.page.apply', 'ai.config.manage'
)
where roles.code = 'system_admin'
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select existing.role_id, ai_permission.id
from public.admin_role_permissions existing
join public.admin_permissions lowcode_permission
  on lowcode_permission.id = existing.permission_id
 and lowcode_permission.code = 'lowcode.pages.manage'
cross join public.admin_permissions ai_permission
where ai_permission.code = 'ai.page.propose'
on conflict do nothing;

create or replace function public.apply_ai_page_proposal(
  p_proposal_id uuid,
  p_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_proposal public.ai_proposals%rowtype;
  v_page public.lowcode_pages%rowtype;
  v_next_version integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  select * into v_proposal
  from public.ai_proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'AI proposal was not found.' using errcode = 'P0002';
  end if;
  if v_proposal.account_id is null
     or not public.is_active_account_member(v_proposal.account_id)
     or v_proposal.created_by <> (select auth.uid()) then
    raise exception 'AI proposal does not belong to the active account and user.' using errcode = '42501';
  end if;
  if not public.has_account_permission(v_proposal.account_id, 'ai.page.apply')
     or not public.has_account_permission(v_proposal.account_id, 'lowcode.pages.manage') then
    raise exception 'AI page apply permission required.' using errcode = '42501';
  end if;
  if v_proposal.status not in ('validated', 'awaiting_approval') then
    raise exception 'Proposal cannot be applied from status "%".', v_proposal.status using errcode = '40001';
  end if;
  if nullif(pg_catalog.btrim(p_content_hash), '') is null
     or v_proposal.content_hash <> p_content_hash then
    raise exception 'Proposal content no longer matches the validated server candidate.'
      using errcode = '40001';
  end if;
  if v_proposal.expires_at <= timezone('utc'::text, now()) then
    update public.ai_proposals set status = 'expired' where id = v_proposal.id;
    return jsonb_build_object('conflict', true, 'status', 'expired', 'message', 'Proposal has expired.');
  end if;
  if jsonb_path_exists(v_proposal.validation_issues, '$[*] ? (@.level == "error")') then
    raise exception 'Proposal has validation errors.' using errcode = '22023';
  end if;

  if v_proposal.kind = 'create_page' then
    if nullif(v_proposal.candidate_schema->>'code', '') is null
       or nullif(v_proposal.candidate_schema->>'route', '') is null
       or nullif(v_proposal.candidate_schema->>'title', '') is null then
      raise exception 'Candidate page requires code, route, and title.' using errcode = '22023';
    end if;
    if coalesce(v_proposal.candidate_schema->>'layout', 'dashboard') not in ('default', 'dashboard', 'blank')
       or coalesce(v_proposal.candidate_schema->>'status', 'draft') not in ('draft', 'published', 'archived')
       or coalesce(v_proposal.candidate_schema->>'pageType', 'custom') not in ('list', 'edit', 'detail', 'custom') then
      raise exception 'Candidate page metadata is invalid.' using errcode = '22023';
    end if;
    insert into public.lowcode_pages (
      code, route, title, description, layout, status, keep_alive, page_type,
      view_name, table_name, schema, version, created_by, updated_by, published_at
    ) values (
      v_proposal.candidate_schema->>'code',
      v_proposal.candidate_schema->>'route',
      v_proposal.candidate_schema->>'title',
      nullif(v_proposal.candidate_schema->>'description', ''),
      coalesce(v_proposal.candidate_schema->>'layout', 'dashboard'),
      coalesce(v_proposal.candidate_schema->>'status', 'draft'),
      coalesce((v_proposal.candidate_schema->>'keepAlive')::boolean, true),
      coalesce(v_proposal.candidate_schema->>'pageType', 'custom'),
      nullif(v_proposal.candidate_schema->>'viewName', ''),
      nullif(pg_catalog.regexp_replace(
        coalesce((
          select coalesce(source.value->>'tableName', source.value#>>'{postData,tableName}')
          from pg_catalog.jsonb_each(
            coalesce(v_proposal.candidate_schema->'dataSources', '{}'::jsonb)
          ) source
          where nullif(coalesce(source.value->>'tableName', source.value#>>'{postData,tableName}'), '') is not null
          limit 1
        ), ''),
        '^public\.', '', 'i'
      ), ''),
      v_proposal.candidate_schema,
      1,
      (select auth.uid()),
      (select auth.uid()),
      case when v_proposal.candidate_schema->>'status' = 'published'
        then timezone('utc'::text, now()) else null end
    ) returning * into v_page;
    v_next_version := 1;
  else
    select * into v_page
    from public.lowcode_pages
    where id = v_proposal.target_page_id
    for update;
    if not found then
      update public.ai_proposals set status = 'conflicted' where id = v_proposal.id;
      return jsonb_build_object('conflict', true, 'status', 'conflicted', 'message', 'Target page no longer exists.');
    end if;
    if v_page.version <> v_proposal.base_version
       or v_page.schema is distinct from v_proposal.base_schema then
      update public.ai_proposals set status = 'conflicted' where id = v_proposal.id;
      return jsonb_build_object('conflict', true, 'status', 'conflicted', 'message', 'Page changed after the proposal was created.');
    end if;
    if nullif(v_proposal.candidate_schema->>'code', '') is null
       or nullif(v_proposal.candidate_schema->>'route', '') is null
       or nullif(v_proposal.candidate_schema->>'title', '') is null then
      raise exception 'Candidate page requires code, route, and title.' using errcode = '22023';
    end if;
    if coalesce(v_proposal.candidate_schema->>'layout', 'dashboard') not in ('default', 'dashboard', 'blank')
       or coalesce(v_proposal.candidate_schema->>'status', 'draft') not in ('draft', 'published', 'archived')
       or coalesce(v_proposal.candidate_schema->>'pageType', 'custom') not in ('list', 'edit', 'detail', 'custom') then
      raise exception 'Candidate page metadata is invalid.' using errcode = '22023';
    end if;
    v_next_version := v_page.version + 1;
    update public.lowcode_pages set
      code = v_proposal.candidate_schema->>'code',
      route = v_proposal.candidate_schema->>'route',
      title = v_proposal.candidate_schema->>'title',
      description = nullif(v_proposal.candidate_schema->>'description', ''),
      layout = coalesce(v_proposal.candidate_schema->>'layout', 'dashboard'),
      status = coalesce(v_proposal.candidate_schema->>'status', 'draft'),
      keep_alive = coalesce((v_proposal.candidate_schema->>'keepAlive')::boolean, true),
      page_type = coalesce(v_proposal.candidate_schema->>'pageType', 'custom'),
      schema = v_proposal.candidate_schema,
      version = v_next_version,
      updated_by = (select auth.uid()),
      published_at = case
        when v_proposal.candidate_schema->>'status' = 'published'
          then coalesce(v_page.published_at, timezone('utc'::text, now()))
        else v_page.published_at
      end
    where id = v_page.id
    returning * into v_page;
  end if;

  insert into public.lowcode_page_versions (
    page_id, version, schema, created_by, published_at
  ) values (
    v_page.id, v_next_version, v_page.schema, (select auth.uid()), v_page.published_at
  ) on conflict (page_id, version) do nothing;

  update public.ai_proposals
  set status = 'applied', applied_at = timezone('utc'::text, now())
  where id = v_proposal.id;

  insert into public.ai_audit_events (
    account_id, user_id, proposal_id, event_type, payload
  ) values (
    v_proposal.account_id,
    (select auth.uid()),
    v_proposal.id,
    'proposal.applied',
    jsonb_build_object(
      'pageId', v_page.id,
      'pageCode', v_page.code,
      'version', v_page.version,
      'globalPageChange', true
    )
  );

  return jsonb_build_object(
    'id', v_page.id,
    'code', v_page.code,
    'route', v_page.route,
    'title', v_page.title,
    'version', v_page.version,
    'status', v_page.status,
    'globalPageChange', true
  );
exception
  when unique_violation then
    update public.ai_proposals set status = 'conflicted' where id = p_proposal_id;
    return jsonb_build_object('conflict', true, 'status', 'conflicted', 'message', 'Page code or route already exists.');
end;
$$;

revoke all on function public.apply_ai_page_proposal(uuid, text) from public;
grant execute on function public.apply_ai_page_proposal(uuid, text) to authenticated;

create or replace function public.cleanup_ai_assistant_data(
  p_conversation_retention interval default interval '90 days',
  p_audit_retention interval default interval '365 days'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_conversations integer := 0;
  v_audit_events integer := 0;
begin
  if pg_catalog.current_user not in ('postgres', 'service_role') then
    raise exception 'AI retention cleanup requires a service role.' using errcode = '42501';
  end if;
  if p_conversation_retention < interval '7 days'
     or p_audit_retention < interval '30 days' then
    raise exception 'AI retention windows are below the allowed minimum.' using errcode = '22023';
  end if;

  update public.ai_proposals
  set status = 'expired'
  where status in ('draft', 'validated', 'awaiting_approval')
    and expires_at <= timezone('utc'::text, now());

  delete from public.ai_conversations
  where updated_at < timezone('utc'::text, now()) - p_conversation_retention;
  get diagnostics v_conversations = row_count;

  delete from public.ai_audit_events
  where created_at < timezone('utc'::text, now()) - p_audit_retention;
  get diagnostics v_audit_events = row_count;

  return jsonb_build_object(
    'deletedConversations', v_conversations,
    'deletedAuditEvents', v_audit_events
  );
end;
$$;

revoke all on function public.cleanup_ai_assistant_data(interval, interval) from public;
grant execute on function public.cleanup_ai_assistant_data(interval, interval) to service_role;

notify pgrst, 'reload schema';
