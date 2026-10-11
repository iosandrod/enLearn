begin;

create table if not exists public.admin_search_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  page_code text not null
    references public.lowcode_pages(code) on update cascade on delete cascade,
  name text not null default '默认方案',
  query_values jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint admin_search_models_name_check check (
    length(btrim(name)) between 1 and 120
  ),
  constraint admin_search_models_query_values_object_check check (
    jsonb_typeof(query_values) = 'object'
  )
);

create unique index if not exists admin_search_models_user_page_name_idx
  on public.admin_search_models(user_id, page_code, lower(name));
create unique index if not exists admin_search_models_one_active_idx
  on public.admin_search_models(user_id, page_code)
  where active;
create index if not exists admin_search_models_user_page_updated_idx
  on public.admin_search_models(user_id, page_code, updated_at desc);

comment on table public.admin_search_models is
  '用户在低代码页面中保存的查询方案；每个用户、每个页面最多一个 active 方案。';
comment on column public.admin_search_models.page_code is
  '关联 lowcode_pages.code。';
comment on column public.admin_search_models.query_values is
  '查询方案 JSON，包含数据源、查询表单原始值和最终过滤树。';

alter table public.admin_search_models enable row level security;
revoke all on public.admin_search_models from anon;
grant select, insert, update, delete on public.admin_search_models to authenticated;

drop policy if exists admin_search_models_owner on public.admin_search_models;
create policy admin_search_models_owner on public.admin_search_models
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.touch_admin_search_models_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists admin_search_models_updated_at on public.admin_search_models;
create trigger admin_search_models_updated_at
before update on public.admin_search_models
for each row execute function public.touch_admin_search_models_updated_at();

create or replace function public.activate_admin_search_model()
returns trigger
language plpgsql
as $$
begin
  if new.active then
    update public.admin_search_models
    set active = false
    where user_id = new.user_id
      and page_code = new.page_code
      and active
      and id is distinct from new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_search_models_activate on public.admin_search_models;
create trigger admin_search_models_activate
before insert or update of active on public.admin_search_models
for each row execute function public.activate_admin_search_model();

create or replace function public.save_admin_search_model(
  p_page_code text,
  p_query_values jsonb,
  p_model_id uuid,
  p_name text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_model public.admin_search_models%rowtype;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authenticated user is required.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_page_code, '')), '') is null then
    raise exception 'page_code is required.' using errcode = '22023';
  end if;
  if p_query_values is null or jsonb_typeof(p_query_values) <> 'object' then
    raise exception 'query_values must be a JSON object.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_page_code, 0)
  );

  if p_model_id is not null then
    select * into v_model
    from public.admin_search_models
    where id = p_model_id
      and user_id = v_user_id
      and page_code = p_page_code
    for update;
    if not found then
      raise exception 'Search model was not found.' using errcode = 'P0002';
    end if;
  else
    select * into v_model
    from public.admin_search_models
    where user_id = v_user_id
      and page_code = p_page_code
    order by active desc, updated_at desc
    limit 1
    for update;
  end if;

  update public.admin_search_models
  set active = false
  where user_id = v_user_id
    and page_code = p_page_code
    and active
    and (v_model.id is null or id <> v_model.id);

  if v_model.id is null then
    insert into public.admin_search_models (
      user_id, page_code, name, query_values, active
    ) values (
      v_user_id, p_page_code, coalesce(v_name, '默认方案'), p_query_values, true
    )
    returning * into v_model;
  else
    update public.admin_search_models
    set name = coalesce(v_name, name),
        query_values = p_query_values,
        active = true
    where id = v_model.id
      and user_id = v_user_id
    returning * into v_model;
  end if;

  return to_jsonb(v_model);
end;
$$;

revoke all on function public.save_admin_search_model(text, jsonb, uuid, text) from public, anon;
grant execute on function public.save_admin_search_model(text, jsonb, uuid, text) to authenticated;

insert into public.service_resource_metadata
  (service_name, resource_name, table_name, version, config, enabled)
values (
  'lowcode',
  'admin_search_models',
  'admin_search_models',
  1,
  jsonb_build_object(
    'tableName', 'admin_search_models',
    'primaryKey', 'id',
    'clientMode', 'user',
    'ownerField', 'user_id',
    'list', jsonb_build_object(
      'defaultPageSize', 100,
      'maxPageSize', 500,
      'defaultSorts', jsonb_build_array(
        jsonb_build_object('field', 'active', 'direction', 'desc'),
        jsonb_build_object('field', 'updated_at', 'direction', 'desc')
      )
    ),
    'create', jsonb_build_object(
      'allowedFields', jsonb_build_array('page_code', 'name', 'query_values', 'active')
    ),
    'update', jsonb_build_object(
      'allowedFields', jsonb_build_array('name', 'query_values', 'active')
    ),
    'delete', jsonb_build_object('timestamp', false)
  ),
  true
)
on conflict (service_name, resource_name) do update set
  table_name = excluded.table_name,
  version = public.service_resource_metadata.version + 1,
  config = excluded.config,
  enabled = true,
  updated_at = timezone('utc', now());

update public.lowcode_node_actions
set source_code = replace(
  replace(
    source_code,
    $old$
function isFilterGroup(value) {
$old$,
    $new$
function readSearchFormValues(blocks, forms, sourceKey, dataSources) {
  return Object.fromEntries(blocks
    .filter((candidate) =>
      (candidate.kind === 'searchForm' ||
        (candidate.kind === 'form' && candidate.formType === 'search')) &&
      searchFormTargetsSource(candidate, sourceKey, blocks, dataSources)
    )
    .map((candidate) => [
      candidate.id,
      isRecord(forms[candidate.id]) ? forms[candidate.id] : {},
    ]));
}
function isFilterGroup(value) {
$new$
  ),
  $old$
    const value = skip
      ? []
      : await this.$node.call('source.invoke', { sourceKey, postData: requestPostData });
    if (await this.$node.call('source.isCurrent', { sourceKey, version })) {
$old$,
  $new$
    const value = skip
      ? []
      : await this.$node.call('source.invoke', { sourceKey, postData: requestPostData });
    const searchFormValues = readSearchFormValues(blocks, this.forms, sourceKey, dataSources);
    if (!skip && block.tableType !== 'detail' && Object.keys(searchFormValues).length) {
      await this.$node.call('searchModel.save', {
        queryValues: {
          sourceKey,
          forms: searchFormValues,
          searches: isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {},
          filters: isRecord(requestPostData.filters) ? requestPostData.filters : {},
        },
      });
    }
    if (await this.$node.call('source.isCurrent', { sourceKey, version })) {
$new$
  ),
  updated_at = timezone('utc', now())
where node_type = 'grid'
  and action_code = 'loadData';

do $$
begin
  if not exists (
    select 1 from public.lowcode_node_actions
    where node_type = 'grid'
      and action_code = 'loadData'
      and position('function readSearchFormValues(blocks, forms, sourceKey, dataSources)' in source_code) > 0
      and position('this.$node.call(''searchModel.save''' in source_code) > 0
  ) then
    raise exception 'grid.loadData search model persistence was not stored';
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');

commit;
