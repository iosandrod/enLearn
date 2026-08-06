-- Unify account-scoped application tables on account_id.
--
-- Existing workflow/chat/notification/print tables used tenant_id text. The
-- active account context is already a basejump account UUID, so keeping a
-- second text column only creates ambiguity and weakens database constraints.

do $$
declare
  policy_record record;
  policy_tables constant text[] := array[
    'wf_model',
    'wf_model_version',
    'wf_process_definition',
    'wf_node_definition',
    'wf_edge_definition',
    'wf_process_instance',
    'wf_node_instance',
    'wf_task',
    'wf_task_candidate',
    'wf_variable',
    'wf_execution_token',
    'wf_history_event',
    'wf_document_binding',
    'wf_comment',
    'wf_cc',
    'wf_job',
    'wf_job_run',
    'wf_timer_job',
    'notification_events',
    'notification_messages',
    'notification_deliveries',
    'notification_preferences',
    'chat_conversations',
    'chat_conversation_members',
    'chat_messages',
    'chat_message_reads',
    'chat_message_reactions',
    'print_logs'
  ];
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(policy_tables)
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

do $$
declare
  scoped_table_name text;
  default_account_id constant uuid := '00000000-0000-4000-8000-000000000001';
  invalid_count bigint;
  account_data_type text;
  scoped_tables constant text[] := array[
    'wf_model',
    'wf_process_definition',
    'wf_process_instance',
    'wf_task',
    'wf_history_event',
    'wf_document_binding',
    'wf_comment',
    'wf_cc',
    'wf_job',
    'wf_job_run',
    'wf_timer_job',
    'notification_events',
    'notification_messages',
    'notification_deliveries',
    'notification_preferences',
    'chat_conversations',
    'chat_conversation_members',
    'chat_messages',
    'chat_message_reads',
    'chat_message_reactions',
    'print_logs'
  ];
