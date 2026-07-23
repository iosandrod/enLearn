-- English training lead-generation MVP schema.
-- This migration extends the existing Hikari Supabase schema without replacing
-- the original auth/users, Stripe, or demo posts tables.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

alter table public.users
  add column if not exists phone text,
  add column if not exists nickname text,
  add column if not exists role text not null default 'student'
    check (role in ('student', 'parent', 'teacher', 'consultant', 'admin')),
  add column if not exists city text,
  add column if not exists english_level text,
  add column if not exists learning_goal text,
  add column if not exists source_channel text,
  add column if not exists lead_status text not null default 'new'
    check (lead_status in ('new', 'contacted', 'trial_booked', 'trial_done', 'converted', 'lost')),
  add column if not exists assigned_consultant_id uuid references public.users(id),
  add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.lead_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lead_events' and policyname = 'Users can insert own lead events'
  ) then
    create policy "Users can insert own lead events" on public.lead_events
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lead_events' and policyname = 'Users can view own lead events'
  ) then
    create policy "Users can view own lead events" on public.lead_events
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  description text,
  cover_url text,
  level text,
  age_group text check (age_group is null or age_group in ('kids', 'teen', 'adult')),
  course_type text not null default 'free'
    check (course_type in ('free', 'paid', 'trial')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'hidden')),
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_courses_updated_at on public.courses;
create trigger set_courses_updated_at
before update on public.courses
for each row
execute function public.set_updated_at();

alter table public.courses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'courses' and policyname = 'Published courses are public'
  ) then
    create policy "Published courses are public" on public.courses
      for select
      using (status = 'published');
  end if;
end $$;

create table if not exists public.course_sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.course_sections enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'course_sections' and policyname = 'Sections of published courses are public'
  ) then
    create policy "Sections of published courses are public" on public.course_sections
      for select
      using (
        exists (
          select 1 from public.courses
          where courses.id = course_sections.course_id
            and courses.status = 'published'
        )
      );
  end if;
end $$;

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  section_id uuid references public.course_sections(id) on delete set null,
  title text not null,
  description text,
  video_url text,
  duration_seconds integer not null default 0,
  lesson_type text not null default 'video'
    check (lesson_type in ('video', 'quiz', 'speaking_task')),
  is_free boolean not null default true,
  sort_order integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'hidden')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_lessons_updated_at on public.lessons;
create trigger set_lessons_updated_at
before update on public.lessons
for each row
execute function public.set_updated_at();

alter table public.lessons enable row level security;

create table if not exists public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  source text not null default 'free_signup'
    check (source in ('free_signup', 'consultant', 'trial_package', 'manual')),
  status text not null default 'active'
    check (status in ('active', 'completed', 'expired', 'cancelled')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (user_id, course_id)
);

drop trigger if exists set_course_enrollments_updated_at on public.course_enrollments;
create trigger set_course_enrollments_updated_at
before update on public.course_enrollments
for each row
execute function public.set_updated_at();

alter table public.course_enrollments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'course_enrollments' and policyname = 'Users can view own course enrollments'
  ) then
    create policy "Users can view own course enrollments" on public.course_enrollments
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'course_enrollments' and policyname = 'Users can enroll self in courses'
  ) then
    create policy "Users can enroll self in courses" on public.course_enrollments
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lessons' and policyname = 'Published free lessons are public'
  ) then
    create policy "Published free lessons are public" on public.lessons
      for select
      using (
        status = 'published'
        and (
          is_free = true
          or exists (
            select 1 from public.course_enrollments
            where course_enrollments.course_id = lessons.course_id
              and course_enrollments.user_id = auth.uid()
              and course_enrollments.status = 'active'
          )
        )
      );
  end if;
end $$;

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  progress_seconds integer not null default 0,
  progress_percent numeric(5,2) not null default 0,
  completed_at timestamp with time zone,
  last_watched_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (user_id, lesson_id),
  check (progress_seconds >= 0),
  check (progress_percent >= 0 and progress_percent <= 100)
);

drop trigger if exists set_lesson_progress_updated_at on public.lesson_progress;
create trigger set_lesson_progress_updated_at
before update on public.lesson_progress
for each row
execute function public.set_updated_at();

