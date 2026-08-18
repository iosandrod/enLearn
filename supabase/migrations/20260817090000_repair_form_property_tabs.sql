with form_tab_labels(code, tab_key, label) as (
  values
    ('material-prop.form', 'basic', '基础'),
    ('material-prop.form', 'data', '数据'),
    ('material-prop.form', 'structure', '结构'),
    ('material-prop.form', 'actions', '按钮'),
    ('material-prop.form', 'behavior', '行为'),
    ('material-prop.lowcode-edit-form', 'basic', '基础'),
    ('material-prop.lowcode-edit-form', 'data', '数据'),
    ('material-prop.lowcode-edit-form', 'structure', '字段'),
    ('material-prop.lowcode-edit-form', 'actions', '按钮'),
    ('material-prop.lowcode-search-form', 'basic', '基础'),
    ('material-prop.lowcode-search-form', 'data', '数据'),
    ('material-prop.lowcode-search-form', 'structure', '字段')
), repaired as (
  select
    definition.code,
    jsonb_set(
      definition.schema,
      '{layout,0,tabs}',
      coalesce(
        (
          select jsonb_agg(
            case
              when labels.label is null then tab.value
              when coalesce(btrim(tab.value ->> 'label'), '') = ''
                or coalesce(btrim(tab.value ->> 'label'), '') ~ '^\?+$'
                then jsonb_set(tab.value, '{label}', to_jsonb(labels.label), true)
              else tab.value
            end
            order by tab.ordinality
          )
          from jsonb_array_elements(
            coalesce(definition.schema #> '{layout,0,tabs}', '[]'::jsonb)
          ) with ordinality as tab(value, ordinality)
          left join form_tab_labels labels
            on labels.code = definition.code
           and labels.tab_key = tab.value ->> 'key'
        ),
        '[]'::jsonb
      ),
      true
    ) as schema
  from public.lowcode_form_definitions definition
  where definition.code in (
    'material-prop.form',
    'material-prop.lowcode-edit-form',
    'material-prop.lowcode-search-form'
  )
)
update public.lowcode_form_definitions definition
set schema = repaired.schema
from repaired
where definition.code = repaired.code
  and definition.schema is distinct from repaired.schema;

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
