begin;

create table if not exists public.print_datasource_script (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  script text not null,
  schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint print_datasource_script_code_check check (code ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$'),
  constraint print_datasource_script_schema_object_check check (jsonb_typeof(schema) = 'object'),
  constraint print_datasource_script_source_check check (length(btrim(script)) > 0)
);

create unique index if not exists print_datasource_script_user_code_idx
  on public.print_datasource_script(user_id, code);
create index if not exists print_datasource_script_user_enabled_idx
  on public.print_datasource_script(user_id, enabled, code);

create table if not exists public.print_datasource_typeorm (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint print_datasource_typeorm_code_check check (code ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$'),
  constraint print_datasource_typeorm_schema_object_check check (jsonb_typeof(schema) = 'object')
);

create unique index if not exists print_datasource_typeorm_user_code_idx
  on public.print_datasource_typeorm(user_id, code);
create index if not exists print_datasource_typeorm_user_enabled_idx
  on public.print_datasource_typeorm(user_id, enabled, code);

comment on table public.print_datasource_script is
  '打印后端数据源 QuickJS 脚本；脚本入口接收 context 对象。';
comment on column public.print_datasource_script.schema is
  '脚本入参和输出 records 的 JSON schema。';
comment on table public.print_datasource_typeorm is
  '打印后端数据源连接配置；schema 保存受控 TypeORM/PostgreSQL 连接参数。';
comment on column public.print_datasource_typeorm.schema is
  '数据源连接配置 JSON；凭据仅供后端 runtime 使用，不返回前端。';

alter table public.print_datasource_script enable row level security;
alter table public.print_datasource_typeorm enable row level security;

revoke all on public.print_datasource_script from anon;
revoke all on public.print_datasource_typeorm from anon;
grant select, insert, update, delete on public.print_datasource_script to authenticated;
grant select, insert, update, delete on public.print_datasource_typeorm to authenticated;

drop policy if exists print_datasource_script_owner on public.print_datasource_script;
create policy print_datasource_script_owner on public.print_datasource_script
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists print_datasource_typeorm_owner on public.print_datasource_typeorm;
create policy print_datasource_typeorm_owner on public.print_datasource_typeorm
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.touch_print_datasource_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists print_datasource_script_updated_at on public.print_datasource_script;
create trigger print_datasource_script_updated_at
before update on public.print_datasource_script
for each row execute function public.touch_print_datasource_updated_at();

drop trigger if exists print_datasource_typeorm_updated_at on public.print_datasource_typeorm;
create trigger print_datasource_typeorm_updated_at
before update on public.print_datasource_typeorm
for each row execute function public.touch_print_datasource_updated_at();

select pg_notify('pgrst', 'reload schema');

commit;
