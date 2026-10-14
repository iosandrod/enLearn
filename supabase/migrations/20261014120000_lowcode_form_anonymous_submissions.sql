begin;

alter table public.lowcode_form_definitions
  add column if not exists allow_anonymous_submit boolean not null default false;
comment on column public.lowcode_form_definitions.allow_anonymous_submit
  is '是否允许未登录用户提交；默认需要登录，与表单定义的公开读取权限独立。';

update public.lowcode_form_definitions
  set allow_anonymous_submit = true, updated_at = now()
  where code = 'print-designer.feedback';

alter table public.lowcode_form_submits alter column user_id drop not null;
comment on column public.lowcode_form_submits.user_id
  is '提交用户；允许匿名提交的表单在未登录时保存 NULL。';

-- Anonymous callers can only write through the validating RPC, never read or
-- insert submission rows directly. Existing authenticated owner RLS is retained.
revoke all on public.lowcode_form_submits from anon;

create or replace function public.submit_lowcode_form(p_form_code text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_definition public.lowcode_form_definitions%rowtype;
  v_submit public.lowcode_form_submits%rowtype;
  v_user_id uuid := auth.uid();
  v_field jsonb;
  v_value jsonb;
begin
  select * into v_definition from public.lowcode_form_definitions
    where code = btrim(p_form_code) and enabled
      and public.can_read_access_level_resource(
        access_level, user_id, null::uuid, enabled
      );
  if not found then
    raise exception '表单不存在、已停用或无权访问。' using errcode = 'P0002';
  end if;
  if v_user_id is null and not v_definition.allow_anonymous_submit then
    raise exception '请先登录后提交表单。' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception '表单数据必须是 JSON 对象。' using errcode = '22023';
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
    values (v_definition.id, v_user_id, p_data) returning * into v_submit;
  return to_jsonb(v_submit);
end;
$$;

revoke all on function public.submit_lowcode_form(text, jsonb) from public;
grant execute on function public.submit_lowcode_form(text, jsonb) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
commit;
