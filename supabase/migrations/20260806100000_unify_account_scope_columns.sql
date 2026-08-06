-- Unify account-scoped application tables on account_id.
--
-- Existing workflow/chat/notification/print tables used tenant_id text. The
-- active account context is already a basejump account UUID, so keeping a
-- second text column only creates ambiguity and weakens database constraints.

-- The account-set RLS migration created policies while these columns were
-- text. Define the UUID overload before the type change so renamed policy
-- expressions remain valid throughout the migration.
create or replace function public.account_id_from_tenant(account_id uuid)
returns uuid
language sql
stable
as $$
  select account_id;
$$;

grant execute on function public.account_id_from_tenant(uuid) to authenticated, service_role;

do $$
declare
  table_name text;
  default_account_id constant uuid := '00000000-0000-4000-8000-000000000001';
  invalid_count bigint;
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

  foreach table_name in array scoped_tables loop
    if to_regclass('public.' || table_name) is null then
      continue;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where columns.table_schema = 'public'
        and columns.table_name = table_name
        and columns.column_name = 'tenant_id'
    ) then
      if exists (
        select 1
        from information_schema.columns
        where columns.table_schema = 'public'
          and columns.table_name = table_name
          and columns.column_name = 'account_id'
      ) then
        raise exception 'Both tenant_id and account_id exist on public.%.', table_name;
      end if;

      execute format(
        'alter table public.%I rename column tenant_id to account_id',
        table_name
      );
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where columns.table_schema = 'public'
        and columns.table_name = table_name
        and columns.column_name = 'account_id'
    ) then
      continue;
    end if;

    execute format(
      'update public.%I set account_id = $1 where account_id = $2',
      table_name
    )
    using default_account_id::text, 'default';

    execute format(
      'select count(*)
       from public.%I
       where account_id is null
          or account_id !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$''',
      table_name
    )
    into invalid_count;

    if invalid_count > 0 then
      raise exception 'Cannot convert public.%.account_id: % invalid values remain.',
        table_name,
        invalid_count;
    end if;

    execute format(
      'alter table public.%I alter column account_id drop default',
      table_name
    );
    execute format(
      'alter table public.%I alter column account_id type uuid using account_id::uuid',
      table_name
    );
    execute format(
      'alter table public.%I alter column account_id set not null',
      table_name
    );
  end loop;
end $$;

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

select pg_notify('pgrst', 'reload schema');
