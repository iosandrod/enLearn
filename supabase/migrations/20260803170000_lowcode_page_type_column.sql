-- Store the low-code page type as first-class page metadata.

alter table public.lowcode_pages
  add column if not exists page_type text;

update public.lowcode_pages
set page_type = case
  when schema->>'pageType' in ('list', 'edit', 'detail', 'custom')
    then schema->>'pageType'
  else 'custom'
end
where page_type is null
   or page_type not in ('list', 'edit', 'detail', 'custom');

update public.lowcode_pages
set schema = jsonb_set(
  coalesce(schema, '{}'::jsonb),
  '{pageType}',
  to_jsonb(page_type),
  true
)
where schema->>'pageType' is distinct from page_type;

alter table public.lowcode_pages
  alter column page_type set default 'custom';

alter table public.lowcode_pages
  alter column page_type set not null;

alter table public.lowcode_pages
  drop constraint if exists lowcode_pages_page_type_check;

alter table public.lowcode_pages
  add constraint lowcode_pages_page_type_check
  check (page_type in ('list', 'edit', 'detail', 'custom'));

create index if not exists lowcode_pages_page_type_idx
  on public.lowcode_pages(page_type);

create or replace function public.sync_lowcode_page_type()
returns trigger
language plpgsql
as $$
begin
  new.page_type = coalesce(new.page_type, 'custom');

  if new.page_type not in ('list', 'edit', 'detail', 'custom') then
    raise exception 'Invalid low-code page type: %', new.page_type
      using errcode = '23514';
  end if;

  new.schema = jsonb_set(
    coalesce(new.schema, '{}'::jsonb),
    '{pageType}',
    to_jsonb(new.page_type),
    true
  );

  return new;
end;
$$;

drop trigger if exists sync_lowcode_page_type on public.lowcode_pages;
create trigger sync_lowcode_page_type
before insert or update of page_type, schema on public.lowcode_pages
for each row
execute function public.sync_lowcode_page_type();

select pg_notify('pgrst', 'reload schema');
