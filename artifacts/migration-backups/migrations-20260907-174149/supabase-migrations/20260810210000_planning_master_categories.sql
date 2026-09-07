-- Unified master-data categories for planning.
-- Scope: planning_category plus category assignments for items, customers and suppliers.

begin;

create table if not exists public.planning_category (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "target_type" text not null check ("target_type" in ('item', 'customer', 'supplier')),
  "code" text not null,
  "name" text not null,
  "parent_id" uuid,
  "description" text,
  "status" text not null default 'active' check ("status" in ('active', 'inactive')),
  "sort_order" integer default 0,
  "metadata" jsonb default '{}'::jsonb,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "target_type", "code")
);

alter table public.planning_item
  add column if not exists category_id uuid;
create index if not exists idx_planning_item_category
  on public.planning_item(account_id, category_id);

alter table public.planning_customer
  add column if not exists category_id uuid;
create index if not exists idx_planning_customer_category
  on public.planning_customer(account_id, category_id);

alter table public.planning_supplier
  add column if not exists category_id uuid;
create index if not exists idx_planning_supplier_category
  on public.planning_supplier(account_id, category_id);

alter table public.planning_category drop constraint if exists planning_category_parent_id_account_fk;
alter table public.planning_category add constraint planning_category_parent_id_account_fk
  foreign key (account_id, "parent_id") references public.planning_category(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_item drop constraint if exists planning_item_category_id_account_fk;
alter table public.planning_item add constraint planning_item_category_id_account_fk
  foreign key (account_id, category_id)
  references public.planning_category(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_customer drop constraint if exists planning_customer_category_id_account_fk;
alter table public.planning_customer add constraint planning_customer_category_id_account_fk
  foreign key (account_id, category_id)
  references public.planning_category(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_supplier drop constraint if exists planning_supplier_category_id_account_fk;
alter table public.planning_supplier add constraint planning_supplier_category_id_account_fk
  foreign key (account_id, category_id)
  references public.planning_category(account_id, id)
  on delete restrict deferrable initially deferred;

create or replace function public.planning_set_audit_fields()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := timezone('utc'::text, now());
  if to_jsonb(new) ? 'lastmodified' then
    new := jsonb_populate_record(new, jsonb_build_object('lastmodified', timezone('utc'::text, now())));
  end if;
  if to_jsonb(new) ? 'attempted_at' and (to_jsonb(new)->>'attempted_at') is null then
    new := jsonb_populate_record(new, jsonb_build_object('attempted_at', timezone('utc'::text, now())));
  end if;
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, new.updated_at);
  end if;
  return new;
end;
$function$;

create index if not exists idx_planning_category_account
  on public.planning_category(account_id);
create index if not exists idx_planning_category_updated
  on public.planning_category(account_id, updated_at desc);
create index if not exists idx_planning_category_tree
  on public.planning_category(account_id, target_type, parent_id, sort_order, code);

alter table public.planning_category enable row level security;

drop policy if exists "Planning viewers can read planning_category" on public.planning_category;
create policy "Planning viewers can read planning_category" on public.planning_category
  for select to authenticated
  using (
    public.has_account_permission(account_id, 'planning.models.view')
    or public.has_account_permission(account_id, 'planning.models.manage')
  );

drop policy if exists "Planning managers can insert planning_category" on public.planning_category;
create policy "Planning managers can insert planning_category" on public.planning_category
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));

drop policy if exists "Planning managers can update planning_category" on public.planning_category;
create policy "Planning managers can update planning_category" on public.planning_category
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));

drop policy if exists "Planning managers can delete planning_category" on public.planning_category;
create policy "Planning managers can delete planning_category" on public.planning_category
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));

grant select, insert, update, delete on public.planning_category to authenticated, service_role;

drop trigger if exists planning_category_audit on public.planning_category;
create trigger planning_category_audit
before insert or update on public.planning_category
for each row execute function public.planning_set_audit_fields();

create or replace function public.planning_validate_category_parent()
returns trigger
language plpgsql
as $function$
declare
  parent_category public.planning_category%rowtype;
  cursor_id uuid;
begin
  if new.parent_id is null then return new; end if;

  select * into parent_category
  from public.planning_category
  where account_id = new.account_id and id = new.parent_id;
  if not found or parent_category.target_type <> new.target_type then
    raise exception 'Category parent must use the same account and target type.' using errcode = '23514';
  end if;

  cursor_id := new.parent_id;
  while cursor_id is not null loop
    if cursor_id = new.id then
      raise exception 'Category hierarchy cannot contain a cycle.' using errcode = '23514';
    end if;
    select parent_id into cursor_id
    from public.planning_category
    where account_id = new.account_id and id = cursor_id;
  end loop;
  return new;
end;
$function$;

drop trigger if exists planning_category_parent_guard on public.planning_category;
create trigger planning_category_parent_guard
before insert or update of account_id, target_type, parent_id on public.planning_category
for each row execute function public.planning_validate_category_parent();

create or replace function public.planning_protect_category_change()
returns trigger
language plpgsql
as $function$
begin
  if new.account_id is distinct from old.account_id
     or new.target_type is distinct from old.target_type
  then
    if exists (
      select 1 from public.planning_category child
      where child.account_id = old.account_id and child.parent_id = old.id
    ) or exists (
      select 1 from public.planning_item record
      where record.account_id = old.account_id and record.category_id = old.id
    ) or exists (
      select 1 from public.planning_customer record
      where record.account_id = old.account_id and record.category_id = old.id
    ) or exists (
      select 1 from public.planning_supplier record
      where record.account_id = old.account_id and record.category_id = old.id
    ) then
      raise exception 'A referenced category cannot change account or target type.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists planning_category_change_guard on public.planning_category;
create trigger planning_category_change_guard
before update of account_id, target_type on public.planning_category
for each row execute function public.planning_protect_category_change();

create or replace function public.planning_item_sync_category()
returns trigger
language plpgsql
as $function$
declare
  selected_category public.planning_category%rowtype;
  root_category public.planning_category%rowtype;
begin
  if new.category_id is null then
    return new;
  end if;

  select * into selected_category
  from public.planning_category
  where account_id = new.account_id and id = new.category_id;
  if not found then
    raise exception 'Category does not belong to this account.' using errcode = '23503';
  end if;
  if selected_category.target_type <> 'item' then
    raise exception 'Category target type % cannot be assigned to item.', selected_category.target_type using errcode = '23514';
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
    where parent.account_id = new.account_id
      and parent.target_type = selected_category.target_type
  )
  select category.* into root_category
  from ancestors
  join public.planning_category category
    on category.account_id = new.account_id and category.id = ancestors.id
  order by ancestors.depth desc
  limit 1;

  new.category := root_category.name;
  new.subcategory := case
    when root_category.id = selected_category.id then null
    else selected_category.name
  end;
  return new;
end;
$function$;

drop trigger if exists planning_item_category_sync on public.planning_item;
create trigger planning_item_category_sync
before insert or update of category_id on public.planning_item
for each row execute function public.planning_item_sync_category();

