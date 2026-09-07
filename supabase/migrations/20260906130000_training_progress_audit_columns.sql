-- The generic training-progress grid sorts by created_at.  Add the standard
-- audit columns used by the other low-code entities so the table can be read
-- by the database-driven grid without a frontend exception.
begin;

alter table public.training_progress
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

drop trigger if exists set_training_progress_updated_at on public.training_progress;
create trigger set_training_progress_updated_at
before update on public.training_progress
for each row execute function public.set_updated_at();

create index if not exists training_progress_created_at_idx
  on public.training_progress (created_at desc);

update public.lowcode_pages page
set schema = jsonb_set(
      page.schema,
      '{blocks,1,schema,grid,columns}',
      (page.schema #> '{blocks,1,schema,grid,columns}') ||
        '[{"field":"created_at","title":"创建时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}}]'::jsonb,
      true
    ),
    version = coalesce(page.version, 0) + 1,
    published_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
where page.code = 'training-progress-list'
  and not exists (
    select 1
    from jsonb_array_elements(page.schema #> '{blocks,1,schema,grid,columns}') column_item
    where column_item->>'field' = 'created_at'
  );

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'training-progress-list'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

commit;
