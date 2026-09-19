-- Keep visual-designer component aliases in the database material catalog.
begin;

with mappings(code, component_map) as (
  values
    ('vxe-input',          '{"input":"vxe-input"}'::jsonb),
    ('vxe-textarea',       '{"textarea":"vxe-textarea"}'::jsonb),
    ('vxe-password-input', '{"password":"vxe-password-input"}'::jsonb),
    ('vxe-select',         '{"picker":"vxe-select","select":"vxe-select"}'::jsonb),
    ('vxe-switch',         '{"switch":"vxe-switch"}'::jsonb),
    ('vxe-checkbox-group', '{"checkbox":"vxe-checkbox-group"}'::jsonb),
    ('vxe-radio-group',    '{"radio":"vxe-radio-group"}'::jsonb),
    ('lc-basic-control',   '{"stepper":"lc-stepper","rate":"lc-rate","slider":"lc-slider"}'::jsonb),
    ('lc-array-table',     '{"array-table":"lc-array-table"}'::jsonb),
    ('lc-sub-form',        '{"sub-form":"lc-sub-form"}'::jsonb),
    ('vxe-upload',         '{"image":"vxe-upload"}'::jsonb)
)
update public.lowcode_materials material
set manifest = jsonb_set(
      coalesce(material.manifest, '{}'::jsonb),
      '{componentMap}',
      mappings.component_map,
      true
    ),
    updated_at = timezone('utc'::text, now())
from mappings
where material.material_kind = 'form'
  and material.code = mappings.code;

do $validation$
declare
  v_material_count integer;
  v_mapping_count integer;
begin
  select count(*)::integer
  into v_material_count
  from public.lowcode_materials
  where material_kind = 'form'
    and code in (
      'vxe-input',
      'vxe-textarea',
      'vxe-password-input',
      'vxe-select',
      'vxe-switch',
      'vxe-checkbox-group',
      'vxe-radio-group',
      'lc-basic-control',
      'lc-array-table',
      'lc-sub-form',
      'vxe-upload'
    )
    and jsonb_typeof(manifest->'componentMap') = 'object';

  select count(*)::integer
  into v_mapping_count
  from public.lowcode_materials material,
    lateral jsonb_each_text(material.manifest->'componentMap') mapping
  where material.material_kind = 'form'
    and material.code in (
      'vxe-input',
      'vxe-textarea',
      'vxe-password-input',
      'vxe-select',
      'vxe-switch',
      'vxe-checkbox-group',
      'vxe-radio-group',
      'lc-basic-control',
      'lc-array-table',
      'lc-sub-form',
      'vxe-upload'
    );

  if v_material_count <> 11 or v_mapping_count <> 14 then
    raise exception 'Form material component map validation failed: materials %, mappings %.',
      v_material_count, v_mapping_count;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
