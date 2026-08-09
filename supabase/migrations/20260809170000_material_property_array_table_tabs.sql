update public.lowcode_form_definitions
set schema = jsonb_set(
  schema,
  '{separateArrayTableTabs}',
  'true'::jsonb,
  true
)
where code like 'material-prop.%'
  and (schema ->> 'separateArrayTableTabs') is distinct from 'true';

notify pgrst, 'reload schema';
