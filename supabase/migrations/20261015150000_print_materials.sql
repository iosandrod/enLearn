begin;

create table if not exists public.print_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  material_type text not null check (material_type in ('image', 'node', 'group')),
  content jsonb not null default '{}'::jsonb,
  preview text,
  status text not null default 'active' check (status in ('active', 'archived')),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid references basejump.accounts(id) on delete set null,
  access_level text not null default 'free' check (access_level in ('free', 'pro', 'enterprise')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.print_materials is
  'Reusable print designer image, single-node and multi-node materials.';
comment on column public.print_materials.content is
  'Image descriptor or resolved tldraw TLContent inserted back into the print canvas.';

create index if not exists print_materials_updated_at_idx
  on public.print_materials(updated_at desc);
create index if not exists print_materials_owner_idx
  on public.print_materials(user_id, updated_at desc);
create index if not exists print_materials_catalog_idx
  on public.print_materials(status, material_type, access_level, updated_at desc);

create or replace function public.touch_print_material_updated_at()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$function$;

drop trigger if exists touch_print_material_updated_at on public.print_materials;
create trigger touch_print_material_updated_at
before update on public.print_materials
for each row execute function public.touch_print_material_updated_at();

alter table public.print_materials enable row level security;

drop policy if exists print_material_owner_write on public.print_materials;
create policy print_material_owner_write on public.print_materials
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select on public.print_materials to anon, authenticated;
grant insert, update, delete on public.print_materials to authenticated;

insert into public.service_resource_metadata (
  service_name, resource_name, table_name, version, config, enabled
)
values (
  'admin',
  'print_materials',
  'print_materials',
  1,
  jsonb_build_object(
    'tableName', 'print_materials',
    'primaryKey', 'id',
    'clientMode', 'user',
    'ownerField', 'user_id',
    'accessLevelRead', true,
    'select', 'id,name,material_type,content,preview,status,version,metadata,user_id,account_id,access_level,created_at,updated_at',
    'publicRead', jsonb_build_object(
      'enabled', true,
      'select', 'id,name,material_type,content,preview,status,version,metadata,user_id,account_id,access_level,created_at,updated_at',
      'filters', jsonb_build_object('status', 'active', 'access_level', 'free'),
      'defaultPageSize', 24,
      'maxPageSize', 200
    ),
    'list', jsonb_build_object(
      'defaultPageSize', 24,
      'maxPageSize', 200,
      'defaultSorts', jsonb_build_array(
        jsonb_build_object('field', 'updated_at', 'direction', 'desc')
      )
    ),
    'create', jsonb_build_object(
      'allowedFields', jsonb_build_array(
        'name', 'material_type', 'content', 'preview', 'status', 'version',
        'metadata', 'account_id', 'access_level'
      )
    ),
    'update', jsonb_build_object(
      'allowedFields', jsonb_build_array(
        'name', 'material_type', 'content', 'preview', 'status', 'version',
        'metadata', 'account_id', 'access_level'
      )
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

-- The access-level installer was introduced before this migration and provides
-- the same public/owner/tier read policies used by print_templates.
select public.configure_access_level_resource('public.print_materials'::regclass);

select pg_notify('pgrst', 'reload schema');

commit;
