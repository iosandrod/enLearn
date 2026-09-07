-- Enterprise training data model.
-- UI pages, entity metadata and navigation are defined separately in
-- 20260906110000_enterprise_training_lowcode_entities.sql.
begin;

create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.training_chapters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  title text not null,
  description text,
  sort_order integer not null default 0,
  video_file_id uuid references public.file_objects(id) on delete set null,
  ppt_file_id uuid references public.file_objects(id) on delete set null,
  duration_seconds integer,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.training_progress (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  chapter_id uuid not null references public.training_chapters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  progress_seconds integer not null default 0,
  completed boolean not null default false,
  last_viewed_at timestamptz not null default timezone('utc'::text, now()),
  unique (chapter_id, user_id)
);

drop trigger if exists set_training_courses_updated_at on public.training_courses;
create trigger set_training_courses_updated_at
before update on public.training_courses for each row execute function public.set_updated_at();
drop trigger if exists set_training_chapters_updated_at on public.training_chapters;
create trigger set_training_chapters_updated_at
before update on public.training_chapters for each row execute function public.set_updated_at();

create index if not exists training_chapters_course_sort_idx
  on public.training_chapters (course_id, sort_order, created_at);
create index if not exists training_progress_user_idx
  on public.training_progress (user_id, course_id, chapter_id);

alter table public.training_courses enable row level security;
alter table public.training_chapters enable row level security;
alter table public.training_progress enable row level security;

drop policy if exists "Authenticated users can use training courses" on public.training_courses;
create policy "Authenticated users can use training courses"
  on public.training_courses for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated users can use training chapters" on public.training_chapters;
create policy "Authenticated users can use training chapters"
  on public.training_chapters for all to authenticated using (true) with check (true);
drop policy if exists "Users can use own training progress" on public.training_progress;
create policy "Users can use own training progress"
  on public.training_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.training_courses to authenticated, service_role;
grant select, insert, update, delete on public.training_chapters to authenticated, service_role;
grant select, insert, update, delete on public.training_progress to authenticated, service_role;

commit;
