-- Forward-only MES low-code action guards and runtime-view refresh.

begin;

create or replace view public.mes_work_order_operation_runtime_view
with (security_invoker = true)
as
select
  operation.*,
  work_order.work_order_no,
  work_order.status as work_order_status,
  work_order.item_id,
  item.name as item_name,
  operation.planned_quantity - operation.good_quantity - operation.scrap_quantity
    as remaining_quantity
from public.mes_work_order_operation operation
join public.mes_work_order work_order
  on work_order.account_id = operation.account_id
 and work_order.id = operation.work_order_id
left join public.planning_item item
  on item.account_id = work_order.account_id and item.id = work_order.item_id;

create or replace view public.mes_work_order_component_runtime_view
with (security_invoker = true)
as
select
  component.*,
  work_order.work_order_no,
  operation.operation_code,
  operation.operation_name,
  operation.status as operation_status,
  operation.row_version as operation_row_version,
  item.name as item_name,
  item.uom,
  component.issued_quantity - component.returned_quantity as net_issued_quantity,
  greatest(component.issued_quantity - component.returned_quantity, 0)
    as available_to_return,
  work_order.status as work_order_status
from public.mes_work_order_component component
join public.mes_work_order work_order
  on work_order.account_id = component.account_id
 and work_order.id = component.work_order_id
left join public.mes_work_order_operation operation
  on operation.account_id = component.account_id
 and operation.id = component.operation_id
left join public.planning_item item
  on item.account_id = component.account_id and item.id = component.item_id;

create or replace view public.mes_production_transaction_runtime_view
with (security_invoker = true)
as
select
  transaction.*,
  work_order.work_order_no,
  operation.operation_code,
  operation.operation_name,
  operation.status as operation_status,
  operation.row_version as operation_row_version,
  original.transaction_type as original_transaction_type,
  reversal.id as reversal_transaction_id,
  (reversal.id is not null) as is_reversed,
  (transaction.transaction_type = 'report'
    and transaction.original_transaction_id is null
    and reversal.id is null
    and work_order.status not in ('closed', 'canceled')) as reversible,
  work_order.status as work_order_status
from public.mes_production_transaction transaction
join public.mes_work_order work_order
  on work_order.account_id = transaction.account_id
 and work_order.id = transaction.work_order_id
join public.mes_work_order_operation operation
  on operation.account_id = transaction.account_id
 and operation.id = transaction.operation_id
left join public.mes_production_transaction original
  on original.account_id = transaction.account_id
 and original.id = transaction.original_transaction_id
left join public.mes_production_transaction reversal
  on reversal.account_id = transaction.account_id
 and reversal.original_transaction_id = transaction.id;

create or replace view public.mes_material_transaction_runtime_view
with (security_invoker = true)
as
select
  transaction.*,
  work_order.work_order_no,
  operation.operation_code,
  operation.operation_name,
  operation.status as operation_status,
  operation.row_version as operation_row_version,
  item.name as item_name,
  item.uom,
  original.transaction_type as original_transaction_type,
  reversal.id as reversal_transaction_id,
  (reversal.id is not null) as is_reversed,
  (transaction.transaction_type in ('issue', 'return', 'consume')
    and transaction.original_transaction_id is null
    and reversal.id is null
    and work_order.status not in ('closed', 'canceled')) as reversible,
  work_order.status as work_order_status
from public.mes_material_transaction transaction
join public.mes_work_order work_order
  on work_order.account_id = transaction.account_id
 and work_order.id = transaction.work_order_id
left join public.mes_work_order_operation operation
  on operation.account_id = transaction.account_id
 and operation.id = transaction.operation_id
join public.planning_item item
  on item.account_id = transaction.account_id and item.id = transaction.item_id
left join public.mes_material_transaction original
  on original.account_id = transaction.account_id
 and original.id = transaction.original_transaction_id
left join public.mes_material_transaction reversal
  on reversal.account_id = transaction.account_id
 and reversal.original_transaction_id = transaction.id;

