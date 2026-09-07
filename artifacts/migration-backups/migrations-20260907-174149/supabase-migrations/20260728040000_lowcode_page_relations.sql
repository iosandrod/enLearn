-- A list page can point to one edit page; an edit page can be reused by many list pages.

alter table public.lowcode_pages
  add column if not exists edit_page_id uuid references public.lowcode_pages(id) on delete set null;

create index if not exists lowcode_pages_edit_page_id_idx
  on public.lowcode_pages(edit_page_id);

alter table public.lowcode_pages
  drop constraint if exists lowcode_pages_edit_page_not_self;

alter table public.lowcode_pages
  add constraint lowcode_pages_edit_page_not_self
  check (edit_page_id is null or edit_page_id <> id);

drop table if exists public.lowcode_page_relations;