create or replace function public.planning_customer_sync_category()
returns trigger
language plpgsql
as $function$
declare
  selected_category public.planning_category%rowtype;
  root_category public.planning_category%rowtype;
begin
  if new.category_id is null then
    return new;
  end if;

  select * into selected_category
  from public.planning_category
  where account_id = new.account_id and id = new.category_id;
  if not found then
    raise exception 'Category does not belong to this account.' using errcode = '23503';
  end if;
  if selected_category.target_type <> 'customer' then
    raise exception 'Category target type % cannot be assigned to customer.', selected_category.target_type using errcode = '23514';
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
    where parent.account_id = new.account_id
      and parent.target_type = selected_category.target_type
  )
  select category.* into root_category
  from ancestors
  join public.planning_category category
    on category.account_id = new.account_id and category.id = ancestors.id
  order by ancestors.depth desc
  limit 1;

  new.category := root_category.name;
  new.subcategory := case
    when root_category.id = selected_category.id then null
    else selected_category.name
  end;
  return new;
end;
$function$;

drop trigger if exists planning_customer_category_sync on public.planning_customer;
create trigger planning_customer_category_sync
before insert or update of category_id on public.planning_customer
for each row execute function public.planning_customer_sync_category();

create or replace function public.planning_supplier_sync_category()
returns trigger
language plpgsql
as $function$
declare
  selected_category public.planning_category%rowtype;
  root_category public.planning_category%rowtype;
begin
  if new.category_id is null then
    return new;
  end if;

  select * into selected_category
  from public.planning_category
  where account_id = new.account_id and id = new.category_id;
  if not found then
    raise exception 'Category does not belong to this account.' using errcode = '23503';
  end if;
  if selected_category.target_type <> 'supplier' then
    raise exception 'Category target type % cannot be assigned to supplier.', selected_category.target_type using errcode = '23514';
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
    where parent.account_id = new.account_id
      and parent.target_type = selected_category.target_type
  )
  select category.* into root_category
  from ancestors
  join public.planning_category category
    on category.account_id = new.account_id and category.id = ancestors.id
  order by ancestors.depth desc
  limit 1;

  new.category := root_category.name;
  new.subcategory := case
    when root_category.id = selected_category.id then null
    else selected_category.name
  end;
  return new;
end;
$function$;

drop trigger if exists planning_supplier_category_sync on public.planning_supplier;
create trigger planning_supplier_category_sync
before insert or update of category_id on public.planning_supplier
for each row execute function public.planning_supplier_sync_category();

create or replace function public.planning_item_clear_category()
returns trigger
language plpgsql
as $function$
begin
  new.category := null;
  new.subcategory := null;
  return new;
end;
$function$;

create or replace function public.planning_customer_clear_category()
returns trigger
language plpgsql
as $function$
begin
  new.category := null;
  new.subcategory := null;
  return new;
end;
$function$;

create or replace function public.planning_supplier_clear_category()
returns trigger
language plpgsql
as $function$
begin
  new.category := null;
  new.subcategory := null;
  return new;
end;
$function$;

drop trigger if exists planning_item_category_clear on public.planning_item;
drop trigger if exists planning_customer_category_clear on public.planning_customer;
drop trigger if exists planning_supplier_category_clear on public.planning_supplier;

alter table public.planning_category
  drop constraint if exists planning_category_parent_not_self_check;
alter table public.planning_category
  add constraint planning_category_parent_not_self_check
  check (parent_id is null or parent_id <> id);

create or replace function public.planning_normalize_category_code(p_value text)
returns text
language sql
immutable
strict
as $function$
  select coalesce(
    nullif(upper(trim(both '_' from regexp_replace(btrim(p_value), '[^A-Za-z0-9]+', '_', 'g'))), ''),
    'CAT_' || upper(left(md5(btrim(p_value)), 12))
  )
$function$;

with source_categories as (
  select account_id, 'item'::text as target_type,
         nullif(btrim(category), '') as category_name,
         nullif(btrim(subcategory), '') as subcategory_name
  from public.planning_item
  union all
  select account_id, 'customer'::text as target_type,
         nullif(btrim(category), '') as category_name,
         nullif(btrim(subcategory), '') as subcategory_name
  from public.planning_customer
  union all
  select account_id, 'supplier'::text as target_type,
         nullif(btrim(category), '') as category_name,
         nullif(btrim(subcategory), '') as subcategory_name
  from public.planning_supplier
), root_categories as (
  select account_id, target_type, category_name
  from source_categories
  where category_name is not null
  group by account_id, target_type, category_name
), normalized_roots as (
  select *, public.planning_normalize_category_code(category_name) as base_code
  from root_categories
), ranked_roots as (
  select *, row_number() over (
    partition by account_id, target_type, base_code
    order by category_name
  ) as code_rank
  from normalized_roots
)
insert into public.planning_category (
  account_id, target_type, code, name, status, sort_order, source
)
select account_id, target_type,
       base_code || case when code_rank = 1 then '' else '_' || code_rank::text end,
       category_name, 'active', 0, 'legacy-category-migration'
from ranked_roots
on conflict (account_id, target_type, code) do nothing;

with source_categories as (
  select account_id, 'item'::text as target_type,
         nullif(btrim(category), '') as category_name,
         nullif(btrim(subcategory), '') as subcategory_name
  from public.planning_item
  union all
  select account_id, 'customer'::text as target_type,
         nullif(btrim(category), '') as category_name,
         nullif(btrim(subcategory), '') as subcategory_name
  from public.planning_customer
  union all
  select account_id, 'supplier'::text as target_type,
         nullif(btrim(category), '') as category_name,
         nullif(btrim(subcategory), '') as subcategory_name
  from public.planning_supplier
), child_categories as (
  select account_id, target_type, category_name, subcategory_name
  from source_categories
  where category_name is not null and subcategory_name is not null
  group by account_id, target_type, category_name, subcategory_name
), resolved_children as (
  select source.*, parent.id as parent_id, parent.code as parent_code
  from child_categories source
  join public.planning_category parent
    on parent.account_id = source.account_id
   and parent.target_type = source.target_type
   and parent.parent_id is null
   and parent.name = source.category_name
), normalized_children as (
  select *, parent_code || '_' ||
    public.planning_normalize_category_code(subcategory_name) as base_code
  from resolved_children
), ranked_children as (
  select *, row_number() over (
    partition by account_id, target_type, base_code
    order by parent_id, subcategory_name
  ) as code_rank
  from normalized_children
)
insert into public.planning_category (
  account_id, target_type, code, name, parent_id, status, sort_order, source
)
select account_id, target_type,
       base_code || case when code_rank = 1 then '' else '_' || code_rank::text end,
       subcategory_name, parent_id, 'active', 0, 'legacy-category-migration'
from ranked_children
on conflict (account_id, target_type, code) do nothing;

