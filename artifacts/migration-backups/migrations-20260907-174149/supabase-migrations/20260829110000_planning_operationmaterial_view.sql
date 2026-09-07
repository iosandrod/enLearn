-- Operation-material view retaining the original column names.

begin;

create or replace view public.planning_operationmaterial_view
with (security_invoker = true)
as
select
  operation_material.*
from public.planning_operationmaterial operation_material
left join public.planning_item item
  on item.account_id = operation_material.account_id
 and item.id = operation_material.item_id
left join public.planning_operation operation
  on operation.account_id = operation_material.account_id
 and operation.id = operation_material.operation_id;

grant select on public.planning_operationmaterial_view to authenticated, service_role;

commit;

select pg_catalog.pg_notify('pgrst', 'reload schema');
