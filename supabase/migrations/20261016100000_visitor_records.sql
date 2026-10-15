begin;

create table if not exists public.visitor_records (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  session_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  ip_address inet,
  page_path text not null,
  page_url text,
  referrer text,
  user_agent text,
  language text,
  timezone text,
  screen_width integer check (screen_width is null or screen_width > 0),
  screen_height integer check (screen_height is null or screen_height > 0),
  visited_at timestamptz not null default timezone('utc', now())
);

comment on table public.visitor_records is
  'Public project page-view records used for visitor and traffic analysis.';
comment on column public.visitor_records.visitor_id is
  'Persistent anonymous browser identifier used to count unique visitors.';
comment on column public.visitor_records.session_id is
  'Per-tab browser session identifier used to group visits in one session.';
comment on column public.visitor_records.ip_address is
  'Client network address resolved by the backend from trusted proxy/request headers.';
comment on column public.visitor_records.visited_at is
  'Server-side visit timestamp stored in UTC.';

create index if not exists visitor_records_visited_at_idx
  on public.visitor_records(visited_at desc);
create index if not exists visitor_records_visitor_time_idx
  on public.visitor_records(visitor_id, visited_at desc);
create index if not exists visitor_records_session_time_idx
  on public.visitor_records(session_id, visited_at desc);
create index if not exists visitor_records_user_time_idx
  on public.visitor_records(user_id, visited_at desc)
  where user_id is not null;
create index if not exists visitor_records_page_time_idx
  on public.visitor_records(page_path, visited_at desc);

alter table public.visitor_records enable row level security;

-- Page visitors can only write through the backend endpoint. Direct browser
-- reads and writes remain unavailable, while the service-role API can insert
-- records and administrators can analyze the table through trusted tooling.
revoke all on public.visitor_records from anon, authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
