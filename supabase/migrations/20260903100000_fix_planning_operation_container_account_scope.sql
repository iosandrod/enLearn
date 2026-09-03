begin;

drop view if exists public.planning_operation_container;

create view public.planning_operation_container
with (security_invoker = true)
as
select
  operation.id as value,
  operation.name as label,
  operation.account_id,
  operation.type,
  operation.owner_id
from public.planning_operation operation
where operation.type in ('routing', 'alternate', 'split');

grant select on public.planning_operation_container to authenticated, service_role;

update public.entity_design_views
set definition_sql = $$select
  operation.id as value,
  operation.name as label,
  operation.account_id,
  operation.type,
  operation.owner_id
from public.planning_operation operation
where operation.type in ('routing', 'alternate', 'split')$$,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'sourceTable', 'public.planning_operation',
      'accountField', 'account_id',
      'valueField', 'value',
      'labelField', 'label'
    ),
    status = 'published',
    security_invoker = true,
    published_at = coalesce(published_at, timezone('utc'::text, now())),
    updated_at = timezone('utc'::text, now())
where schema_name = 'public'
  and view_name = 'planning_operation_container';

update public.system_option_sources
set source_config = coalesce(source_config, '{}'::jsonb) || jsonb_build_object(
      'view', 'public.planning_operation_container',
      'valueField', 'value',
      'labelField', 'label',
      'accountScoped', true
    ),
    updated_at = timezone('utc'::text, now())
where code = 'planning_route';

commit;
