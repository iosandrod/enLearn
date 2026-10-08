begin;

-- Keep the print detail table editor independent from the full grid designer.
-- Its schema is copied from the existing lowcode grid column section, but the
-- field selector is a plain input because a print detail table has no grid
-- source metadata to resolve.
with source_schema as (
  select field->'props'->'schema' as schema
  from public.lowcode_form_definitions definition
  cross join lateral jsonb_array_elements(definition.schema->'fields') field
  where definition.code = 'grid-designer'
    and definition.enabled = true
    and field->>'field' = 'grid-designer-columns'
  limit 1
), detail_schema as (
  select jsonb_set(jsonb_set(
    jsonb_set(
      jsonb_set(schema, '{title}', to_jsonb('打印明细列配置'::text), true),
      '{fields,0,label}', to_jsonb('列配置'::text), true
    ),
    '{fields,0,props,columns,0,component}', to_jsonb('vxe-input'::text), true
  ), '{fields,0,props,columns,0,props}',
    '{"clearable":true,"placeholder":"请输入明细字段名"}'::jsonb, true
  ) #- '{fields,0,props,columns,0,optionsSourceKey}' as schema
  from source_schema
), print_schema as (
  select jsonb_set(schema, '{fields,0,props}',
    (schema #> '{fields,0,props}') || '{
      "height": 440,
      "rowHeight": 36,
      "toolbarButtons": [
        {"code":"add","label":"新增列","command":"add","status":"primary","prefixIcon":"ri-add-line"}
      ],
      "treeConfig": {"childrenField":"children","expandAll":true},
      "childAddable": true,
      "addChildText": "新增子列"
    }'::jsonb, true
  ) as schema
  from detail_schema
)
insert into public.lowcode_form_definitions
  (code, name, description, schema, enabled, user_id)
select
  'print-designer.detail-table-columns',
  '打印明细列配置',
  '打印设计器明细表格的列配置表单。',
  schema,
  true,
  null
from print_schema
where not exists (
  select 1
  from public.lowcode_form_definitions
  where code = 'print-designer.detail-table-columns'
);

-- Also refresh an installation created by an earlier version of this
-- migration, so the definition remains a copy of the current grid column
-- section with only the print-specific column actions.
with source_schema as (
  select field->'props'->'schema' as schema
  from public.lowcode_form_definitions definition
  cross join lateral jsonb_array_elements(definition.schema->'fields') field
  where definition.code = 'grid-designer'
    and definition.enabled = true
    and field->>'field' = 'grid-designer-columns'
  limit 1
), detail_schema as (
  select jsonb_set(jsonb_set(
    jsonb_set(
      jsonb_set(schema, '{title}', to_jsonb('打印明细列配置'::text), true),
      '{fields,0,label}', to_jsonb('列配置'::text), true
    ),
    '{fields,0,props,columns,0,component}', to_jsonb('vxe-input'::text), true
  ), '{fields,0,props,columns,0,props}',
    '{"clearable":true,"placeholder":"请输入明细字段名"}'::jsonb, true
  ) #- '{fields,0,props,columns,0,optionsSourceKey}' as schema
  from source_schema
), print_schema as (
  select jsonb_set(schema, '{fields,0,props}',
    (schema #> '{fields,0,props}') || '{
      "height": 440,
      "rowHeight": 36,
      "toolbarButtons": [
        {"code":"add","label":"新增列","command":"add","status":"primary","prefixIcon":"ri-add-line"}
      ],
      "treeConfig": {"childrenField":"children","expandAll":true},
      "childAddable": true,
      "addChildText": "新增子列"
    }'::jsonb, true
  ) as schema
  from detail_schema
)
update public.lowcode_form_definitions definition
set schema = print_schema.schema,
    updated_at = timezone('utc', now())
from print_schema
where definition.code = 'print-designer.detail-table-columns';

do $$
begin
  if not exists (
    select 1 from public.lowcode_form_definitions
    where code = 'print-designer.detail-table-columns'
  ) then
    raise exception 'Cannot copy print detail column form: grid-designer columns section is missing.';
  end if;
end;
$$;

select pg_notify('pgrst', 'reload schema');

commit;
