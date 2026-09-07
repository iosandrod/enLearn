-- Read operation-resource records through a relation-aware view while keeping
-- the physical table as the CRUD write target.

begin;

create or replace view public.planning_operationresource_view
with (security_invoker = true)
as
select
  operation_resource.id,
  operation_resource.account_id,
  operation_resource.operation_id,
  operation.name as operation_name,
  coalesce(operation.name, operation_resource.operation_id::text) as operation_id_label,
  operation_resource.resource_id,
  resource.name as resource_name,
  coalesce(resource.name, operation_resource.resource_id::text) as resource_id_label,
  operation_resource.skill_id,
  skill.name as skill_name,
  coalesce(skill.name, operation_resource.skill_id::text) as skill_id_label,
  operation_resource.quantity,
  operation_resource.quantity_fixed,
  operation_resource.effective_start,
  operation_resource.effective_end,
  operation_resource.name,
  operation_resource.priority,
  operation_resource.setup,
  operation_resource.search,
  operation_resource.source,
  operation_resource.lastmodified,
  operation_resource.created_by,
  operation_resource.updated_by,
  operation_resource.created_at,
  operation_resource.updated_at
from public.planning_operationresource operation_resource
left join public.planning_operation operation
  on operation.account_id = operation_resource.account_id
 and operation.id = operation_resource.operation_id
left join public.planning_resource resource
  on resource.account_id = operation_resource.account_id
 and resource.id = operation_resource.resource_id
left join public.planning_skill skill
  on skill.account_id = operation_resource.account_id
 and skill.id = operation_resource.skill_id;

grant select on public.planning_operationresource_view to authenticated, service_role;

insert into public.entity_design_views (
  code, schema_name, view_name, title, description, definition_sql,
  status, security_invoker, published_at, metadata
) values (
  'planning_operationresource_view', 'public', 'planning_operationresource_view',
  '工序资源关联视图', '展示工序资源及其工序、资源和技能名称。',
  $$select
  operation_resource.id,
  operation_resource.account_id,
  operation_resource.operation_id,
  operation.name as operation_name,
  coalesce(operation.name, operation_resource.operation_id::text) as operation_id_label,
  operation_resource.resource_id,
  resource.name as resource_name,
  coalesce(resource.name, operation_resource.resource_id::text) as resource_id_label,
  operation_resource.skill_id,
  skill.name as skill_name,
  coalesce(skill.name, operation_resource.skill_id::text) as skill_id_label,
  operation_resource.quantity,
  operation_resource.quantity_fixed,
  operation_resource.effective_start,
  operation_resource.effective_end,
  operation_resource.name,
  operation_resource.priority,
  operation_resource.setup,
  operation_resource.search,
  operation_resource.source,
  operation_resource.lastmodified,
  operation_resource.created_by,
  operation_resource.updated_by,
  operation_resource.created_at,
  operation_resource.updated_at
from public.planning_operationresource operation_resource
left join public.planning_operation operation on operation.account_id = operation_resource.account_id and operation.id = operation_resource.operation_id
left join public.planning_resource resource on resource.account_id = operation_resource.account_id and resource.id = operation_resource.resource_id
left join public.planning_skill skill on skill.account_id = operation_resource.account_id and skill.id = operation_resource.skill_id$$,
  'published', true, timezone('utc'::text, now()),
  '{"sourceTable":"public.planning_operationresource","relationFields":["operation_id","resource_id","skill_id"]}'::jsonb
)
on conflict (code) do update set
  schema_name = excluded.schema_name,
  view_name = excluded.view_name,
  title = excluded.title,
  description = excluded.description,
  definition_sql = excluded.definition_sql,
  status = excluded.status,
  security_invoker = true,
  published_at = excluded.published_at,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

update public.lowcode_pages
set view_name = 'public.planning_operationresource_view',
    table_name = 'planning_operationresource',
    version = version + 1,
    published_at = case when status = 'published' then timezone('utc'::text, now()) else published_at end,
    updated_at = timezone('utc'::text, now())
where code in ('planning_operationresource-list', 'planning_operationresource-edit');

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_operationresource-list', 'planning_operationresource-edit')
on conflict (page_id, version) do update
set schema = excluded.schema,
    published_at = excluded.published_at;

do $validation$
begin
  if (select count(*) from public.lowcode_pages
      where code in ('planning_operationresource-list', 'planning_operationresource-edit')
        and view_name = 'public.planning_operationresource_view') <> 2 then
    raise exception 'Operation-resource pages were not bound to the relation view.';
  end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public'
        and table_name = 'planning_operationresource_view'
        and column_name in (
          'operation_name', 'operation_id_label',
          'resource_name', 'resource_id_label',
          'skill_name', 'skill_id_label'
        )) <> 6 then
    raise exception 'Operation-resource relation view is missing required display columns.';
  end if;
end;
$validation$;

commit;

select pg_catalog.pg_notify('pgrst', 'reload schema');
