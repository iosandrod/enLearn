begin;

do $$
declare
  foreign_key record;
begin
  -- Older installations may have added a foreign key manually. The field is
  -- metadata only, so remove any FK attached to this column before normalizing
  -- the check constraint.
  for foreign_key in
    select constraint_name
    from information_schema.key_column_usage
    where table_schema = 'public'
      and table_name = 'lowcode_form_definitions'
      and column_name = 'table_name'
      and position_in_unique_constraint is not null
  loop
    execute format(
      'alter table public.lowcode_form_definitions drop constraint if exists %I',
      foreign_key.constraint_name
    );
  end loop;
end
$$;

-- PostgreSQL cannot change a column type while a view depends on it.
drop view if exists public.print_data_source_form_definition_options;

-- A form definition does not have to be backed by a database table. Keep this
-- metadata field as a nullable text value and do not couple it to a relation.
alter table public.lowcode_form_definitions
  alter column table_name drop not null,
  alter column table_name type text using table_name::text;

alter table public.lowcode_form_definitions
  drop constraint if exists lowcode_form_definitions_table_name_check;

alter table public.lowcode_form_definitions
  add constraint lowcode_form_definitions_table_name_check
  check (
    table_name is null
    or btrim(table_name) = ''
    or table_name ~ '^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$'
  );

-- Keep custom/inline print data sources available in the selector even when
-- they intentionally have no physical business table.
create or replace view public.print_data_source_form_definition_options
with (security_invoker = false)
as
select
  definitions.code::text as value,
  case
    when btrim(coalesce(definitions.table_name, '')) = ''
      then definitions.name::text
    else (definitions.name || '（' || definitions.table_name || '）')::text
  end as label
from public.lowcode_form_definitions definitions
where definitions.enabled = true
  and definitions.code like 'print-designer.datasource.%'
order by definitions.name, definitions.code;

comment on view public.print_data_source_form_definition_options is
  'Enabled low-code print data source form definitions, including definitions without a physical business table.';

grant select on public.print_data_source_form_definition_options to authenticated, service_role;

commit;
