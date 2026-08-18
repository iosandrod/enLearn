update public.lowcode_form_definitions
set schema = jsonb_insert(
  schema,
  '{layout,0,tabs,0,blocks,2}',
  '{"kind":"field","field":"formType"}'::jsonb,
  false
)
where code = 'material-prop.form'
  and not coalesce(
    schema #> '{layout,0,tabs,0,blocks}',
    '[]'::jsonb
  ) @> '[{"kind":"field","field":"formType"}]'::jsonb;

update public.lowcode_form_definitions
set schema = jsonb_insert(
  schema,
  '{layout,0,tabs,0,blocks,2}',
  '{"kind":"field","field":"formType"}'::jsonb,
  false
)
where code = 'material-prop.lowcode-edit-form'
  and not coalesce(
    schema #> '{layout,0,tabs,0,blocks}',
    '[]'::jsonb
  ) @> '[{"kind":"field","field":"formType"}]'::jsonb;

notify pgrst, 'reload schema';
