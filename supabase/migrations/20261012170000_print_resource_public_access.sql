begin;

-- Reuse application roles for premium access; no subscription table or API.
insert into public.admin_permissions (code, name, resource_type, resource_key, action_code, status)
values
  ('print.resources.pro', 'Read Pro print resources', 'entity', 'print_resources', 'read', 'active'),
  ('print.resources.enterprise', 'Read Enterprise print resources', 'entity', 'print_resources', 'read', 'active')
on conflict (code) do nothing;

-- Ownership is never inferred from a caller-provided field. Shared resources
-- have user_id=NULL and must explicitly opt into public/authenticated/account.
create or replace function public.can_read_print_resource(
  p_user_id uuid, p_visibility text, p_access_level text,
  p_account_id uuid, p_enabled boolean
) returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $function$
  select coalesce(
    (auth.uid() is not null and p_user_id = auth.uid())
    or (
      p_user_id is null and p_enabled and (
        (p_visibility = 'public' and p_access_level = 'free')
        or (
          auth.uid() is not null
          and (
            p_visibility in ('public', 'authenticated')
            or (p_visibility = 'account' and public.is_active_account_member(p_account_id))
          )
          and (
            p_access_level = 'free'
            or (
              p_access_level in ('pro', 'enterprise')
              and (
                public.has_app_permission('print.resources.enterprise')
                or (p_access_level = 'pro' and public.has_app_permission('print.resources.pro'))
                or (
                  p_account_id is not null and public.is_active_account_member(p_account_id)
                  and (
                    public.has_account_permission(p_account_id, 'print.resources.enterprise')
                    or (p_access_level = 'pro' and public.has_account_permission(p_account_id, 'print.resources.pro'))
                  )
                )
              )
            )
          )
        )
      )
    ), false
  );
$function$;
revoke all on function public.can_read_print_resource(uuid, text, text, uuid, boolean) from public;
grant execute on function public.can_read_print_resource(uuid, text, text, uuid, boolean) to anon, authenticated;

-- Expressions are conditional because older installations use out-of-tree
-- migrations to create the table. No unrelated schema is recreated here.
do $resources$
declare
  resource_table text;
  active_expression text;
  operation text;
begin
  foreach resource_table in array array['print_templates', 'print_expressions', 'print_datasource_script'] loop
    if to_regclass('public.' || resource_table) is null then
      continue;
    end if;
    execute format('alter table public.%I
      add column if not exists user_id uuid default auth.uid(),
      add column if not exists visibility text not null default ''private'',
      add column if not exists access_level text not null default ''free'',
      add column if not exists account_id uuid references basejump.accounts(id)', resource_table);
    if resource_table = 'print_datasource_script' then
      execute 'alter table public.print_datasource_script alter column user_id drop not null';
    else
      -- Preserve existing personal assets rather than publishing legacy rows.
      execute format('update public.%I set user_id = created_by
        where user_id is null and created_by is not null and visibility = ''private''', resource_table);
    end if;
    -- Rows without an owner are the existing platform catalog. Publish those
    -- as the initial free guest resources; future rows still default private.
    execute format('update public.%I set visibility = ''public''
      where user_id is null and visibility = ''private''', resource_table);
    if not exists (select 1 from pg_constraint where conrelid = to_regclass('public.' || resource_table)
      and conname = resource_table || '_visibility_check') then
      execute format('alter table public.%I add constraint %I
        check (visibility in (''public'', ''authenticated'', ''account'', ''private''))',
        resource_table, resource_table || '_visibility_check');
    end if;
    if not exists (select 1 from pg_constraint where conrelid = to_regclass('public.' || resource_table)
      and conname = resource_table || '_access_level_check') then
      execute format('alter table public.%I add constraint %I
        check (access_level in (''free'', ''pro'', ''enterprise''))',
        resource_table, resource_table || '_access_level_check');
    end if;
    execute format('create index if not exists %I on public.%I (visibility, access_level, account_id)',
      resource_table || '_resource_access_idx', resource_table);
    execute format('alter table public.%I enable row level security', resource_table);
    active_expression := case when resource_table = 'print_templates' then 'status = ''active''' else 'enabled' end;
    -- Restrictive SELECT prevents old permissive management policies from
    -- exposing another user's assets, private platform assets or premium rows.
    execute format('drop policy if exists print_resource_read on public.%I', resource_table);
    execute format('create policy print_resource_read on public.%I for select to anon, authenticated
      using (public.can_read_print_resource(user_id, visibility, access_level, account_id, %s))',
      resource_table, active_expression);
    execute format('drop policy if exists print_resource_read_boundary on public.%I', resource_table);
    execute format('create policy print_resource_read_boundary on public.%I as restrictive for select to anon, authenticated
      using (public.can_read_print_resource(user_id, visibility, access_level, account_id, %s))',
      resource_table, active_expression);
    -- Existing broad management roles must not edit or transfer shared/foreign
    -- rows. Platform publishing remains a trusted service-role operation.
    foreach operation in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', 'print_resource_owner_' || operation, resource_table);
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
        'print_resource_owner_' || operation, resource_table, operation,
        case operation
          when 'insert' then 'with check (user_id = auth.uid())'
          when 'delete' then 'using (user_id = auth.uid())'
          else 'using (user_id = auth.uid()) with check (user_id = auth.uid())'
        end);
    end loop;
    execute format('drop policy if exists print_resource_owner_write on public.%I', resource_table);
    execute format('create policy print_resource_owner_write on public.%I for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid())', resource_table);
    if resource_table <> 'print_datasource_script' then
      execute format('grant select, insert, update, delete on public.%I to authenticated', resource_table);
      execute format('grant select on public.%I to anon', resource_table);
    end if;
  end loop;