update public.planning_item record
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
      and parent.target_type = 'item'
      and parent.parent_id is null
      and parent.name = nullif(btrim(record.category), '')
    order by child.code
    limit 1
  ),
  (
    select parent.id
    from public.planning_category parent
    where parent.account_id = record.account_id
      and parent.target_type = 'item'
      and parent.parent_id is null
      and parent.name = nullif(btrim(record.category), '')
    order by parent.code
    limit 1
  )
)
where record.category_id is null
  and nullif(btrim(record.category), '') is not null;

update public.planning_customer record
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
      and parent.target_type = 'customer'
      and parent.parent_id is null
      and parent.name = nullif(btrim(record.category), '')
    order by child.code
    limit 1
  ),
  (
    select parent.id
    from public.planning_category parent
    where parent.account_id = record.account_id
      and parent.target_type = 'customer'
      and parent.parent_id is null
      and parent.name = nullif(btrim(record.category), '')
    order by parent.code
    limit 1
  )
)
where record.category_id is null
  and nullif(btrim(record.category), '') is not null;

update public.planning_supplier record
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
      and parent.target_type = 'supplier'
      and parent.parent_id is null
      and parent.name = nullif(btrim(record.category), '')
    order by child.code
    limit 1
  ),
  (
    select parent.id
    from public.planning_category parent
    where parent.account_id = record.account_id
      and parent.target_type = 'supplier'
      and parent.parent_id is null
      and parent.name = nullif(btrim(record.category), '')
    order by parent.code
    limit 1
  )
)
where record.category_id is null
  and nullif(btrim(record.category), '') is not null;

set constraints all immediate;

create or replace function public.planning_resync_category_assignments()
returns trigger
language plpgsql
as $function$
declare
  category_ids uuid[];
begin
  if new.name is not distinct from old.name
     and new.parent_id is not distinct from old.parent_id then
    return new;
  end if;

  with recursive subtree(id) as (
    select new.id
    union all
    select child.id
    from public.planning_category child
    join subtree parent on child.parent_id = parent.id
    where child.account_id = new.account_id
      and child.target_type = new.target_type
  )
  select array_agg(id) into category_ids from subtree;

  if new.target_type = 'item' then
    update public.planning_item record
    set category_id = record.category_id
    where record.account_id = new.account_id
      and record.category_id = any(category_ids);
  elsif new.target_type = 'customer' then
    update public.planning_customer record
    set category_id = record.category_id
    where record.account_id = new.account_id
      and record.category_id = any(category_ids);
  elsif new.target_type = 'supplier' then
    update public.planning_supplier record
    set category_id = record.category_id
    where record.account_id = new.account_id
      and record.category_id = any(category_ids);
  end if;
  return new;
end;
$function$;

drop trigger if exists planning_category_assignment_resync on public.planning_category;
create trigger planning_category_assignment_resync
after update of name, parent_id on public.planning_category
for each row execute function public.planning_resync_category_assignments();

drop trigger if exists planning_item_category_clear on public.planning_item;
create trigger planning_item_category_clear
before update of category_id on public.planning_item
for each row
when (old.category_id is not null and new.category_id is null)
execute function public.planning_item_clear_category();

drop trigger if exists planning_customer_category_clear on public.planning_customer;
create trigger planning_customer_category_clear
before update of category_id on public.planning_customer
for each row
when (old.category_id is not null and new.category_id is null)
execute function public.planning_customer_clear_category();

drop trigger if exists planning_supplier_category_clear on public.planning_supplier;
create trigger planning_supplier_category_clear
before update of category_id on public.planning_supplier
for each row
when (old.category_id is not null and new.category_id is null)
execute function public.planning_supplier_clear_category();

drop trigger if exists planning_item_category_legacy_fields_sync on public.planning_item;
create trigger planning_item_category_legacy_fields_sync
before update of category, subcategory on public.planning_item
for each row
when (new.category_id is not null)
execute function public.planning_item_sync_category();

drop trigger if exists planning_customer_category_legacy_fields_sync on public.planning_customer;
create trigger planning_customer_category_legacy_fields_sync
before update of category, subcategory on public.planning_customer
for each row
when (new.category_id is not null)
execute function public.planning_customer_sync_category();

drop trigger if exists planning_supplier_category_legacy_fields_sync on public.planning_supplier;
create trigger planning_supplier_category_legacy_fields_sync
before update of category, subcategory on public.planning_supplier
for each row
when (new.category_id is not null)
execute function public.planning_supplier_sync_category();

