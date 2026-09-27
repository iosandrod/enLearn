begin;

-- The upload API needs these objects before it can create a signed URL.
-- Keep this migration idempotent so it also repairs databases created from a
-- partial migration history.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('app-files', 'app-files', false, 52428800)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create table if not exists public.file_objects (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'app-files',
  object_key text not null,
  original_name text not null,
  mime_type text,
  size_bytes bigint,
  checksum text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  status text not null default 'created'
    check (status in ('created', 'uploading', 'uploaded', 'ready', 'rejected', 'deleted')),
  locked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  upload_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (bucket, object_key)
);

alter table public.file_objects add column if not exists locked boolean not null default false;
alter table public.file_objects add column if not exists upload_expires_at timestamptz;
alter table public.file_objects add column if not exists deleted_at timestamptz;

drop trigger if exists set_file_objects_updated_at on public.file_objects;
create trigger set_file_objects_updated_at
before update on public.file_objects
for each row execute function public.set_updated_at();

create index if not exists file_objects_owner_created_idx
  on public.file_objects (owner_id, created_at desc)
  where deleted_at is null;
create index if not exists file_objects_status_idx
  on public.file_objects (status)
  where deleted_at is null;

create table if not exists public.file_usages (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.file_objects(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  purpose text not null default 'attachment',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (file_id, entity_type, entity_id, purpose)
);

create table if not exists public.file_folders (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'app-files',
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  path text not null,
  parent_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (bucket, owner_id, path)
);

drop trigger if exists set_file_folders_updated_at on public.file_folders;
create trigger set_file_folders_updated_at
before update on public.file_folders
for each row execute function public.set_updated_at();

create index if not exists file_usages_entity_idx
  on public.file_usages (entity_type, entity_id, purpose);
create index if not exists file_folders_owner_path_idx
  on public.file_folders (owner_id, path)
  where deleted_at is null;

alter table public.file_objects enable row level security;
alter table public.file_usages enable row level security;
alter table public.file_folders enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_objects' and policyname = 'Users can read own or public files') then
    create policy "Users can read own or public files" on public.file_objects for select
      using (auth.uid() = owner_id or visibility = 'public');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_objects' and policyname = 'Users can create own files') then
    create policy "Users can create own files" on public.file_objects for insert
      with check (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_objects' and policyname = 'Users can update own files') then
    create policy "Users can update own files" on public.file_objects for update
      using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_usages' and policyname = 'Users can read usages for accessible files') then
    create policy "Users can read usages for accessible files" on public.file_usages for select
      using (exists (select 1 from public.file_objects fo where fo.id = file_usages.file_id and (fo.owner_id = auth.uid() or fo.visibility = 'public')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_usages' and policyname = 'Users can create usages for own files') then
    create policy "Users can create usages for own files" on public.file_usages for insert
      with check (exists (select 1 from public.file_objects fo where fo.id = file_usages.file_id and fo.owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_folders' and policyname = 'Users can manage own file folders') then
    create policy "Users can manage own file folders" on public.file_folders for all
      using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can upload own file objects') then
    create policy "Users can upload own file objects" on storage.objects for insert
      with check (bucket_id = 'app-files' and auth.uid()::text = (storage.foldername(name))[2]);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can read own or public file objects') then
    create policy "Users can read own or public file objects" on storage.objects for select
      using (bucket_id = 'app-files' and (auth.uid()::text = (storage.foldername(name))[2] or exists (select 1 from public.file_objects fo where fo.bucket = storage.objects.bucket_id and fo.object_key = storage.objects.name and fo.visibility = 'public' and fo.deleted_at is null)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can update own file objects') then
    create policy "Users can update own file objects" on storage.objects for update
      using (bucket_id = 'app-files' and auth.uid()::text = (storage.foldername(name))[2])
      with check (bucket_id = 'app-files' and auth.uid()::text = (storage.foldername(name))[2]);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can delete own file objects') then
    create policy "Users can delete own file objects" on storage.objects for delete
      using (bucket_id = 'app-files' and auth.uid()::text = (storage.foldername(name))[2]);
  end if;
end $$;

create table if not exists public.service_resource_metadata (
  id bigint generated by default as identity primary key,
  service_name text not null,
  resource_name text not null,
  table_name text not null,
  version integer not null default 1 check (version > 0),
  config jsonb not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_resource_metadata_service_resource_key unique (service_name, resource_name),
  constraint service_resource_metadata_config_object_check check (jsonb_typeof(config) = 'object'),
  constraint service_resource_metadata_table_consistency_check check (config ->> 'tableName' = table_name)
);

insert into public.service_resource_metadata (service_name, resource_name, table_name, version, config, enabled)
values
  ('files', 'file_objects', 'file_objects', 1, '{"tableName":"file_objects","ownerField":"owner_id","defaults":{"bucket":"app-files","visibility":"private","status":"created","locked":false,"metadata":{}},"list":{"defaultFilters":{"deleted_at":null},"defaultSorts":[{"field":"created_at","direction":"desc"}]},"create":{"allowedFields":["id","bucket","object_key","original_name","mime_type","size_bytes","checksum","owner_id","visibility","status","locked","metadata","upload_expires_at"],"requiredFields":["object_key","original_name"],"userFields":{"owner":"owner_id"}},"update":{"allowedFields":["bucket","object_key","original_name","mime_type","size_bytes","checksum","visibility","status","locked","metadata","upload_expires_at","deleted_at"]},"delete":{"softDelete":true,"statusField":"status","deletedStatus":"deleted"}}'::jsonb, true),
  ('files', 'file_folders', 'file_folders', 1, '{"tableName":"file_folders","ownerField":"owner_id","defaults":{"bucket":"app-files","metadata":{}},"list":{"defaultFilters":{"deleted_at":null},"defaultSorts":[{"field":"path","direction":"asc"}]},"create":{"allowedFields":["bucket","owner_id","name","path","parent_path","metadata","deleted_at"],"requiredFields":["name","path"],"userFields":{"owner":"owner_id"}},"update":{"allowedFields":["bucket","name","path","parent_path","metadata","deleted_at"]},"delete":{"softDelete":true}}'::jsonb, true),
  ('files', 'file_usages', 'file_usages', 1, '{"tableName":"file_usages","list":{"defaultSorts":[{"field":"created_at","direction":"desc"}]},"create":{"allowedFields":["file_id","entity_type","entity_id","purpose","metadata","created_by"],"requiredFields":["file_id","entity_type","entity_id"],"timestamp":false,"userFields":{"createdBy":"created_by"}},"update":{"allowedFields":["entity_type","entity_id","purpose","metadata"],"timestamp":false}}'::jsonb, true)
on conflict (service_name, resource_name) do update set
  table_name = excluded.table_name,
  version = excluded.version,
  config = excluded.config,
  enabled = excluded.enabled,
  updated_at = now();

commit;
