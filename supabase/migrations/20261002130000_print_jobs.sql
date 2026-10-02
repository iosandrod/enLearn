begin;

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('preview', 'export')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'partial', 'failed', 'canceled', 'expired')),
  template_id text not null,
  template_version integer not null default 1,
  input_json jsonb not null,
  input_sha256 text not null,
  total_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  cancel_requested boolean not null default false,
  error_code text,
  error_message text,
  attempts integer not null default 0,
  available_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.print_jobs add column if not exists cancel_requested boolean not null default false;
alter table public.print_jobs add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists print_jobs_account_status_idx
  on public.print_jobs (account_id, status, created_at desc);
create index if not exists print_jobs_expiry_idx
  on public.print_jobs (expires_at)
  where status not in ('expired', 'canceled');

create table if not exists public.print_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.print_jobs(id) on delete cascade,
  account_id uuid not null,
  object_key text not null,
  format text not null check (format in ('pdf', 'png', 'jpeg', 'zip')),
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  record_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  unique (job_id, object_key)
);

create index if not exists print_artifacts_job_idx
  on public.print_artifacts (job_id, created_at);

create table if not exists public.print_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.print_jobs(id) on delete cascade,
  item_index integer not null,
  record_key text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  artifact_id uuid references public.print_artifacts(id) on delete set null,
  error_code text,
  error_message text,
  attempts integer not null default 0,
  unique (job_id, item_index)
);

alter table public.print_jobs enable row level security;
alter table public.print_artifacts enable row level security;
alter table public.print_job_items enable row level security;

drop policy if exists "Users can read own print jobs" on public.print_jobs;
create policy "Users can read own print jobs"
  on public.print_jobs for select
  using (auth.uid() = owner_id);

drop policy if exists "Users can read own print artifacts" on public.print_artifacts;
create policy "Users can read own print artifacts"
  on public.print_artifacts for select
  using (exists (
    select 1 from public.print_jobs
    where print_jobs.id = print_artifacts.job_id
      and print_jobs.owner_id = auth.uid()
  ));

drop policy if exists "Users can read own print items" on public.print_job_items;
create policy "Users can read own print items"
  on public.print_job_items for select
  using (exists (
    select 1 from public.print_jobs
    where print_jobs.id = print_job_items.job_id
      and print_jobs.owner_id = auth.uid()
  ));

commit;
