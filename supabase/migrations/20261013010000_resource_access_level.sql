begin;

-- access_level is the sole publication/tier switch. Ownership still controls
-- writes and access to a user's own paid resources, but free rows are shared.
create or replace function public.can_read_access_level_resource(
  p_access_level text, p_user_id uuid, p_account_id uuid, p_enabled boolean
) returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $function$
  select coalesce(
    (p_access_level = 'free' and p_enabled)
    or (
      auth.uid() is not null and (
        p_user_id = auth.uid()
        or (
          p_user_id is null and p_enabled
          and (p_account_id is null or public.is_active_account_member(p_account_id))
          and (
            (p_access_level = 'pro' and public.has_app_permission('print.resources.pro'))
            or (p_access_level in ('pro', 'enterprise')
              and public.has_app_permission('print.resources.enterprise'))
            or (
              p_account_id is not null and public.is_active_account_member(p_account_id)
              and (
                (p_access_level = 'pro' and public.has_account_permission(p_account_id, 'print.resources.pro'))
                or (p_access_level in ('pro', 'enterprise')
                  and public.has_account_permission(p_account_id, 'print.resources.enterprise'))
              )
            )
          )
        )
      )
    ), false
  );
$function$;
revoke all on function public.can_read_access_level_resource(text, uuid, uuid, boolean) from public;
grant execute on function public.can_read_access_level_resource(text, uuid, uuid, boolean) to anon, authenticated;

-- Remove the superseded print publication policies before dropping their column.
do $remove_visibility$
declare relation_name text;
begin
  foreach relation_name in array array['print_templates', 'print_expressions', 'print_datasource_script'] loop
    if to_regclass('public.' || relation_name) is null then continue; end if;
    execute format('drop policy if exists print_resource_read on public.%I', relation_name);
    execute format('drop policy if exists print_resource_read_boundary on public.%I', relation_name);
    execute format('alter table public.%I drop column if exists visibility', relation_name);
  end loop;
  drop policy if exists print_form_guest_read on public.lowcode_form_definitions;
  drop policy if exists print_form_read_boundary on public.lowcode_form_definitions;
  drop policy if exists print_form_scoped_read on public.lowcode_form_definitions;
  alter table public.lowcode_form_definitions drop column if exists visibility;
end;
$remove_visibility$;
drop function if exists public.can_read_print_resource(uuid, text, text, uuid, boolean);

-- One installer covers every public table carrying access_level. No new HTTP
-- endpoint or per-table guest flag is needed. Metadata still limits columns.
create or replace function public.configure_access_level_resource(p_relation regclass)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare
  relation_name text;
  relation_schema text;
  owner_expression text := 'null::uuid';
  account_expression text := 'null::uuid';
  enabled_expression text := 'true';
  predicate text;
  metadata_row record;
  resource_config jsonb;
  config_path text[];
  config_key text;
  selected_fields text;
