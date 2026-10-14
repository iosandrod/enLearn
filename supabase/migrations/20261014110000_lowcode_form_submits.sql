begin;

create table if not exists public.lowcode_form_submits (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.lowcode_form_definitions(id),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lowcode_form_submits_data_object_check check (jsonb_typeof(data) = 'object')
);

create index if not exists lowcode_form_submits_form_created_idx
  on public.lowcode_form_submits(form_id, created_at desc);
create index if not exists lowcode_form_submits_user_created_idx
  on public.lowcode_form_submits(user_id, created_at desc);

comment on table public.lowcode_form_submits is '低代码表单提交记录；原始表单数据以 JSON 保存。';
comment on column public.lowcode_form_submits.form_id is '关联 lowcode_form_definitions.id。';
comment on column public.lowcode_form_submits.user_id is '提交表单的登录用户。';

alter table public.lowcode_form_submits enable row level security;
revoke all on public.lowcode_form_submits from anon, authenticated;
grant select, insert on public.lowcode_form_submits to authenticated;
grant all on public.lowcode_form_submits to service_role;

drop policy if exists lowcode_form_submits_owner_read on public.lowcode_form_submits;
create policy lowcode_form_submits_owner_read on public.lowcode_form_submits
  for select to authenticated using (user_id = auth.uid());
drop policy if exists lowcode_form_submits_owner_insert on public.lowcode_form_submits;
create policy lowcode_form_submits_owner_insert on public.lowcode_form_submits
  for insert to authenticated with check (
    user_id = auth.uid() and exists (
      select 1 from public.lowcode_form_definitions definition
      where definition.id = form_id and definition.enabled
    )
  );

create or replace function public.submit_lowcode_form(p_form_code text, p_data jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_definition public.lowcode_form_definitions%rowtype;
  v_submit public.lowcode_form_submits%rowtype;
  v_field jsonb;
  v_value jsonb;
begin
  if auth.uid() is null then
    raise exception '请先登录后提交反馈。' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception '表单数据必须是 JSON 对象。' using errcode = '22023';
  end if;
  select * into v_definition from public.lowcode_form_definitions
    where code = btrim(p_form_code) and enabled;
  if not found then
    raise exception '表单不存在、已停用或无权访问。' using errcode = 'P0002';
  end if;
  for v_field in select value from jsonb_array_elements(v_definition.schema->'fields') loop
    v_value := p_data->(v_field->>'field');
    if v_field->>'required' = 'true' and (
      v_value is null or v_value = 'null'::jsonb
      or (jsonb_typeof(v_value) = 'string' and btrim(v_value #>> '{}') = '')
      or v_value = '[]'::jsonb
    ) then
      raise exception '%不能为空。', coalesce(v_field->>'label', v_field->>'field')
        using errcode = '22023';
    end if;
  end loop;
  insert into public.lowcode_form_submits(form_id, user_id, data)
    values (v_definition.id, auth.uid(), p_data) returning * into v_submit;
  return to_jsonb(v_submit);
end;
$$;

revoke all on function public.submit_lowcode_form(text, jsonb) from public, anon;
grant execute on function public.submit_lowcode_form(text, jsonb) to authenticated;

insert into public.lowcode_form_definitions
  (code, name, description, table_name, schema, enabled, user_id)
values (
  'print-designer.feedback', '提交反馈', '打印设计器问题与建议反馈表单。', null,
  $schema${
    "title": "提交反馈",
    "columns": 1,
    "fields": [
      {"field":"type","label":"反馈类型","component":"vxe-select","required":true,"defaultValue":"suggestion","props":{"clearable":false},"options":[{"label":"功能建议","value":"suggestion"},{"label":"问题反馈","value":"bug"},{"label":"其他","value":"other"}]},
      {"field":"title","label":"标题","component":"vxe-input","required":true,"props":{"placeholder":"请简要描述问题或建议","maxlength":120}},
      {"field":"content","label":"反馈内容","component":"vxe-textarea","required":true,"props":{"placeholder":"请描述问题、操作步骤或你的建议","rows":6,"maxlength":5000}},
      {"field":"contact","label":"联系方式","component":"vxe-input","props":{"placeholder":"邮箱、微信或其他联系方式（选填）","maxlength":200}}
    ],
    "actions": []
  }$schema$::jsonb, true, null
)
on conflict (code) do update set
  name = excluded.name, description = excluded.description,
  table_name = excluded.table_name, schema = excluded.schema,
  enabled = true, updated_at = now();

select pg_notify('pgrst', 'reload schema');
commit;
