-- Make the runtime field editor's option-source code a searchable, creatable select.

begin;

create or replace view public.system_option_source_code_options
with (security_invoker = true)
as
select
  sources.code::text as value,
  (sources.name || ' (' || sources.code || ')')::text as label,
  sources.sort_order,
  sources.created_at
from public.system_option_sources sources
where sources.status = 'active';

grant select on public.system_option_source_code_options to authenticated;

insert into public.system_option_sources (
  code,
  name,
  description,
  source_type,
  source_config,
  cache_ttl_seconds,
  status,
  sort_order,
  is_system
) values (
  'option_source_code',
  U&'\4E0B\62C9\6570\636E\6E90 Code',
  U&'\8FD4\56DE\6240\6709\5DF2\542F\7528\7684\4E0B\62C9\6570\636E\6E90\7F16\7801\3002',
  'view',
  jsonb_build_object(
    'view', 'public.system_option_source_code_options',
    'labelField', 'label',
    'valueField', 'value',
    'orderBy', 'sort_order',
    'limit', 1000
  ),
  0,
  'active',
  60,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  source_type = excluded.source_type,
  source_config = excluded.source_config,
  cache_ttl_seconds = excluded.cache_ttl_seconds,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  updated_at = timezone('utc'::text, now());

update public.lowcode_form_definitions definitions
set schema = jsonb_set(
  definitions.schema,
  '{fields}',
  (
    select jsonb_agg(
      case
        when field_item->>'field' = 'optionsCode' then
          jsonb_set(
            field_item || jsonb_build_object(
              'component', 'vxe-select',
              'optionsCode', 'option_source_code'
            ),
            '{props}',
            coalesce(field_item->'props', '{}'::jsonb) || jsonb_build_object(
              'clearable', true,
              'filterable', true,
              'allowCreate', true,
              'placeholder', U&'\8BF7\9009\62E9\6216\8F93\5165\4E0B\62C9 Code'
            ),
            true
          )
        else field_item
      end
      order by ordinal
    )
    from jsonb_array_elements(definitions.schema->'fields')
      with ordinality fields(field_item, ordinal)
  ),
  true
)
where definitions.code = 'runtime-form-field-editor';

do $validation$
declare
  v_source_count integer;
  v_option_count integer;
  v_expected_option_count integer;
  v_field jsonb;
begin
  select count(*)::integer
  into v_source_count
  from public.system_option_sources
  where code = 'option_source_code'
    and source_type = 'view'
    and status = 'active';

  select count(*)::integer
  into v_option_count
  from public.system_option_source_code_options;

  select count(*)::integer
  into v_expected_option_count
  from public.system_option_sources
  where status = 'active';

  select field_item
  into v_field
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema->'fields') field_item
  where definitions.code = 'runtime-form-field-editor'
    and field_item->>'field' = 'optionsCode';

  if v_source_count <> 1
    or v_option_count <> v_expected_option_count
    or v_field->>'component' <> 'vxe-select'
    or v_field->>'optionsCode' <> 'option_source_code'
    or v_field#>>'{props,filterable}' <> 'true'
    or v_field#>>'{props,allowCreate}' <> 'true'
  then
    raise exception 'Runtime field option-source select validation failed: source %, options %/%, field %.',
      v_source_count, v_option_count, v_expected_option_count, v_field;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