end
$resources$;

create unique index if not exists print_datasource_script_public_code_idx
  on public.print_datasource_script(code) where user_id is null;
-- Catalog columns only. Management uses the existing print service with its
-- service-role client; scripts and database connection details stay private.
revoke select on public.print_datasource_script from public, anon, authenticated;
grant select (id, code, name, schema, enabled, version, user_id,
  visibility, access_level, account_id, updated_at)
  on public.print_datasource_script to anon, authenticated;

-- The designer's actual print data-source definitions live in this existing
-- table. Only datasource.* rows adopt print resource access; other forms retain
-- their existing read/write policies and the anonymous system-form read.
alter table public.lowcode_form_definitions
  add column if not exists visibility text not null default 'private'
    check (visibility in ('public', 'authenticated', 'account', 'private')),
  add column if not exists access_level text not null default 'free'
    check (access_level in ('free', 'pro', 'enterprise')),
  add column if not exists account_id uuid references basejump.accounts(id);
update public.lowcode_form_definitions set user_id = created_by
  where code like 'print-designer.datasource.%' and user_id is null
    and created_by is not null and visibility = 'private';
update public.lowcode_form_definitions set visibility = 'public'
  where code like 'print-designer.datasource.%'
    and user_id is null and visibility = 'private';
create index if not exists lowcode_form_definitions_print_access_idx
  on public.lowcode_form_definitions(visibility, access_level, account_id)
  where code like 'print-designer.datasource.%';
grant select on public.lowcode_form_definitions to anon;
drop policy if exists print_form_guest_read on public.lowcode_form_definitions;
create policy print_form_guest_read on public.lowcode_form_definitions for select to anon
  using (user_id is null and enabled and (
    code not like 'print-designer.datasource.%'
    or public.can_read_print_resource(user_id, visibility, access_level, account_id, enabled)
  ));
drop policy if exists print_form_read_boundary on public.lowcode_form_definitions;
create policy print_form_read_boundary on public.lowcode_form_definitions as restrictive for select to anon, authenticated
  using (code not like 'print-designer.datasource.%'
    or public.can_read_print_resource(user_id, visibility, access_level, account_id, enabled));
drop policy if exists print_form_scoped_read on public.lowcode_form_definitions;
create policy print_form_scoped_read on public.lowcode_form_definitions for select to authenticated
  using (code like 'print-designer.datasource.%'
    and public.can_read_print_resource(user_id, visibility, access_level, account_id, enabled));
drop policy if exists print_form_owner_write on public.lowcode_form_definitions;
create policy print_form_owner_write on public.lowcode_form_definitions for all to authenticated
  using (code like 'print-designer.datasource.%' and user_id = auth.uid())
  with check (code like 'print-designer.datasource.%' and user_id = auth.uid());