alter table public.lesson_progress enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lesson_progress' and policyname = 'Users can view own lesson progress'
  ) then
    create policy "Users can view own lesson progress" on public.lesson_progress
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lesson_progress' and policyname = 'Users can insert own lesson progress'
  ) then
    create policy "Users can insert own lesson progress" on public.lesson_progress
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lesson_progress' and policyname = 'Users can update own lesson progress'
  ) then
    create policy "Users can update own lesson progress" on public.lesson_progress
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.ai_scenarios (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  level text,
  scene_type text not null default 'daily'
    check (scene_type in ('daily', 'travel', 'business', 'interview', 'ielts', 'kids')),
  system_prompt text not null,
  opening_message text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'hidden')),
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_ai_scenarios_updated_at on public.ai_scenarios;
create trigger set_ai_scenarios_updated_at
before update on public.ai_scenarios
for each row
execute function public.set_updated_at();

alter table public.ai_scenarios enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_scenarios' and policyname = 'Published AI scenarios are public'
  ) then
    create policy "Published AI scenarios are public" on public.ai_scenarios
      for select
      using (status = 'published');
  end if;
end $$;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id uuid references public.ai_scenarios(id) on delete set null,
  title text,
  status text not null default 'active'
    check (status in ('active', 'ended')),
  score numeric(5,2),
  feedback text,
  started_at timestamp with time zone not null default timezone('utc'::text, now()),
  ended_at timestamp with time zone,
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (score is null or (score >= 0 and score <= 100))
);

drop trigger if exists set_ai_conversations_updated_at on public.ai_conversations;
create trigger set_ai_conversations_updated_at
before update on public.ai_conversations
for each row
execute function public.set_updated_at();

alter table public.ai_conversations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_conversations' and policyname = 'Users can manage own AI conversations'
  ) then
    create policy "Users can manage own AI conversations" on public.ai_conversations
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  audio_url text,
  pronunciation_score numeric(5,2),
  grammar_feedback text,
  vocabulary_feedback text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (pronunciation_score is null or (pronunciation_score >= 0 and pronunciation_score <= 100))
);

alter table public.ai_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_messages' and policyname = 'Users can manage messages in own AI conversations'
  ) then
    create policy "Users can manage messages in own AI conversations" on public.ai_messages
      for all
      using (
        exists (
          select 1 from public.ai_conversations
          where ai_conversations.id = ai_messages.conversation_id
            and ai_conversations.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.ai_conversations
          where ai_conversations.id = ai_messages.conversation_id
            and ai_conversations.user_id = auth.uid()
        )
      );
  end if;
end $$;

create table if not exists public.speech_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references public.ai_messages(id) on delete set null,
  transcript text,
  fluency_score numeric(5,2),
  pronunciation_score numeric(5,2),
  accuracy_score numeric(5,2),
  feedback jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (fluency_score is null or (fluency_score >= 0 and fluency_score <= 100)),
  check (pronunciation_score is null or (pronunciation_score >= 0 and pronunciation_score <= 100)),
  check (accuracy_score is null or (accuracy_score >= 0 and accuracy_score <= 100))
);

alter table public.speech_assessments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'speech_assessments' and policyname = 'Users can view own speech assessments'
  ) then
    create policy "Users can view own speech assessments" on public.speech_assessments
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  display_name text not null,
  intro text,
  avatar_url text,
  specialties text[] not null default '{}',
  levels text[] not null default '{}',
  online_status text not null default 'offline'
    check (online_status in ('online', 'busy', 'offline')),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_teachers_updated_at on public.teachers;
create trigger set_teachers_updated_at
before update on public.teachers
for each row
execute function public.set_updated_at();

alter table public.teachers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'teachers' and policyname = 'Active teachers are public'
  ) then
    create policy "Active teachers are public" on public.teachers
      for select
      using (status = 'active');
  end if;
end $$;

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  session_type text not null default 'text'
    check (session_type in ('text', 'voice', 'video')),
  provider text,
  provider_session_id text,
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'ended', 'cancelled')),
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_chat_sessions_updated_at on public.chat_sessions;
create trigger set_chat_sessions_updated_at
before update on public.chat_sessions
for each row
execute function public.set_updated_at();