begin
  if not exists (
    select 1
    from basejump.accounts
    where id = default_account_id
  ) then
    raise exception 'Default account % does not exist.', default_account_id;
  end if;

  foreach scoped_table_name in array scoped_tables loop
    if to_regclass('public.' || scoped_table_name) is null then
      continue;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where columns.table_schema = 'public'
        and columns.table_name = scoped_table_name
        and columns.column_name = 'tenant_id'
    ) then
      if exists (
        select 1
        from information_schema.columns
        where columns.table_schema = 'public'
          and columns.table_name = scoped_table_name
          and columns.column_name = 'account_id'
      ) then
        raise exception 'Both tenant_id and account_id exist on public.%.', scoped_table_name;
      end if;

      execute format(
        'alter table public.%I rename column tenant_id to account_id',
        scoped_table_name
      );
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where columns.table_schema = 'public'
        and columns.table_name = scoped_table_name
        and columns.column_name = 'account_id'
    ) then
      continue;
    end if;

    select columns.data_type
    into account_data_type
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = scoped_table_name
      and columns.column_name = 'account_id';

    if account_data_type = 'uuid' then
      continue;
    end if;

    if account_data_type <> 'text' then
      raise exception 'Cannot convert public.%.account_id from unsupported type %.',
        scoped_table_name,
        account_data_type;
    end if;

    execute format(
      'update public.%I set account_id = $1 where account_id = $2',
      scoped_table_name
    )
    using default_account_id::text, 'default';

    execute format(
      'select count(*)
       from public.%I
       where account_id is null
          or account_id !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$''',
      scoped_table_name
    )
    into invalid_count;

    if invalid_count > 0 then
      raise exception 'Cannot convert public.%.account_id: % invalid values remain.',
        scoped_table_name,
        invalid_count;
    end if;

    execute format(
      'alter table public.%I alter column account_id drop default',
      scoped_table_name
    );
    execute format(
      'alter table public.%I alter column account_id type uuid using account_id::uuid',
      scoped_table_name
    );
    execute format(
      'alter table public.%I alter column account_id set not null',
      scoped_table_name
    );
  end loop;
end $$;

-- Workflow RLS.
do $$
declare
  workflow_table text;
begin
  foreach workflow_table in array array[
    'wf_model', 'wf_process_definition', 'wf_process_instance', 'wf_task',
    'wf_history_event', 'wf_document_binding', 'wf_comment', 'wf_cc',
    'wf_job', 'wf_job_run', 'wf_timer_job'
  ]
  loop
    if to_regclass('public.' || workflow_table) is not null then
      execute format('alter table public.%I enable row level security', workflow_table);
      execute format(
        'create policy "Account permission holders can manage workflow rows" on public.%I
          for all to authenticated
          using (
            public.has_account_permission(
              account_id,
              case
                when %L in (''wf_model'', ''wf_process_definition'') then ''workflow.definitions.manage''
                when %L in (''wf_comment'', ''wf_cc'') then ''workflow.tasks.manage''
                else ''workflow.runtime.manage''
              end
            )
          )
          with check (
            public.has_account_permission(
              account_id,
              case
                when %L in (''wf_model'', ''wf_process_definition'') then ''workflow.definitions.manage''
                when %L in (''wf_comment'', ''wf_cc'') then ''workflow.tasks.manage''
                else ''workflow.runtime.manage''
              end
            )
          )',
        workflow_table,
        workflow_table,
        workflow_table,
        workflow_table,
        workflow_table
      );
    end if;
  end loop;
end $$;

alter table public.wf_model_version enable row level security;
create policy "Account permission holders can manage workflow model versions"
on public.wf_model_version for all to authenticated
using (
  exists (
    select 1 from public.wf_model models
    where models.id = wf_model_version.model_id
      and public.has_account_permission(models.account_id, 'workflow.definitions.manage')
  )
)
with check (
  exists (
    select 1 from public.wf_model models
    where models.id = wf_model_version.model_id
      and public.has_account_permission(models.account_id, 'workflow.definitions.manage')
  )
);

do $$
declare
  definition_table text;
begin
  foreach definition_table in array array['wf_node_definition', 'wf_edge_definition']
  loop
    if to_regclass('public.' || definition_table) is not null then
      execute format('alter table public.%I enable row level security', definition_table);
      execute format(
        'create policy "Account permission holders can manage workflow definitions" on public.%I
          for all to authenticated
          using (
            exists (
              select 1 from public.wf_process_definition definitions
              where definitions.id = %I.definition_id
                and public.has_account_permission(
                  definitions.account_id,
                  ''workflow.definitions.manage''
                )
            )
          )
          with check (
            exists (
              select 1 from public.wf_process_definition definitions
              where definitions.id = %I.definition_id
                and public.has_account_permission(
                  definitions.account_id,
                  ''workflow.definitions.manage''
                )
            )
          )',
        definition_table,
        definition_table,
        definition_table
      );
    end if;
  end loop;
end $$;

do $$
declare
  runtime_table text;
begin
  foreach runtime_table in array array[
    'wf_node_instance', 'wf_variable', 'wf_execution_token'
  ]
  loop
    if to_regclass('public.' || runtime_table) is not null then
      execute format('alter table public.%I enable row level security', runtime_table);
      execute format(
        'create policy "Account permission holders can manage workflow runtime" on public.%I
          for all to authenticated
          using (
            exists (
              select 1
              from public.wf_process_instance instances
              where instances.id = %I.process_instance_id
                and public.has_account_permission(
                  instances.account_id,
                  ''workflow.runtime.manage''
                )
            )
          )
          with check (
            exists (
              select 1
              from public.wf_process_instance instances
              where instances.id = %I.process_instance_id
                and public.has_account_permission(
                  instances.account_id,
                  ''workflow.runtime.manage''
                )
            )
          )',
        runtime_table,
        runtime_table,
        runtime_table
      );
    end if;
  end loop;
end $$;

alter table public.wf_task_candidate enable row level security;
create policy "Account permission holders can manage workflow runtime"
on public.wf_task_candidate for all to authenticated
using (
  exists (
    select 1
    from public.wf_task tasks
    where tasks.id = wf_task_candidate.task_id
      and public.has_account_permission(tasks.account_id, 'workflow.runtime.manage')
  )
)
with check (
  exists (
    select 1
    from public.wf_task tasks
    where tasks.id = wf_task_candidate.task_id
      and public.has_account_permission(tasks.account_id, 'workflow.runtime.manage')
  )
);

-- Notification RLS.
alter table public.notification_events enable row level security;
alter table public.notification_messages enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_preferences enable row level security;

create policy "Account users can read notification messages"
on public.notification_messages for select to authenticated
using (
  public.is_active_account_member(account_id)
  and (
    recipient_id = auth.uid()
    or public.has_account_permission(account_id, 'notification.messages.manage')
  )
);

create policy "Account users can update notification messages"
on public.notification_messages for update to authenticated
using (
  public.is_active_account_member(account_id)
  and (
    recipient_id = auth.uid()
    or public.has_account_permission(account_id, 'notification.messages.manage')
  )
)
with check (
  public.is_active_account_member(account_id)
  and (
    recipient_id = auth.uid()
    or public.has_account_permission(account_id, 'notification.messages.manage')
  )
);

create policy "Account users can manage notification preferences"
on public.notification_preferences for all to authenticated
using (
  public.is_active_account_member(account_id)
  and (
    user_id = auth.uid()
    or public.has_account_permission(account_id, 'notification.messages.manage')
  )
)
with check (
  public.is_active_account_member(account_id)
  and (
    user_id = auth.uid()
    or public.has_account_permission(account_id, 'notification.messages.manage')
  )
);

create policy "Account permission holders can manage notification events"
on public.notification_events for all to authenticated
using (public.has_account_permission(account_id, 'notification.messages.manage'))
with check (public.has_account_permission(account_id, 'notification.messages.manage'));

create policy "Account permission holders can manage notification deliveries"
on public.notification_deliveries for all to authenticated
using (public.has_account_permission(account_id, 'notification.deliveries.manage'))
with check (public.has_account_permission(account_id, 'notification.deliveries.manage'));

-- Chat RLS.
alter table public.chat_conversations enable row level security;
alter table public.chat_conversation_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_reads enable row level security;
alter table public.chat_message_reactions enable row level security;

create policy "Account users can read joined chat conversations"
on public.chat_conversations for select to authenticated
using (
  public.is_active_account_member(account_id)
  and (
    exists (
      select 1 from public.chat_conversation_members members
      where members.conversation_id = chat_conversations.id
        and members.account_id = chat_conversations.account_id
        and members.user_id = auth.uid()
        and members.status = 'active'
    )
    or public.has_account_permission(account_id, 'chat.manage')
  )
);

create policy "Account users can create chat conversations"
on public.chat_conversations for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_active_account_member(account_id)
);

create policy "Account users can update joined chat conversations"
on public.chat_conversations for update to authenticated
using (
  public.is_active_account_member(account_id)
  and exists (
    select 1 from public.chat_conversation_members members
    where members.conversation_id = chat_conversations.id
      and members.account_id = chat_conversations.account_id
      and members.user_id = auth.uid()
      and members.status = 'active'
  )
)
with check (
  public.is_active_account_member(account_id)
  and exists (
    select 1 from public.chat_conversation_members members
    where members.conversation_id = chat_conversations.id
      and members.account_id = chat_conversations.account_id
      and members.user_id = auth.uid()
      and members.status = 'active'
  )
);

create policy "Account permission holders can manage chat conversations"
on public.chat_conversations for all to authenticated
using (public.has_account_permission(account_id, 'chat.manage'))
with check (public.has_account_permission(account_id, 'chat.manage'));

create policy "Account users can read chat memberships"
on public.chat_conversation_members for select to authenticated
using (
  public.is_active_account_member(account_id)
  and (
    user_id = auth.uid()
    or public.has_account_permission(account_id, 'chat.manage')
  )
);

create policy "Account users can read joined chat messages"
on public.chat_messages for select to authenticated
using (
  public.is_active_account_member(account_id)
  and (
    exists (
      select 1 from public.chat_conversation_members members
      where members.conversation_id = chat_messages.conversation_id
        and members.account_id = chat_messages.account_id
        and members.user_id = auth.uid()
        and members.status = 'active'
    )
    or public.has_account_permission(account_id, 'chat.manage')
  )
);

create policy "Account users can send joined chat messages"
on public.chat_messages for insert to authenticated
with check (
  conversation_id is not null
  and sender_id = auth.uid()
  and public.is_active_account_member(account_id)
  and exists (
    select 1
    from public.chat_conversations conversations
    join public.chat_conversation_members members
      on members.conversation_id = conversations.id
     and members.account_id = conversations.account_id
    where conversations.id = chat_messages.conversation_id
      and conversations.account_id = chat_messages.account_id
      and members.user_id = auth.uid()
      and members.status = 'active'
  )
);

create policy "Account users can update own chat messages"
on public.chat_messages for update to authenticated
using (
  sender_id = auth.uid()
  and public.is_active_account_member(account_id)
  and exists (
    select 1 from public.chat_conversation_members members
    where members.conversation_id = chat_messages.conversation_id
      and members.account_id = chat_messages.account_id
      and members.user_id = auth.uid()
      and members.status = 'active'
  )
)
with check (
  sender_id = auth.uid()
  and public.is_active_account_member(account_id)
  and exists (
    select 1 from public.chat_conversation_members members
    where members.conversation_id = chat_messages.conversation_id
      and members.account_id = chat_messages.account_id
      and members.user_id = auth.uid()
      and members.status = 'active'
  )
);

create policy "Account users can manage own chat reads"
on public.chat_message_reads for all to authenticated
using (
  user_id = auth.uid()
  and public.is_active_account_member(account_id)
)
with check (
  user_id = auth.uid()
  and public.is_active_account_member(account_id)
);

create policy "Account users can manage own chat reactions"
on public.chat_message_reactions for all to authenticated
using (
  user_id = auth.uid()
  and public.is_active_account_member(account_id)
)
with check (
  user_id = auth.uid()
  and public.is_active_account_member(account_id)
);

-- Print RLS.
alter table public.print_logs enable row level security;
create policy "Account permission holders can view print logs"
on public.print_logs for select to authenticated
using (public.has_account_permission(account_id, 'print.logs.view'));

-- Existing low-code metadata may still name the old database field.
update public.admin_entities
set schema = replace(schema::text, '"tenant_id"', '"account_id"')::jsonb
where schema::text like '%tenant_id%';

update public.lowcode_pages
set schema = replace(schema::text, '"tenant_id"', '"account_id"')::jsonb
where schema::text like '%tenant_id%';

update public.lowcode_page_versions
set schema = replace(schema::text, '"tenant_id"', '"account_id"')::jsonb
where schema::text like '%tenant_id%';

drop function if exists public.account_id_from_tenant(text);
drop function if exists public.account_id_from_tenant(uuid);

select pg_notify('pgrst', 'reload schema');
