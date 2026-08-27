-- Store resource categories in the unified planning_category table.
-- Keep the legacy resource.category/subcategory columns as synchronized projections.

begin;

alter table public.planning_category
  drop constraint if exists planning_category_target_type_check;
alter table public.planning_category
  add constraint planning_category_target_type_check
  check (target_type in ('item', 'customer', 'supplier', 'resource'));

alter table public.planning_resource
  add column if not exists category_id uuid;
create index if not exists idx_planning_resource_category
  on public.planning_resource(account_id, category_id);

alter table public.planning_resource drop constraint if exists planning_resource_category_id_account_fk;
alter table public.planning_resource add constraint planning_resource_category_id_account_fk
  foreign key (account_id, category_id)
  references public.planning_category(account_id, id)
  on delete restrict deferrable initially deferred;

-- Migrate existing resource text values into root/leaf category records.
with source_categories as (
  select account_id,
         nullif(btrim(category), '') as category_name,
         nullif(btrim(subcategory), '') as subcategory_name
  from public.planning_resource
), roots as (
  select account_id, category_name
  from source_categories
  where category_name is not null
  group by account_id, category_name
)
insert into public.planning_category (account_id, target_type, code, name, status, sort_order, source)
select account_id, 'resource', public.planning_normalize_category_code(category_name), category_name,
       'active', 0, 'legacy-resource-category-migration'
from roots
on conflict (account_id, target_type, code) do nothing;

with source_categories as (
  select account_id,
         nullif(btrim(category), '') as category_name,
         nullif(btrim(subcategory), '') as subcategory_name
  from public.planning_resource
), leaves as (
  select account_id, category_name, subcategory_name
  from source_categories
  where category_name is not null and subcategory_name is not null
  group by account_id, category_name, subcategory_name
)
insert into public.planning_category (account_id, target_type, code, name, parent_id, status, sort_order, source)
select leaves.account_id, 'resource', parent.code || '_' || public.planning_normalize_category_code(leaves.subcategory_name),
       leaves.subcategory_name, parent.id, 'active', 0, 'legacy-resource-category-migration'
from leaves
join public.planning_category parent
  on parent.account_id = leaves.account_id
 and parent.target_type = 'resource'
 and parent.parent_id is null
 and parent.name = leaves.category_name
on conflict (account_id, target_type, code) do nothing;

update public.planning_resource record
set category_id = coalesce(
  (
    select child.id
    from public.planning_category parent
    join public.planning_category child
      on child.account_id = parent.account_id
     and child.target_type = parent.target_type
     and child.parent_id = parent.id
     and child.name = nullif(btrim(record.subcategory), '')
    where parent.account_id = record.account_id
      and parent.target_type = 'resource'
      and parent.parent_id is null
      and parent.name = nullif(btrim(record.category), '')
    order by child.code
    limit 1
  ),
  (
    select parent.id
    from public.planning_category parent
    where parent.account_id = record.account_id
      and parent.target_type = 'resource'
      and parent.parent_id is null
      and parent.name = nullif(btrim(record.category), '')
    order by parent.code
    limit 1
  )
)
where record.category_id is null
  and nullif(btrim(record.category), '') is not null;

create or replace function public.planning_resource_sync_category()
returns trigger
language plpgsql
as $function$
declare
  selected_category public.planning_category%rowtype;
  root_category public.planning_category%rowtype;
  root_code text;
