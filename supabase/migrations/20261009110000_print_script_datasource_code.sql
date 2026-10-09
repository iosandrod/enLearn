begin;

alter table public.print_datasource_script
  add column if not exists datasource_code text;

comment on column public.print_datasource_script.datasource_code is
  '关联当前用户的 print_datasource_typeorm.code；为空表示未关联数据源。';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.print_datasource_script'::regclass
      and conname = 'print_datasource_script_datasource_code_fkey'
  ) then
    alter table public.print_datasource_script
      add constraint print_datasource_script_datasource_code_fkey
      foreign key (user_id, datasource_code)
      references public.print_datasource_typeorm(user_id, code)
      on update cascade
      on delete set null (datasource_code);
  end if;
end
$$;

create index if not exists print_datasource_script_datasource_code_idx
  on public.print_datasource_script(user_id, datasource_code)
  where datasource_code is not null;

-- Preserve customized form fields and add the optional association once.
update public.lowcode_form_definitions definition
set schema = jsonb_set(
      definition.schema,
      '{fields}',
      (definition.schema->'fields') || '[{
        "field": "datasource_code",
        "label": "关联数据源",
        "component": "vxe-select",
        "optionsSourceKey": "typeormDataSources",
        "props": {"clearable": true, "filterable": true, "placeholder": "可选，请选择数据源"}
      }]'::jsonb,
      true
    ),
    updated_at = timezone('utc', now())
where definition.code = 'print-designer.datasource-script-meta'
  and not exists (
    select 1 from jsonb_array_elements(definition.schema->'fields') field
    where field->>'field' = 'datasource_code'
  );

select pg_notify('pgrst', 'reload schema');

commit;
