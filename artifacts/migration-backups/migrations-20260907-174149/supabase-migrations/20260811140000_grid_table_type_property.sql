update public.lowcode_form_definitions
set schema = jsonb_set(
  schema,
  '{layout,0,tabs,0,blocks}',
  coalesce(schema #> '{layout,0,tabs,0,blocks}', '[]'::jsonb) ||
    '[{"kind":"field","field":"tableType"}]'::jsonb,
  true
)
where code = 'material-prop.lowcode-grid'
  and not coalesce(
    schema #> '{layout,0,tabs,0,blocks}',
    '[]'::jsonb
  ) @> '[{"kind":"field","field":"tableType"}]'::jsonb;

notify pgrst, 'reload schema';