begin
  -- Accept legacy text writes and materialize them as resource categories.
  if (tg_op = 'INSERT' and new.category_id is null)
     or (tg_op = 'UPDATE'
         and new.category_id is not distinct from old.category_id
         and (new.category is distinct from old.category
              or new.subcategory is distinct from old.subcategory)) then
    if nullif(btrim(new.category), '') is null then
      new.category_id := null;
    else
      root_code := public.planning_normalize_category_code(new.category);
      insert into public.planning_category (account_id, target_type, code, name, status, sort_order, source)
      values (new.account_id, 'resource', root_code, btrim(new.category), 'active', 0, 'resource-category-entry')
      on conflict (account_id, target_type, code) do update
        set name = excluded.name;

      select * into selected_category
      from public.planning_category
      where account_id = new.account_id and target_type = 'resource' and code = root_code;

      if nullif(btrim(new.subcategory), '') is not null then
        insert into public.planning_category (account_id, target_type, code, name, parent_id, status, sort_order, source)
        values (
          new.account_id, 'resource', root_code || '_' || public.planning_normalize_category_code(new.subcategory),
          btrim(new.subcategory), selected_category.id, 'active', 0, 'resource-category-entry'
        )
        on conflict (account_id, target_type, code) do update
          set name = excluded.name, parent_id = excluded.parent_id;
        select id into new.category_id
        from public.planning_category
        where account_id = new.account_id
          and target_type = 'resource'
          and parent_id = selected_category.id
          and name = btrim(new.subcategory)
        order by code
        limit 1;
      else
        new.category_id := selected_category.id;
      end if;
    end if;
  end if;

  if new.category_id is null then
    new.category := null;
    new.subcategory := null;
    return new;
  end if;

  select * into selected_category
  from public.planning_category
  where account_id = new.account_id and id = new.category_id;
  if not found then
    raise exception 'Category does not belong to this account.' using errcode = '23503';
  end if;
  if selected_category.target_type <> 'resource' then
    raise exception 'Category target type % cannot be assigned to resource.', selected_category.target_type using errcode = '23514';
  end if;
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and selected_category.status <> 'active' then
    raise exception 'Inactive categories cannot be newly assigned.' using errcode = '23514';
  end if;

  with recursive ancestors(id, parent_id, depth) as (
    select selected_category.id, selected_category.parent_id, 0
    union all
    select parent.id, parent.parent_id, ancestors.depth + 1
    from public.planning_category parent
    join ancestors on ancestors.parent_id = parent.id
    where parent.account_id = new.account_id and parent.target_type = 'resource'
  )
  select category.* into root_category
  from ancestors
  join public.planning_category category
    on category.account_id = new.account_id and category.id = ancestors.id
  order by ancestors.depth desc
  limit 1;

  new.category := root_category.name;
  new.subcategory := case when root_category.id = selected_category.id then null else selected_category.name end;
  return new;
end;
$function$;

drop trigger if exists planning_resource_category_sync on public.planning_resource;
create trigger planning_resource_category_sync
before insert or update of category_id, category, subcategory on public.planning_resource
for each row execute function public.planning_resource_sync_category();

create or replace function public.planning_resource_clear_category()
returns trigger
language plpgsql
as $function$
begin
  new.category := null;
  new.subcategory := null;
  return new;
end;
$function$;

drop trigger if exists planning_resource_category_clear on public.planning_resource;
create trigger planning_resource_category_clear
before update of category_id on public.planning_resource
for each row
when (old.category_id is not null and new.category_id is null)
execute function public.planning_resource_clear_category();

create or replace function public.planning_protect_category_change()
returns trigger
language plpgsql
as $function$
begin
  if new.account_id is distinct from old.account_id or new.target_type is distinct from old.target_type then
    if exists (select 1 from public.planning_category child where child.account_id = old.account_id and child.parent_id = old.id)
       or exists (select 1 from public.planning_item record where record.account_id = old.account_id and record.category_id = old.id)
       or exists (select 1 from public.planning_customer record where record.account_id = old.account_id and record.category_id = old.id)
       or exists (select 1 from public.planning_supplier record where record.account_id = old.account_id and record.category_id = old.id)
       or exists (select 1 from public.planning_resource record where record.account_id = old.account_id and record.category_id = old.id) then
      raise exception 'A referenced category cannot change account or target type.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.planning_resync_category_assignments()
returns trigger
language plpgsql
as $function$
declare category_ids uuid[];
begin
  if new.name is not distinct from old.name and new.parent_id is not distinct from old.parent_id then return new; end if;
  with recursive subtree(id) as (
    select new.id
    union all
    select child.id from public.planning_category child join subtree parent on child.parent_id = parent.id
    where child.account_id = new.account_id and child.target_type = new.target_type
  ) select array_agg(id) into category_ids from subtree;
  if new.target_type = 'item' then
    update public.planning_item set category_id = public.planning_item.category_id where account_id = new.account_id and category_id = any(category_ids);
  elsif new.target_type = 'customer' then
    update public.planning_customer set category_id = public.planning_customer.category_id where account_id = new.account_id and category_id = any(category_ids);
  elsif new.target_type = 'supplier' then
    update public.planning_supplier set category_id = public.planning_supplier.category_id where account_id = new.account_id and category_id = any(category_ids);
  elsif new.target_type = 'resource' then
    update public.planning_resource set category_id = public.planning_resource.category_id where account_id = new.account_id and category_id = any(category_ids);
  end if;
  return new;
end;
$function$;

comment on column public.planning_resource.category_id is '{"title":"类别","type":"text","align":"left","description":"关联统一主数据类别表中的资源类别。"}';
comment on column public.planning_category.target_type is '{"title":"类别对象","type":"text","align":"left","description":"标识类别适用于物料、客户、供应商或资源。"}';

select pg_notify('pgrst', 'reload schema');

commit;
