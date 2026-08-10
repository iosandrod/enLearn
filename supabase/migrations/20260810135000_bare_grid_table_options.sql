-- Keep physical-table dropdown values concise for the public schema.

begin;

create or replace view public.system_physical_table_options
with (security_invoker = true)
as
select
  tables.table_name::text as value,
  tables.table_name::text as label
from information_schema.tables tables
where tables.table_schema = 'public'
  and tables.table_type = 'BASE TABLE';

grant select on public.system_physical_table_options to authenticated;

notify pgrst, 'reload schema';

commit;
