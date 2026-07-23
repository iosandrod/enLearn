-- Seed content for the English training MVP funnel.

insert into public.courses (
  title,
  subtitle,
  description,
  cover_url,
  level,
  age_group,
  course_type,
  status,
  sort_order
) values
  (
    'Free Speaking Starter',
    'A 20-minute sample path for new learners',
    'Short pronunciation and daily speaking videos designed to help visitors experience the learning flow before booking a trial class.',
    '/hikari-landingpage.png',
    'beginner',
    'teen',
    'free',
    'published',
    10
  ),
  (
    'Parent Demo: Kids English',
    'Preview phonics and classroom interaction',
    'A lightweight preview for parents who want to understand how offline classes teach pronunciation, vocabulary, and confidence.',
    '/hikari-documentation.png',
    'kids',
    'kids',
    'trial',
    'published',
    20
  )
on conflict do nothing;

with starter as (
  select id from public.courses where title = 'Free Speaking Starter' limit 1
),
starter_section as (
  insert into public.course_sections (course_id, title, sort_order)
  select id, 'Starter Lessons', 10 from starter
  where not exists (
    select 1 from public.course_sections
    where course_id = starter.id and title = 'Starter Lessons'
  )
  returning id, course_id
)
insert into public.lessons (
  course_id,
  section_id,
  title,
  description,
  video_url,
  duration_seconds,
  lesson_type,
  is_free,
  sort_order,
  status
)
select
  starter_section.course_id,
  starter_section.id,
  lesson.title,
  lesson.description,
  lesson.video_url,
  lesson.duration_seconds,
  'video',
  true,
  lesson.sort_order,
  'published'
from starter_section
cross join (
  values
    ('Daily Greeting Practice', 'Practice simple self-introduction lines and greeting rhythm.', 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', 180, 10),
    ('Common Classroom Phrases', 'Learn phrases students use in an English classroom.', 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', 240, 20),
    ('Book a Trial Class Prompt', 'Prepare answers for a short level placement conversation.', 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', 210, 30)
) as lesson(title, description, video_url, duration_seconds, sort_order)
where not exists (
  select 1 from public.lessons
  where lessons.course_id = starter_section.course_id
    and lessons.title = lesson.title
);

with kids as (
  select id from public.courses where title = 'Parent Demo: Kids English' limit 1
),
kids_section as (
  insert into public.course_sections (course_id, title, sort_order)
  select id, 'Parent Preview', 10 from kids
  where not exists (
    select 1 from public.course_sections
    where course_id = kids.id and title = 'Parent Preview'
  )
  returning id, course_id
)
insert into public.lessons (
  course_id,
  section_id,
  title,
  description,
  video_url,
  duration_seconds,
  lesson_type,
  is_free,
  sort_order,
  status
)
select
  kids_section.course_id,
  kids_section.id,
  'Phonics Mini Class',
  'A short parent-facing preview of phonics teaching flow.',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  180,
  'video',
  true,
  10,
  'published'
from kids_section
where not exists (
  select 1 from public.lessons
  where lessons.course_id = kids_section.course_id
    and lessons.title = 'Phonics Mini Class'
);

insert into public.campuses (
  name,
  city,
  district,
  address,
  phone,
  latitude,
  longitude,
  status
) values
  (
    'Hikari English Downtown Campus',
    'Shanghai',
    'Huangpu',
    '88 Learning Road, Huangpu District',
    '400-800-1001',
    31.230400,
    121.473700,
    'active'
  ),
  (
    'Hikari English Pudong Campus',
    'Shanghai',
    'Pudong',
    '168 Future Avenue, Pudong New Area',
    '400-800-1002',
    31.221100,
    121.544000,
    'active'
  )
on conflict do nothing;

insert into public.trial_classes (
  campus_id,
  course_id,
  title,
  start_time,
  end_time,
  capacity,
  booked_count,
  status
)
select
  campuses.id,
  courses.id,
  'Offline Speaking Trial Class',
  timezone('utc'::text, now()) + interval '2 days',
  timezone('utc'::text, now()) + interval '2 days 1 hour',
  12,
  0,
  'open'
from public.campuses
cross join public.courses
where campuses.name = 'Hikari English Downtown Campus'
  and courses.title = 'Free Speaking Starter'
  and not exists (
    select 1 from public.trial_classes
    where trial_classes.campus_id = campuses.id
      and trial_classes.title = 'Offline Speaking Trial Class'
  );

insert into public.trial_classes (
  campus_id,
  course_id,
  title,
  start_time,
  end_time,
  capacity,
  booked_count,
  status
)
select
  campuses.id,
  courses.id,
  'Kids Phonics Trial Class',
  timezone('utc'::text, now()) + interval '3 days',
  timezone('utc'::text, now()) + interval '3 days 1 hour',
  10,
  0,
  'open'
from public.campuses
cross join public.courses
where campuses.name = 'Hikari English Pudong Campus'
  and courses.title = 'Parent Demo: Kids English'
  and not exists (
    select 1 from public.trial_classes
    where trial_classes.campus_id = campuses.id
      and trial_classes.title = 'Kids Phonics Trial Class'
  );