do $form_writes$
declare operation text;
begin
  foreach operation in array array['insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.lowcode_form_definitions', 'print_form_owner_' || operation);
    execute format('create policy %I on public.lowcode_form_definitions as restrictive for %s to authenticated %s',
      'print_form_owner_' || operation, operation,
      case operation
        when 'insert' then 'with check (code not like ''print-designer.datasource.%'' or user_id = auth.uid())'
        when 'delete' then 'using (code not like ''print-designer.datasource.%'' or user_id = auth.uid())'
        else 'using (code not like ''print-designer.datasource.%'' or user_id = auth.uid())
          with check (code not like ''print-designer.datasource.%'' or user_id = auth.uid())'
      end);
  end loop;
  if to_regclass('public.print_data_source_form_definition_options') is not null then
    execute 'alter view public.print_data_source_form_definition_options set (security_invoker = true)';
    execute 'grant select on public.print_data_source_form_definition_options to anon, authenticated';
  end if;
end
$form_writes$;

-- Extend existing resource metadata; preserve all unrelated hooks and fields.
do $metadata$
declare
  resource_table text;
  resource_select text;
  guest_filters jsonb;
  guest_max integer;
begin
  foreach resource_table in array array['print_templates', 'print_expressions', 'print_datasource_script', 'lowcode_form_definitions'] loop
    if to_regclass('public.' || resource_table) is null then continue; end if;
    resource_select := case resource_table
      when 'print_templates' then 'id,name,content,workspace,preview,status,version,metadata,user_id,visibility,access_level,account_id,updated_at'
      when 'print_expressions' then 'id,name,code,description,purpose,template_id,template_type,expression_source,enabled,user_id,visibility,access_level,account_id,updated_at'
      when 'print_datasource_script' then 'id,code,name,schema,enabled,version,user_id,visibility,access_level,account_id,updated_at'
      else 'id,code,name,description,schema,enabled,table_name,user_id,visibility,access_level,account_id,updated_at'
    end;
    guest_filters := case resource_table
      when 'print_templates' then '{"visibility":"public","access_level":"free","status":"active"}'::jsonb
      when 'lowcode_form_definitions' then '{"enabled":true}'::jsonb
      else '{"visibility":"public","access_level":"free","enabled":true}'::jsonb
    end;
    guest_max := case when resource_table in ('print_expressions', 'lowcode_form_definitions') then 500 else 200 end;
    if resource_table = 'print_datasource_script' then
      insert into public.service_resource_metadata (service_name, resource_name, table_name, config, enabled)
      values ('admin', resource_table, resource_table,
        jsonb_build_object('tableName', resource_table, 'internalActions', jsonb_build_array('create', 'update', 'delete'),
          'list', jsonb_build_object('defaultSorts', jsonb_build_array(jsonb_build_object('field', 'code', 'direction', 'asc')))), true)
      on conflict (service_name, resource_name) do nothing;
    end if;
    update public.service_resource_metadata
    set config = config || jsonb_build_object(
        'clientMode', 'user', 'select', resource_select,
        'publicRead', jsonb_build_object('enabled', true, 'select', resource_select,
          'filters', guest_filters, 'defaultPageSize', 100, 'maxPageSize', guest_max)),
      version = version + 1, updated_at = timezone('utc', now())
    where service_name = case when resource_table = 'lowcode_form_definitions' then 'lowcode' else 'admin' end
      and resource_name = resource_table;
    if resource_table <> 'print_datasource_script' then
      update public.service_resource_metadata
      set config = jsonb_set(jsonb_set(config,
        '{create,allowedFields}', coalesce(config #> '{create,allowedFields}', '[]'::jsonb)
          || '["visibility","access_level","account_id"]'::jsonb, true),
        '{update,allowedFields}', (coalesce(config #> '{update,allowedFields}', '[]'::jsonb) - 'user_id')
          || '["visibility","access_level","account_id"]'::jsonb, true)
      where service_name = case when resource_table = 'lowcode_form_definitions' then 'lowcode' else 'admin' end
        and resource_name = resource_table;
    end if;
  end loop;
end
$metadata$;

select pg_notify('pgrst', 'reload schema');
commit;