grant select on public.mes_work_order_operation_runtime_view to authenticated, service_role;
grant select on public.mes_work_order_component_runtime_view to authenticated, service_role;
grant select on public.mes_production_transaction_runtime_view to authenticated, service_role;
grant select on public.mes_material_transaction_runtime_view to authenticated, service_role;

with next_schema as (
  select
    page.id,
    page.schema,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      page.schema,
                      '{blocks,3,tabs,2,blocks,0,schema,rowActions,actions,0,visible}',
                      '{"field":"reversible","operator":"eq","value":true}'::jsonb,
                      true
                    ),
                    '{blocks,3,tabs,3,blocks,0,schema,rowActions,actions,0,visible}',
                    '{"field":"reversible","operator":"eq","value":true}'::jsonb,
                    true
                  ),
                  '{blocks,3,tabs,0,blocks,0,schema,rowActions,actions,0,visible}',
                  '{"field":"status","operator":"eq","value":"ready"}'::jsonb,
                  true
                ),
                '{blocks,3,tabs,0,blocks,0,schema,rowActions,actions,1,visible}',
                '{"field":"status","operator":"eq","value":"in_progress"}'::jsonb,
                true
              ),
              '{blocks,3,tabs,0,blocks,0,schema,rowActions,actions,2,visible}',
              '{"field":"status","operator":"eq","value":"paused"}'::jsonb,
              true
            ),
            '{blocks,3,tabs,0,blocks,0,schema,rowActions,actions,3,visible}',
            '{"field":"status","operator":"eq","value":"in_progress"}'::jsonb,
            true
          ),
          '{blocks,3,tabs,0,blocks,0,schema,rowActions,actions,4,visible}',
          '{"field":"status","operator":"eq","value":"in_progress"}'::jsonb,
          true
        ),
        '{blocks,3,tabs,1,blocks,0,schema,rowActions,actions,0,visible}',
        '[{"field":"requirement_type","operator":"eq","value":"consume"},{"field":"operation_status","operator":"in","value":["ready","in_progress","paused"]}]'::jsonb,
        true
      ),
      '{blocks,3,tabs,1,blocks,0,schema,rowActions,actions,1,visible}',
      '[{"field":"requirement_type","operator":"eq","value":"consume"},{"field":"operation_status","operator":"in","value":["ready","in_progress","paused","completed"]},{"field":"available_to_return","operator":"gt","value":0}]'::jsonb,
      true
    ) as guarded_schema
  from public.lowcode_pages page
  where page.code = 'mes_execution_console'
), updated_execution as (
  update public.lowcode_pages page
  set schema = next_schema.guarded_schema,
      version = page.version + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  from next_schema
  where page.id = next_schema.id
    and page.schema is distinct from next_schema.guarded_schema
  returning page.id, page.version, page.schema, page.published_at
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at from updated_execution
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

with ledger_guards(code, action_path, predicate) as (
  values
    ('mes_production_ledger', '{blocks,2,schema,rowActions,actions,0,visible}'::text[], '{"field":"reversible","operator":"eq","value":true}'::jsonb),
    ('mes_material_ledger', '{blocks,2,schema,rowActions,actions,0,visible}'::text[], '{"field":"reversible","operator":"eq","value":true}'::jsonb)
), next_schema as (
  select page.id, jsonb_set(page.schema, guard.action_path, guard.predicate, true) as guarded_schema
  from public.lowcode_pages page
  join ledger_guards guard on guard.code = page.code
), updated_ledgers as (
  update public.lowcode_pages page
  set schema = next_schema.guarded_schema,
      version = page.version + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  from next_schema
  where page.id = next_schema.id
    and page.schema is distinct from next_schema.guarded_schema
  returning page.id, page.version, page.schema, page.published_at
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at from updated_ledgers
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

-- The desktop business root is a navigation container. Mobile projects its
-- children only when the container is explicitly marked for projection.
update public.admin_routes
set metadata = coalesce(metadata, '{}'::jsonb)
      || '{"mobileNavigation":"container"}'::jsonb,
    updated_at = timezone('utc'::text, now())
where code = 'business-root'
  and coalesce(metadata->>'mobileNavigation', '') <> 'container';

commit;