begin
  select c.relname, n.nspname into relation_name, relation_schema
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.oid = p_relation and c.relkind in ('r', 'p');
  if relation_schema is distinct from 'public' or not exists (
    select 1 from pg_attribute where attrelid = p_relation
      and attname = 'access_level' and attnum > 0 and not attisdropped
  ) then return; end if;

  if exists (select 1 from pg_attribute where attrelid = p_relation and attname = 'user_id'
    and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped) then
    owner_expression := 'user_id';
  end if;
  if exists (select 1 from pg_attribute where attrelid = p_relation and attname = 'account_id'
    and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped) then
    account_expression := 'account_id';
  end if;
  if relation_name = 'print_templates' then
    enabled_expression := 'status = ''active''';
  elsif exists (select 1 from pg_attribute where attrelid = p_relation and attname = 'enabled'
    and atttypid = 'bool'::regtype and attnum > 0 and not attisdropped) then
    enabled_expression := 'enabled';
  end if;
  predicate := format('public.can_read_access_level_resource(access_level::text, %s, %s, %s)',
    owner_expression, account_expression, enabled_expression);

  execute format('alter table %s enable row level security', p_relation);
  execute format('drop policy if exists access_level_guest_read on %s', p_relation);
  execute format('drop policy if exists access_level_guest_boundary on %s', p_relation);
  execute format('drop policy if exists access_level_user_read on %s', p_relation);
  execute format('drop policy if exists access_level_user_boundary on %s', p_relation);
  execute format('create policy access_level_guest_read on %s for select to anon using (%s)', p_relation, predicate);
  execute format('create policy access_level_guest_boundary on %s as restrictive for select to anon using (%s)', p_relation, predicate);
  execute format('create policy access_level_user_read on %s for select to authenticated using (%s)', p_relation, predicate);
  execute format('create policy access_level_user_boundary on %s as restrictive for select to authenticated using (%s)', p_relation, predicate);

  if relation_name = 'print_datasource_script' then
    -- Never turn a catalog read into access to executable scripts/credentials.
    execute format('revoke select on %s from public, anon, authenticated', p_relation);
    execute format('grant select (id, code, name, schema, enabled, version, user_id, access_level, account_id, updated_at)
      on %s to anon, authenticated', p_relation);
  else
    execute format('grant select on %s to anon, authenticated', p_relation);
  end if;

  for metadata_row in select service_name, resource_name, config from public.service_resource_metadata
    where table_name in (relation_name, relation_schema || '.' || relation_name) loop
    resource_config := metadata_row.config;
    foreach config_key in array array['select', 'publicRead.select'] loop
      config_path := string_to_array(config_key, '.');
      selected_fields := resource_config #>> config_path;
      if selected_fields is not null then
        selected_fields := array_to_string(array_remove(string_to_array(selected_fields, ','), 'visibility'), ',');
        resource_config := jsonb_set(resource_config, config_path, to_jsonb(selected_fields));
      end if;
    end loop;
    foreach config_path slice 1 in array array[array['create','allowedFields'], array['update','allowedFields']] loop
      if jsonb_typeof(resource_config #> config_path) = 'array' then
        resource_config := jsonb_set(resource_config, config_path, (resource_config #> config_path) - 'visibility');
      end if;
    end loop;
    resource_config := resource_config || jsonb_build_object('accessLevelRead', true, 'clientMode', 'user');
    resource_config := jsonb_set(resource_config, '{publicRead}',
      coalesce(resource_config->'publicRead', '{}'::jsonb) || jsonb_build_object(
        'enabled', true,
        'filters', (coalesce(resource_config #> '{publicRead,filters}', '{}'::jsonb) - 'visibility')
          || jsonb_build_object('access_level', 'free'),
        'defaultPageSize', coalesce(resource_config #> '{publicRead,defaultPageSize}', '100'::jsonb),
        'maxPageSize', coalesce(resource_config #> '{publicRead,maxPageSize}', '200'::jsonb)
      ));
    update public.service_resource_metadata
      set config = resource_config, version = version + 1, updated_at = timezone('utc', now())
      where service_name = metadata_row.service_name and resource_name = metadata_row.resource_name
        and config is distinct from resource_config;
  end loop;
end;
$function$;
revoke all on function public.configure_access_level_resource(regclass) from public, anon, authenticated;

-- Future CREATE TABLE / ADD access_level operations install the same RLS.
create or replace function public.on_access_level_resource_ddl()
returns event_trigger language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare command record;
begin
  if current_setting('app.configuring_access_level', true) = 'on' then return; end if;
  perform set_config('app.configuring_access_level', 'on', true);
  for command in select * from pg_event_trigger_ddl_commands()
    where classid = 'pg_class'::regclass and objid <> 0 loop
    perform public.configure_access_level_resource(command.objid::regclass);
  end loop;
  perform set_config('app.configuring_access_level', 'off', true);
end;
$function$;
revoke all on function public.on_access_level_resource_ddl() from public, anon, authenticated;
drop event trigger if exists access_level_resource_ddl;
create event trigger access_level_resource_ddl on ddl_command_end
  when tag in ('CREATE TABLE', 'ALTER TABLE')
  execute function public.on_access_level_resource_ddl();

do $install$
declare relation_id regclass;
begin
  perform set_config('app.configuring_access_level', 'on', true);
  for relation_id in
    select c.oid::regclass from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='access_level' and a.attnum > 0 and not a.attisdropped
    where n.nspname='public' and c.relkind in ('r','p')
  loop
    perform public.configure_access_level_resource(relation_id);
  end loop;
  perform set_config('app.configuring_access_level', 'off', true);
end;
$install$;

select pg_notify('pgrst', 'reload schema');
commit;