alter table public.chat_sessions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_sessions' and policyname = 'Students can create own chat sessions'
  ) then
    create policy "Students can create own chat sessions" on public.chat_sessions
      for insert
      with check (auth.uid() = student_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_sessions' and policyname = 'Chat participants can view sessions'
  ) then
    create policy "Chat participants can view sessions" on public.chat_sessions
      for select
      using (
        auth.uid() = student_id
        or exists (
          select 1 from public.teachers
          where teachers.id = chat_sessions.teacher_id
            and teachers.user_id = auth.uid()
        )
      );
  end if;
end $$;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message_type text not null default 'text'
    check (message_type in ('text', 'image', 'audio', 'file', 'system')),
  content text,
  media_url text,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.chat_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'Chat participants can view messages'
  ) then
    create policy "Chat participants can view messages" on public.chat_messages
      for select
      using (
        exists (
          select 1 from public.chat_sessions
          left join public.teachers on teachers.id = chat_sessions.teacher_id
          where chat_sessions.id = chat_messages.session_id
            and (chat_sessions.student_id = auth.uid() or teachers.user_id = auth.uid())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'Chat participants can send messages'
  ) then
    create policy "Chat participants can send messages" on public.chat_messages
      for insert
      with check (
        sender_id = auth.uid()
        and exists (
          select 1 from public.chat_sessions
          left join public.teachers on teachers.id = chat_sessions.teacher_id
          where chat_sessions.id = chat_messages.session_id
            and (chat_sessions.student_id = auth.uid() or teachers.user_id = auth.uid())
        )
      );
  end if;
end $$;

create table if not exists public.campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  district text,
  address text not null,
  phone text,
  latitude numeric(10,6),
  longitude numeric(10,6),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_campuses_updated_at on public.campuses;
create trigger set_campuses_updated_at
before update on public.campuses
for each row
execute function public.set_updated_at();

alter table public.campuses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'campuses' and policyname = 'Active campuses are public'
  ) then
    create policy "Active campuses are public" on public.campuses
      for select
      using (status = 'active');
  end if;
end $$;

create table if not exists public.trial_classes (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  teacher_id uuid references public.teachers(id) on delete set null,
  title text not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  capacity integer not null default 20,
  booked_count integer not null default 0,
  status text not null default 'open'
    check (status in ('open', 'full', 'cancelled', 'finished')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (capacity > 0),
  check (booked_count >= 0),
  check (booked_count <= capacity),
  check (end_time > start_time)
);

drop trigger if exists set_trial_classes_updated_at on public.trial_classes;
create trigger set_trial_classes_updated_at
before update on public.trial_classes
for each row
execute function public.set_updated_at();

alter table public.trial_classes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trial_classes' and policyname = 'Open trial classes are public'
  ) then
    create policy "Open trial classes are public" on public.trial_classes
      for select
      using (status in ('open', 'full'));
  end if;
end $$;

create table if not exists public.trial_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trial_class_id uuid references public.trial_classes(id) on delete set null,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  student_name text not null,
  student_age integer,
  parent_phone text not null,
  learning_goal text,
  status text not null default 'submitted'
    check (status in ('submitted', 'confirmed', 'attended', 'no_show', 'converted', 'cancelled')),
  consultant_id uuid references public.users(id) on delete set null,
  remark text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (student_age is null or (student_age >= 3 and student_age <= 100))
);

drop trigger if exists set_trial_bookings_updated_at on public.trial_bookings;
create trigger set_trial_bookings_updated_at
before update on public.trial_bookings
for each row
execute function public.set_updated_at();

alter table public.trial_bookings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trial_bookings' and policyname = 'Users can create own trial bookings'
  ) then
    create policy "Users can create own trial bookings" on public.trial_bookings
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trial_bookings' and policyname = 'Users can view own trial bookings'
  ) then
    create policy "Users can view own trial bookings" on public.trial_bookings
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trial_bookings' and policyname = 'Users can cancel own submitted bookings'
  ) then
    create policy "Users can cancel own submitted bookings" on public.trial_bookings
      for update
      using (auth.uid() = user_id and status in ('submitted', 'confirmed'))
      with check (auth.uid() = user_id and status = 'cancelled');
  end if;
end $$;

