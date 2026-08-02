-- Use lowcode_pages.edit_page_id as the only list-to-edit page link.

alter table public.lowcode_pages
  add column if not exists edit_page_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_attribute column_row
      on column_row.attrelid = constraint_row.conrelid
     and column_row.attnum = any (constraint_row.conkey)
    where constraint_row.contype = 'f'
      and constraint_row.conrelid = 'public.lowcode_pages'::regclass
      and constraint_row.confrelid = 'public.lowcode_pages'::regclass
      and column_row.attname = 'edit_page_id'
  ) then
    alter table public.lowcode_pages
      add constraint lowcode_pages_edit_page_id_fkey
      foreign key (edit_page_id)
      references public.lowcode_pages(id)
      on delete set null;
  end if;
end $$;

create index if not exists lowcode_pages_edit_page_id_idx
  on public.lowcode_pages(edit_page_id);

alter table public.lowcode_pages
  drop constraint if exists lowcode_pages_edit_page_not_self;

alter table public.lowcode_pages
  add constraint lowcode_pages_edit_page_not_self
  check (edit_page_id is null or edit_page_id <> id);

update public.lowcode_pages as list_page
set
  edit_page_id = edit_page.id,
  updated_at = timezone('utc'::text, now())
from public.lowcode_pages as edit_page
where list_page.edit_page_id is null
  and edit_page.code = list_page.code || '-edit'
  and edit_page.schema->>'pageType' = 'edit';

drop table if exists public.lowcode_page_relations;

select pg_notify('pgrst', 'reload schema');
