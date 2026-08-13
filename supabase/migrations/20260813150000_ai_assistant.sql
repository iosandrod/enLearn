-- Account-scoped AI conversations and guarded low-code page proposals.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null default '新对话',
  mode text not null default 'ask'
    check (mode in ('ask', 'create_page', 'edit_page', 'generate_button', 'generate_function')),
  page_ref jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists ai_conversations_account_user_updated_idx
  on public.ai_conversations (account_id, created_by, updated_at desc);

create index if not exists ai_conversations_updated_retention_idx
  on public.ai_conversations (updated_at);

drop trigger if exists set_ai_conversations_updated_at on public.ai_conversations;
create trigger set_ai_conversations_updated_at
before update on public.ai_conversations
for each row execute function public.set_updated_at();

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
