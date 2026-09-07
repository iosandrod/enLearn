-- Keep the entity designer catalog represented in the runtime entity registry.
-- Existing curated admin entities remain authoritative for their page and route metadata.

create or replace function entity_design_private.sync_admin_entities(
  p_actor uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_source_count integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_matched integer := 0;
begin
  -- Serialize the code, route, and sort-order allocation across concurrent page loads.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('entity_design_sync_admin_entities', 0)
  );

  select pg_catalog.count(*)::integer
  into v_source_count
  from public.entity_design_tables;

  with synchronized as (
    update public.admin_entities admin_entity
    set
      title = design_table.title,
      table_name = design_table.schema_name || '.' || design_table.table_name,
      description = design_table.description,
      primary_key = design_table.primary_key,
      status = case when design_table.status = 'active' then 'active' else 'inactive' end,
      schema = (
        case
          when pg_catalog.jsonb_typeof(admin_entity.schema) = 'object' then admin_entity.schema
          else '{}'::jsonb
        end
      ) || pg_catalog.jsonb_build_object(
        'entityDesign',
        pg_catalog.jsonb_build_object(
          'managed', true,
          'tableId', design_table.id
        )
      ),
      updated_by = p_actor
    from public.entity_design_tables design_table
    where admin_entity.schema #>> '{entityDesign,tableId}' = design_table.id::text
      and not exists (
        select 1
        from public.admin_entities conflicting_entity
        where conflicting_entity.id <> admin_entity.id
          and conflicting_entity.table_name in (
            design_table.schema_name || '.' || design_table.table_name,
            design_table.table_name
          )
      )
      and (
        admin_entity.title,
        admin_entity.table_name,
        admin_entity.description,
        admin_entity.primary_key,
        admin_entity.status,
        admin_entity.schema #>> '{entityDesign,managed}',
        admin_entity.schema #>> '{entityDesign,tableId}'
      ) is distinct from (
        design_table.title,
        design_table.schema_name || '.' || design_table.table_name,
        design_table.description,
        design_table.primary_key,
        case when design_table.status = 'active' then 'active' else 'inactive' end,
        'true',
        design_table.id::text
      )
    returning admin_entity.id
  )
  select pg_catalog.count(*)::integer
  into v_updated
  from synchronized;

  with missing as (
    select design_table.*
    from public.entity_design_tables design_table
    where not exists (
      select 1
      from public.admin_entities admin_entity
      where admin_entity.table_name in (
        design_table.schema_name || '.' || design_table.table_name,
        design_table.table_name
      )
    )
  ), code_candidates as (
    select
      missing.*,
      case
        when not exists (
          select 1 from public.admin_entities admin_entity where admin_entity.code = missing.code
        ) then missing.code
        when not exists (
          select 1
          from public.admin_entities admin_entity
          where admin_entity.code = 'entity_design_' || missing.code
        ) then 'entity_design_' || missing.code
        else 'entity_design_' || missing.code || '_' || pg_catalog.left(
          pg_catalog.md5(missing.id::text),
          8
        )
      end as sync_code
    from missing
  ), prepared as (
    select
      code_candidates.*,
      case
        when not exists (
          select 1
          from public.admin_entities admin_entity
          where admin_entity.route_path = '/dashboard/data/' || code_candidates.sync_code
        ) then '/dashboard/data/' || code_candidates.sync_code
        else '/dashboard/data/' || code_candidates.sync_code || '-' || pg_catalog.left(
          pg_catalog.replace(code_candidates.id::text, '-', ''),
          8
        )
      end as sync_route,
      pg_catalog.row_number() over (
        order by
          code_candidates.position_y,
          code_candidates.position_x,
          code_candidates.created_at,
          code_candidates.id
      )::integer as sync_order
    from code_candidates
  ), inserted as (
    insert into public.admin_entities (
      code,
      title,
      table_name,
      route_path,
      description,
      primary_key,
      status,
      sort_order,
      schema,
      created_by,
      updated_by
    )
    select
      prepared.sync_code,
      prepared.title,
      prepared.schema_name || '.' || prepared.table_name,
      prepared.sync_route,
      prepared.description,
      prepared.primary_key,
      case when prepared.status = 'active' then 'active' else 'inactive' end,
      current_order.maximum + prepared.sync_order,
      pg_catalog.jsonb_build_object(
        'entityDesign',
        pg_catalog.jsonb_build_object(
          'managed', true,
          'tableId', prepared.id
        )
      ),
      p_actor,
      p_actor
    from prepared
    cross join (
      select coalesce(pg_catalog.max(admin_entity.sort_order), 0)::integer as maximum
      from public.admin_entities admin_entity
    ) current_order
    on conflict do nothing
    returning id
  )
  select pg_catalog.count(*)::integer
  into v_inserted
  from inserted;

  select pg_catalog.count(*)::integer
  into v_matched
  from public.entity_design_tables design_table
  where exists (
    select 1
    from public.admin_entities admin_entity
    where admin_entity.table_name in (
      design_table.schema_name || '.' || design_table.table_name,
      design_table.table_name
    )
  );

  return pg_catalog.jsonb_build_object(
    'source', v_source_count,
    'matched', v_matched,
    'inserted', v_inserted,
    'updated', v_updated,
    'unmatched', v_source_count - v_matched
  );
end;
$function$;

create or replace function public.entity_design_sync_admin_entities()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform entity_design_private.assert_manage_permission();
  return entity_design_private.sync_admin_entities(auth.uid());
end;
$function$;

revoke all on function entity_design_private.sync_admin_entities(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.entity_design_sync_admin_entities()
from public, anon, authenticated, service_role;
grant execute on function public.entity_design_sync_admin_entities()
to authenticated;

-- Repair existing installations immediately; later reads keep the registries aligned.
select entity_design_private.sync_admin_entities(null);

select pg_notify('pgrst', 'reload schema');