create table if not exists public.consultant_tasks (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid references public.users(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid references public.trial_bookings(id) on delete set null,
  task_type text not null default 'follow_up'
    check (task_type in ('call', 'wechat', 'reminder', 'follow_up')),
  status text not null default 'pending'
    check (status in ('pending', 'done', 'cancelled')),
  due_at timestamp with time zone,
  completed_at timestamp with time zone,
  note text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_consultant_tasks_updated_at on public.consultant_tasks;
create trigger set_consultant_tasks_updated_at
before update on public.consultant_tasks
for each row
execute function public.set_updated_at();

alter table public.consultant_tasks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'consultant_tasks' and policyname = 'Assigned consultants can view tasks'
  ) then
    create policy "Assigned consultants can view tasks" on public.consultant_tasks
      for select
      using (consultant_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'consultant_tasks' and policyname = 'Assigned consultants can update tasks'
  ) then
    create policy "Assigned consultants can update tasks" on public.consultant_tasks
      for update
      using (consultant_id = auth.uid())
      with check (consultant_id = auth.uid());
  end if;
end $$;

create table if not exists public.conversion_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid references public.trial_bookings(id) on delete set null,
  consultant_id uuid references public.users(id) on delete set null,
  product_name text not null,
  amount numeric(10,2) not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'refunded', 'cancelled')),
  converted_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (amount >= 0)
);

drop trigger if exists set_conversion_records_updated_at on public.conversion_records;
create trigger set_conversion_records_updated_at
before update on public.conversion_records
for each row
execute function public.set_updated_at();

alter table public.conversion_records enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conversion_records' and policyname = 'Users can view own conversion records'
  ) then
    create policy "Users can view own conversion records" on public.conversion_records
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists lead_events_user_id_created_at_idx on public.lead_events(user_id, created_at desc);
create index if not exists courses_status_sort_order_idx on public.courses(status, sort_order);
create index if not exists course_sections_course_id_sort_order_idx on public.course_sections(course_id, sort_order);
create index if not exists lessons_course_id_status_sort_order_idx on public.lessons(course_id, status, sort_order);
create index if not exists course_enrollments_user_id_status_idx on public.course_enrollments(user_id, status);
create index if not exists lesson_progress_user_id_updated_at_idx on public.lesson_progress(user_id, updated_at desc);
create index if not exists ai_conversations_user_id_started_at_idx on public.ai_conversations(user_id, started_at desc);
create index if not exists ai_messages_conversation_id_created_at_idx on public.ai_messages(conversation_id, created_at);
create index if not exists teachers_status_online_status_idx on public.teachers(status, online_status);
create index if not exists chat_sessions_student_id_status_idx on public.chat_sessions(student_id, status);
create index if not exists chat_sessions_teacher_id_status_idx on public.chat_sessions(teacher_id, status);
create index if not exists chat_messages_session_id_created_at_idx on public.chat_messages(session_id, created_at);
create index if not exists campuses_city_status_idx on public.campuses(city, status);
create index if not exists trial_classes_campus_id_start_time_idx on public.trial_classes(campus_id, start_time);
create index if not exists trial_bookings_user_id_created_at_idx on public.trial_bookings(user_id, created_at desc);
create index if not exists trial_bookings_status_created_at_idx on public.trial_bookings(status, created_at desc);
create index if not exists consultant_tasks_consultant_id_status_due_at_idx on public.consultant_tasks(consultant_id, status, due_at);
create index if not exists conversion_records_user_id_created_at_idx on public.conversion_records(user_id, created_at desc);
create unique index if not exists ai_scenarios_title_uidx on public.ai_scenarios(title);

insert into public.ai_scenarios (
  title,
  description,
  level,
  scene_type,
  system_prompt,
  opening_message,
  status,
  sort_order
) values
  (
    'Daily Greeting',
    'A beginner-friendly daily conversation for lead capture and placement.',
    'beginner',
    'daily',
    'You are a friendly English coach. Keep replies short, correct mistakes gently, and ask one follow-up question each turn.',
    'Hi! Nice to meet you. What is your name?',
    'published',
    10
  ),
  (
    'Trial Class Interview',
    'A short placement chat before booking an offline trial class.',
    'a1',
    'interview',
    'You are an English placement teacher. Ask simple questions about the learner goal, age, school grade, and speaking confidence.',
    'Hello! I will ask a few simple questions before your trial class. Why do you want to learn English?',
    'published',
    20
  )
on conflict do nothing;