select public.register_dynamic_crud_resource(
  'planning_category',
  'planning_category',
  encode(digest(convert_to('{"resource_name":"planning_category","resources":{"planning_category":{"code":"planning_category","table_name":"planning_category","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["target_type","code","name","parent_id","description","status","sort_order","metadata","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["target_type","code","name","parent_id","description","status","sort_order","metadata","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["target_type","code","name","status"],"timestamp":true},"update":{"allowed_fields":["target_type","code","name","parent_id","description","status","sort_order","metadata","source","account_id","updated_at","updated_by"],"input_allowed_fields":["target_type","code","name","parent_id","description","status","sort_order","metadata","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_category","resources":{"planning_category":{"code":"planning_category","table_name":"planning_category","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["target_type","code","name","parent_id","description","status","sort_order","metadata","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["target_type","code","name","parent_id","description","status","sort_order","metadata","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["target_type","code","name","status"],"timestamp":true},"update":{"allowed_fields":["target_type","code","name","parent_id","description","status","sort_order","metadata","source","account_id","updated_at","updated_by"],"input_allowed_fields":["target_type","code","name","parent_id","description","status","sort_order","metadata","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_customer',
  'planning_customer',
  encode(digest(convert_to('{"resource_name":"planning_customer","resources":{"planning_customer":{"code":"planning_customer","table_name":"planning_customer","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_customer","resources":{"planning_customer":{"code":"planning_customer","table_name":"planning_customer","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_item',
  'planning_item',
  encode(digest(convert_to('{"resource_name":"planning_item","resources":{"planning_item":{"code":"planning_item","table_name":"planning_item","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category_id","cost","type","weight","volume","periodofcover","uom","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category_id","cost","type","weight","volume","periodofcover","uom","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category_id","cost","type","weight","volume","periodofcover","uom","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category_id","cost","type","weight","volume","periodofcover","uom","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_item","resources":{"planning_item":{"code":"planning_item","table_name":"planning_item","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category_id","cost","type","weight","volume","periodofcover","uom","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category_id","cost","type","weight","volume","periodofcover","uom","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category_id","cost","type","weight","volume","periodofcover","uom","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category_id","cost","type","weight","volume","periodofcover","uom","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_supplier',
  'planning_supplier',
  encode(digest(convert_to('{"resource_name":"planning_supplier","resources":{"planning_supplier":{"code":"planning_supplier","table_name":"planning_supplier","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category_id","available_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category_id","available_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category_id","available_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category_id","available_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_supplier","resources":{"planning_supplier":{"code":"planning_supplier","table_name":"planning_supplier","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category_id","available_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category_id","available_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category_id","available_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category_id","available_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive, schema, version, published_at
) values
  ('planning_category-list', '/dashboard/planning/category', '主数据类别', '统一维护物料、客户和供应商的账套级层级类别。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_category-list","route":"/dashboard/planning/category","title":"主数据类别","description":"统一维护物料、客户和供应商的账套级层级类别。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_categoryRows":{"key":"planning_categoryRows","label":"主数据类别数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_category","postData":{"resource":"planning_category","tableName":"planning_category","limit":300,"orderBy":"code","orderDirection":"asc"},"autoLoad":true},"planning_categoryOptions":{"key":"planning_categoryOptions","label":"上级类别选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_category","labelField":"name","filters":{"status":"active","target_type":"{{ forms.planning_category_edit_form.target_type }}"},"tree":true},"autoLoad":true}},"blocks":[{"id":"planning_category-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/category/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_categoryRows"]}]}]},{"id":"planning_category-search","kind":"searchForm","targetSourceKey":"planning_categoryRows","schema":{"columns":4,"fields":[{"field":"name","label":"类别名称","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"启用","value":"active"},{"label":"停用","value":"inactive"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_category-grid","kind":"grid","title":"主数据类别列表","sourceKey":"planning_categoryRows","sourceType":"custom","tableName":"planning_category","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"target_type","title":"类别对象","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"item":"物料","customer":"客户","supplier":"供应商"},"emptyText":"-"}},{"field":"code","title":"类别编码","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"name","title":"类别名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"status","title":"状态","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"active":"启用","inactive":"停用"},"emptyText":"-"}},{"field":"parent_id_label","title":"上级类别","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"sort_order","title":"排序","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"metadata","title":"扩展信息","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_category-edit', '/dashboard/planning/category/edit', '主数据类别编辑', '统一维护物料、客户和供应商的账套级层级类别。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_category-edit","route":"/dashboard/planning/category/edit","title":"主数据类别编辑","description":"统一维护物料、客户和供应商的账套级层级类别。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_categoryRows":{"key":"planning_categoryRows","label":"主数据类别数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_category","postData":{"resource":"planning_category","tableName":"planning_category","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_categoryOptions":{"key":"planning_categoryOptions","label":"上级类别选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_category","labelField":"name","excludeId":"{{ forms.planning_category_edit_form.id }}","filters":{"status":"active","target_type":"{{ forms.planning_category_edit_form.target_type }}"},"tree":true},"loadAfterSourceKeys":["planning_categoryRows"],"autoLoad":true}},"blocks":[{"id":"planning_category-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/category"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_categoryRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_categoryRows","serviceMethod":"saveItem","postData":{"resource":"planning_category","id":"{{ forms.planning_category_edit_form.id }}","data":{"target_type":"{{ forms.planning_category_edit_form.target_type }}","code":"{{ forms.planning_category_edit_form.code }}","name":"{{ forms.planning_category_edit_form.name }}","parent_id":"{{ forms.planning_category_edit_form.parent_id }}","description":"{{ forms.planning_category_edit_form.description }}","status":"{{ forms.planning_category_edit_form.status }}","sort_order":"{{ forms.planning_category_edit_form.sort_order }}","metadata":"{{ forms.planning_category_edit_form.metadata }}","source":"{{ forms.planning_category_edit_form.source }}"}},"assignTo":"planning_categorySaved"},{"type":"navigate","route":"/dashboard/planning/category/edit?id={{ data.planning_categorySaved.id }}&fromPage=planning_category-list"},{"type":"showMessage","status":"success","message":"主数据类别已保存。"}]}]},{"id":"planning_category-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_category_edit_form","kind":"form","title":"主数据类别信息","sourceKey":"planning_categoryRows","submitSourceKey":"planning_categoryRows","initialValues":{"id":"","target_type":"","code":"","name":"","parent_id":"","description":"","status":"active","sort_order":0,"metadata":{},"source":""},"schema":{"columns":4,"fields":[{"field":"target_type","label":"类别对象","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入类别对象"},"options":[{"label":"物料","value":"item"},{"label":"客户","value":"customer"},{"label":"供应商","value":"supplier"}],"rules":[{"required":true,"message":"请输入类别对象"}],"events":{"change":[{"type":"setFormField","blockId":"planning_category_edit_form","field":"parent_id","value":""},{"type":"refreshDataSources","sourceKeys":["planning_categoryOptions"]}]}},{"field":"code","label":"类别编码","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入类别编码"},"rules":[{"required":true,"message":"请输入类别编码"}]},{"field":"name","label":"类别名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入类别名称"},"rules":[{"required":true,"message":"请输入类别名称"}]},{"field":"parent_id","label":"上级类别","component":"vxe-tree-select","span":2,"props":{"clearable":true,"placeholder":"请选择上级类别","filterable":true},"optionsSourceKey":"planning_categoryOptions","optionProps":{"label":"label","value":"id","children":"children"}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态"},"options":[{"label":"启用","value":"active"},{"label":"停用","value":"inactive"}],"rules":[{"required":true,"message":"请输入状态"}]},{"field":"sort_order","label":"排序","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入排序","type":"number"}},{"field":"metadata","label":"扩展信息","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入扩展信息"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.layout is distinct from excluded.layout
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then public.lowcode_pages.version + 1
    else public.lowcode_pages.version
  end,
  published_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
    then excluded.published_at
    else public.lowcode_pages.published_at
  end,
  updated_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.layout is distinct from excluded.layout
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then timezone('utc'::text, now())
    else public.lowcode_pages.updated_at
  end;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_category-list', 'planning_category-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_category-list'
  and edit_page.code = 'planning_category-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_category', '主数据类别', 'public.planning_category',
  '/dashboard/planning/category', 'planning_category-list', 'ri-folder-tree-line', '统一维护物料、客户和供应商的账套级层级类别。',
  'id', 'active', 319, '{"sourceTable":"category","freppleModel":"category","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"target_type","label":"类别对象","kind":"text","required":true,"options":[{"label":"物料","value":"item"},{"label":"客户","value":"customer"},{"label":"供应商","value":"supplier"}]},{"name":"code","label":"类别编码","kind":"text","required":true},{"name":"name","label":"类别名称","kind":"text","required":true},{"name":"parent_id","label":"上级类别","kind":"relation","relation":"planning_category","relationFilters":{"status":"active"},"relationFilterBindings":{"target_type":"target_type"},"relationLabelField":"name","relationOnDelete":"restrict","relationTree":true},{"name":"description","label":"说明","kind":"text"},{"name":"status","label":"状态","kind":"text","required":true,"default":"active","options":[{"label":"启用","value":"active"},{"label":"停用","value":"inactive"}]},{"name":"sort_order","label":"排序","kind":"integer","default":0},{"name":"metadata","label":"扩展信息","kind":"json","default":{}},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
)
on conflict (code) do update set
  title = excluded.title,
  table_name = excluded.table_name,
  route_path = excluded.route_path,
  page_code = excluded.page_code,
  icon = excluded.icon,
  description = excluded.description,
  primary_key = excluded.primary_key,
  status = excluded.status,
  sort_order = excluded.sort_order,
  schema = excluded.schema,
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive, schema, version, published_at
) values
  ('planning_customer-list', '/dashboard/planning/customer', '客户', '计划需求所引用的客户主数据。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_customer-list","route":"/dashboard/planning/customer","title":"客户","description":"计划需求所引用的客户主数据。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_customerRows":{"key":"planning_customerRows","label":"客户数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_customer","postData":{"resource":"planning_customer","tableName":"planning_customer","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true},"planning_categoryOptions":{"key":"planning_categoryOptions","label":"类别选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_category","labelField":"name","filters":{"target_type":"customer","status":"active"},"tree":true},"autoLoad":true}},"blocks":[{"id":"planning_customer-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/customer/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_customerRows"]}]}]},{"id":"planning_customer-search","kind":"searchForm","targetSourceKey":"planning_customerRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_customer-grid","kind":"grid","title":"客户列表","sourceKey":"planning_customerRows","sourceType":"custom","tableName":"planning_customer","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"owner_id_label","title":"上级","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"category_id_label","title":"类别","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lft","title":"左节点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"rght","title":"右节点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"lvl","title":"层级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"category","title":"分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_customer-edit', '/dashboard/planning/customer/edit', '客户编辑', '计划需求所引用的客户主数据。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_customer-edit","route":"/dashboard/planning/customer/edit","title":"客户编辑","description":"计划需求所引用的客户主数据。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_customerRows":{"key":"planning_customerRows","label":"客户数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_customer","postData":{"resource":"planning_customer","tableName":"planning_customer","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name","excludeId":"{{ forms.planning_customer_edit_form.id }}"},"autoLoad":true},"planning_categoryOptions":{"key":"planning_categoryOptions","label":"类别选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_category","labelField":"name","filters":{"target_type":"customer","status":"active"},"tree":true},"autoLoad":true}},"blocks":[{"id":"planning_customer-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/customer"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_customerRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_customerRows","serviceMethod":"saveItem","postData":{"resource":"planning_customer","id":"{{ forms.planning_customer_edit_form.id }}","data":{"name":"{{ forms.planning_customer_edit_form.name }}","owner_id":"{{ forms.planning_customer_edit_form.owner_id }}","description":"{{ forms.planning_customer_edit_form.description }}","category_id":"{{ forms.planning_customer_edit_form.category_id }}","source":"{{ forms.planning_customer_edit_form.source }}"}},"assignTo":"planning_customerSaved"},{"type":"navigate","route":"/dashboard/planning/customer/edit?id={{ data.planning_customerSaved.id }}&fromPage=planning_customer-list"},{"type":"showMessage","status":"success","message":"客户已保存。"}]}]},{"id":"planning_customer-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_customer_edit_form","kind":"form","title":"客户信息","sourceKey":"planning_customerRows","submitSourceKey":"planning_customerRows","initialValues":{"id":"","name":"","owner_id":"","description":"","category_id":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"owner_id","label":"上级","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择上级","filterable":true},"optionsSourceKey":"planning_customerOptions","optionProps":{"label":"label","value":"id"}},{"field":"lft","label":"左节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入左节点","type":"number","disabled":true}},{"field":"rght","label":"右节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入右节点","type":"number","disabled":true}},{"field":"lvl","label":"层级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入层级","type":"number","disabled":true}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category_id","label":"类别","component":"vxe-tree-select","span":2,"props":{"clearable":true,"placeholder":"请选择类别","filterable":true},"optionsSourceKey":"planning_categoryOptions","optionProps":{"label":"label","value":"id","children":"children"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类","disabled":true}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类","disabled":true}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.layout is distinct from excluded.layout
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then public.lowcode_pages.version + 1
    else public.lowcode_pages.version
  end,
  published_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
    then excluded.published_at
    else public.lowcode_pages.published_at
  end,
  updated_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.layout is distinct from excluded.layout
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then timezone('utc'::text, now())
    else public.lowcode_pages.updated_at
  end;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_customer-list', 'planning_customer-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_customer-list'
  and edit_page.code = 'planning_customer-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_customer', '客户', 'public.planning_customer',
  '/dashboard/planning/customer', 'planning_customer-list', 'ri-user-star-line', '计划需求所引用的客户主数据。',
  'id', 'active', 323, '{"sourceTable":"customer","freppleModel":"customer","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"名称","kind":"text","required":true},{"name":"owner_id","label":"上级","kind":"relation","relation":"planning_customer"},{"name":"lft","label":"左节点","kind":"integer","readOnly":true},{"name":"rght","label":"右节点","kind":"integer","readOnly":true},{"name":"lvl","label":"层级","kind":"integer","readOnly":true},{"name":"description","label":"说明","kind":"text"},{"name":"category_id","label":"类别","kind":"relation","relation":"planning_category","relationFilters":{"target_type":"customer","status":"active"},"relationLabelField":"name","relationOnDelete":"restrict","relationTree":true},{"name":"category","label":"分类","kind":"text","readOnly":true},{"name":"subcategory","label":"子分类","kind":"text","readOnly":true},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
)
on conflict (code) do update set
  title = excluded.title,
  table_name = excluded.table_name,
  route_path = excluded.route_path,
  page_code = excluded.page_code,
  icon = excluded.icon,
  description = excluded.description,
  primary_key = excluded.primary_key,
  status = excluded.status,
  sort_order = excluded.sort_order,
  schema = excluded.schema,
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive, schema, version, published_at
) values
  ('planning_item-list', '/dashboard/planning/item', '物料', '原料、半成品和成品物料。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_item-list","route":"/dashboard/planning/item","title":"物料","description":"原料、半成品和成品物料。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_itemRows":{"key":"planning_itemRows","label":"物料数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_item","postData":{"resource":"planning_item","tableName":"planning_item","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_categoryOptions":{"key":"planning_categoryOptions","label":"类别选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_category","labelField":"name","filters":{"target_type":"item","status":"active"},"tree":true},"autoLoad":true}},"blocks":[{"id":"planning_item-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/item/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_itemRows"]}]}]},{"id":"planning_item-search","kind":"searchForm","targetSourceKey":"planning_itemRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}},{"field":"type","label":"计划类型","component":"vxe-select","options":[{"label":"make to stock","value":"make to stock"},{"label":"make to order","value":"make to order"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_item-grid","kind":"grid","title":"物料列表","sourceKey":"planning_itemRows","sourceType":"custom","tableName":"planning_item","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"owner_id_label","title":"上级","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"category_id_label","title":"类别","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"cost","title":"成本","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"type","title":"计划类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"make to stock":"make to stock","make to order":"make to order"},"emptyText":"-"}},{"field":"weight","title":"重量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"volume","title":"体积","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"periodofcover","title":"覆盖周期","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_item-edit', '/dashboard/planning/item/edit', '物料编辑', '原料、半成品和成品物料。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_item-edit","route":"/dashboard/planning/item/edit","title":"物料编辑","description":"原料、半成品和成品物料。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_itemRows":{"key":"planning_itemRows","label":"物料数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_item","postData":{"resource":"planning_item","tableName":"planning_item","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name","excludeId":"{{ forms.planning_item_edit_form.id }}"},"autoLoad":true},"planning_categoryOptions":{"key":"planning_categoryOptions","label":"类别选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_category","labelField":"name","filters":{"target_type":"item","status":"active"},"tree":true},"autoLoad":true}},"blocks":[{"id":"planning_item-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/item"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_itemRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_itemRows","serviceMethod":"saveItem","postData":{"resource":"planning_item","id":"{{ forms.planning_item_edit_form.id }}","data":{"name":"{{ forms.planning_item_edit_form.name }}","owner_id":"{{ forms.planning_item_edit_form.owner_id }}","description":"{{ forms.planning_item_edit_form.description }}","category_id":"{{ forms.planning_item_edit_form.category_id }}","cost":"{{ forms.planning_item_edit_form.cost }}","type":"{{ forms.planning_item_edit_form.type }}","weight":"{{ forms.planning_item_edit_form.weight }}","volume":"{{ forms.planning_item_edit_form.volume }}","periodofcover":"{{ forms.planning_item_edit_form.periodofcover }}","uom":"{{ forms.planning_item_edit_form.uom }}","source":"{{ forms.planning_item_edit_form.source }}"}},"assignTo":"planning_itemSaved"},{"type":"navigate","route":"/dashboard/planning/item/edit?id={{ data.planning_itemSaved.id }}&fromPage=planning_item-list"},{"type":"showMessage","status":"success","message":"物料已保存。"}]}]},{"id":"planning_item-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_item_edit_form","kind":"form","title":"物料信息","sourceKey":"planning_itemRows","submitSourceKey":"planning_itemRows","initialValues":{"id":"","name":"","owner_id":"","description":"","category_id":"","cost":"","type":"","weight":"","volume":"","periodofcover":"","uom":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"owner_id","label":"上级","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择上级","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"}},{"field":"lft","label":"左节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入左节点","type":"number","disabled":true}},{"field":"rght","label":"右节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入右节点","type":"number","disabled":true}},{"field":"lvl","label":"层级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入层级","type":"number","disabled":true}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category_id","label":"类别","component":"vxe-tree-select","span":2,"props":{"clearable":true,"placeholder":"请选择类别","filterable":true},"optionsSourceKey":"planning_categoryOptions","optionProps":{"label":"label","value":"id","children":"children"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类","disabled":true}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类","disabled":true}},{"field":"cost","label":"成本","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入成本","type":"number"}},{"field":"type","label":"计划类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入计划类型"},"options":[{"label":"make to stock","value":"make to stock"},{"label":"make to order","value":"make to order"}]},{"field":"weight","label":"重量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入重量","type":"number"}},{"field":"volume","label":"体积","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入体积","type":"number"}},{"field":"periodofcover","label":"覆盖周期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入覆盖周期","type":"number"}},{"field":"uom","label":"单位","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入单位"}},{"field":"latedemandcount","label":"延期需求数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入延期需求数","type":"number","disabled":true}},{"field":"latedemandquantity","label":"延期需求量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入延期需求量","type":"number","disabled":true}},{"field":"latedemandvalue","label":"延期需求金额","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入延期需求金额","type":"number","disabled":true}},{"field":"unplanneddemandcount","label":"未排需求数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入未排需求数","type":"number","disabled":true}},{"field":"unplanneddemandquantity","label":"未排需求量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入未排需求量","type":"number","disabled":true}},{"field":"unplanneddemandvalue","label":"未排需求金额","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入未排需求金额","type":"number","disabled":true}},{"field":"demand_pattern","label":"需求模式","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入需求模式","disabled":true}},{"field":"adi","label":"ADI","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入ADI","type":"number","disabled":true}},{"field":"cv2","label":"CV²","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入CV²","type":"number","disabled":true}},{"field":"outlier_1b","label":"1期异常值","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入1期异常值","type":"number","disabled":true}},{"field":"outlier_6b","label":"6期异常值","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入6期异常值","type":"number","disabled":true}},{"field":"outlier_12b","label":"12期异常值","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入12期异常值","type":"number","disabled":true}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.layout is distinct from excluded.layout
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then public.lowcode_pages.version + 1
    else public.lowcode_pages.version
  end,
  published_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
    then excluded.published_at
    else public.lowcode_pages.published_at
  end,
  updated_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.layout is distinct from excluded.layout
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then timezone('utc'::text, now())
    else public.lowcode_pages.updated_at
  end;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_item-list', 'planning_item-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_item-list'
  and edit_page.code = 'planning_item-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_item', '物料', 'public.planning_item',
  '/dashboard/planning/item', 'planning_item-list', 'ri-box-3-line', '原料、半成品和成品物料。',
  'id', 'active', 324, '{"sourceTable":"item","freppleModel":"item","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"名称","kind":"text","required":true},{"name":"owner_id","label":"上级","kind":"relation","relation":"planning_item"},{"name":"lft","label":"左节点","kind":"integer","readOnly":true},{"name":"rght","label":"右节点","kind":"integer","readOnly":true},{"name":"lvl","label":"层级","kind":"integer","readOnly":true},{"name":"description","label":"说明","kind":"text"},{"name":"category_id","label":"类别","kind":"relation","relation":"planning_category","relationFilters":{"target_type":"item","status":"active"},"relationLabelField":"name","relationOnDelete":"restrict","relationTree":true},{"name":"category","label":"分类","kind":"text","readOnly":true},{"name":"subcategory","label":"子分类","kind":"text","readOnly":true},{"name":"cost","label":"成本","kind":"number"},{"name":"type","label":"计划类型","kind":"text","options":[{"label":"make to stock","value":"make to stock"},{"label":"make to order","value":"make to order"}]},{"name":"weight","label":"重量","kind":"number"},{"name":"volume","label":"体积","kind":"number"},{"name":"periodofcover","label":"覆盖周期","kind":"integer"},{"name":"uom","label":"单位","kind":"text"},{"name":"latedemandcount","label":"延期需求数","kind":"integer","readOnly":true},{"name":"latedemandquantity","label":"延期需求量","kind":"number","readOnly":true},{"name":"latedemandvalue","label":"延期需求金额","kind":"number","readOnly":true},{"name":"unplanneddemandcount","label":"未排需求数","kind":"integer","readOnly":true},{"name":"unplanneddemandquantity","label":"未排需求量","kind":"number","readOnly":true},{"name":"unplanneddemandvalue","label":"未排需求金额","kind":"number","readOnly":true},{"name":"demand_pattern","label":"需求模式","kind":"text","readOnly":true},{"name":"adi","label":"ADI","kind":"number","readOnly":true},{"name":"cv2","label":"CV²","kind":"number","readOnly":true},{"name":"outlier_1b","label":"1期异常值","kind":"number","readOnly":true},{"name":"outlier_6b","label":"6期异常值","kind":"number","readOnly":true},{"name":"outlier_12b","label":"12期异常值","kind":"number","readOnly":true},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
)
on conflict (code) do update set
  title = excluded.title,
  table_name = excluded.table_name,
  route_path = excluded.route_path,
  page_code = excluded.page_code,
  icon = excluded.icon,
  description = excluded.description,
  primary_key = excluded.primary_key,
  status = excluded.status,
  sort_order = excluded.sort_order,
  schema = excluded.schema,
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive, schema, version, published_at
) values
  ('planning_supplier-list', '/dashboard/planning/supplier', '供应商', '采购来源与供应商主数据。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_supplier-list","route":"/dashboard/planning/supplier","title":"供应商","description":"采购来源与供应商主数据。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_supplierRows":{"key":"planning_supplierRows","label":"供应商数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_supplier","postData":{"resource":"planning_supplier","tableName":"planning_supplier","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_supplierOptions":{"key":"planning_supplierOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_supplier","labelField":"name"},"autoLoad":true},"planning_categoryOptions":{"key":"planning_categoryOptions","label":"类别选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_category","labelField":"name","filters":{"target_type":"supplier","status":"active"},"tree":true},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"可用日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_supplier-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/supplier/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_supplierRows"]}]}]},{"id":"planning_supplier-search","kind":"searchForm","targetSourceKey":"planning_supplierRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_supplier-grid","kind":"grid","title":"供应商列表","sourceKey":"planning_supplierRows","sourceType":"custom","tableName":"planning_supplier","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"owner_id_label","title":"上级","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"category_id_label","title":"类别","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"available_id_label","title":"可用日历","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lft","title":"左节点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"rght","title":"右节点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"lvl","title":"层级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_supplier-edit', '/dashboard/planning/supplier/edit', '供应商编辑', '采购来源与供应商主数据。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_supplier-edit","route":"/dashboard/planning/supplier/edit","title":"供应商编辑","description":"采购来源与供应商主数据。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_supplierRows":{"key":"planning_supplierRows","label":"供应商数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_supplier","postData":{"resource":"planning_supplier","tableName":"planning_supplier","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_supplierOptions":{"key":"planning_supplierOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_supplier","labelField":"name","excludeId":"{{ forms.planning_supplier_edit_form.id }}"},"autoLoad":true},"planning_categoryOptions":{"key":"planning_categoryOptions","label":"类别选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_category","labelField":"name","filters":{"target_type":"supplier","status":"active"},"tree":true},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"可用日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_supplier-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/supplier"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_supplierRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_supplierRows","serviceMethod":"saveItem","postData":{"resource":"planning_supplier","id":"{{ forms.planning_supplier_edit_form.id }}","data":{"name":"{{ forms.planning_supplier_edit_form.name }}","owner_id":"{{ forms.planning_supplier_edit_form.owner_id }}","description":"{{ forms.planning_supplier_edit_form.description }}","category_id":"{{ forms.planning_supplier_edit_form.category_id }}","available_id":"{{ forms.planning_supplier_edit_form.available_id }}","source":"{{ forms.planning_supplier_edit_form.source }}"}},"assignTo":"planning_supplierSaved"},{"type":"navigate","route":"/dashboard/planning/supplier/edit?id={{ data.planning_supplierSaved.id }}&fromPage=planning_supplier-list"},{"type":"showMessage","status":"success","message":"供应商已保存。"}]}]},{"id":"planning_supplier-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_supplier_edit_form","kind":"form","title":"供应商信息","sourceKey":"planning_supplierRows","submitSourceKey":"planning_supplierRows","initialValues":{"id":"","name":"","owner_id":"","description":"","category_id":"","available_id":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"owner_id","label":"上级","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择上级","filterable":true},"optionsSourceKey":"planning_supplierOptions","optionProps":{"label":"label","value":"id"}},{"field":"lft","label":"左节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入左节点","type":"number","disabled":true}},{"field":"rght","label":"右节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入右节点","type":"number","disabled":true}},{"field":"lvl","label":"层级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入层级","type":"number","disabled":true}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category_id","label":"类别","component":"vxe-tree-select","span":2,"props":{"clearable":true,"placeholder":"请选择类别","filterable":true},"optionsSourceKey":"planning_categoryOptions","optionProps":{"label":"label","value":"id","children":"children"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类","disabled":true}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类","disabled":true}},{"field":"available_id","label":"可用日历","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择可用日历","filterable":true},"optionsSourceKey":"planning_calendarOptions","optionProps":{"label":"label","value":"id"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.layout is distinct from excluded.layout
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then public.lowcode_pages.version + 1
    else public.lowcode_pages.version
  end,
  published_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
    then excluded.published_at
    else public.lowcode_pages.published_at
  end,
  updated_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.layout is distinct from excluded.layout
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then timezone('utc'::text, now())
    else public.lowcode_pages.updated_at
  end;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_supplier-list', 'planning_supplier-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_supplier-list'
  and edit_page.code = 'planning_supplier-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_supplier', '供应商', 'public.planning_supplier',
  '/dashboard/planning/supplier', 'planning_supplier-list', 'ri-truck-line', '采购来源与供应商主数据。',
  'id', 'active', 325, '{"sourceTable":"supplier","freppleModel":"supplier","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"名称","kind":"text","required":true},{"name":"owner_id","label":"上级","kind":"relation","relation":"planning_supplier"},{"name":"lft","label":"左节点","kind":"integer","readOnly":true},{"name":"rght","label":"右节点","kind":"integer","readOnly":true},{"name":"lvl","label":"层级","kind":"integer","readOnly":true},{"name":"description","label":"说明","kind":"text"},{"name":"category_id","label":"类别","kind":"relation","relation":"planning_category","relationFilters":{"target_type":"supplier","status":"active"},"relationLabelField":"name","relationOnDelete":"restrict","relationTree":true},{"name":"category","label":"分类","kind":"text","readOnly":true},{"name":"subcategory","label":"子分类","kind":"text","readOnly":true},{"name":"available_id","label":"可用日历","kind":"relation","relation":"planning_calendar"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
)
on conflict (code) do update set
  title = excluded.title,
  table_name = excluded.table_name,
  route_path = excluded.route_path,
  page_code = excluded.page_code,
  icon = excluded.icon,
  description = excluded.description,
  primary_key = excluded.primary_key,
  status = excluded.status,
  sort_order = excluded.sort_order,
  schema = excluded.schema,
  updated_at = timezone('utc'::text, now());

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  'planning-category', '主数据类别', '/dashboard/planning/category', parent.id,
  'page', 'ri-folder-tree-line', 'planning_category-list', 'planning.models.view',
  true, true, 'dashboard', 'active', 35,
  '{"module":"planning","group":"基础数据","sourceTable":"category"}'::jsonb
from public.admin_routes parent
where parent.code = 'planning-1'
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  parent_id = excluded.parent_id,
  route_type = excluded.route_type,
  icon = excluded.icon,
  page_code = excluded.page_code,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

do $comments$
declare
  table_metadata jsonb := '{"planning_category":["主数据类别","统一维护物料、客户和供应商的账套级层级类别；类别用于归类、筛选和分析，不直接改变排产约束。"],"planning_item":["计划物料","维护原料、半成品和成品的成本、单位、层级、统一类别及需求特征，是供需计划的物料主数据。"],"planning_customer":["计划客户","维护计划需求和预测引用的客户主数据、层级及统一类别，用于客户维度的供需分析。"],"planning_supplier":["计划供应商","维护采购来源、供应商层级、统一类别和可用日历，为物料供应规则和采购计划提供主数据。"]}'::jsonb;
  table_name text;
  metadata jsonb;
  relations jsonb;
begin
  foreach table_name in array array[
    'planning_category', 'planning_item', 'planning_customer', 'planning_supplier'
  ] loop
    metadata := table_metadata -> table_name;
    select coalesce(jsonb_agg(relation order by relation->>'table', relation->>'type'), '[]'::jsonb)
    into relations
    from (
      select jsonb_build_object(
        'table', related_namespace.nspname || '.' || related_table.relname,
        'type', 'references',
        'localColumns', (
          select jsonb_agg(local_attribute.attname order by local_key.ordinality)
          from unnest(constraint_meta.conkey) with ordinality local_key(attnum, ordinality)
          join pg_attribute local_attribute
            on local_attribute.attrelid = constraint_meta.conrelid
           and local_attribute.attnum = local_key.attnum
        ),
        'relatedColumns', (
          select jsonb_agg(related_attribute.attname order by related_key.ordinality)
          from unnest(constraint_meta.confkey) with ordinality related_key(attnum, ordinality)
          join pg_attribute related_attribute
            on related_attribute.attrelid = constraint_meta.confrelid
           and related_attribute.attnum = related_key.attnum
        ),
        'constraint', constraint_meta.conname,
        'onDelete', case constraint_meta.confdeltype
          when 'c' then 'CASCADE' when 'r' then 'RESTRICT' when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT' else 'NO ACTION'
        end
      ) as relation
      from pg_constraint constraint_meta
      join pg_class related_table on related_table.oid = constraint_meta.confrelid
      join pg_namespace related_namespace on related_namespace.oid = related_table.relnamespace
      where constraint_meta.contype = 'f'
        and constraint_meta.conrelid = ('public.' || table_name)::regclass

      union all

      select jsonb_build_object(
        'table', related_namespace.nspname || '.' || related_table.relname,
        'type', 'referenced_by',
        'localColumns', (
          select jsonb_agg(local_attribute.attname order by local_key.ordinality)
          from unnest(constraint_meta.confkey) with ordinality local_key(attnum, ordinality)
          join pg_attribute local_attribute
            on local_attribute.attrelid = constraint_meta.confrelid
           and local_attribute.attnum = local_key.attnum
        ),
        'relatedColumns', (
          select jsonb_agg(related_attribute.attname order by related_key.ordinality)
          from unnest(constraint_meta.conkey) with ordinality related_key(attnum, ordinality)
          join pg_attribute related_attribute
            on related_attribute.attrelid = constraint_meta.conrelid
           and related_attribute.attnum = related_key.attnum
        ),
        'constraint', constraint_meta.conname,
        'onDelete', case constraint_meta.confdeltype
          when 'c' then 'CASCADE' when 'r' then 'RESTRICT' when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT' else 'NO ACTION'
        end
      ) as relation
      from pg_constraint constraint_meta
      join pg_class related_table on related_table.oid = constraint_meta.conrelid
      join pg_namespace related_namespace on related_namespace.oid = related_table.relnamespace
      where constraint_meta.contype = 'f'
        and constraint_meta.confrelid = ('public.' || table_name)::regclass
    ) relation_rows;

    execute format(
      'comment on table public.%I is %L',
      table_name,
      json_build_object(
        'title', metadata ->> 0,
        'description', metadata ->> 1,
        'relation', relations
      )::text
    );
  end loop;
end
$comments$;

comment on column public.planning_category.target_type is '{"title":"类别对象","type":"text","align":"left","description":"标识类别适用于物料、客户或供应商。"}';

comment on column public.planning_category.code is '{"title":"类别编码","type":"text","align":"left","description":"类别在账套和对象类型内的稳定唯一编码。"}';

comment on column public.planning_category.name is '{"title":"类别名称","type":"text","align":"left","description":"类别的业务显示名称。"}';

comment on column public.planning_category.parent_id is '{"title":"上级类别","type":"text","align":"left","description":"关联同账套、同对象类型的上级类别。"}';

comment on column public.planning_category.description is '{"title":"说明","type":"text","align":"left","description":"类别的业务用途说明。"}';

comment on column public.planning_category.status is '{"title":"状态","type":"enum","align":"center","description":"控制类别是否允许被新分配。"}';

comment on column public.planning_category.sort_order is '{"title":"排序","type":"number","align":"right","description":"同级类别的显示顺序。"}';

comment on column public.planning_category.metadata is '{"title":"扩展信息","type":"json","align":"left","description":"以 JSON 结构保存类别扩展信息。"}';

comment on column public.planning_category.source is '{"title":"数据来源","type":"text","align":"left","description":"记录类别的数据来源。"}';

comment on column public.planning_category.lastmodified is '{"title":"最后修改","type":"datetime","align":"center","description":"记录类别最后修改时间。"}';

comment on column public.planning_item.category_id is '{"title":"类别","type":"text","align":"left","description":"关联统一主数据类别表中的类别。"}';

comment on column public.planning_customer.category_id is '{"title":"类别","type":"text","align":"left","description":"关联统一主数据类别表中的类别。"}';

comment on column public.planning_supplier.category_id is '{"title":"类别","type":"text","align":"left","description":"关联统一主数据类别表中的类别。"}';

comment on column public.planning_category.id is '{"title":"主键","type":"text","align":"left","description":"当前类别记录的唯一标识。"}';

comment on column public.planning_category.account_id is '{"title":"账套","type":"text","align":"left","description":"类别所属账套的唯一标识。"}';

comment on column public.planning_category.created_by is '{"title":"创建人","type":"text","align":"left","description":"创建类别记录的用户。"}';

comment on column public.planning_category.updated_by is '{"title":"更新人","type":"text","align":"left","description":"最后更新类别记录的用户。"}';

comment on column public.planning_category.created_at is '{"title":"创建时间","type":"datetime","align":"center","description":"类别记录的创建时间。"}';

comment on column public.planning_category.updated_at is '{"title":"更新时间","type":"datetime","align":"center","description":"类别记录的更新时间。"}';

select pg_notify('pgrst', 'reload schema');

commit;