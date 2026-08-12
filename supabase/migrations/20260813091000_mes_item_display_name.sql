-- Refresh MES read models to expose the independent planning item name.

begin;

create or replace view public.mes_work_order_runtime_view
with (security_invoker = true)
as
select
  work_order.*,
  coalesce(nullif(item.display_name, ''), item.name) as item_name,
  location.name as location_name,
  plan_version.code as plan_version_code,
  plan_version.name as plan_version_name,
  work_order.planned_quantity - work_order.good_quantity - work_order.scrap_quantity
    as remaining_quantity
from public.mes_work_order work_order
left join public.planning_item item
  on item.account_id = work_order.account_id and item.id = work_order.item_id
left join public.planning_location location
  on location.account_id = work_order.account_id and location.id = work_order.location_id
left join public.planning_plan_version plan_version
  on plan_version.account_id = work_order.account_id
 and plan_version.id = work_order.source_plan_version_id;

create or replace view public.mes_work_order_operation_runtime_view
with (security_invoker = true)
as
select
  operation.*,
  work_order.work_order_no,
  work_order.status as work_order_status,
  work_order.item_id,
  coalesce(nullif(item.display_name, ''), item.name) as item_name,
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
  coalesce(nullif(item.display_name, ''), item.name) as item_name,
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
  coalesce(nullif(item.display_name, ''), item.name) as item_name,
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

grant select on public.mes_work_order_runtime_view to authenticated, service_role;
grant select on public.mes_work_order_operation_runtime_view to authenticated, service_role;
grant select on public.mes_work_order_component_runtime_view to authenticated, service_role;
grant select on public.mes_material_transaction_runtime_view to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

commit;
