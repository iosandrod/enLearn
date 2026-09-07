-- frePPLe-compatible planning data service for enLearn.
-- Scope: 23 core data models and low-code CRUD pages. The C++ solver is intentionally excluded.

begin;

insert into public.admin_permissions (
  code, name, description, resource_type, resource_key, action_code, status, sort_order
) values
  ('planning.models.view', '查看排产数据', '查看排产基础数据、工艺、需求和计划结果。', 'menu', 'planning', 'view', 'active', 310),
  ('planning.models.manage', '维护排产数据', '新增、修改和删除排产模型数据。', 'action', 'planning', 'manage', 'active', 311)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  resource_key = excluded.resource_key,
  action_code = excluded.action_code,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions
  on permissions.code in ('planning.models.view', 'planning.models.manage')
where roles.code in ('system_admin', 'operations_admin')
on conflict do nothing;

create table if not exists public.planning_calendar (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "description" text,
  "category" text,
  "subcategory" text,
  "defaultvalue" numeric(30, 8) default 0,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_calendarbucket (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "calendar_id" uuid not null,
  "startdate" timestamptz default '1971-01-01T00:00:00Z'::timestamptz,
  "enddate" timestamptz default '2030-12-31T00:00:00Z'::timestamptz,
  "value" numeric(30, 8) not null default 0,
  "priority" integer default 0,
  "monday" boolean default true,
  "tuesday" boolean default true,
  "wednesday" boolean default true,
  "thursday" boolean default true,
  "friday" boolean default true,
  "saturday" boolean default true,
  "sunday" boolean default true,
  "starttime" time default '00:00:00'::time,
  "endtime" time default '23:59:59'::time,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "calendar_id", "startdate", "enddate", "priority")
);

create table if not exists public.planning_location (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "owner_id" uuid,
  "lft" integer,
  "rght" integer,
  "lvl" integer,
  "description" text,
  "category" text,
  "subcategory" text,
  "available_id" uuid,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_customer (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "owner_id" uuid,
  "lft" integer,
  "rght" integer,
  "lvl" integer,
  "description" text,
  "category" text,
  "subcategory" text,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_item (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "owner_id" uuid,
  "lft" integer,
  "rght" integer,
  "lvl" integer,
  "description" text,
  "category" text,
  "subcategory" text,
  "cost" numeric(30, 8),
  "type" text check ("type" in ('make to stock', 'make to order')),
  "weight" numeric(30, 8),
  "volume" numeric(30, 8),
  "periodofcover" integer,
  "uom" text,
  "latedemandcount" integer,
  "latedemandquantity" numeric(30, 8),
  "latedemandvalue" numeric(30, 8),
  "unplanneddemandcount" integer,
  "unplanneddemandquantity" numeric(30, 8),
  "unplanneddemandvalue" numeric(30, 8),
  "demand_pattern" text,
  "adi" numeric(30, 8),
  "cv2" numeric(30, 8),
  "outlier_1b" numeric(30, 8),
  "outlier_6b" numeric(30, 8),
  "outlier_12b" numeric(30, 8),
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_supplier (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "owner_id" uuid,
  "lft" integer,
  "rght" integer,
  "lvl" integer,
  "description" text,
  "category" text,
  "subcategory" text,
  "available_id" uuid,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_itemsupplier (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "item_id" uuid not null,
  "location_id" uuid,
  "supplier_id" uuid not null,
  "leadtime" interval,
  "extra_safety_leadtime" interval,
  "hard_safety_leadtime" interval,
  "sizeminimum" numeric(30, 8) default 1,
  "sizemultiple" numeric(30, 8),
  "sizemaximum" numeric(30, 8),
  "batchwindow" interval default '7 days'::interval,
  "cost" numeric(30, 8),
  "priority" integer default 1,
  "effective_start" timestamptz default '1971-01-01T00:00:00Z'::timestamptz,
  "effective_end" timestamptz default '2030-12-31T00:00:00Z'::timestamptz,
  "resource_id" uuid,
  "resource_qty" numeric(30, 8) default 1,
  "fence" interval,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "item_id", "location_id", "supplier_id", "effective_start")
);

create table if not exists public.planning_itemdistribution (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "item_id" uuid not null,
  "location_id" uuid not null,
  "origin_id" uuid not null,
  "leadtime" interval,
  "sizeminimum" numeric(30, 8) default 1,
  "sizemultiple" numeric(30, 8),
  "sizemaximum" numeric(30, 8),
  "batchwindow" interval default '7 days'::interval,
  "cost" numeric(30, 8),
  "priority" integer default 1,
  "effective_start" timestamptz default '1971-01-01T00:00:00Z'::timestamptz,
  "effective_end" timestamptz default '2030-12-31T00:00:00Z'::timestamptz,
  "resource_id" uuid,
  "resource_qty" numeric(30, 8) default 1,
  "fence" interval,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "item_id", "location_id", "origin_id", "effective_start")
);

create table if not exists public.planning_buffer (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "description" text,
  "category" text,
  "subcategory" text,
  "type" text default 'default' check ("type" in ('default', 'infinite')),
  "location_id" uuid not null,
  "item_id" uuid not null,
  "batch" text default '',
  "onhand" numeric(30, 8) default 0,
  "minimum" numeric(30, 8) default 0,
  "minimum_calendar_id" uuid,
  "min_interval" interval,
  "maximum" numeric(30, 8) default 0,
  "maximum_calendar_id" uuid,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "item_id", "location_id", "batch")
);

create table if not exists public.planning_setupmatrix (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_resource (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "owner_id" uuid,
  "lft" integer,
  "rght" integer,
  "lvl" integer,
  "description" text,
  "category" text,
  "subcategory" text,
  "type" text default 'default' check ("type" in ('default', 'buckets', 'buckets_day', 'buckets_week', 'buckets_month', 'infinite')),
  "constrained" boolean,
  "maximum" numeric(30, 8) default 1,
  "maximum_calendar_id" uuid,
  "available_id" uuid,
  "location_id" uuid,
  "cost" numeric(30, 8),
  "maxearly" interval,
  "setupmatrix_id" uuid,
  "setup" text,
  "efficiency" numeric(30, 8),
  "efficiency_calendar_id" uuid,
  "overloadcount" integer,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_skill (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_resourceskill (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "resource_id" uuid not null,
  "skill_id" uuid not null,
  "effective_start" timestamptz,
  "effective_end" timestamptz,
  "priority" integer default 1,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "resource_id", "skill_id")
);

create table if not exists public.planning_setuprule (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "setupmatrix_id" uuid not null,
  "priority" integer not null,
  "fromsetup" text,
  "tosetup" text,
  "duration" interval,
  "cost" numeric(30, 8),
  "resource_id" uuid,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "setupmatrix_id", "priority")
);

create table if not exists public.planning_operation (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "type" text default 'fixed_time' check ("type" in ('fixed_time', 'time_per', 'routing', 'alternate', 'split')),
  "description" text,
  "category" text,
  "subcategory" text,
  "item_id" uuid,
  "location_id" uuid not null,
  "owner_id" uuid,
  "priority" integer default 1,
  "effective_start" timestamptz,
  "effective_end" timestamptz,
  "fence" interval,
  "posttime" interval,
  "sizeminimum" numeric(30, 8) default 1,
  "sizemultiple" numeric(30, 8),
  "sizemaximum" numeric(30, 8),
  "cost" numeric(30, 8),
  "duration" interval,
  "duration_per" interval,
  "search" text check ("search" in ('PRIORITY', 'MINCOST', 'MINPENALTY', 'MINCOSTPENALTY')),
  "available_id" uuid,
  "batchwindow" interval,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_operationmaterial (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "operation_id" uuid not null,
  "item_id" uuid not null,
  "location_id" uuid,
  "quantity" numeric(30, 8) default 1,
  "quantity_fixed" numeric(30, 8),
  "type" text default 'start' check ("type" in ('start', 'end', 'transfer_batch')),
  "effective_start" timestamptz default '1971-01-01T00:00:00Z'::timestamptz,
  "effective_end" timestamptz default '2030-12-31T00:00:00Z'::timestamptz,
  "name" text,
  "priority" integer default 1,
  "search" text check ("search" in ('PRIORITY', 'MINCOST', 'MINPENALTY', 'MINCOSTPENALTY')),
  "transferbatch" numeric(30, 8),
  "offset" interval,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "operation_id", "item_id", "effective_start")
);

create table if not exists public.planning_operationresource (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "operation_id" uuid not null,
  "resource_id" uuid not null,
  "skill_id" uuid,
  "quantity" numeric(30, 8) default 1,
  "quantity_fixed" numeric(30, 8),
  "effective_start" timestamptz default '1971-01-01T00:00:00Z'::timestamptz,
  "effective_end" timestamptz default '2030-12-31T00:00:00Z'::timestamptz,
  "name" text,
  "priority" integer default 1,
  "setup" text,
  "search" text check ("search" in ('PRIORITY', 'MINCOST', 'MINPENALTY', 'MINCOSTPENALTY')),
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "operation_id", "resource_id", "effective_start")
);

create table if not exists public.planning_suboperation (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "operation_id" uuid not null,
  "priority" integer not null default 1,
  "suboperation_id" uuid not null,
  "effective_start" timestamptz default '1971-01-01T00:00:00Z'::timestamptz,
  "effective_end" timestamptz default '2030-12-31T00:00:00Z'::timestamptz,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "operation_id", "suboperation_id", "effective_start")
);

create table if not exists public.planning_operation_dependency (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "operation_id" uuid not null,
  "blockedby_id" uuid not null,
  "quantity" numeric(30, 8) default 1,
  "safety_leadtime" interval,
  "hard_safety_leadtime" interval,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "operation_id", "blockedby_id")
);

create table if not exists public.planning_demand (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "owner" text,
  "description" text,
  "category" text,
  "subcategory" text,
  "customer_id" uuid not null,
  "item_id" uuid not null,
  "location_id" uuid not null,
  "due" timestamptz not null,
  "status" text default 'open' check ("status" in ('inquiry', 'quote', 'open', 'closed', 'canceled')),
  "operation_id" uuid,
  "quantity" numeric(30, 8) not null,
  "priority" integer not null default 10,
  "minshipment" numeric(30, 8),
  "maxlateness" interval,
  "policy" text default 'independent' check ("policy" in ('independent', 'alltogether', 'inratio')),
  "batch" text,
  "delay" interval,
  "plannedquantity" numeric(30, 8),
  "deliverydate" timestamptz,
  "plan" jsonb default '{}'::jsonb,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_operationplan (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "reference" text not null,
  "status" text check ("status" in ('proposed', 'approved', 'confirmed', 'completed', 'closed')),
  "type" text not null default 'MO' check ("type" in ('STCK', 'MO', 'WO', 'PO', 'DO', 'DLVR')),
  "quantity" numeric(30, 8) not null default 1,
  "quantity_completed" numeric(30, 8),
  "color" numeric(30, 8) default 0,
  "startdate" timestamptz,
  "enddate" timestamptz,
  "remark" text,
  "criticality" numeric(30, 8),
  "delay" interval,
  "plan" jsonb default '{}'::jsonb,
  "operation_id" uuid,
  "owner_id" uuid,
  "batch" text,
  "item_id" uuid,
  "origin_id" uuid,
  "destination_id" uuid,
  "supplier_id" uuid,
  "location_id" uuid,
  "demand_id" uuid,
  "due" timestamptz,
  "name" text,
  "forecast" text,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "reference")
);

create table if not exists public.planning_operationplanresource (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "resource_id" uuid not null,
  "operationplan_id" uuid not null,
  "quantity" numeric(30, 8) default 1,
  "setup" text,
  "status" text check ("status" in ('proposed', 'confirmed', 'closed')),
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "resource_id", "operationplan_id")
);

create table if not exists public.planning_operationplanmaterial (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "item_id" uuid not null,
  "location_id" uuid not null,
  "operationplan_id" uuid not null,
  "quantity" numeric(30, 8) not null,
  "flowdate" timestamptz not null,
  "onhand" numeric(30, 8),
  "minimum" numeric(30, 8),
  "periodofcover" numeric(30, 8),
  "status" text check ("status" in ('proposed', 'confirmed', 'closed')),
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id)
);

alter table public.planning_calendarbucket drop constraint if exists planning_calendarbucket_calendar_id_account_fk;
alter table public.planning_calendarbucket add constraint planning_calendarbucket_calendar_id_account_fk
  foreign key (account_id, "calendar_id") references public.planning_calendar(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_location drop constraint if exists planning_location_owner_id_account_fk;
alter table public.planning_location add constraint planning_location_owner_id_account_fk
  foreign key (account_id, "owner_id") references public.planning_location(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_location drop constraint if exists planning_location_available_id_account_fk;
alter table public.planning_location add constraint planning_location_available_id_account_fk
  foreign key (account_id, "available_id") references public.planning_calendar(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_customer drop constraint if exists planning_customer_owner_id_account_fk;
alter table public.planning_customer add constraint planning_customer_owner_id_account_fk
  foreign key (account_id, "owner_id") references public.planning_customer(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_item drop constraint if exists planning_item_owner_id_account_fk;
alter table public.planning_item add constraint planning_item_owner_id_account_fk
  foreign key (account_id, "owner_id") references public.planning_item(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_supplier drop constraint if exists planning_supplier_owner_id_account_fk;
alter table public.planning_supplier add constraint planning_supplier_owner_id_account_fk
  foreign key (account_id, "owner_id") references public.planning_supplier(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_supplier drop constraint if exists planning_supplier_available_id_account_fk;
alter table public.planning_supplier add constraint planning_supplier_available_id_account_fk
  foreign key (account_id, "available_id") references public.planning_calendar(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_itemsupplier drop constraint if exists planning_itemsupplier_item_id_account_fk;
alter table public.planning_itemsupplier add constraint planning_itemsupplier_item_id_account_fk
  foreign key (account_id, "item_id") references public.planning_item(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_itemsupplier drop constraint if exists planning_itemsupplier_location_id_account_fk;
alter table public.planning_itemsupplier add constraint planning_itemsupplier_location_id_account_fk
  foreign key (account_id, "location_id") references public.planning_location(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_itemsupplier drop constraint if exists planning_itemsupplier_supplier_id_account_fk;
alter table public.planning_itemsupplier add constraint planning_itemsupplier_supplier_id_account_fk
  foreign key (account_id, "supplier_id") references public.planning_supplier(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_itemsupplier drop constraint if exists planning_itemsupplier_resource_id_account_fk;
alter table public.planning_itemsupplier add constraint planning_itemsupplier_resource_id_account_fk
  foreign key (account_id, "resource_id") references public.planning_resource(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_itemdistribution drop constraint if exists planning_itemdistribution_item_id_account_fk;
alter table public.planning_itemdistribution add constraint planning_itemdistribution_item_id_account_fk
  foreign key (account_id, "item_id") references public.planning_item(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_itemdistribution drop constraint if exists planning_itemdistribution_location_id_account_fk;
alter table public.planning_itemdistribution add constraint planning_itemdistribution_location_id_account_fk
  foreign key (account_id, "location_id") references public.planning_location(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_itemdistribution drop constraint if exists planning_itemdistribution_origin_id_account_fk;
alter table public.planning_itemdistribution add constraint planning_itemdistribution_origin_id_account_fk
  foreign key (account_id, "origin_id") references public.planning_location(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_itemdistribution drop constraint if exists planning_itemdistribution_resource_id_account_fk;
alter table public.planning_itemdistribution add constraint planning_itemdistribution_resource_id_account_fk
  foreign key (account_id, "resource_id") references public.planning_resource(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_buffer drop constraint if exists planning_buffer_location_id_account_fk;
alter table public.planning_buffer add constraint planning_buffer_location_id_account_fk
  foreign key (account_id, "location_id") references public.planning_location(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_buffer drop constraint if exists planning_buffer_item_id_account_fk;
alter table public.planning_buffer add constraint planning_buffer_item_id_account_fk
  foreign key (account_id, "item_id") references public.planning_item(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_buffer drop constraint if exists planning_buffer_minimum_calendar_id_account_fk;
alter table public.planning_buffer add constraint planning_buffer_minimum_calendar_id_account_fk
  foreign key (account_id, "minimum_calendar_id") references public.planning_calendar(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_buffer drop constraint if exists planning_buffer_maximum_calendar_id_account_fk;
alter table public.planning_buffer add constraint planning_buffer_maximum_calendar_id_account_fk
  foreign key (account_id, "maximum_calendar_id") references public.planning_calendar(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_resource drop constraint if exists planning_resource_owner_id_account_fk;
alter table public.planning_resource add constraint planning_resource_owner_id_account_fk
  foreign key (account_id, "owner_id") references public.planning_resource(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_resource drop constraint if exists planning_resource_maximum_calendar_id_account_fk;
alter table public.planning_resource add constraint planning_resource_maximum_calendar_id_account_fk
  foreign key (account_id, "maximum_calendar_id") references public.planning_calendar(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_resource drop constraint if exists planning_resource_available_id_account_fk;
alter table public.planning_resource add constraint planning_resource_available_id_account_fk
  foreign key (account_id, "available_id") references public.planning_calendar(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_resource drop constraint if exists planning_resource_location_id_account_fk;
alter table public.planning_resource add constraint planning_resource_location_id_account_fk
  foreign key (account_id, "location_id") references public.planning_location(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_resource drop constraint if exists planning_resource_setupmatrix_id_account_fk;
alter table public.planning_resource add constraint planning_resource_setupmatrix_id_account_fk
  foreign key (account_id, "setupmatrix_id") references public.planning_setupmatrix(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_resource drop constraint if exists planning_resource_efficiency_calendar_id_account_fk;
alter table public.planning_resource add constraint planning_resource_efficiency_calendar_id_account_fk
  foreign key (account_id, "efficiency_calendar_id") references public.planning_calendar(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_resourceskill drop constraint if exists planning_resourceskill_resource_id_account_fk;
alter table public.planning_resourceskill add constraint planning_resourceskill_resource_id_account_fk
  foreign key (account_id, "resource_id") references public.planning_resource(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_resourceskill drop constraint if exists planning_resourceskill_skill_id_account_fk;
alter table public.planning_resourceskill add constraint planning_resourceskill_skill_id_account_fk
  foreign key (account_id, "skill_id") references public.planning_skill(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_setuprule drop constraint if exists planning_setuprule_setupmatrix_id_account_fk;
alter table public.planning_setuprule add constraint planning_setuprule_setupmatrix_id_account_fk
  foreign key (account_id, "setupmatrix_id") references public.planning_setupmatrix(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_setuprule drop constraint if exists planning_setuprule_resource_id_account_fk;
alter table public.planning_setuprule add constraint planning_setuprule_resource_id_account_fk
  foreign key (account_id, "resource_id") references public.planning_resource(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operation drop constraint if exists planning_operation_item_id_account_fk;
alter table public.planning_operation add constraint planning_operation_item_id_account_fk
  foreign key (account_id, "item_id") references public.planning_item(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operation drop constraint if exists planning_operation_location_id_account_fk;
alter table public.planning_operation add constraint planning_operation_location_id_account_fk
  foreign key (account_id, "location_id") references public.planning_location(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_operation drop constraint if exists planning_operation_owner_id_account_fk;
alter table public.planning_operation add constraint planning_operation_owner_id_account_fk
  foreign key (account_id, "owner_id") references public.planning_operation(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operation drop constraint if exists planning_operation_available_id_account_fk;
alter table public.planning_operation add constraint planning_operation_available_id_account_fk
  foreign key (account_id, "available_id") references public.planning_calendar(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationmaterial drop constraint if exists planning_operationmaterial_operation_id_account_fk;
alter table public.planning_operationmaterial add constraint planning_operationmaterial_operation_id_account_fk
  foreign key (account_id, "operation_id") references public.planning_operation(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_operationmaterial drop constraint if exists planning_operationmaterial_item_id_account_fk;
alter table public.planning_operationmaterial add constraint planning_operationmaterial_item_id_account_fk
  foreign key (account_id, "item_id") references public.planning_item(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_operationmaterial drop constraint if exists planning_operationmaterial_location_id_account_fk;
alter table public.planning_operationmaterial add constraint planning_operationmaterial_location_id_account_fk
  foreign key (account_id, "location_id") references public.planning_location(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationresource drop constraint if exists planning_operationresource_operation_id_account_fk;
alter table public.planning_operationresource add constraint planning_operationresource_operation_id_account_fk
  foreign key (account_id, "operation_id") references public.planning_operation(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_operationresource drop constraint if exists planning_operationresource_resource_id_account_fk;
alter table public.planning_operationresource add constraint planning_operationresource_resource_id_account_fk
  foreign key (account_id, "resource_id") references public.planning_resource(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_operationresource drop constraint if exists planning_operationresource_skill_id_account_fk;
alter table public.planning_operationresource add constraint planning_operationresource_skill_id_account_fk
  foreign key (account_id, "skill_id") references public.planning_skill(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_suboperation drop constraint if exists planning_suboperation_operation_id_account_fk;
alter table public.planning_suboperation add constraint planning_suboperation_operation_id_account_fk
  foreign key (account_id, "operation_id") references public.planning_operation(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_suboperation drop constraint if exists planning_suboperation_suboperation_id_account_fk;
alter table public.planning_suboperation add constraint planning_suboperation_suboperation_id_account_fk
  foreign key (account_id, "suboperation_id") references public.planning_operation(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_operation_dependency drop constraint if exists planning_operation_dependency_operation_id_account_fk;
alter table public.planning_operation_dependency add constraint planning_operation_dependency_operation_id_account_fk
  foreign key (account_id, "operation_id") references public.planning_operation(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_operation_dependency drop constraint if exists planning_operation_dependency_blockedby_id_account_fk;
alter table public.planning_operation_dependency add constraint planning_operation_dependency_blockedby_id_account_fk
  foreign key (account_id, "blockedby_id") references public.planning_operation(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_demand drop constraint if exists planning_demand_customer_id_account_fk;
alter table public.planning_demand add constraint planning_demand_customer_id_account_fk
  foreign key (account_id, "customer_id") references public.planning_customer(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_demand drop constraint if exists planning_demand_item_id_account_fk;
alter table public.planning_demand add constraint planning_demand_item_id_account_fk
  foreign key (account_id, "item_id") references public.planning_item(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_demand drop constraint if exists planning_demand_location_id_account_fk;
alter table public.planning_demand add constraint planning_demand_location_id_account_fk
  foreign key (account_id, "location_id") references public.planning_location(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_demand drop constraint if exists planning_demand_operation_id_account_fk;
alter table public.planning_demand add constraint planning_demand_operation_id_account_fk
  foreign key (account_id, "operation_id") references public.planning_operation(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationplan drop constraint if exists planning_operationplan_operation_id_account_fk;
alter table public.planning_operationplan add constraint planning_operationplan_operation_id_account_fk
  foreign key (account_id, "operation_id") references public.planning_operation(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationplan drop constraint if exists planning_operationplan_owner_id_account_fk;
alter table public.planning_operationplan add constraint planning_operationplan_owner_id_account_fk
  foreign key (account_id, "owner_id") references public.planning_operationplan(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationplan drop constraint if exists planning_operationplan_item_id_account_fk;
alter table public.planning_operationplan add constraint planning_operationplan_item_id_account_fk
  foreign key (account_id, "item_id") references public.planning_item(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationplan drop constraint if exists planning_operationplan_origin_id_account_fk;
alter table public.planning_operationplan add constraint planning_operationplan_origin_id_account_fk
  foreign key (account_id, "origin_id") references public.planning_location(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationplan drop constraint if exists planning_operationplan_destination_id_account_fk;
alter table public.planning_operationplan add constraint planning_operationplan_destination_id_account_fk
  foreign key (account_id, "destination_id") references public.planning_location(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationplan drop constraint if exists planning_operationplan_supplier_id_account_fk;
alter table public.planning_operationplan add constraint planning_operationplan_supplier_id_account_fk
  foreign key (account_id, "supplier_id") references public.planning_supplier(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationplan drop constraint if exists planning_operationplan_location_id_account_fk;
alter table public.planning_operationplan add constraint planning_operationplan_location_id_account_fk
  foreign key (account_id, "location_id") references public.planning_location(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationplan drop constraint if exists planning_operationplan_demand_id_account_fk;
alter table public.planning_operationplan add constraint planning_operationplan_demand_id_account_fk
  foreign key (account_id, "demand_id") references public.planning_demand(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationplanresource drop constraint if exists planning_operationplanresource_resource_id_account_fk;
alter table public.planning_operationplanresource add constraint planning_operationplanresource_resource_id_account_fk
  foreign key (account_id, "resource_id") references public.planning_resource(account_id, id)
  on delete cascade deferrable initially deferred;

alter table public.planning_operationplanresource drop constraint if exists planning_operationplanresource_operationplan_id_account_fk;
alter table public.planning_operationplanresource add constraint planning_operationplanresource_operationplan_id_account_fk
  foreign key (account_id, "operationplan_id") references public.planning_operationplan(account_id, id)
  on delete cascade deferrable initially deferred;

alter table public.planning_operationplanmaterial drop constraint if exists planning_operationplanmaterial_item_id_account_fk;
alter table public.planning_operationplanmaterial add constraint planning_operationplanmaterial_item_id_account_fk
  foreign key (account_id, "item_id") references public.planning_item(account_id, id)
  on delete cascade deferrable initially deferred;

alter table public.planning_operationplanmaterial drop constraint if exists planning_operationplanmaterial_location_id_account_fk;
alter table public.planning_operationplanmaterial add constraint planning_operationplanmaterial_location_id_account_fk
  foreign key (account_id, "location_id") references public.planning_location(account_id, id)
  on delete cascade deferrable initially deferred;

alter table public.planning_operationplanmaterial drop constraint if exists planning_operationplanmaterial_operationplan_id_account_fk;
alter table public.planning_operationplanmaterial add constraint planning_operationplanmaterial_operationplan_id_account_fk
  foreign key (account_id, "operationplan_id") references public.planning_operationplan(account_id, id)
  on delete cascade deferrable initially deferred;

create or replace function public.planning_set_audit_fields()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := timezone('utc'::text, now());
  new.lastmodified := timezone('utc'::text, now());
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, new.updated_at);
  end if;
  return new;
end;
$function$;

create or replace function public.planning_assert_operation_shape()
returns trigger
language plpgsql
as $function$
declare
  owner_type text;
begin
  if new.owner_id is null then return new; end if;
  if new.owner_id = new.id then
    raise exception 'Operation cannot own itself.' using errcode = '23514';
  end if;
  select type into owner_type
  from public.planning_operation
  where account_id = new.account_id and id = new.owner_id;
  if owner_type in ('time_per', 'fixed_time') then
    raise exception 'An operation owner cannot be time_per or fixed_time.' using errcode = '23514';
  end if;
  if owner_type = 'routing' and new.type not in ('time_per', 'fixed_time') then
    raise exception 'A routing owner only accepts time_per or fixed_time children.' using errcode = '23514';
  end if;
  if new.type in ('alternate', 'split') and owner_type in ('alternate', 'split') then
    raise exception 'Alternate and split operations cannot own alternate or split children.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

create or replace function public.planning_sync_suboperation()
returns trigger
language plpgsql
as $function$
begin
  if new.operation_id = new.suboperation_id then
    raise exception 'A suboperation must differ from its parent operation.' using errcode = '23514';
  end if;
  update public.planning_operation
  set owner_id = new.operation_id,
      priority = new.priority,
      effective_start = new.effective_start,
      effective_end = new.effective_end,
      item_id = null,
      updated_at = timezone('utc'::text, now()),
      lastmodified = timezone('utc'::text, now())
  where account_id = new.account_id and id = new.suboperation_id;
  return new;
end;
$function$;

create or replace function public.planning_invalidate_hierarchy()
returns trigger
language plpgsql
as $function$
begin
  new.lft := null;
  new.rght := null;
  new.lvl := null;
  return new;
end;
$function$;

create index if not exists idx_planning_calendar_account on public.planning_calendar(account_id);
create index if not exists idx_planning_calendar_updated on public.planning_calendar(account_id, updated_at desc);
alter table public.planning_calendar enable row level security;
drop policy if exists "Planning viewers can read planning_calendar" on public.planning_calendar;
create policy "Planning viewers can read planning_calendar" on public.planning_calendar
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_calendar" on public.planning_calendar;
create policy "Planning managers can insert planning_calendar" on public.planning_calendar
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_calendar" on public.planning_calendar;
create policy "Planning managers can update planning_calendar" on public.planning_calendar
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_calendar" on public.planning_calendar;
create policy "Planning managers can delete planning_calendar" on public.planning_calendar
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_calendar to authenticated, service_role;
drop trigger if exists planning_calendar_audit on public.planning_calendar;
create trigger planning_calendar_audit before insert or update on public.planning_calendar
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_calendarbucket_account on public.planning_calendarbucket(account_id);
create index if not exists idx_planning_calendarbucket_updated on public.planning_calendarbucket(account_id, updated_at desc);
alter table public.planning_calendarbucket enable row level security;
drop policy if exists "Planning viewers can read planning_calendarbucket" on public.planning_calendarbucket;
create policy "Planning viewers can read planning_calendarbucket" on public.planning_calendarbucket
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_calendarbucket" on public.planning_calendarbucket;
create policy "Planning managers can insert planning_calendarbucket" on public.planning_calendarbucket
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_calendarbucket" on public.planning_calendarbucket;
create policy "Planning managers can update planning_calendarbucket" on public.planning_calendarbucket
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_calendarbucket" on public.planning_calendarbucket;
create policy "Planning managers can delete planning_calendarbucket" on public.planning_calendarbucket
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_calendarbucket to authenticated, service_role;
drop trigger if exists planning_calendarbucket_audit on public.planning_calendarbucket;
create trigger planning_calendarbucket_audit before insert or update on public.planning_calendarbucket
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_location_account on public.planning_location(account_id);
create index if not exists idx_planning_location_updated on public.planning_location(account_id, updated_at desc);
alter table public.planning_location enable row level security;
drop policy if exists "Planning viewers can read planning_location" on public.planning_location;
create policy "Planning viewers can read planning_location" on public.planning_location
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_location" on public.planning_location;
create policy "Planning managers can insert planning_location" on public.planning_location
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_location" on public.planning_location;
create policy "Planning managers can update planning_location" on public.planning_location
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_location" on public.planning_location;
create policy "Planning managers can delete planning_location" on public.planning_location
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_location to authenticated, service_role;
drop trigger if exists planning_location_audit on public.planning_location;
create trigger planning_location_audit before insert or update on public.planning_location
  for each row execute function public.planning_set_audit_fields();
drop trigger if exists planning_location_hierarchy on public.planning_location;
create trigger planning_location_hierarchy before insert or update of owner_id on public.planning_location
  for each row execute function public.planning_invalidate_hierarchy();

create index if not exists idx_planning_customer_account on public.planning_customer(account_id);
create index if not exists idx_planning_customer_updated on public.planning_customer(account_id, updated_at desc);
alter table public.planning_customer enable row level security;
drop policy if exists "Planning viewers can read planning_customer" on public.planning_customer;
create policy "Planning viewers can read planning_customer" on public.planning_customer
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_customer" on public.planning_customer;
create policy "Planning managers can insert planning_customer" on public.planning_customer
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_customer" on public.planning_customer;
create policy "Planning managers can update planning_customer" on public.planning_customer
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_customer" on public.planning_customer;
create policy "Planning managers can delete planning_customer" on public.planning_customer
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_customer to authenticated, service_role;
drop trigger if exists planning_customer_audit on public.planning_customer;
create trigger planning_customer_audit before insert or update on public.planning_customer
  for each row execute function public.planning_set_audit_fields();
drop trigger if exists planning_customer_hierarchy on public.planning_customer;
create trigger planning_customer_hierarchy before insert or update of owner_id on public.planning_customer
  for each row execute function public.planning_invalidate_hierarchy();

create index if not exists idx_planning_item_account on public.planning_item(account_id);
create index if not exists idx_planning_item_updated on public.planning_item(account_id, updated_at desc);
alter table public.planning_item enable row level security;
drop policy if exists "Planning viewers can read planning_item" on public.planning_item;
create policy "Planning viewers can read planning_item" on public.planning_item
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_item" on public.planning_item;
create policy "Planning managers can insert planning_item" on public.planning_item
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_item" on public.planning_item;
create policy "Planning managers can update planning_item" on public.planning_item
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_item" on public.planning_item;
create policy "Planning managers can delete planning_item" on public.planning_item
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_item to authenticated, service_role;
drop trigger if exists planning_item_audit on public.planning_item;
create trigger planning_item_audit before insert or update on public.planning_item
  for each row execute function public.planning_set_audit_fields();
drop trigger if exists planning_item_hierarchy on public.planning_item;
create trigger planning_item_hierarchy before insert or update of owner_id on public.planning_item
  for each row execute function public.planning_invalidate_hierarchy();

create index if not exists idx_planning_supplier_account on public.planning_supplier(account_id);
create index if not exists idx_planning_supplier_updated on public.planning_supplier(account_id, updated_at desc);
alter table public.planning_supplier enable row level security;
drop policy if exists "Planning viewers can read planning_supplier" on public.planning_supplier;
create policy "Planning viewers can read planning_supplier" on public.planning_supplier
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_supplier" on public.planning_supplier;
create policy "Planning managers can insert planning_supplier" on public.planning_supplier
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_supplier" on public.planning_supplier;
create policy "Planning managers can update planning_supplier" on public.planning_supplier
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_supplier" on public.planning_supplier;
create policy "Planning managers can delete planning_supplier" on public.planning_supplier
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_supplier to authenticated, service_role;
drop trigger if exists planning_supplier_audit on public.planning_supplier;
create trigger planning_supplier_audit before insert or update on public.planning_supplier
  for each row execute function public.planning_set_audit_fields();
drop trigger if exists planning_supplier_hierarchy on public.planning_supplier;
create trigger planning_supplier_hierarchy before insert or update of owner_id on public.planning_supplier
  for each row execute function public.planning_invalidate_hierarchy();

create index if not exists idx_planning_itemsupplier_account on public.planning_itemsupplier(account_id);
create index if not exists idx_planning_itemsupplier_updated on public.planning_itemsupplier(account_id, updated_at desc);
alter table public.planning_itemsupplier enable row level security;
drop policy if exists "Planning viewers can read planning_itemsupplier" on public.planning_itemsupplier;
create policy "Planning viewers can read planning_itemsupplier" on public.planning_itemsupplier
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_itemsupplier" on public.planning_itemsupplier;
create policy "Planning managers can insert planning_itemsupplier" on public.planning_itemsupplier
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_itemsupplier" on public.planning_itemsupplier;
create policy "Planning managers can update planning_itemsupplier" on public.planning_itemsupplier
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_itemsupplier" on public.planning_itemsupplier;
create policy "Planning managers can delete planning_itemsupplier" on public.planning_itemsupplier
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_itemsupplier to authenticated, service_role;
drop trigger if exists planning_itemsupplier_audit on public.planning_itemsupplier;
create trigger planning_itemsupplier_audit before insert or update on public.planning_itemsupplier
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_itemdistribution_account on public.planning_itemdistribution(account_id);
create index if not exists idx_planning_itemdistribution_updated on public.planning_itemdistribution(account_id, updated_at desc);
alter table public.planning_itemdistribution enable row level security;
drop policy if exists "Planning viewers can read planning_itemdistribution" on public.planning_itemdistribution;
create policy "Planning viewers can read planning_itemdistribution" on public.planning_itemdistribution
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_itemdistribution" on public.planning_itemdistribution;
create policy "Planning managers can insert planning_itemdistribution" on public.planning_itemdistribution
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_itemdistribution" on public.planning_itemdistribution;
create policy "Planning managers can update planning_itemdistribution" on public.planning_itemdistribution
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_itemdistribution" on public.planning_itemdistribution;
create policy "Planning managers can delete planning_itemdistribution" on public.planning_itemdistribution
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_itemdistribution to authenticated, service_role;
drop trigger if exists planning_itemdistribution_audit on public.planning_itemdistribution;
create trigger planning_itemdistribution_audit before insert or update on public.planning_itemdistribution
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_buffer_account on public.planning_buffer(account_id);
create index if not exists idx_planning_buffer_updated on public.planning_buffer(account_id, updated_at desc);
alter table public.planning_buffer enable row level security;
drop policy if exists "Planning viewers can read planning_buffer" on public.planning_buffer;
create policy "Planning viewers can read planning_buffer" on public.planning_buffer
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_buffer" on public.planning_buffer;
create policy "Planning managers can insert planning_buffer" on public.planning_buffer
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_buffer" on public.planning_buffer;
create policy "Planning managers can update planning_buffer" on public.planning_buffer
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_buffer" on public.planning_buffer;
create policy "Planning managers can delete planning_buffer" on public.planning_buffer
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_buffer to authenticated, service_role;
drop trigger if exists planning_buffer_audit on public.planning_buffer;
create trigger planning_buffer_audit before insert or update on public.planning_buffer
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_setupmatrix_account on public.planning_setupmatrix(account_id);
create index if not exists idx_planning_setupmatrix_updated on public.planning_setupmatrix(account_id, updated_at desc);
alter table public.planning_setupmatrix enable row level security;
drop policy if exists "Planning viewers can read planning_setupmatrix" on public.planning_setupmatrix;
create policy "Planning viewers can read planning_setupmatrix" on public.planning_setupmatrix
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_setupmatrix" on public.planning_setupmatrix;
create policy "Planning managers can insert planning_setupmatrix" on public.planning_setupmatrix
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_setupmatrix" on public.planning_setupmatrix;
create policy "Planning managers can update planning_setupmatrix" on public.planning_setupmatrix
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_setupmatrix" on public.planning_setupmatrix;
create policy "Planning managers can delete planning_setupmatrix" on public.planning_setupmatrix
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_setupmatrix to authenticated, service_role;
drop trigger if exists planning_setupmatrix_audit on public.planning_setupmatrix;
create trigger planning_setupmatrix_audit before insert or update on public.planning_setupmatrix
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_resource_account on public.planning_resource(account_id);
create index if not exists idx_planning_resource_updated on public.planning_resource(account_id, updated_at desc);
alter table public.planning_resource enable row level security;
drop policy if exists "Planning viewers can read planning_resource" on public.planning_resource;
create policy "Planning viewers can read planning_resource" on public.planning_resource
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_resource" on public.planning_resource;
create policy "Planning managers can insert planning_resource" on public.planning_resource
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_resource" on public.planning_resource;
create policy "Planning managers can update planning_resource" on public.planning_resource
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_resource" on public.planning_resource;
create policy "Planning managers can delete planning_resource" on public.planning_resource
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_resource to authenticated, service_role;
drop trigger if exists planning_resource_audit on public.planning_resource;
create trigger planning_resource_audit before insert or update on public.planning_resource
  for each row execute function public.planning_set_audit_fields();
drop trigger if exists planning_resource_hierarchy on public.planning_resource;
create trigger planning_resource_hierarchy before insert or update of owner_id on public.planning_resource
  for each row execute function public.planning_invalidate_hierarchy();

create index if not exists idx_planning_skill_account on public.planning_skill(account_id);
create index if not exists idx_planning_skill_updated on public.planning_skill(account_id, updated_at desc);
alter table public.planning_skill enable row level security;
drop policy if exists "Planning viewers can read planning_skill" on public.planning_skill;
create policy "Planning viewers can read planning_skill" on public.planning_skill
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_skill" on public.planning_skill;
create policy "Planning managers can insert planning_skill" on public.planning_skill
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_skill" on public.planning_skill;
create policy "Planning managers can update planning_skill" on public.planning_skill
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_skill" on public.planning_skill;
create policy "Planning managers can delete planning_skill" on public.planning_skill
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_skill to authenticated, service_role;
drop trigger if exists planning_skill_audit on public.planning_skill;
create trigger planning_skill_audit before insert or update on public.planning_skill
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_resourceskill_account on public.planning_resourceskill(account_id);
create index if not exists idx_planning_resourceskill_updated on public.planning_resourceskill(account_id, updated_at desc);
alter table public.planning_resourceskill enable row level security;
drop policy if exists "Planning viewers can read planning_resourceskill" on public.planning_resourceskill;
create policy "Planning viewers can read planning_resourceskill" on public.planning_resourceskill
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_resourceskill" on public.planning_resourceskill;
create policy "Planning managers can insert planning_resourceskill" on public.planning_resourceskill
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_resourceskill" on public.planning_resourceskill;
create policy "Planning managers can update planning_resourceskill" on public.planning_resourceskill
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_resourceskill" on public.planning_resourceskill;
create policy "Planning managers can delete planning_resourceskill" on public.planning_resourceskill
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_resourceskill to authenticated, service_role;
drop trigger if exists planning_resourceskill_audit on public.planning_resourceskill;
create trigger planning_resourceskill_audit before insert or update on public.planning_resourceskill
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_setuprule_account on public.planning_setuprule(account_id);
create index if not exists idx_planning_setuprule_updated on public.planning_setuprule(account_id, updated_at desc);
alter table public.planning_setuprule enable row level security;
drop policy if exists "Planning viewers can read planning_setuprule" on public.planning_setuprule;
create policy "Planning viewers can read planning_setuprule" on public.planning_setuprule
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_setuprule" on public.planning_setuprule;
create policy "Planning managers can insert planning_setuprule" on public.planning_setuprule
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_setuprule" on public.planning_setuprule;
create policy "Planning managers can update planning_setuprule" on public.planning_setuprule
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_setuprule" on public.planning_setuprule;
create policy "Planning managers can delete planning_setuprule" on public.planning_setuprule
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_setuprule to authenticated, service_role;
drop trigger if exists planning_setuprule_audit on public.planning_setuprule;
create trigger planning_setuprule_audit before insert or update on public.planning_setuprule
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_operation_account on public.planning_operation(account_id);
create index if not exists idx_planning_operation_updated on public.planning_operation(account_id, updated_at desc);
alter table public.planning_operation enable row level security;
drop policy if exists "Planning viewers can read planning_operation" on public.planning_operation;
create policy "Planning viewers can read planning_operation" on public.planning_operation
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_operation" on public.planning_operation;
create policy "Planning managers can insert planning_operation" on public.planning_operation
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_operation" on public.planning_operation;
create policy "Planning managers can update planning_operation" on public.planning_operation
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_operation" on public.planning_operation;
create policy "Planning managers can delete planning_operation" on public.planning_operation
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_operation to authenticated, service_role;
drop trigger if exists planning_operation_audit on public.planning_operation;
create trigger planning_operation_audit before insert or update on public.planning_operation
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_operationmaterial_account on public.planning_operationmaterial(account_id);
create index if not exists idx_planning_operationmaterial_updated on public.planning_operationmaterial(account_id, updated_at desc);
alter table public.planning_operationmaterial enable row level security;
drop policy if exists "Planning viewers can read planning_operationmaterial" on public.planning_operationmaterial;
create policy "Planning viewers can read planning_operationmaterial" on public.planning_operationmaterial
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_operationmaterial" on public.planning_operationmaterial;
create policy "Planning managers can insert planning_operationmaterial" on public.planning_operationmaterial
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_operationmaterial" on public.planning_operationmaterial;
create policy "Planning managers can update planning_operationmaterial" on public.planning_operationmaterial
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_operationmaterial" on public.planning_operationmaterial;
create policy "Planning managers can delete planning_operationmaterial" on public.planning_operationmaterial
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_operationmaterial to authenticated, service_role;
drop trigger if exists planning_operationmaterial_audit on public.planning_operationmaterial;
create trigger planning_operationmaterial_audit before insert or update on public.planning_operationmaterial
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_operationresource_account on public.planning_operationresource(account_id);
create index if not exists idx_planning_operationresource_updated on public.planning_operationresource(account_id, updated_at desc);
alter table public.planning_operationresource enable row level security;
drop policy if exists "Planning viewers can read planning_operationresource" on public.planning_operationresource;
create policy "Planning viewers can read planning_operationresource" on public.planning_operationresource
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_operationresource" on public.planning_operationresource;
create policy "Planning managers can insert planning_operationresource" on public.planning_operationresource
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_operationresource" on public.planning_operationresource;
create policy "Planning managers can update planning_operationresource" on public.planning_operationresource
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_operationresource" on public.planning_operationresource;
create policy "Planning managers can delete planning_operationresource" on public.planning_operationresource
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_operationresource to authenticated, service_role;
drop trigger if exists planning_operationresource_audit on public.planning_operationresource;
create trigger planning_operationresource_audit before insert or update on public.planning_operationresource
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_suboperation_account on public.planning_suboperation(account_id);
create index if not exists idx_planning_suboperation_updated on public.planning_suboperation(account_id, updated_at desc);
alter table public.planning_suboperation enable row level security;
drop policy if exists "Planning viewers can read planning_suboperation" on public.planning_suboperation;
create policy "Planning viewers can read planning_suboperation" on public.planning_suboperation
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_suboperation" on public.planning_suboperation;
create policy "Planning managers can insert planning_suboperation" on public.planning_suboperation
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_suboperation" on public.planning_suboperation;
create policy "Planning managers can update planning_suboperation" on public.planning_suboperation
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_suboperation" on public.planning_suboperation;
create policy "Planning managers can delete planning_suboperation" on public.planning_suboperation
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_suboperation to authenticated, service_role;
drop trigger if exists planning_suboperation_audit on public.planning_suboperation;
create trigger planning_suboperation_audit before insert or update on public.planning_suboperation
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_operation_dependency_account on public.planning_operation_dependency(account_id);
create index if not exists idx_planning_operation_dependency_updated on public.planning_operation_dependency(account_id, updated_at desc);
alter table public.planning_operation_dependency enable row level security;
drop policy if exists "Planning viewers can read planning_operation_dependency" on public.planning_operation_dependency;
create policy "Planning viewers can read planning_operation_dependency" on public.planning_operation_dependency
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_operation_dependency" on public.planning_operation_dependency;
create policy "Planning managers can insert planning_operation_dependency" on public.planning_operation_dependency
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_operation_dependency" on public.planning_operation_dependency;
create policy "Planning managers can update planning_operation_dependency" on public.planning_operation_dependency
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_operation_dependency" on public.planning_operation_dependency;
create policy "Planning managers can delete planning_operation_dependency" on public.planning_operation_dependency
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_operation_dependency to authenticated, service_role;
drop trigger if exists planning_operation_dependency_audit on public.planning_operation_dependency;
create trigger planning_operation_dependency_audit before insert or update on public.planning_operation_dependency
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_demand_account on public.planning_demand(account_id);
create index if not exists idx_planning_demand_updated on public.planning_demand(account_id, updated_at desc);
alter table public.planning_demand enable row level security;
drop policy if exists "Planning viewers can read planning_demand" on public.planning_demand;
create policy "Planning viewers can read planning_demand" on public.planning_demand
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_demand" on public.planning_demand;
create policy "Planning managers can insert planning_demand" on public.planning_demand
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_demand" on public.planning_demand;
create policy "Planning managers can update planning_demand" on public.planning_demand
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_demand" on public.planning_demand;
create policy "Planning managers can delete planning_demand" on public.planning_demand
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_demand to authenticated, service_role;
drop trigger if exists planning_demand_audit on public.planning_demand;
create trigger planning_demand_audit before insert or update on public.planning_demand
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_operationplan_account on public.planning_operationplan(account_id);
create index if not exists idx_planning_operationplan_updated on public.planning_operationplan(account_id, updated_at desc);
alter table public.planning_operationplan enable row level security;
drop policy if exists "Planning viewers can read planning_operationplan" on public.planning_operationplan;
create policy "Planning viewers can read planning_operationplan" on public.planning_operationplan
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_operationplan" on public.planning_operationplan;
create policy "Planning managers can insert planning_operationplan" on public.planning_operationplan
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_operationplan" on public.planning_operationplan;
create policy "Planning managers can update planning_operationplan" on public.planning_operationplan
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_operationplan" on public.planning_operationplan;
create policy "Planning managers can delete planning_operationplan" on public.planning_operationplan
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_operationplan to authenticated, service_role;
drop trigger if exists planning_operationplan_audit on public.planning_operationplan;
create trigger planning_operationplan_audit before insert or update on public.planning_operationplan
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_operationplanresource_account on public.planning_operationplanresource(account_id);
create index if not exists idx_planning_operationplanresource_updated on public.planning_operationplanresource(account_id, updated_at desc);
alter table public.planning_operationplanresource enable row level security;
drop policy if exists "Planning viewers can read planning_operationplanresource" on public.planning_operationplanresource;
create policy "Planning viewers can read planning_operationplanresource" on public.planning_operationplanresource
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_operationplanresource" on public.planning_operationplanresource;
create policy "Planning managers can insert planning_operationplanresource" on public.planning_operationplanresource
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_operationplanresource" on public.planning_operationplanresource;
create policy "Planning managers can update planning_operationplanresource" on public.planning_operationplanresource
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_operationplanresource" on public.planning_operationplanresource;
create policy "Planning managers can delete planning_operationplanresource" on public.planning_operationplanresource
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_operationplanresource to authenticated, service_role;
drop trigger if exists planning_operationplanresource_audit on public.planning_operationplanresource;
create trigger planning_operationplanresource_audit before insert or update on public.planning_operationplanresource
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_operationplanmaterial_account on public.planning_operationplanmaterial(account_id);
create index if not exists idx_planning_operationplanmaterial_updated on public.planning_operationplanmaterial(account_id, updated_at desc);
alter table public.planning_operationplanmaterial enable row level security;
drop policy if exists "Planning viewers can read planning_operationplanmaterial" on public.planning_operationplanmaterial;
create policy "Planning viewers can read planning_operationplanmaterial" on public.planning_operationplanmaterial
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_operationplanmaterial" on public.planning_operationplanmaterial;
create policy "Planning managers can insert planning_operationplanmaterial" on public.planning_operationplanmaterial
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can update planning_operationplanmaterial" on public.planning_operationplanmaterial;
create policy "Planning managers can update planning_operationplanmaterial" on public.planning_operationplanmaterial
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can delete planning_operationplanmaterial" on public.planning_operationplanmaterial;
create policy "Planning managers can delete planning_operationplanmaterial" on public.planning_operationplanmaterial
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_operationplanmaterial to authenticated, service_role;
drop trigger if exists planning_operationplanmaterial_audit on public.planning_operationplanmaterial;
create trigger planning_operationplanmaterial_audit before insert or update on public.planning_operationplanmaterial
  for each row execute function public.planning_set_audit_fields();

create unique index if not exists planning_itemsupplier_any_location_key
  on public.planning_itemsupplier(account_id, item_id, supplier_id, effective_start)
  where location_id is null;

alter table public.planning_buffer
  drop constraint if exists planning_buffer_batch_not_null;
alter table public.planning_buffer
  add constraint planning_buffer_batch_not_null check (batch is not null);

alter table public.planning_operation_dependency
  drop constraint if exists planning_operation_dependency_distinct_check;
alter table public.planning_operation_dependency
  add constraint planning_operation_dependency_distinct_check check (operation_id <> blockedby_id);

drop trigger if exists planning_operation_shape on public.planning_operation;
create trigger planning_operation_shape
before insert or update of owner_id, type on public.planning_operation
for each row execute function public.planning_assert_operation_shape();

drop trigger if exists planning_suboperation_sync on public.planning_suboperation;
create trigger planning_suboperation_sync
after insert or update of operation_id, suboperation_id, priority, effective_start, effective_end
on public.planning_suboperation
for each row execute function public.planning_sync_suboperation();

select public.register_dynamic_crud_resource(
  'planning_calendar',
  'planning_calendar',
  encode(digest(convert_to('{"resource_name":"planning_calendar","resources":{"planning_calendar":{"code":"planning_calendar","table_name":"planning_calendar","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","description","category","subcategory","defaultvalue","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","description","category","subcategory","defaultvalue","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","description","category","subcategory","defaultvalue","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","description","category","subcategory","defaultvalue","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_calendar","resources":{"planning_calendar":{"code":"planning_calendar","table_name":"planning_calendar","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","description","category","subcategory","defaultvalue","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","description","category","subcategory","defaultvalue","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","description","category","subcategory","defaultvalue","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","description","category","subcategory","defaultvalue","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_calendarbucket',
  'planning_calendarbucket',
  encode(digest(convert_to('{"resource_name":"planning_calendarbucket","resources":{"planning_calendarbucket":{"code":"planning_calendarbucket","table_name":"planning_calendarbucket","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["calendar_id","startdate","enddate","value","priority","monday","tuesday","wednesday","thursday","friday","saturday","sunday","starttime","endtime","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["calendar_id","startdate","enddate","value","priority","monday","tuesday","wednesday","thursday","friday","saturday","sunday","starttime","endtime","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["calendar_id","value"],"timestamp":true},"update":{"allowed_fields":["calendar_id","startdate","enddate","value","priority","monday","tuesday","wednesday","thursday","friday","saturday","sunday","starttime","endtime","source","account_id","updated_at","updated_by"],"input_allowed_fields":["calendar_id","startdate","enddate","value","priority","monday","tuesday","wednesday","thursday","friday","saturday","sunday","starttime","endtime","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_calendarbucket","resources":{"planning_calendarbucket":{"code":"planning_calendarbucket","table_name":"planning_calendarbucket","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["calendar_id","startdate","enddate","value","priority","monday","tuesday","wednesday","thursday","friday","saturday","sunday","starttime","endtime","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["calendar_id","startdate","enddate","value","priority","monday","tuesday","wednesday","thursday","friday","saturday","sunday","starttime","endtime","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["calendar_id","value"],"timestamp":true},"update":{"allowed_fields":["calendar_id","startdate","enddate","value","priority","monday","tuesday","wednesday","thursday","friday","saturday","sunday","starttime","endtime","source","account_id","updated_at","updated_by"],"input_allowed_fields":["calendar_id","startdate","enddate","value","priority","monday","tuesday","wednesday","thursday","friday","saturday","sunday","starttime","endtime","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_location',
  'planning_location',
  encode(digest(convert_to('{"resource_name":"planning_location","resources":{"planning_location":{"code":"planning_location","table_name":"planning_location","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category","subcategory","available_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","available_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category","subcategory","available_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","available_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_location","resources":{"planning_location":{"code":"planning_location","table_name":"planning_location","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category","subcategory","available_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","available_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category","subcategory","available_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","available_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_customer',
  'planning_customer',
  encode(digest(convert_to('{"resource_name":"planning_customer","resources":{"planning_customer":{"code":"planning_customer","table_name":"planning_customer","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category","subcategory","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category","subcategory","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_customer","resources":{"planning_customer":{"code":"planning_customer","table_name":"planning_customer","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category","subcategory","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category","subcategory","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_item',
  'planning_item',
  encode(digest(convert_to('{"resource_name":"planning_item","resources":{"planning_item":{"code":"planning_item","table_name":"planning_item","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category","subcategory","cost","type","weight","volume","periodofcover","uom","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","cost","type","weight","volume","periodofcover","uom","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category","subcategory","cost","type","weight","volume","periodofcover","uom","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","cost","type","weight","volume","periodofcover","uom","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_item","resources":{"planning_item":{"code":"planning_item","table_name":"planning_item","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category","subcategory","cost","type","weight","volume","periodofcover","uom","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","cost","type","weight","volume","periodofcover","uom","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category","subcategory","cost","type","weight","volume","periodofcover","uom","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","cost","type","weight","volume","periodofcover","uom","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_supplier',
  'planning_supplier',
  encode(digest(convert_to('{"resource_name":"planning_supplier","resources":{"planning_supplier":{"code":"planning_supplier","table_name":"planning_supplier","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category","subcategory","available_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","available_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category","subcategory","available_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","available_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_supplier","resources":{"planning_supplier":{"code":"planning_supplier","table_name":"planning_supplier","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category","subcategory","available_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","available_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category","subcategory","available_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","available_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_itemsupplier',
  'planning_itemsupplier',
  encode(digest(convert_to('{"resource_name":"planning_itemsupplier","resources":{"planning_itemsupplier":{"code":"planning_itemsupplier","table_name":"planning_itemsupplier","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["item_id","location_id","supplier_id","leadtime","extra_safety_leadtime","hard_safety_leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["item_id","location_id","supplier_id","leadtime","extra_safety_leadtime","hard_safety_leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["item_id","supplier_id"],"timestamp":true},"update":{"allowed_fields":["item_id","location_id","supplier_id","leadtime","extra_safety_leadtime","hard_safety_leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source","account_id","updated_at","updated_by"],"input_allowed_fields":["item_id","location_id","supplier_id","leadtime","extra_safety_leadtime","hard_safety_leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_itemsupplier","resources":{"planning_itemsupplier":{"code":"planning_itemsupplier","table_name":"planning_itemsupplier","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["item_id","location_id","supplier_id","leadtime","extra_safety_leadtime","hard_safety_leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["item_id","location_id","supplier_id","leadtime","extra_safety_leadtime","hard_safety_leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["item_id","supplier_id"],"timestamp":true},"update":{"allowed_fields":["item_id","location_id","supplier_id","leadtime","extra_safety_leadtime","hard_safety_leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source","account_id","updated_at","updated_by"],"input_allowed_fields":["item_id","location_id","supplier_id","leadtime","extra_safety_leadtime","hard_safety_leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_itemdistribution',
  'planning_itemdistribution',
  encode(digest(convert_to('{"resource_name":"planning_itemdistribution","resources":{"planning_itemdistribution":{"code":"planning_itemdistribution","table_name":"planning_itemdistribution","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["item_id","location_id","origin_id","leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["item_id","location_id","origin_id","leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["item_id","location_id","origin_id"],"timestamp":true},"update":{"allowed_fields":["item_id","location_id","origin_id","leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source","account_id","updated_at","updated_by"],"input_allowed_fields":["item_id","location_id","origin_id","leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_itemdistribution","resources":{"planning_itemdistribution":{"code":"planning_itemdistribution","table_name":"planning_itemdistribution","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["item_id","location_id","origin_id","leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["item_id","location_id","origin_id","leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["item_id","location_id","origin_id"],"timestamp":true},"update":{"allowed_fields":["item_id","location_id","origin_id","leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source","account_id","updated_at","updated_by"],"input_allowed_fields":["item_id","location_id","origin_id","leadtime","sizeminimum","sizemultiple","sizemaximum","batchwindow","cost","priority","effective_start","effective_end","resource_id","resource_qty","fence","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_buffer',
  'planning_buffer',
  encode(digest(convert_to('{"resource_name":"planning_buffer","resources":{"planning_buffer":{"code":"planning_buffer","table_name":"planning_buffer","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["description","category","subcategory","type","location_id","item_id","batch","onhand","minimum","minimum_calendar_id","min_interval","maximum","maximum_calendar_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["description","category","subcategory","type","location_id","item_id","batch","onhand","minimum","minimum_calendar_id","min_interval","maximum","maximum_calendar_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["location_id","item_id"],"timestamp":true},"update":{"allowed_fields":["description","category","subcategory","type","location_id","item_id","batch","onhand","minimum","minimum_calendar_id","min_interval","maximum","maximum_calendar_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["description","category","subcategory","type","location_id","item_id","batch","onhand","minimum","minimum_calendar_id","min_interval","maximum","maximum_calendar_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_buffer","resources":{"planning_buffer":{"code":"planning_buffer","table_name":"planning_buffer","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["description","category","subcategory","type","location_id","item_id","batch","onhand","minimum","minimum_calendar_id","min_interval","maximum","maximum_calendar_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["description","category","subcategory","type","location_id","item_id","batch","onhand","minimum","minimum_calendar_id","min_interval","maximum","maximum_calendar_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["location_id","item_id"],"timestamp":true},"update":{"allowed_fields":["description","category","subcategory","type","location_id","item_id","batch","onhand","minimum","minimum_calendar_id","min_interval","maximum","maximum_calendar_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["description","category","subcategory","type","location_id","item_id","batch","onhand","minimum","minimum_calendar_id","min_interval","maximum","maximum_calendar_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_setupmatrix',
  'planning_setupmatrix',
  encode(digest(convert_to('{"resource_name":"planning_setupmatrix","resources":{"planning_setupmatrix":{"code":"planning_setupmatrix","table_name":"planning_setupmatrix","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_setupmatrix","resources":{"planning_setupmatrix":{"code":"planning_setupmatrix","table_name":"planning_setupmatrix","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_resource',
  'planning_resource',
  encode(digest(convert_to('{"resource_name":"planning_resource","resources":{"planning_resource":{"code":"planning_resource","table_name":"planning_resource","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category","subcategory","type","constrained","maximum","maximum_calendar_id","available_id","location_id","cost","maxearly","setupmatrix_id","setup","efficiency","efficiency_calendar_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","type","constrained","maximum","maximum_calendar_id","available_id","location_id","cost","maxearly","setupmatrix_id","setup","efficiency","efficiency_calendar_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category","subcategory","type","constrained","maximum","maximum_calendar_id","available_id","location_id","cost","maxearly","setupmatrix_id","setup","efficiency","efficiency_calendar_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","type","constrained","maximum","maximum_calendar_id","available_id","location_id","cost","maxearly","setupmatrix_id","setup","efficiency","efficiency_calendar_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_resource","resources":{"planning_resource":{"code":"planning_resource","table_name":"planning_resource","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner_id","description","category","subcategory","type","constrained","maximum","maximum_calendar_id","available_id","location_id","cost","maxearly","setupmatrix_id","setup","efficiency","efficiency_calendar_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","type","constrained","maximum","maximum_calendar_id","available_id","location_id","cost","maxearly","setupmatrix_id","setup","efficiency","efficiency_calendar_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","owner_id","description","category","subcategory","type","constrained","maximum","maximum_calendar_id","available_id","location_id","cost","maxearly","setupmatrix_id","setup","efficiency","efficiency_calendar_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner_id","description","category","subcategory","type","constrained","maximum","maximum_calendar_id","available_id","location_id","cost","maxearly","setupmatrix_id","setup","efficiency","efficiency_calendar_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_skill',
  'planning_skill',
  encode(digest(convert_to('{"resource_name":"planning_skill","resources":{"planning_skill":{"code":"planning_skill","table_name":"planning_skill","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_skill","resources":{"planning_skill":{"code":"planning_skill","table_name":"planning_skill","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_resourceskill',
  'planning_resourceskill',
  encode(digest(convert_to('{"resource_name":"planning_resourceskill","resources":{"planning_resourceskill":{"code":"planning_resourceskill","table_name":"planning_resourceskill","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["resource_id","skill_id","effective_start","effective_end","priority","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["resource_id","skill_id","effective_start","effective_end","priority","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["resource_id","skill_id"],"timestamp":true},"update":{"allowed_fields":["resource_id","skill_id","effective_start","effective_end","priority","source","account_id","updated_at","updated_by"],"input_allowed_fields":["resource_id","skill_id","effective_start","effective_end","priority","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_resourceskill","resources":{"planning_resourceskill":{"code":"planning_resourceskill","table_name":"planning_resourceskill","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["resource_id","skill_id","effective_start","effective_end","priority","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["resource_id","skill_id","effective_start","effective_end","priority","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["resource_id","skill_id"],"timestamp":true},"update":{"allowed_fields":["resource_id","skill_id","effective_start","effective_end","priority","source","account_id","updated_at","updated_by"],"input_allowed_fields":["resource_id","skill_id","effective_start","effective_end","priority","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_setuprule',
  'planning_setuprule',
  encode(digest(convert_to('{"resource_name":"planning_setuprule","resources":{"planning_setuprule":{"code":"planning_setuprule","table_name":"planning_setuprule","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["setupmatrix_id","priority","fromsetup","tosetup","duration","cost","resource_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["setupmatrix_id","priority","fromsetup","tosetup","duration","cost","resource_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["setupmatrix_id","priority"],"timestamp":true},"update":{"allowed_fields":["setupmatrix_id","priority","fromsetup","tosetup","duration","cost","resource_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["setupmatrix_id","priority","fromsetup","tosetup","duration","cost","resource_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_setuprule","resources":{"planning_setuprule":{"code":"planning_setuprule","table_name":"planning_setuprule","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["setupmatrix_id","priority","fromsetup","tosetup","duration","cost","resource_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["setupmatrix_id","priority","fromsetup","tosetup","duration","cost","resource_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["setupmatrix_id","priority"],"timestamp":true},"update":{"allowed_fields":["setupmatrix_id","priority","fromsetup","tosetup","duration","cost","resource_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["setupmatrix_id","priority","fromsetup","tosetup","duration","cost","resource_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_operation',
  'planning_operation',
  encode(digest(convert_to('{"resource_name":"planning_operation","resources":{"planning_operation":{"code":"planning_operation","table_name":"planning_operation","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","type","description","category","subcategory","item_id","location_id","owner_id","priority","effective_start","effective_end","fence","posttime","sizeminimum","sizemultiple","sizemaximum","cost","duration","duration_per","search","available_id","batchwindow","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","type","description","category","subcategory","item_id","location_id","owner_id","priority","effective_start","effective_end","fence","posttime","sizeminimum","sizemultiple","sizemaximum","cost","duration","duration_per","search","available_id","batchwindow","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name","location_id"],"timestamp":true},"update":{"allowed_fields":["name","type","description","category","subcategory","item_id","location_id","owner_id","priority","effective_start","effective_end","fence","posttime","sizeminimum","sizemultiple","sizemaximum","cost","duration","duration_per","search","available_id","batchwindow","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","type","description","category","subcategory","item_id","location_id","owner_id","priority","effective_start","effective_end","fence","posttime","sizeminimum","sizemultiple","sizemaximum","cost","duration","duration_per","search","available_id","batchwindow","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_operation","resources":{"planning_operation":{"code":"planning_operation","table_name":"planning_operation","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","type","description","category","subcategory","item_id","location_id","owner_id","priority","effective_start","effective_end","fence","posttime","sizeminimum","sizemultiple","sizemaximum","cost","duration","duration_per","search","available_id","batchwindow","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","type","description","category","subcategory","item_id","location_id","owner_id","priority","effective_start","effective_end","fence","posttime","sizeminimum","sizemultiple","sizemaximum","cost","duration","duration_per","search","available_id","batchwindow","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name","location_id"],"timestamp":true},"update":{"allowed_fields":["name","type","description","category","subcategory","item_id","location_id","owner_id","priority","effective_start","effective_end","fence","posttime","sizeminimum","sizemultiple","sizemaximum","cost","duration","duration_per","search","available_id","batchwindow","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","type","description","category","subcategory","item_id","location_id","owner_id","priority","effective_start","effective_end","fence","posttime","sizeminimum","sizemultiple","sizemaximum","cost","duration","duration_per","search","available_id","batchwindow","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_operationmaterial',
  'planning_operationmaterial',
  encode(digest(convert_to('{"resource_name":"planning_operationmaterial","resources":{"planning_operationmaterial":{"code":"planning_operationmaterial","table_name":"planning_operationmaterial","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["operation_id","item_id","location_id","quantity","quantity_fixed","type","effective_start","effective_end","name","priority","search","transferbatch","offset","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["operation_id","item_id","location_id","quantity","quantity_fixed","type","effective_start","effective_end","name","priority","search","transferbatch","offset","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["operation_id","item_id"],"timestamp":true},"update":{"allowed_fields":["operation_id","item_id","location_id","quantity","quantity_fixed","type","effective_start","effective_end","name","priority","search","transferbatch","offset","source","account_id","updated_at","updated_by"],"input_allowed_fields":["operation_id","item_id","location_id","quantity","quantity_fixed","type","effective_start","effective_end","name","priority","search","transferbatch","offset","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_operationmaterial","resources":{"planning_operationmaterial":{"code":"planning_operationmaterial","table_name":"planning_operationmaterial","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["operation_id","item_id","location_id","quantity","quantity_fixed","type","effective_start","effective_end","name","priority","search","transferbatch","offset","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["operation_id","item_id","location_id","quantity","quantity_fixed","type","effective_start","effective_end","name","priority","search","transferbatch","offset","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["operation_id","item_id"],"timestamp":true},"update":{"allowed_fields":["operation_id","item_id","location_id","quantity","quantity_fixed","type","effective_start","effective_end","name","priority","search","transferbatch","offset","source","account_id","updated_at","updated_by"],"input_allowed_fields":["operation_id","item_id","location_id","quantity","quantity_fixed","type","effective_start","effective_end","name","priority","search","transferbatch","offset","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_operationresource',
  'planning_operationresource',
  encode(digest(convert_to('{"resource_name":"planning_operationresource","resources":{"planning_operationresource":{"code":"planning_operationresource","table_name":"planning_operationresource","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["operation_id","resource_id","skill_id","quantity","quantity_fixed","effective_start","effective_end","name","priority","setup","search","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["operation_id","resource_id","skill_id","quantity","quantity_fixed","effective_start","effective_end","name","priority","setup","search","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["operation_id","resource_id"],"timestamp":true},"update":{"allowed_fields":["operation_id","resource_id","skill_id","quantity","quantity_fixed","effective_start","effective_end","name","priority","setup","search","source","account_id","updated_at","updated_by"],"input_allowed_fields":["operation_id","resource_id","skill_id","quantity","quantity_fixed","effective_start","effective_end","name","priority","setup","search","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_operationresource","resources":{"planning_operationresource":{"code":"planning_operationresource","table_name":"planning_operationresource","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["operation_id","resource_id","skill_id","quantity","quantity_fixed","effective_start","effective_end","name","priority","setup","search","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["operation_id","resource_id","skill_id","quantity","quantity_fixed","effective_start","effective_end","name","priority","setup","search","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["operation_id","resource_id"],"timestamp":true},"update":{"allowed_fields":["operation_id","resource_id","skill_id","quantity","quantity_fixed","effective_start","effective_end","name","priority","setup","search","source","account_id","updated_at","updated_by"],"input_allowed_fields":["operation_id","resource_id","skill_id","quantity","quantity_fixed","effective_start","effective_end","name","priority","setup","search","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_suboperation',
  'planning_suboperation',
  encode(digest(convert_to('{"resource_name":"planning_suboperation","resources":{"planning_suboperation":{"code":"planning_suboperation","table_name":"planning_suboperation","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["operation_id","priority","suboperation_id","effective_start","effective_end","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["operation_id","priority","suboperation_id","effective_start","effective_end","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["operation_id","priority","suboperation_id"],"timestamp":true},"update":{"allowed_fields":["operation_id","priority","suboperation_id","effective_start","effective_end","source","account_id","updated_at","updated_by"],"input_allowed_fields":["operation_id","priority","suboperation_id","effective_start","effective_end","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_suboperation","resources":{"planning_suboperation":{"code":"planning_suboperation","table_name":"planning_suboperation","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["operation_id","priority","suboperation_id","effective_start","effective_end","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["operation_id","priority","suboperation_id","effective_start","effective_end","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["operation_id","priority","suboperation_id"],"timestamp":true},"update":{"allowed_fields":["operation_id","priority","suboperation_id","effective_start","effective_end","source","account_id","updated_at","updated_by"],"input_allowed_fields":["operation_id","priority","suboperation_id","effective_start","effective_end","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_operation_dependency',
  'planning_operation_dependency',
  encode(digest(convert_to('{"resource_name":"planning_operation_dependency","resources":{"planning_operation_dependency":{"code":"planning_operation_dependency","table_name":"planning_operation_dependency","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["operation_id","blockedby_id","quantity","safety_leadtime","hard_safety_leadtime","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["operation_id","blockedby_id","quantity","safety_leadtime","hard_safety_leadtime","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["operation_id","blockedby_id"],"timestamp":true},"update":{"allowed_fields":["operation_id","blockedby_id","quantity","safety_leadtime","hard_safety_leadtime","source","account_id","updated_at","updated_by"],"input_allowed_fields":["operation_id","blockedby_id","quantity","safety_leadtime","hard_safety_leadtime","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_operation_dependency","resources":{"planning_operation_dependency":{"code":"planning_operation_dependency","table_name":"planning_operation_dependency","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["operation_id","blockedby_id","quantity","safety_leadtime","hard_safety_leadtime","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["operation_id","blockedby_id","quantity","safety_leadtime","hard_safety_leadtime","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["operation_id","blockedby_id"],"timestamp":true},"update":{"allowed_fields":["operation_id","blockedby_id","quantity","safety_leadtime","hard_safety_leadtime","source","account_id","updated_at","updated_by"],"input_allowed_fields":["operation_id","blockedby_id","quantity","safety_leadtime","hard_safety_leadtime","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_demand',
  'planning_demand',
  encode(digest(convert_to('{"resource_name":"planning_demand","resources":{"planning_demand":{"code":"planning_demand","table_name":"planning_demand","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner","description","category","subcategory","customer_id","item_id","location_id","due","status","operation_id","quantity","priority","minshipment","maxlateness","policy","batch","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner","description","category","subcategory","customer_id","item_id","location_id","due","status","operation_id","quantity","priority","minshipment","maxlateness","policy","batch","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name","customer_id","item_id","location_id","due","quantity","priority"],"timestamp":true},"update":{"allowed_fields":["name","owner","description","category","subcategory","customer_id","item_id","location_id","due","status","operation_id","quantity","priority","minshipment","maxlateness","policy","batch","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner","description","category","subcategory","customer_id","item_id","location_id","due","status","operation_id","quantity","priority","minshipment","maxlateness","policy","batch","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_demand","resources":{"planning_demand":{"code":"planning_demand","table_name":"planning_demand","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","owner","description","category","subcategory","customer_id","item_id","location_id","due","status","operation_id","quantity","priority","minshipment","maxlateness","policy","batch","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","owner","description","category","subcategory","customer_id","item_id","location_id","due","status","operation_id","quantity","priority","minshipment","maxlateness","policy","batch","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name","customer_id","item_id","location_id","due","quantity","priority"],"timestamp":true},"update":{"allowed_fields":["name","owner","description","category","subcategory","customer_id","item_id","location_id","due","status","operation_id","quantity","priority","minshipment","maxlateness","policy","batch","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","owner","description","category","subcategory","customer_id","item_id","location_id","due","status","operation_id","quantity","priority","minshipment","maxlateness","policy","batch","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_operationplan',
  'planning_operationplan',
  encode(digest(convert_to('{"resource_name":"planning_operationplan","resources":{"planning_operationplan":{"code":"planning_operationplan","table_name":"planning_operationplan","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["reference","type","quantity"],"timestamp":true},"update":{"allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","source","account_id","updated_at","updated_by"],"input_allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_operationplan","resources":{"planning_operationplan":{"code":"planning_operationplan","table_name":"planning_operationplan","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["reference","type","quantity"],"timestamp":true},"update":{"allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","source","account_id","updated_at","updated_by"],"input_allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_operationplanresource',
  'planning_operationplanresource',
  encode(digest(convert_to('{"resource_name":"planning_operationplanresource","resources":{"planning_operationplanresource":{"code":"planning_operationplanresource","table_name":"planning_operationplanresource","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["resource_id","operationplan_id","quantity","setup","status","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["resource_id","operationplan_id","quantity","setup","status","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["resource_id","operationplan_id"],"timestamp":true},"update":{"allowed_fields":["resource_id","operationplan_id","quantity","setup","status","source","account_id","updated_at","updated_by"],"input_allowed_fields":["resource_id","operationplan_id","quantity","setup","status","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_operationplanresource","resources":{"planning_operationplanresource":{"code":"planning_operationplanresource","table_name":"planning_operationplanresource","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["resource_id","operationplan_id","quantity","setup","status","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["resource_id","operationplan_id","quantity","setup","status","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["resource_id","operationplan_id"],"timestamp":true},"update":{"allowed_fields":["resource_id","operationplan_id","quantity","setup","status","source","account_id","updated_at","updated_by"],"input_allowed_fields":["resource_id","operationplan_id","quantity","setup","status","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_operationplanmaterial',
  'planning_operationplanmaterial',
  encode(digest(convert_to('{"resource_name":"planning_operationplanmaterial","resources":{"planning_operationplanmaterial":{"code":"planning_operationplanmaterial","table_name":"planning_operationplanmaterial","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["item_id","location_id","operationplan_id","quantity","flowdate","status","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["item_id","location_id","operationplan_id","quantity","flowdate","status","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["item_id","location_id","operationplan_id","quantity","flowdate"],"timestamp":true},"update":{"allowed_fields":["item_id","location_id","operationplan_id","quantity","flowdate","status","source","account_id","updated_at","updated_by"],"input_allowed_fields":["item_id","location_id","operationplan_id","quantity","flowdate","status","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_operationplanmaterial","resources":{"planning_operationplanmaterial":{"code":"planning_operationplanmaterial","table_name":"planning_operationplanmaterial","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["item_id","location_id","operationplan_id","quantity","flowdate","status","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["item_id","location_id","operationplan_id","quantity","flowdate","status","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["item_id","location_id","operationplan_id","quantity","flowdate"],"timestamp":true},"update":{"allowed_fields":["item_id","location_id","operationplan_id","quantity","flowdate","status","source","account_id","updated_at","updated_by"],"input_allowed_fields":["item_id","location_id","operationplan_id","quantity","flowdate","status","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive, schema, version, published_at
) values
  ('planning_calendar-list', '/dashboard/planning/calendar', '日历', '工作时间、能力或阈值日历。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_calendar-list","route":"/dashboard/planning/calendar","title":"日历","description":"工作时间、能力或阈值日历。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_calendarRows":{"key":"planning_calendarRows","label":"日历数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_calendar","postData":{"resource":"planning_calendar","tableName":"planning_calendar","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true}},"blocks":[{"id":"planning_calendar-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/calendar/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_calendarRows"]}]}]},{"id":"planning_calendar-search","kind":"searchForm","targetSourceKey":"planning_calendarRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_calendar-grid","kind":"grid","title":"日历列表","sourceKey":"planning_calendarRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"category","title":"分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"subcategory","title":"子分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"defaultvalue","title":"默认值","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_calendar-edit', '/dashboard/planning/calendar/edit', '日历编辑', '工作时间、能力或阈值日历。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_calendar-edit","route":"/dashboard/planning/calendar/edit","title":"日历编辑","description":"工作时间、能力或阈值日历。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_calendarRows":{"key":"planning_calendarRows","label":"日历数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_calendar","postData":{"resource":"planning_calendar","tableName":"planning_calendar","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true}},"blocks":[{"id":"planning_calendar-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/calendar"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_calendarRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_calendarRows","serviceMethod":"saveItem","postData":{"resource":"planning_calendar","id":"{{ forms.planning_calendar_edit_form.id }}","data":{"name":"{{ forms.planning_calendar_edit_form.name }}","description":"{{ forms.planning_calendar_edit_form.description }}","category":"{{ forms.planning_calendar_edit_form.category }}","subcategory":"{{ forms.planning_calendar_edit_form.subcategory }}","defaultvalue":"{{ forms.planning_calendar_edit_form.defaultvalue }}","source":"{{ forms.planning_calendar_edit_form.source }}"}},"assignTo":"planning_calendarSaved"},{"type":"navigate","route":"/dashboard/planning/calendar/edit?id={{ data.planning_calendarSaved.id }}&fromPage=planning_calendar-list"},{"type":"showMessage","status":"success","message":"日历已保存。"}]}]},{"id":"planning_calendar-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_calendar_edit_form","kind":"form","title":"日历信息","sourceKey":"planning_calendarRows","submitSourceKey":"planning_calendarRows","initialValues":{"id":"","name":"","description":"","category":"","subcategory":"","defaultvalue":0,"source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类"}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类"}},{"field":"defaultvalue","label":"默认值","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入默认值","type":"number"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_calendar-list'
  and edit_page.code = 'planning_calendar-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_calendar-list', 'planning_calendar-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_calendar', '日历', 'public.planning_calendar',
  '/dashboard/planning/calendar', 'planning_calendar-list', 'ri-calendar-line', '工作时间、能力或阈值日历。',
  'id', 'active', 320, '{"sourceTable":"calendar","freppleModel":"calendar","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"名称","kind":"text","required":true},{"name":"description","label":"说明","kind":"text"},{"name":"category","label":"分类","kind":"text"},{"name":"subcategory","label":"子分类","kind":"text"},{"name":"defaultvalue","label":"默认值","kind":"number","default":0},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_calendarbucket-list', '/dashboard/planning/calendarbucket', '日历明细', '日历生效区间、周内日期和每日时间段。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_calendarbucket-list","route":"/dashboard/planning/calendarbucket","title":"日历明细","description":"日历生效区间、周内日期和每日时间段。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_calendarbucketRows":{"key":"planning_calendarbucketRows","label":"日历明细数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_calendarbucket","postData":{"resource":"planning_calendarbucket","tableName":"planning_calendarbucket","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_calendarbucket-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/calendarbucket/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_calendarbucketRows"]}]}]},{"id":"planning_calendarbucket-grid","kind":"grid","title":"日历明细列表","sourceKey":"planning_calendarbucketRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"calendar_id_label","title":"日历","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"value","title":"值","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"startdate","title":"开始日期","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"enddate","title":"结束日期","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"priority","title":"优先级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"monday","title":"周一","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"true":"是","false":"否"},"emptyText":"-"},"width":90,"align":"center"},{"field":"tuesday","title":"周二","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"true":"是","false":"否"},"emptyText":"-"},"width":90,"align":"center"},{"field":"wednesday","title":"周三","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"true":"是","false":"否"},"emptyText":"-"},"width":90,"align":"center"},{"field":"thursday","title":"周四","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"true":"是","false":"否"},"emptyText":"-"},"width":90,"align":"center"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_calendarbucket-edit', '/dashboard/planning/calendarbucket/edit', '日历明细编辑', '日历生效区间、周内日期和每日时间段。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_calendarbucket-edit","route":"/dashboard/planning/calendarbucket/edit","title":"日历明细编辑","description":"日历生效区间、周内日期和每日时间段。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_calendarbucketRows":{"key":"planning_calendarbucketRows","label":"日历明细数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_calendarbucket","postData":{"resource":"planning_calendarbucket","tableName":"planning_calendarbucket","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_calendarbucket-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/calendarbucket"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_calendarbucketRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_calendarbucketRows","serviceMethod":"saveItem","postData":{"resource":"planning_calendarbucket","id":"{{ forms.planning_calendarbucket_edit_form.id }}","data":{"calendar_id":"{{ forms.planning_calendarbucket_edit_form.calendar_id }}","startdate":"{{ forms.planning_calendarbucket_edit_form.startdate }}","enddate":"{{ forms.planning_calendarbucket_edit_form.enddate }}","value":"{{ forms.planning_calendarbucket_edit_form.value }}","priority":"{{ forms.planning_calendarbucket_edit_form.priority }}","monday":"{{ forms.planning_calendarbucket_edit_form.monday }}","tuesday":"{{ forms.planning_calendarbucket_edit_form.tuesday }}","wednesday":"{{ forms.planning_calendarbucket_edit_form.wednesday }}","thursday":"{{ forms.planning_calendarbucket_edit_form.thursday }}","friday":"{{ forms.planning_calendarbucket_edit_form.friday }}","saturday":"{{ forms.planning_calendarbucket_edit_form.saturday }}","sunday":"{{ forms.planning_calendarbucket_edit_form.sunday }}","starttime":"{{ forms.planning_calendarbucket_edit_form.starttime }}","endtime":"{{ forms.planning_calendarbucket_edit_form.endtime }}","source":"{{ forms.planning_calendarbucket_edit_form.source }}"}},"assignTo":"planning_calendarbucketSaved"},{"type":"navigate","route":"/dashboard/planning/calendarbucket/edit?id={{ data.planning_calendarbucketSaved.id }}&fromPage=planning_calendarbucket-list"},{"type":"showMessage","status":"success","message":"日历明细已保存。"}]}]},{"id":"planning_calendarbucket-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_calendarbucket_edit_form","kind":"form","title":"日历明细信息","sourceKey":"planning_calendarbucketRows","submitSourceKey":"planning_calendarbucketRows","initialValues":{"id":"","calendar_id":"","startdate":"1971-01-01T00:00:00Z","enddate":"2030-12-31T00:00:00Z","value":0,"priority":0,"monday":true,"tuesday":true,"wednesday":true,"thursday":true,"friday":true,"saturday":true,"sunday":true,"starttime":"00:00:00","endtime":"23:59:59","source":""},"schema":{"columns":4,"fields":[{"field":"calendar_id","label":"日历","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择日历","filterable":true},"optionsSourceKey":"planning_calendarOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入日历"}]},{"field":"startdate","label":"开始日期","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入开始日期"}},{"field":"enddate","label":"结束日期","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入结束日期"}},{"field":"value","label":"值","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入值","type":"number"},"rules":[{"required":true,"message":"请输入值"}]},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"}},{"field":"monday","label":"周一","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入周一"}},{"field":"tuesday","label":"周二","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入周二"}},{"field":"wednesday","label":"周三","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入周三"}},{"field":"thursday","label":"周四","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入周四"}},{"field":"friday","label":"周五","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入周五"}},{"field":"saturday","label":"周六","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入周六"}},{"field":"sunday","label":"周日","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入周日"}},{"field":"starttime","label":"开始时间","component":"vxe-time-picker","span":2,"props":{"clearable":true,"placeholder":"请输入开始时间"}},{"field":"endtime","label":"结束时间","component":"vxe-time-picker","span":2,"props":{"clearable":true,"placeholder":"请输入结束时间"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_calendarbucket-list'
  and edit_page.code = 'planning_calendarbucket-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_calendarbucket-list', 'planning_calendarbucket-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_calendarbucket', '日历明细', 'public.planning_calendarbucket',
  '/dashboard/planning/calendarbucket', 'planning_calendarbucket-list', 'ri-calendar-event-line', '日历生效区间、周内日期和每日时间段。',
  'id', 'active', 321, '{"sourceTable":"calendarbucket","freppleModel":"calendarbucket","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"calendar_id","label":"日历","kind":"relation","relation":"planning_calendar","required":true},{"name":"startdate","label":"开始日期","kind":"datetime","default":"1971-01-01T00:00:00Z"},{"name":"enddate","label":"结束日期","kind":"datetime","default":"2030-12-31T00:00:00Z"},{"name":"value","label":"值","kind":"number","required":true,"default":0},{"name":"priority","label":"优先级","kind":"integer","default":0},{"name":"monday","label":"周一","kind":"boolean","default":true},{"name":"tuesday","label":"周二","kind":"boolean","default":true},{"name":"wednesday","label":"周三","kind":"boolean","default":true},{"name":"thursday","label":"周四","kind":"boolean","default":true},{"name":"friday","label":"周五","kind":"boolean","default":true},{"name":"saturday","label":"周六","kind":"boolean","default":true},{"name":"sunday","label":"周日","kind":"boolean","default":true},{"name":"starttime","label":"开始时间","kind":"time","default":"00:00:00"},{"name":"endtime","label":"结束时间","kind":"time","default":"23:59:59"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_location-list', '/dashboard/planning/location', '地点', '工厂、仓库和其他计划地点。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_location-list","route":"/dashboard/planning/location","title":"地点","description":"工厂、仓库和其他计划地点。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_locationRows":{"key":"planning_locationRows","label":"地点数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_location","postData":{"resource":"planning_location","tableName":"planning_location","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"可用日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_location-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/location/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_locationRows"]}]}]},{"id":"planning_location-search","kind":"searchForm","targetSourceKey":"planning_locationRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_location-grid","kind":"grid","title":"地点列表","sourceKey":"planning_locationRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"owner_id_label","title":"上级","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"category","title":"分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"subcategory","title":"子分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"available_id_label","title":"可用日历","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lft","title":"左节点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"rght","title":"右节点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_location-edit', '/dashboard/planning/location/edit', '地点编辑', '工厂、仓库和其他计划地点。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_location-edit","route":"/dashboard/planning/location/edit","title":"地点编辑","description":"工厂、仓库和其他计划地点。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_locationRows":{"key":"planning_locationRows","label":"地点数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_location","postData":{"resource":"planning_location","tableName":"planning_location","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"可用日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_location-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/location"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_locationRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_locationRows","serviceMethod":"saveItem","postData":{"resource":"planning_location","id":"{{ forms.planning_location_edit_form.id }}","data":{"name":"{{ forms.planning_location_edit_form.name }}","owner_id":"{{ forms.planning_location_edit_form.owner_id }}","description":"{{ forms.planning_location_edit_form.description }}","category":"{{ forms.planning_location_edit_form.category }}","subcategory":"{{ forms.planning_location_edit_form.subcategory }}","available_id":"{{ forms.planning_location_edit_form.available_id }}","source":"{{ forms.planning_location_edit_form.source }}"}},"assignTo":"planning_locationSaved"},{"type":"navigate","route":"/dashboard/planning/location/edit?id={{ data.planning_locationSaved.id }}&fromPage=planning_location-list"},{"type":"showMessage","status":"success","message":"地点已保存。"}]}]},{"id":"planning_location-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_location_edit_form","kind":"form","title":"地点信息","sourceKey":"planning_locationRows","submitSourceKey":"planning_locationRows","initialValues":{"id":"","name":"","owner_id":"","description":"","category":"","subcategory":"","available_id":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"owner_id","label":"上级","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择上级","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"}},{"field":"lft","label":"左节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入左节点","type":"number","disabled":true}},{"field":"rght","label":"右节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入右节点","type":"number","disabled":true}},{"field":"lvl","label":"层级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入层级","type":"number","disabled":true}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类"}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类"}},{"field":"available_id","label":"可用日历","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择可用日历","filterable":true},"optionsSourceKey":"planning_calendarOptions","optionProps":{"label":"label","value":"id"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_location-list'
  and edit_page.code = 'planning_location-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_location-list', 'planning_location-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_location', '地点', 'public.planning_location',
  '/dashboard/planning/location', 'planning_location-list', 'ri-map-pin-line', '工厂、仓库和其他计划地点。',
  'id', 'active', 322, '{"sourceTable":"location","freppleModel":"location","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"名称","kind":"text","required":true},{"name":"owner_id","label":"上级","kind":"relation","relation":"planning_location"},{"name":"lft","label":"左节点","kind":"integer","readOnly":true},{"name":"rght","label":"右节点","kind":"integer","readOnly":true},{"name":"lvl","label":"层级","kind":"integer","readOnly":true},{"name":"description","label":"说明","kind":"text"},{"name":"category","label":"分类","kind":"text"},{"name":"subcategory","label":"子分类","kind":"text"},{"name":"available_id","label":"可用日历","kind":"relation","relation":"planning_calendar"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_customer-list', '/dashboard/planning/customer', '客户', '计划需求所引用的客户主数据。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_customer-list","route":"/dashboard/planning/customer","title":"客户","description":"计划需求所引用的客户主数据。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_customerRows":{"key":"planning_customerRows","label":"客户数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_customer","postData":{"resource":"planning_customer","tableName":"planning_customer","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_customer-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/customer/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_customerRows"]}]}]},{"id":"planning_customer-search","kind":"searchForm","targetSourceKey":"planning_customerRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_customer-grid","kind":"grid","title":"客户列表","sourceKey":"planning_customerRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"owner_id_label","title":"上级","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"category","title":"分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"subcategory","title":"子分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lft","title":"左节点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"rght","title":"右节点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"lvl","title":"层级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_customer-edit', '/dashboard/planning/customer/edit', '客户编辑', '计划需求所引用的客户主数据。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_customer-edit","route":"/dashboard/planning/customer/edit","title":"客户编辑","description":"计划需求所引用的客户主数据。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_customerRows":{"key":"planning_customerRows","label":"客户数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_customer","postData":{"resource":"planning_customer","tableName":"planning_customer","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_customer-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/customer"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_customerRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_customerRows","serviceMethod":"saveItem","postData":{"resource":"planning_customer","id":"{{ forms.planning_customer_edit_form.id }}","data":{"name":"{{ forms.planning_customer_edit_form.name }}","owner_id":"{{ forms.planning_customer_edit_form.owner_id }}","description":"{{ forms.planning_customer_edit_form.description }}","category":"{{ forms.planning_customer_edit_form.category }}","subcategory":"{{ forms.planning_customer_edit_form.subcategory }}","source":"{{ forms.planning_customer_edit_form.source }}"}},"assignTo":"planning_customerSaved"},{"type":"navigate","route":"/dashboard/planning/customer/edit?id={{ data.planning_customerSaved.id }}&fromPage=planning_customer-list"},{"type":"showMessage","status":"success","message":"客户已保存。"}]}]},{"id":"planning_customer-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_customer_edit_form","kind":"form","title":"客户信息","sourceKey":"planning_customerRows","submitSourceKey":"planning_customerRows","initialValues":{"id":"","name":"","owner_id":"","description":"","category":"","subcategory":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"owner_id","label":"上级","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择上级","filterable":true},"optionsSourceKey":"planning_customerOptions","optionProps":{"label":"label","value":"id"}},{"field":"lft","label":"左节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入左节点","type":"number","disabled":true}},{"field":"rght","label":"右节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入右节点","type":"number","disabled":true}},{"field":"lvl","label":"层级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入层级","type":"number","disabled":true}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类"}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_customer-list'
  and edit_page.code = 'planning_customer-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_customer-list', 'planning_customer-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_customer', '客户', 'public.planning_customer',
  '/dashboard/planning/customer', 'planning_customer-list', 'ri-user-star-line', '计划需求所引用的客户主数据。',
  'id', 'active', 323, '{"sourceTable":"customer","freppleModel":"customer","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"名称","kind":"text","required":true},{"name":"owner_id","label":"上级","kind":"relation","relation":"planning_customer"},{"name":"lft","label":"左节点","kind":"integer","readOnly":true},{"name":"rght","label":"右节点","kind":"integer","readOnly":true},{"name":"lvl","label":"层级","kind":"integer","readOnly":true},{"name":"description","label":"说明","kind":"text"},{"name":"category","label":"分类","kind":"text"},{"name":"subcategory","label":"子分类","kind":"text"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_item-list', '/dashboard/planning/item', '物料', '原料、半成品和成品物料。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_item-list","route":"/dashboard/planning/item","title":"物料","description":"原料、半成品和成品物料。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_itemRows":{"key":"planning_itemRows","label":"物料数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_item","postData":{"resource":"planning_item","tableName":"planning_item","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_item-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/item/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_itemRows"]}]}]},{"id":"planning_item-search","kind":"searchForm","targetSourceKey":"planning_itemRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}},{"field":"type","label":"计划类型","component":"vxe-select","options":[{"label":"make to stock","value":"make to stock"},{"label":"make to order","value":"make to order"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_item-grid","kind":"grid","title":"物料列表","sourceKey":"planning_itemRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"owner_id_label","title":"上级","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"category","title":"分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"subcategory","title":"子分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"cost","title":"成本","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"type","title":"计划类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"make to stock":"make to stock","make to order":"make to order"},"emptyText":"-"}},{"field":"weight","title":"重量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"volume","title":"体积","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_item-edit', '/dashboard/planning/item/edit', '物料编辑', '原料、半成品和成品物料。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_item-edit","route":"/dashboard/planning/item/edit","title":"物料编辑","description":"原料、半成品和成品物料。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_itemRows":{"key":"planning_itemRows","label":"物料数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_item","postData":{"resource":"planning_item","tableName":"planning_item","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_item-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/item"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_itemRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_itemRows","serviceMethod":"saveItem","postData":{"resource":"planning_item","id":"{{ forms.planning_item_edit_form.id }}","data":{"name":"{{ forms.planning_item_edit_form.name }}","owner_id":"{{ forms.planning_item_edit_form.owner_id }}","description":"{{ forms.planning_item_edit_form.description }}","category":"{{ forms.planning_item_edit_form.category }}","subcategory":"{{ forms.planning_item_edit_form.subcategory }}","cost":"{{ forms.planning_item_edit_form.cost }}","type":"{{ forms.planning_item_edit_form.type }}","weight":"{{ forms.planning_item_edit_form.weight }}","volume":"{{ forms.planning_item_edit_form.volume }}","periodofcover":"{{ forms.planning_item_edit_form.periodofcover }}","uom":"{{ forms.planning_item_edit_form.uom }}","source":"{{ forms.planning_item_edit_form.source }}"}},"assignTo":"planning_itemSaved"},{"type":"navigate","route":"/dashboard/planning/item/edit?id={{ data.planning_itemSaved.id }}&fromPage=planning_item-list"},{"type":"showMessage","status":"success","message":"物料已保存。"}]}]},{"id":"planning_item-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_item_edit_form","kind":"form","title":"物料信息","sourceKey":"planning_itemRows","submitSourceKey":"planning_itemRows","initialValues":{"id":"","name":"","owner_id":"","description":"","category":"","subcategory":"","cost":"","type":"","weight":"","volume":"","periodofcover":"","uom":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"owner_id","label":"上级","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择上级","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"}},{"field":"lft","label":"左节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入左节点","type":"number","disabled":true}},{"field":"rght","label":"右节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入右节点","type":"number","disabled":true}},{"field":"lvl","label":"层级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入层级","type":"number","disabled":true}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类"}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类"}},{"field":"cost","label":"成本","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入成本","type":"number"}},{"field":"type","label":"计划类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入计划类型"},"options":[{"label":"make to stock","value":"make to stock"},{"label":"make to order","value":"make to order"}]},{"field":"weight","label":"重量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入重量","type":"number"}},{"field":"volume","label":"体积","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入体积","type":"number"}},{"field":"periodofcover","label":"覆盖周期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入覆盖周期","type":"number"}},{"field":"uom","label":"单位","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入单位"}},{"field":"latedemandcount","label":"延期需求数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入延期需求数","type":"number","disabled":true}},{"field":"latedemandquantity","label":"延期需求量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入延期需求量","type":"number","disabled":true}},{"field":"latedemandvalue","label":"延期需求金额","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入延期需求金额","type":"number","disabled":true}},{"field":"unplanneddemandcount","label":"未排需求数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入未排需求数","type":"number","disabled":true}},{"field":"unplanneddemandquantity","label":"未排需求量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入未排需求量","type":"number","disabled":true}},{"field":"unplanneddemandvalue","label":"未排需求金额","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入未排需求金额","type":"number","disabled":true}},{"field":"demand_pattern","label":"需求模式","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入需求模式","disabled":true}},{"field":"adi","label":"ADI","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入ADI","type":"number","disabled":true}},{"field":"cv2","label":"CV²","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入CV²","type":"number","disabled":true}},{"field":"outlier_1b","label":"1期异常值","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入1期异常值","type":"number","disabled":true}},{"field":"outlier_6b","label":"6期异常值","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入6期异常值","type":"number","disabled":true}},{"field":"outlier_12b","label":"12期异常值","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入12期异常值","type":"number","disabled":true}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_item-list'
  and edit_page.code = 'planning_item-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_item-list', 'planning_item-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_item', '物料', 'public.planning_item',
  '/dashboard/planning/item', 'planning_item-list', 'ri-box-3-line', '原料、半成品和成品物料。',
  'id', 'active', 324, '{"sourceTable":"item","freppleModel":"item","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"名称","kind":"text","required":true},{"name":"owner_id","label":"上级","kind":"relation","relation":"planning_item"},{"name":"lft","label":"左节点","kind":"integer","readOnly":true},{"name":"rght","label":"右节点","kind":"integer","readOnly":true},{"name":"lvl","label":"层级","kind":"integer","readOnly":true},{"name":"description","label":"说明","kind":"text"},{"name":"category","label":"分类","kind":"text"},{"name":"subcategory","label":"子分类","kind":"text"},{"name":"cost","label":"成本","kind":"number"},{"name":"type","label":"计划类型","kind":"text","options":[{"label":"make to stock","value":"make to stock"},{"label":"make to order","value":"make to order"}]},{"name":"weight","label":"重量","kind":"number"},{"name":"volume","label":"体积","kind":"number"},{"name":"periodofcover","label":"覆盖周期","kind":"integer"},{"name":"uom","label":"单位","kind":"text"},{"name":"latedemandcount","label":"延期需求数","kind":"integer","readOnly":true},{"name":"latedemandquantity","label":"延期需求量","kind":"number","readOnly":true},{"name":"latedemandvalue","label":"延期需求金额","kind":"number","readOnly":true},{"name":"unplanneddemandcount","label":"未排需求数","kind":"integer","readOnly":true},{"name":"unplanneddemandquantity","label":"未排需求量","kind":"number","readOnly":true},{"name":"unplanneddemandvalue","label":"未排需求金额","kind":"number","readOnly":true},{"name":"demand_pattern","label":"需求模式","kind":"text","readOnly":true},{"name":"adi","label":"ADI","kind":"number","readOnly":true},{"name":"cv2","label":"CV²","kind":"number","readOnly":true},{"name":"outlier_1b","label":"1期异常值","kind":"number","readOnly":true},{"name":"outlier_6b","label":"6期异常值","kind":"number","readOnly":true},{"name":"outlier_12b","label":"12期异常值","kind":"number","readOnly":true},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_supplier-list', '/dashboard/planning/supplier', '供应商', '采购来源与供应商主数据。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_supplier-list","route":"/dashboard/planning/supplier","title":"供应商","description":"采购来源与供应商主数据。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_supplierRows":{"key":"planning_supplierRows","label":"供应商数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_supplier","postData":{"resource":"planning_supplier","tableName":"planning_supplier","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_supplierOptions":{"key":"planning_supplierOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_supplier","labelField":"name"},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"可用日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_supplier-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/supplier/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_supplierRows"]}]}]},{"id":"planning_supplier-search","kind":"searchForm","targetSourceKey":"planning_supplierRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_supplier-grid","kind":"grid","title":"供应商列表","sourceKey":"planning_supplierRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"owner_id_label","title":"上级","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"category","title":"分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"subcategory","title":"子分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"available_id_label","title":"可用日历","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lft","title":"左节点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"rght","title":"右节点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_supplier-edit', '/dashboard/planning/supplier/edit', '供应商编辑', '采购来源与供应商主数据。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_supplier-edit","route":"/dashboard/planning/supplier/edit","title":"供应商编辑","description":"采购来源与供应商主数据。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_supplierRows":{"key":"planning_supplierRows","label":"供应商数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_supplier","postData":{"resource":"planning_supplier","tableName":"planning_supplier","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_supplierOptions":{"key":"planning_supplierOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_supplier","labelField":"name"},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"可用日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_supplier-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/supplier"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_supplierRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_supplierRows","serviceMethod":"saveItem","postData":{"resource":"planning_supplier","id":"{{ forms.planning_supplier_edit_form.id }}","data":{"name":"{{ forms.planning_supplier_edit_form.name }}","owner_id":"{{ forms.planning_supplier_edit_form.owner_id }}","description":"{{ forms.planning_supplier_edit_form.description }}","category":"{{ forms.planning_supplier_edit_form.category }}","subcategory":"{{ forms.planning_supplier_edit_form.subcategory }}","available_id":"{{ forms.planning_supplier_edit_form.available_id }}","source":"{{ forms.planning_supplier_edit_form.source }}"}},"assignTo":"planning_supplierSaved"},{"type":"navigate","route":"/dashboard/planning/supplier/edit?id={{ data.planning_supplierSaved.id }}&fromPage=planning_supplier-list"},{"type":"showMessage","status":"success","message":"供应商已保存。"}]}]},{"id":"planning_supplier-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_supplier_edit_form","kind":"form","title":"供应商信息","sourceKey":"planning_supplierRows","submitSourceKey":"planning_supplierRows","initialValues":{"id":"","name":"","owner_id":"","description":"","category":"","subcategory":"","available_id":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"owner_id","label":"上级","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择上级","filterable":true},"optionsSourceKey":"planning_supplierOptions","optionProps":{"label":"label","value":"id"}},{"field":"lft","label":"左节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入左节点","type":"number","disabled":true}},{"field":"rght","label":"右节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入右节点","type":"number","disabled":true}},{"field":"lvl","label":"层级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入层级","type":"number","disabled":true}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类"}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类"}},{"field":"available_id","label":"可用日历","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择可用日历","filterable":true},"optionsSourceKey":"planning_calendarOptions","optionProps":{"label":"label","value":"id"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_supplier-list'
  and edit_page.code = 'planning_supplier-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_supplier-list', 'planning_supplier-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_supplier', '供应商', 'public.planning_supplier',
  '/dashboard/planning/supplier', 'planning_supplier-list', 'ri-truck-line', '采购来源与供应商主数据。',
  'id', 'active', 325, '{"sourceTable":"supplier","freppleModel":"supplier","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"名称","kind":"text","required":true},{"name":"owner_id","label":"上级","kind":"relation","relation":"planning_supplier"},{"name":"lft","label":"左节点","kind":"integer","readOnly":true},{"name":"rght","label":"右节点","kind":"integer","readOnly":true},{"name":"lvl","label":"层级","kind":"integer","readOnly":true},{"name":"description","label":"说明","kind":"text"},{"name":"category","label":"分类","kind":"text"},{"name":"subcategory","label":"子分类","kind":"text"},{"name":"available_id","label":"可用日历","kind":"relation","relation":"planning_calendar"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_itemsupplier-list', '/dashboard/planning/itemsupplier', '物料供应', '物料、供应商和地点之间的采购规则。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_itemsupplier-list","route":"/dashboard/planning/itemsupplier","title":"物料供应","description":"物料、供应商和地点之间的采购规则。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_itemsupplierRows":{"key":"planning_itemsupplierRows","label":"物料供应数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_itemsupplier","postData":{"resource":"planning_itemsupplier","tableName":"planning_itemsupplier","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_supplierOptions":{"key":"planning_supplierOptions","label":"供应商选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_supplier","labelField":"name"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_itemsupplier-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/itemsupplier/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_itemsupplierRows"]}]}]},{"id":"planning_itemsupplier-grid","kind":"grid","title":"物料供应列表","sourceKey":"planning_itemsupplierRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"item_id_label","title":"物料","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"supplier_id_label","title":"供应商","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"leadtime","title":"采购提前期","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"extra_safety_leadtime","title":"额外安全提前期","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"hard_safety_leadtime","title":"硬安全提前期","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"sizeminimum","title":"最小批量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"sizemultiple","title":"批量倍数","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"sizemaximum","title":"最大批量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_itemsupplier-edit', '/dashboard/planning/itemsupplier/edit', '物料供应编辑', '物料、供应商和地点之间的采购规则。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_itemsupplier-edit","route":"/dashboard/planning/itemsupplier/edit","title":"物料供应编辑","description":"物料、供应商和地点之间的采购规则。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_itemsupplierRows":{"key":"planning_itemsupplierRows","label":"物料供应数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_itemsupplier","postData":{"resource":"planning_itemsupplier","tableName":"planning_itemsupplier","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_supplierOptions":{"key":"planning_supplierOptions","label":"供应商选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_supplier","labelField":"name"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_itemsupplier-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/itemsupplier"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_itemsupplierRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_itemsupplierRows","serviceMethod":"saveItem","postData":{"resource":"planning_itemsupplier","id":"{{ forms.planning_itemsupplier_edit_form.id }}","data":{"item_id":"{{ forms.planning_itemsupplier_edit_form.item_id }}","location_id":"{{ forms.planning_itemsupplier_edit_form.location_id }}","supplier_id":"{{ forms.planning_itemsupplier_edit_form.supplier_id }}","leadtime":"{{ forms.planning_itemsupplier_edit_form.leadtime }}","extra_safety_leadtime":"{{ forms.planning_itemsupplier_edit_form.extra_safety_leadtime }}","hard_safety_leadtime":"{{ forms.planning_itemsupplier_edit_form.hard_safety_leadtime }}","sizeminimum":"{{ forms.planning_itemsupplier_edit_form.sizeminimum }}","sizemultiple":"{{ forms.planning_itemsupplier_edit_form.sizemultiple }}","sizemaximum":"{{ forms.planning_itemsupplier_edit_form.sizemaximum }}","batchwindow":"{{ forms.planning_itemsupplier_edit_form.batchwindow }}","cost":"{{ forms.planning_itemsupplier_edit_form.cost }}","priority":"{{ forms.planning_itemsupplier_edit_form.priority }}","effective_start":"{{ forms.planning_itemsupplier_edit_form.effective_start }}","effective_end":"{{ forms.planning_itemsupplier_edit_form.effective_end }}","resource_id":"{{ forms.planning_itemsupplier_edit_form.resource_id }}","resource_qty":"{{ forms.planning_itemsupplier_edit_form.resource_qty }}","fence":"{{ forms.planning_itemsupplier_edit_form.fence }}","source":"{{ forms.planning_itemsupplier_edit_form.source }}"}},"assignTo":"planning_itemsupplierSaved"},{"type":"navigate","route":"/dashboard/planning/itemsupplier/edit?id={{ data.planning_itemsupplierSaved.id }}&fromPage=planning_itemsupplier-list"},{"type":"showMessage","status":"success","message":"物料供应已保存。"}]}]},{"id":"planning_itemsupplier-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_itemsupplier_edit_form","kind":"form","title":"物料供应信息","sourceKey":"planning_itemsupplierRows","submitSourceKey":"planning_itemsupplierRows","initialValues":{"id":"","item_id":"","location_id":"","supplier_id":"","leadtime":"","extra_safety_leadtime":"","hard_safety_leadtime":"","sizeminimum":1,"sizemultiple":"","sizemaximum":"","batchwindow":"7 days","cost":"","priority":1,"effective_start":"1971-01-01T00:00:00Z","effective_end":"2030-12-31T00:00:00Z","resource_id":"","resource_qty":1,"fence":"","source":""},"schema":{"columns":4,"fields":[{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"}},{"field":"supplier_id","label":"供应商","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择供应商","filterable":true},"optionsSourceKey":"planning_supplierOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入供应商"}]},{"field":"leadtime","label":"采购提前期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入采购提前期"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"extra_safety_leadtime","label":"额外安全提前期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入额外安全提前期"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"hard_safety_leadtime","label":"硬安全提前期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入硬安全提前期"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"sizeminimum","label":"最小批量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最小批量","type":"number"}},{"field":"sizemultiple","label":"批量倍数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入批量倍数","type":"number"}},{"field":"sizemaximum","label":"最大批量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最大批量","type":"number"}},{"field":"batchwindow","label":"合批窗口","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入合批窗口"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"cost","label":"采购成本","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入采购成本","type":"number"}},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"}},{"field":"effective_start","label":"生效开始","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效开始"}},{"field":"effective_end","label":"生效结束","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效结束"}},{"field":"resource_id","label":"资源","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择资源","filterable":true},"optionsSourceKey":"planning_resourceOptions","optionProps":{"label":"label","value":"id"}},{"field":"resource_qty","label":"资源用量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入资源用量","type":"number"}},{"field":"fence","label":"冻结期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入冻结期"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_itemsupplier-list'
  and edit_page.code = 'planning_itemsupplier-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_itemsupplier-list', 'planning_itemsupplier-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_itemsupplier', '物料供应', 'public.planning_itemsupplier',
  '/dashboard/planning/itemsupplier', 'planning_itemsupplier-list', 'ri-shopping-bag-3-line', '物料、供应商和地点之间的采购规则。',
  'id', 'active', 326, '{"sourceTable":"itemsupplier","freppleModel":"itemsupplier","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item","required":true},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location"},{"name":"supplier_id","label":"供应商","kind":"relation","relation":"planning_supplier","required":true},{"name":"leadtime","label":"采购提前期","kind":"interval"},{"name":"extra_safety_leadtime","label":"额外安全提前期","kind":"interval"},{"name":"hard_safety_leadtime","label":"硬安全提前期","kind":"interval"},{"name":"sizeminimum","label":"最小批量","kind":"number","default":1},{"name":"sizemultiple","label":"批量倍数","kind":"number"},{"name":"sizemaximum","label":"最大批量","kind":"number"},{"name":"batchwindow","label":"合批窗口","kind":"interval","default":"7 days"},{"name":"cost","label":"采购成本","kind":"number"},{"name":"priority","label":"优先级","kind":"integer","default":1},{"name":"effective_start","label":"生效开始","kind":"datetime","default":"1971-01-01T00:00:00Z"},{"name":"effective_end","label":"生效结束","kind":"datetime","default":"2030-12-31T00:00:00Z"},{"name":"resource_id","label":"资源","kind":"relation","relation":"planning_resource"},{"name":"resource_qty","label":"资源用量","kind":"number","default":1},{"name":"fence","label":"冻结期","kind":"interval"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_itemdistribution-list', '/dashboard/planning/itemdistribution', '物料配送', '地点之间的物料补货和配送通道。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_itemdistribution-list","route":"/dashboard/planning/itemdistribution","title":"物料配送","description":"地点之间的物料补货和配送通道。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_itemdistributionRows":{"key":"planning_itemdistributionRows","label":"物料配送数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_itemdistribution","postData":{"resource":"planning_itemdistribution","tableName":"planning_itemdistribution","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"目的地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_itemdistribution-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/itemdistribution/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_itemdistributionRows"]}]}]},{"id":"planning_itemdistribution-grid","kind":"grid","title":"物料配送列表","sourceKey":"planning_itemdistributionRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"item_id_label","title":"物料","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"目的地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"origin_id_label","title":"来源地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"leadtime","title":"配送提前期","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"sizeminimum","title":"最小批量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"sizemultiple","title":"批量倍数","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"sizemaximum","title":"最大批量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"batchwindow","title":"合批窗口","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"cost","title":"配送成本","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_itemdistribution-edit', '/dashboard/planning/itemdistribution/edit', '物料配送编辑', '地点之间的物料补货和配送通道。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_itemdistribution-edit","route":"/dashboard/planning/itemdistribution/edit","title":"物料配送编辑","description":"地点之间的物料补货和配送通道。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_itemdistributionRows":{"key":"planning_itemdistributionRows","label":"物料配送数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_itemdistribution","postData":{"resource":"planning_itemdistribution","tableName":"planning_itemdistribution","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"目的地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_itemdistribution-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/itemdistribution"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_itemdistributionRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_itemdistributionRows","serviceMethod":"saveItem","postData":{"resource":"planning_itemdistribution","id":"{{ forms.planning_itemdistribution_edit_form.id }}","data":{"item_id":"{{ forms.planning_itemdistribution_edit_form.item_id }}","location_id":"{{ forms.planning_itemdistribution_edit_form.location_id }}","origin_id":"{{ forms.planning_itemdistribution_edit_form.origin_id }}","leadtime":"{{ forms.planning_itemdistribution_edit_form.leadtime }}","sizeminimum":"{{ forms.planning_itemdistribution_edit_form.sizeminimum }}","sizemultiple":"{{ forms.planning_itemdistribution_edit_form.sizemultiple }}","sizemaximum":"{{ forms.planning_itemdistribution_edit_form.sizemaximum }}","batchwindow":"{{ forms.planning_itemdistribution_edit_form.batchwindow }}","cost":"{{ forms.planning_itemdistribution_edit_form.cost }}","priority":"{{ forms.planning_itemdistribution_edit_form.priority }}","effective_start":"{{ forms.planning_itemdistribution_edit_form.effective_start }}","effective_end":"{{ forms.planning_itemdistribution_edit_form.effective_end }}","resource_id":"{{ forms.planning_itemdistribution_edit_form.resource_id }}","resource_qty":"{{ forms.planning_itemdistribution_edit_form.resource_qty }}","fence":"{{ forms.planning_itemdistribution_edit_form.fence }}","source":"{{ forms.planning_itemdistribution_edit_form.source }}"}},"assignTo":"planning_itemdistributionSaved"},{"type":"navigate","route":"/dashboard/planning/itemdistribution/edit?id={{ data.planning_itemdistributionSaved.id }}&fromPage=planning_itemdistribution-list"},{"type":"showMessage","status":"success","message":"物料配送已保存。"}]}]},{"id":"planning_itemdistribution-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_itemdistribution_edit_form","kind":"form","title":"物料配送信息","sourceKey":"planning_itemdistributionRows","submitSourceKey":"planning_itemdistributionRows","initialValues":{"id":"","item_id":"","location_id":"","origin_id":"","leadtime":"","sizeminimum":1,"sizemultiple":"","sizemaximum":"","batchwindow":"7 days","cost":"","priority":1,"effective_start":"1971-01-01T00:00:00Z","effective_end":"2030-12-31T00:00:00Z","resource_id":"","resource_qty":1,"fence":"","source":""},"schema":{"columns":4,"fields":[{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"location_id","label":"目的地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择目的地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入目的地点"}]},{"field":"origin_id","label":"来源地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择来源地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入来源地点"}]},{"field":"leadtime","label":"配送提前期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入配送提前期"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"sizeminimum","label":"最小批量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最小批量","type":"number"}},{"field":"sizemultiple","label":"批量倍数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入批量倍数","type":"number"}},{"field":"sizemaximum","label":"最大批量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最大批量","type":"number"}},{"field":"batchwindow","label":"合批窗口","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入合批窗口"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"cost","label":"配送成本","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入配送成本","type":"number"}},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"}},{"field":"effective_start","label":"生效开始","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效开始"}},{"field":"effective_end","label":"生效结束","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效结束"}},{"field":"resource_id","label":"资源","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择资源","filterable":true},"optionsSourceKey":"planning_resourceOptions","optionProps":{"label":"label","value":"id"}},{"field":"resource_qty","label":"资源用量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入资源用量","type":"number"}},{"field":"fence","label":"冻结期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入冻结期"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_itemdistribution-list'
  and edit_page.code = 'planning_itemdistribution-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_itemdistribution-list', 'planning_itemdistribution-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_itemdistribution', '物料配送', 'public.planning_itemdistribution',
  '/dashboard/planning/itemdistribution', 'planning_itemdistribution-list', 'ri-route-line', '地点之间的物料补货和配送通道。',
  'id', 'active', 327, '{"sourceTable":"itemdistribution","freppleModel":"itemdistribution","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item","required":true},{"name":"location_id","label":"目的地点","kind":"relation","relation":"planning_location","required":true},{"name":"origin_id","label":"来源地点","kind":"relation","relation":"planning_location","required":true},{"name":"leadtime","label":"配送提前期","kind":"interval"},{"name":"sizeminimum","label":"最小批量","kind":"number","default":1},{"name":"sizemultiple","label":"批量倍数","kind":"number"},{"name":"sizemaximum","label":"最大批量","kind":"number"},{"name":"batchwindow","label":"合批窗口","kind":"interval","default":"7 days"},{"name":"cost","label":"配送成本","kind":"number"},{"name":"priority","label":"优先级","kind":"integer","default":1},{"name":"effective_start","label":"生效开始","kind":"datetime","default":"1971-01-01T00:00:00Z"},{"name":"effective_end","label":"生效结束","kind":"datetime","default":"2030-12-31T00:00:00Z"},{"name":"resource_id","label":"资源","kind":"relation","relation":"planning_resource"},{"name":"resource_qty","label":"资源用量","kind":"number","default":1},{"name":"fence","label":"冻结期","kind":"interval"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_buffer-list', '/dashboard/planning/buffer', '库存缓冲区', '物料在地点上的库存状态和上下限。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_buffer-list","route":"/dashboard/planning/buffer","title":"库存缓冲区","description":"物料在地点上的库存状态和上下限。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_bufferRows":{"key":"planning_bufferRows","label":"库存缓冲区数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_buffer","postData":{"resource":"planning_buffer","tableName":"planning_buffer","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"最小库存日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_buffer-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/buffer/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_bufferRows"]}]}]},{"id":"planning_buffer-search","kind":"searchForm","targetSourceKey":"planning_bufferRows","schema":{"columns":4,"fields":[{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}},{"field":"type","label":"类型","component":"vxe-select","options":[{"label":"default","value":"default"},{"label":"infinite","value":"infinite"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_buffer-grid","kind":"grid","title":"库存缓冲区列表","sourceKey":"planning_bufferRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"location_id_label","title":"地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item_id_label","title":"物料","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"category","title":"分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"subcategory","title":"子分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"type","title":"类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"default":"default","infinite":"infinite"},"emptyText":"-"}},{"field":"batch","title":"批次","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"onhand","title":"现有量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"minimum","title":"最小库存","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_buffer-edit', '/dashboard/planning/buffer/edit', '库存缓冲区编辑', '物料在地点上的库存状态和上下限。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_buffer-edit","route":"/dashboard/planning/buffer/edit","title":"库存缓冲区编辑","description":"物料在地点上的库存状态和上下限。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_bufferRows":{"key":"planning_bufferRows","label":"库存缓冲区数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_buffer","postData":{"resource":"planning_buffer","tableName":"planning_buffer","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"最小库存日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_buffer-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/buffer"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_bufferRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_bufferRows","serviceMethod":"saveItem","postData":{"resource":"planning_buffer","id":"{{ forms.planning_buffer_edit_form.id }}","data":{"description":"{{ forms.planning_buffer_edit_form.description }}","category":"{{ forms.planning_buffer_edit_form.category }}","subcategory":"{{ forms.planning_buffer_edit_form.subcategory }}","type":"{{ forms.planning_buffer_edit_form.type }}","location_id":"{{ forms.planning_buffer_edit_form.location_id }}","item_id":"{{ forms.planning_buffer_edit_form.item_id }}","batch":"{{ forms.planning_buffer_edit_form.batch }}","onhand":"{{ forms.planning_buffer_edit_form.onhand }}","minimum":"{{ forms.planning_buffer_edit_form.minimum }}","minimum_calendar_id":"{{ forms.planning_buffer_edit_form.minimum_calendar_id }}","min_interval":"{{ forms.planning_buffer_edit_form.min_interval }}","maximum":"{{ forms.planning_buffer_edit_form.maximum }}","maximum_calendar_id":"{{ forms.planning_buffer_edit_form.maximum_calendar_id }}","source":"{{ forms.planning_buffer_edit_form.source }}"}},"assignTo":"planning_bufferSaved"},{"type":"navigate","route":"/dashboard/planning/buffer/edit?id={{ data.planning_bufferSaved.id }}&fromPage=planning_buffer-list"},{"type":"showMessage","status":"success","message":"库存缓冲区已保存。"}]}]},{"id":"planning_buffer-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_buffer_edit_form","kind":"form","title":"库存缓冲区信息","sourceKey":"planning_bufferRows","submitSourceKey":"planning_bufferRows","initialValues":{"id":"","description":"","category":"","subcategory":"","type":"default","location_id":"","item_id":"","batch":"","onhand":0,"minimum":0,"minimum_calendar_id":"","min_interval":"","maximum":0,"maximum_calendar_id":"","source":""},"schema":{"columns":4,"fields":[{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类"}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类"}},{"field":"type","label":"类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入类型"},"options":[{"label":"default","value":"default"},{"label":"infinite","value":"infinite"}]},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入地点"}]},{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"batch","label":"批次","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入批次"}},{"field":"onhand","label":"现有量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入现有量","type":"number"}},{"field":"minimum","label":"最小库存","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最小库存","type":"number"}},{"field":"minimum_calendar_id","label":"最小库存日历","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择最小库存日历","filterable":true},"optionsSourceKey":"planning_calendarOptions","optionProps":{"label":"label","value":"id"}},{"field":"min_interval","label":"最小间隔","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最小间隔"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"maximum","label":"最大库存","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最大库存","type":"number"}},{"field":"maximum_calendar_id","label":"最大库存日历","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择最大库存日历","filterable":true},"optionsSourceKey":"planning_calendarOptions","optionProps":{"label":"label","value":"id"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_buffer-list'
  and edit_page.code = 'planning_buffer-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_buffer-list', 'planning_buffer-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_buffer', '库存缓冲区', 'public.planning_buffer',
  '/dashboard/planning/buffer', 'planning_buffer-list', 'ri-stack-line', '物料在地点上的库存状态和上下限。',
  'id', 'active', 328, '{"sourceTable":"buffer","freppleModel":"buffer","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"description","label":"说明","kind":"text"},{"name":"category","label":"分类","kind":"text"},{"name":"subcategory","label":"子分类","kind":"text"},{"name":"type","label":"类型","kind":"text","default":"default","options":[{"label":"default","value":"default"},{"label":"infinite","value":"infinite"}]},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location","required":true},{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item","required":true},{"name":"batch","label":"批次","kind":"text","default":""},{"name":"onhand","label":"现有量","kind":"number","default":0},{"name":"minimum","label":"最小库存","kind":"number","default":0},{"name":"minimum_calendar_id","label":"最小库存日历","kind":"relation","relation":"planning_calendar"},{"name":"min_interval","label":"最小间隔","kind":"interval"},{"name":"maximum","label":"最大库存","kind":"number","default":0},{"name":"maximum_calendar_id","label":"最大库存日历","kind":"relation","relation":"planning_calendar"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_setupmatrix-list', '/dashboard/planning/setupmatrix', '换型矩阵', '资源换型规则的集合。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_setupmatrix-list","route":"/dashboard/planning/setupmatrix","title":"换型矩阵","description":"资源换型规则的集合。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_setupmatrixRows":{"key":"planning_setupmatrixRows","label":"换型矩阵数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_setupmatrix","postData":{"resource":"planning_setupmatrix","tableName":"planning_setupmatrix","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true}},"blocks":[{"id":"planning_setupmatrix-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/setupmatrix/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_setupmatrixRows"]}]}]},{"id":"planning_setupmatrix-search","kind":"searchForm","targetSourceKey":"planning_setupmatrixRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_setupmatrix-grid","kind":"grid","title":"换型矩阵列表","sourceKey":"planning_setupmatrixRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_setupmatrix-edit', '/dashboard/planning/setupmatrix/edit', '换型矩阵编辑', '资源换型规则的集合。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_setupmatrix-edit","route":"/dashboard/planning/setupmatrix/edit","title":"换型矩阵编辑","description":"资源换型规则的集合。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_setupmatrixRows":{"key":"planning_setupmatrixRows","label":"换型矩阵数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_setupmatrix","postData":{"resource":"planning_setupmatrix","tableName":"planning_setupmatrix","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true}},"blocks":[{"id":"planning_setupmatrix-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/setupmatrix"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_setupmatrixRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_setupmatrixRows","serviceMethod":"saveItem","postData":{"resource":"planning_setupmatrix","id":"{{ forms.planning_setupmatrix_edit_form.id }}","data":{"name":"{{ forms.planning_setupmatrix_edit_form.name }}","source":"{{ forms.planning_setupmatrix_edit_form.source }}"}},"assignTo":"planning_setupmatrixSaved"},{"type":"navigate","route":"/dashboard/planning/setupmatrix/edit?id={{ data.planning_setupmatrixSaved.id }}&fromPage=planning_setupmatrix-list"},{"type":"showMessage","status":"success","message":"换型矩阵已保存。"}]}]},{"id":"planning_setupmatrix-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_setupmatrix_edit_form","kind":"form","title":"换型矩阵信息","sourceKey":"planning_setupmatrixRows","submitSourceKey":"planning_setupmatrixRows","initialValues":{"id":"","name":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_setupmatrix-list'
  and edit_page.code = 'planning_setupmatrix-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_setupmatrix-list', 'planning_setupmatrix-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_setupmatrix', '换型矩阵', 'public.planning_setupmatrix',
  '/dashboard/planning/setupmatrix', 'planning_setupmatrix-list', 'ri-table-line', '资源换型规则的集合。',
  'id', 'active', 329, '{"sourceTable":"setupmatrix","freppleModel":"setupmatrix","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"名称","kind":"text","required":true},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_resource-list', '/dashboard/planning/resource', '资源', '设备、人员、产线等能力资源。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_resource-list","route":"/dashboard/planning/resource","title":"资源","description":"设备、人员、产线等能力资源。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_resourceRows":{"key":"planning_resourceRows","label":"资源数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_resource","postData":{"resource":"planning_resource","tableName":"planning_resource","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"最大能力日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_setupmatrixOptions":{"key":"planning_setupmatrixOptions","label":"换型矩阵选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_setupmatrix","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_resource-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/resource/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_resourceRows"]}]}]},{"id":"planning_resource-search","kind":"searchForm","targetSourceKey":"planning_resourceRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}},{"field":"type","label":"类型","component":"vxe-select","options":[{"label":"default","value":"default"},{"label":"buckets","value":"buckets"},{"label":"buckets_day","value":"buckets_day"},{"label":"buckets_week","value":"buckets_week"},{"label":"buckets_month","value":"buckets_month"},{"label":"infinite","value":"infinite"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_resource-grid","kind":"grid","title":"资源列表","sourceKey":"planning_resourceRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"owner_id_label","title":"上级","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"category","title":"分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"subcategory","title":"子分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"type","title":"类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"default":"default","buckets":"buckets","buckets_day":"buckets_day","buckets_week":"buckets_week","buckets_month":"buckets_month","infinite":"infinite"},"emptyText":"-"}},{"field":"constrained","title":"受约束","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"true":"是","false":"否"},"emptyText":"-"},"width":90,"align":"center"},{"field":"maximum","title":"最大能力","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"maximum_calendar_id_label","title":"最大能力日历","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_resource-edit', '/dashboard/planning/resource/edit', '资源编辑', '设备、人员、产线等能力资源。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_resource-edit","route":"/dashboard/planning/resource/edit","title":"资源编辑","description":"设备、人员、产线等能力资源。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_resourceRows":{"key":"planning_resourceRows","label":"资源数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_resource","postData":{"resource":"planning_resource","tableName":"planning_resource","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"上级选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"最大能力日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_setupmatrixOptions":{"key":"planning_setupmatrixOptions","label":"换型矩阵选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_setupmatrix","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_resource-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/resource"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_resourceRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_resourceRows","serviceMethod":"saveItem","postData":{"resource":"planning_resource","id":"{{ forms.planning_resource_edit_form.id }}","data":{"name":"{{ forms.planning_resource_edit_form.name }}","owner_id":"{{ forms.planning_resource_edit_form.owner_id }}","description":"{{ forms.planning_resource_edit_form.description }}","category":"{{ forms.planning_resource_edit_form.category }}","subcategory":"{{ forms.planning_resource_edit_form.subcategory }}","type":"{{ forms.planning_resource_edit_form.type }}","constrained":"{{ forms.planning_resource_edit_form.constrained }}","maximum":"{{ forms.planning_resource_edit_form.maximum }}","maximum_calendar_id":"{{ forms.planning_resource_edit_form.maximum_calendar_id }}","available_id":"{{ forms.planning_resource_edit_form.available_id }}","location_id":"{{ forms.planning_resource_edit_form.location_id }}","cost":"{{ forms.planning_resource_edit_form.cost }}","maxearly":"{{ forms.planning_resource_edit_form.maxearly }}","setupmatrix_id":"{{ forms.planning_resource_edit_form.setupmatrix_id }}","setup":"{{ forms.planning_resource_edit_form.setup }}","efficiency":"{{ forms.planning_resource_edit_form.efficiency }}","efficiency_calendar_id":"{{ forms.planning_resource_edit_form.efficiency_calendar_id }}","source":"{{ forms.planning_resource_edit_form.source }}"}},"assignTo":"planning_resourceSaved"},{"type":"navigate","route":"/dashboard/planning/resource/edit?id={{ data.planning_resourceSaved.id }}&fromPage=planning_resource-list"},{"type":"showMessage","status":"success","message":"资源已保存。"}]}]},{"id":"planning_resource-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_resource_edit_form","kind":"form","title":"资源信息","sourceKey":"planning_resourceRows","submitSourceKey":"planning_resourceRows","initialValues":{"id":"","name":"","owner_id":"","description":"","category":"","subcategory":"","type":"default","constrained":false,"maximum":1,"maximum_calendar_id":"","available_id":"","location_id":"","cost":"","maxearly":"","setupmatrix_id":"","setup":"","efficiency":"","efficiency_calendar_id":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"owner_id","label":"上级","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择上级","filterable":true},"optionsSourceKey":"planning_resourceOptions","optionProps":{"label":"label","value":"id"}},{"field":"lft","label":"左节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入左节点","type":"number","disabled":true}},{"field":"rght","label":"右节点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入右节点","type":"number","disabled":true}},{"field":"lvl","label":"层级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入层级","type":"number","disabled":true}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类"}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类"}},{"field":"type","label":"类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入类型"},"options":[{"label":"default","value":"default"},{"label":"buckets","value":"buckets"},{"label":"buckets_day","value":"buckets_day"},{"label":"buckets_week","value":"buckets_week"},{"label":"buckets_month","value":"buckets_month"},{"label":"infinite","value":"infinite"}]},{"field":"constrained","label":"受约束","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入受约束"}},{"field":"maximum","label":"最大能力","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最大能力","type":"number"}},{"field":"maximum_calendar_id","label":"最大能力日历","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择最大能力日历","filterable":true},"optionsSourceKey":"planning_calendarOptions","optionProps":{"label":"label","value":"id"}},{"field":"available_id","label":"可用日历","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择可用日历","filterable":true},"optionsSourceKey":"planning_calendarOptions","optionProps":{"label":"label","value":"id"}},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"}},{"field":"cost","label":"单位成本","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入单位成本","type":"number"}},{"field":"maxearly","label":"最大提前量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最大提前量"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"setupmatrix_id","label":"换型矩阵","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择换型矩阵","filterable":true},"optionsSourceKey":"planning_setupmatrixOptions","optionProps":{"label":"label","value":"id"}},{"field":"setup","label":"当前换型","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入当前换型"}},{"field":"efficiency","label":"效率","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入效率","type":"number"}},{"field":"efficiency_calendar_id","label":"效率日历","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择效率日历","filterable":true},"optionsSourceKey":"planning_calendarOptions","optionProps":{"label":"label","value":"id"}},{"field":"overloadcount","label":"超载次数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入超载次数","type":"number","disabled":true}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_resource-list'
  and edit_page.code = 'planning_resource-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_resource-list', 'planning_resource-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_resource', '资源', 'public.planning_resource',
  '/dashboard/planning/resource', 'planning_resource-list', 'ri-hammer-line', '设备、人员、产线等能力资源。',
  'id', 'active', 330, '{"sourceTable":"resource","freppleModel":"resource","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"名称","kind":"text","required":true},{"name":"owner_id","label":"上级","kind":"relation","relation":"planning_resource"},{"name":"lft","label":"左节点","kind":"integer","readOnly":true},{"name":"rght","label":"右节点","kind":"integer","readOnly":true},{"name":"lvl","label":"层级","kind":"integer","readOnly":true},{"name":"description","label":"说明","kind":"text"},{"name":"category","label":"分类","kind":"text"},{"name":"subcategory","label":"子分类","kind":"text"},{"name":"type","label":"类型","kind":"text","default":"default","options":[{"label":"default","value":"default"},{"label":"buckets","value":"buckets"},{"label":"buckets_day","value":"buckets_day"},{"label":"buckets_week","value":"buckets_week"},{"label":"buckets_month","value":"buckets_month"},{"label":"infinite","value":"infinite"}]},{"name":"constrained","label":"受约束","kind":"boolean"},{"name":"maximum","label":"最大能力","kind":"number","default":1},{"name":"maximum_calendar_id","label":"最大能力日历","kind":"relation","relation":"planning_calendar"},{"name":"available_id","label":"可用日历","kind":"relation","relation":"planning_calendar"},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location"},{"name":"cost","label":"单位成本","kind":"number"},{"name":"maxearly","label":"最大提前量","kind":"interval"},{"name":"setupmatrix_id","label":"换型矩阵","kind":"relation","relation":"planning_setupmatrix"},{"name":"setup","label":"当前换型","kind":"text"},{"name":"efficiency","label":"效率","kind":"number"},{"name":"efficiency_calendar_id","label":"效率日历","kind":"relation","relation":"planning_calendar"},{"name":"overloadcount","label":"超载次数","kind":"integer","readOnly":true},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_skill-list', '/dashboard/planning/skill', '技能', '资源能力所需或具备的技能。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_skill-list","route":"/dashboard/planning/skill","title":"技能","description":"资源能力所需或具备的技能。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_skillRows":{"key":"planning_skillRows","label":"技能数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_skill","postData":{"resource":"planning_skill","tableName":"planning_skill","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true}},"blocks":[{"id":"planning_skill-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/skill/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_skillRows"]}]}]},{"id":"planning_skill-search","kind":"searchForm","targetSourceKey":"planning_skillRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_skill-grid","kind":"grid","title":"技能列表","sourceKey":"planning_skillRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_skill-edit', '/dashboard/planning/skill/edit', '技能编辑', '资源能力所需或具备的技能。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_skill-edit","route":"/dashboard/planning/skill/edit","title":"技能编辑","description":"资源能力所需或具备的技能。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_skillRows":{"key":"planning_skillRows","label":"技能数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_skill","postData":{"resource":"planning_skill","tableName":"planning_skill","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true}},"blocks":[{"id":"planning_skill-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/skill"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_skillRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_skillRows","serviceMethod":"saveItem","postData":{"resource":"planning_skill","id":"{{ forms.planning_skill_edit_form.id }}","data":{"name":"{{ forms.planning_skill_edit_form.name }}","source":"{{ forms.planning_skill_edit_form.source }}"}},"assignTo":"planning_skillSaved"},{"type":"navigate","route":"/dashboard/planning/skill/edit?id={{ data.planning_skillSaved.id }}&fromPage=planning_skill-list"},{"type":"showMessage","status":"success","message":"技能已保存。"}]}]},{"id":"planning_skill-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_skill_edit_form","kind":"form","title":"技能信息","sourceKey":"planning_skillRows","submitSourceKey":"planning_skillRows","initialValues":{"id":"","name":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_skill-list'
  and edit_page.code = 'planning_skill-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_skill-list', 'planning_skill-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_skill', '技能', 'public.planning_skill',
  '/dashboard/planning/skill', 'planning_skill-list', 'ri-award-line', '资源能力所需或具备的技能。',
  'id', 'active', 331, '{"sourceTable":"skill","freppleModel":"skill","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"名称","kind":"text","required":true},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_resourceskill-list', '/dashboard/planning/resourceskill', '资源技能', '资源与技能的有效期和优先级关联。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_resourceskill-list","route":"/dashboard/planning/resourceskill","title":"资源技能","description":"资源与技能的有效期和优先级关联。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_resourceskillRows":{"key":"planning_resourceskillRows","label":"资源技能数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_resourceskill","postData":{"resource":"planning_resourceskill","tableName":"planning_resourceskill","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true},"planning_skillOptions":{"key":"planning_skillOptions","label":"技能选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_skill","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_resourceskill-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/resourceskill/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_resourceskillRows"]}]}]},{"id":"planning_resourceskill-grid","kind":"grid","title":"资源技能列表","sourceKey":"planning_resourceskillRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"resource_id_label","title":"资源","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"skill_id_label","title":"技能","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"effective_start","title":"生效开始","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"effective_end","title":"生效结束","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"priority","title":"优先级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_resourceskill-edit', '/dashboard/planning/resourceskill/edit', '资源技能编辑', '资源与技能的有效期和优先级关联。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_resourceskill-edit","route":"/dashboard/planning/resourceskill/edit","title":"资源技能编辑","description":"资源与技能的有效期和优先级关联。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_resourceskillRows":{"key":"planning_resourceskillRows","label":"资源技能数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_resourceskill","postData":{"resource":"planning_resourceskill","tableName":"planning_resourceskill","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true},"planning_skillOptions":{"key":"planning_skillOptions","label":"技能选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_skill","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_resourceskill-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/resourceskill"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_resourceskillRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_resourceskillRows","serviceMethod":"saveItem","postData":{"resource":"planning_resourceskill","id":"{{ forms.planning_resourceskill_edit_form.id }}","data":{"resource_id":"{{ forms.planning_resourceskill_edit_form.resource_id }}","skill_id":"{{ forms.planning_resourceskill_edit_form.skill_id }}","effective_start":"{{ forms.planning_resourceskill_edit_form.effective_start }}","effective_end":"{{ forms.planning_resourceskill_edit_form.effective_end }}","priority":"{{ forms.planning_resourceskill_edit_form.priority }}","source":"{{ forms.planning_resourceskill_edit_form.source }}"}},"assignTo":"planning_resourceskillSaved"},{"type":"navigate","route":"/dashboard/planning/resourceskill/edit?id={{ data.planning_resourceskillSaved.id }}&fromPage=planning_resourceskill-list"},{"type":"showMessage","status":"success","message":"资源技能已保存。"}]}]},{"id":"planning_resourceskill-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_resourceskill_edit_form","kind":"form","title":"资源技能信息","sourceKey":"planning_resourceskillRows","submitSourceKey":"planning_resourceskillRows","initialValues":{"id":"","resource_id":"","skill_id":"","effective_start":"","effective_end":"","priority":1,"source":""},"schema":{"columns":4,"fields":[{"field":"resource_id","label":"资源","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择资源","filterable":true},"optionsSourceKey":"planning_resourceOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入资源"}]},{"field":"skill_id","label":"技能","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择技能","filterable":true},"optionsSourceKey":"planning_skillOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入技能"}]},{"field":"effective_start","label":"生效开始","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效开始"}},{"field":"effective_end","label":"生效结束","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效结束"}},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_resourceskill-list'
  and edit_page.code = 'planning_resourceskill-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_resourceskill-list', 'planning_resourceskill-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_resourceskill', '资源技能', 'public.planning_resourceskill',
  '/dashboard/planning/resourceskill', 'planning_resourceskill-list', 'ri-user-settings-line', '资源与技能的有效期和优先级关联。',
  'id', 'active', 332, '{"sourceTable":"resourceskill","freppleModel":"resourceskill","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"resource_id","label":"资源","kind":"relation","relation":"planning_resource","required":true},{"name":"skill_id","label":"技能","kind":"relation","relation":"planning_skill","required":true},{"name":"effective_start","label":"生效开始","kind":"datetime"},{"name":"effective_end","label":"生效结束","kind":"datetime"},{"name":"priority","label":"优先级","kind":"integer","default":1},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_setuprule-list', '/dashboard/planning/setuprule', '换型规则', '换型矩阵中的前后状态、耗时和成本规则。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_setuprule-list","route":"/dashboard/planning/setuprule","title":"换型规则","description":"换型矩阵中的前后状态、耗时和成本规则。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_setupruleRows":{"key":"planning_setupruleRows","label":"换型规则数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_setuprule","postData":{"resource":"planning_setuprule","tableName":"planning_setuprule","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_setupmatrixOptions":{"key":"planning_setupmatrixOptions","label":"换型矩阵选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_setupmatrix","labelField":"name"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"限定资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_setuprule-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/setuprule/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_setupruleRows"]}]}]},{"id":"planning_setuprule-grid","kind":"grid","title":"换型规则列表","sourceKey":"planning_setupruleRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"setupmatrix_id_label","title":"换型矩阵","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"priority","title":"优先级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"fromsetup","title":"原换型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"tosetup","title":"目标换型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"duration","title":"换型时长","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"cost","title":"换型成本","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"resource_id_label","title":"限定资源","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_setuprule-edit', '/dashboard/planning/setuprule/edit', '换型规则编辑', '换型矩阵中的前后状态、耗时和成本规则。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_setuprule-edit","route":"/dashboard/planning/setuprule/edit","title":"换型规则编辑","description":"换型矩阵中的前后状态、耗时和成本规则。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_setupruleRows":{"key":"planning_setupruleRows","label":"换型规则数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_setuprule","postData":{"resource":"planning_setuprule","tableName":"planning_setuprule","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_setupmatrixOptions":{"key":"planning_setupmatrixOptions","label":"换型矩阵选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_setupmatrix","labelField":"name"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"限定资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_setuprule-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/setuprule"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_setupruleRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_setupruleRows","serviceMethod":"saveItem","postData":{"resource":"planning_setuprule","id":"{{ forms.planning_setuprule_edit_form.id }}","data":{"setupmatrix_id":"{{ forms.planning_setuprule_edit_form.setupmatrix_id }}","priority":"{{ forms.planning_setuprule_edit_form.priority }}","fromsetup":"{{ forms.planning_setuprule_edit_form.fromsetup }}","tosetup":"{{ forms.planning_setuprule_edit_form.tosetup }}","duration":"{{ forms.planning_setuprule_edit_form.duration }}","cost":"{{ forms.planning_setuprule_edit_form.cost }}","resource_id":"{{ forms.planning_setuprule_edit_form.resource_id }}","source":"{{ forms.planning_setuprule_edit_form.source }}"}},"assignTo":"planning_setupruleSaved"},{"type":"navigate","route":"/dashboard/planning/setuprule/edit?id={{ data.planning_setupruleSaved.id }}&fromPage=planning_setuprule-list"},{"type":"showMessage","status":"success","message":"换型规则已保存。"}]}]},{"id":"planning_setuprule-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_setuprule_edit_form","kind":"form","title":"换型规则信息","sourceKey":"planning_setupruleRows","submitSourceKey":"planning_setupruleRows","initialValues":{"id":"","setupmatrix_id":"","priority":"","fromsetup":"","tosetup":"","duration":"","cost":"","resource_id":"","source":""},"schema":{"columns":4,"fields":[{"field":"setupmatrix_id","label":"换型矩阵","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择换型矩阵","filterable":true},"optionsSourceKey":"planning_setupmatrixOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入换型矩阵"}]},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"},"rules":[{"required":true,"message":"请输入优先级"}]},{"field":"fromsetup","label":"原换型","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入原换型"}},{"field":"tosetup","label":"目标换型","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入目标换型"}},{"field":"duration","label":"换型时长","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入换型时长"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"cost","label":"换型成本","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入换型成本","type":"number"}},{"field":"resource_id","label":"限定资源","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择限定资源","filterable":true},"optionsSourceKey":"planning_resourceOptions","optionProps":{"label":"label","value":"id"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_setuprule-list'
  and edit_page.code = 'planning_setuprule-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_setuprule-list', 'planning_setuprule-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_setuprule', '换型规则', 'public.planning_setuprule',
  '/dashboard/planning/setuprule', 'planning_setuprule-list', 'ri-git-merge-line', '换型矩阵中的前后状态、耗时和成本规则。',
  'id', 'active', 333, '{"sourceTable":"setuprule","freppleModel":"setuprule","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"setupmatrix_id","label":"换型矩阵","kind":"relation","relation":"planning_setupmatrix","required":true},{"name":"priority","label":"优先级","kind":"integer","required":true},{"name":"fromsetup","label":"原换型","kind":"text"},{"name":"tosetup","label":"目标换型","kind":"text"},{"name":"duration","label":"换型时长","kind":"interval"},{"name":"cost","label":"换型成本","kind":"number"},{"name":"resource_id","label":"限定资源","kind":"relation","relation":"planning_resource"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_operation-list', '/dashboard/planning/operation', '工序', '制造工序、路线、备选与拆分结构。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_operation-list","route":"/dashboard/planning/operation","title":"工序","description":"制造工序、路线、备选与拆分结构。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_operationRows":{"key":"planning_operationRows","label":"工序数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operation","postData":{"resource":"planning_operation","tableName":"planning_operation","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"产出物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"上级工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"可用日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_operation-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/operation/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationRows"]}]}]},{"id":"planning_operation-search","kind":"searchForm","targetSourceKey":"planning_operationRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}},{"field":"type","label":"类型","component":"vxe-select","options":[{"label":"fixed_time","value":"fixed_time"},{"label":"time_per","value":"time_per"},{"label":"routing","value":"routing"},{"label":"alternate","value":"alternate"},{"label":"split","value":"split"}],"props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_operation-grid","kind":"grid","title":"工序列表","sourceKey":"planning_operationRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"type","title":"类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"fixed_time":"fixed_time","time_per":"time_per","routing":"routing","alternate":"alternate","split":"split"},"emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"category","title":"分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"subcategory","title":"子分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item_id_label","title":"产出物料","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"owner_id_label","title":"上级工序","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"priority","title":"优先级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_operation-edit', '/dashboard/planning/operation/edit', '工序编辑', '制造工序、路线、备选与拆分结构。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_operation-edit","route":"/dashboard/planning/operation/edit","title":"工序编辑","description":"制造工序、路线、备选与拆分结构。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_operationRows":{"key":"planning_operationRows","label":"工序数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operation","postData":{"resource":"planning_operation","tableName":"planning_operation","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"产出物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"上级工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true},"planning_calendarOptions":{"key":"planning_calendarOptions","label":"可用日历选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_calendar","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_operation-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/operation"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_operationRows","serviceMethod":"saveItem","postData":{"resource":"planning_operation","id":"{{ forms.planning_operation_edit_form.id }}","data":{"name":"{{ forms.planning_operation_edit_form.name }}","type":"{{ forms.planning_operation_edit_form.type }}","description":"{{ forms.planning_operation_edit_form.description }}","category":"{{ forms.planning_operation_edit_form.category }}","subcategory":"{{ forms.planning_operation_edit_form.subcategory }}","item_id":"{{ forms.planning_operation_edit_form.item_id }}","location_id":"{{ forms.planning_operation_edit_form.location_id }}","owner_id":"{{ forms.planning_operation_edit_form.owner_id }}","priority":"{{ forms.planning_operation_edit_form.priority }}","effective_start":"{{ forms.planning_operation_edit_form.effective_start }}","effective_end":"{{ forms.planning_operation_edit_form.effective_end }}","fence":"{{ forms.planning_operation_edit_form.fence }}","posttime":"{{ forms.planning_operation_edit_form.posttime }}","sizeminimum":"{{ forms.planning_operation_edit_form.sizeminimum }}","sizemultiple":"{{ forms.planning_operation_edit_form.sizemultiple }}","sizemaximum":"{{ forms.planning_operation_edit_form.sizemaximum }}","cost":"{{ forms.planning_operation_edit_form.cost }}","duration":"{{ forms.planning_operation_edit_form.duration }}","duration_per":"{{ forms.planning_operation_edit_form.duration_per }}","search":"{{ forms.planning_operation_edit_form.search }}","available_id":"{{ forms.planning_operation_edit_form.available_id }}","batchwindow":"{{ forms.planning_operation_edit_form.batchwindow }}","source":"{{ forms.planning_operation_edit_form.source }}"}},"assignTo":"planning_operationSaved"},{"type":"navigate","route":"/dashboard/planning/operation/edit?id={{ data.planning_operationSaved.id }}&fromPage=planning_operation-list"},{"type":"showMessage","status":"success","message":"工序已保存。"}]}]},{"id":"planning_operation-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_operation_edit_form","kind":"form","title":"工序信息","sourceKey":"planning_operationRows","submitSourceKey":"planning_operationRows","initialValues":{"id":"","name":"","type":"fixed_time","description":"","category":"","subcategory":"","item_id":"","location_id":"","owner_id":"","priority":1,"effective_start":"","effective_end":"","fence":"","posttime":"","sizeminimum":1,"sizemultiple":"","sizemaximum":"","cost":"","duration":"","duration_per":"","search":"","available_id":"","batchwindow":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"type","label":"类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入类型"},"options":[{"label":"fixed_time","value":"fixed_time"},{"label":"time_per","value":"time_per"},{"label":"routing","value":"routing"},{"label":"alternate","value":"alternate"},{"label":"split","value":"split"}]},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类"}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类"}},{"field":"item_id","label":"产出物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择产出物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"}},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入地点"}]},{"field":"owner_id","label":"上级工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择上级工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"}},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"}},{"field":"effective_start","label":"生效开始","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效开始"}},{"field":"effective_end","label":"生效结束","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效结束"}},{"field":"fence","label":"冻结期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入冻结期"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"posttime","label":"后处理时间","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入后处理时间"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"sizeminimum","label":"最小批量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最小批量","type":"number"}},{"field":"sizemultiple","label":"批量倍数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入批量倍数","type":"number"}},{"field":"sizemaximum","label":"最大批量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最大批量","type":"number"}},{"field":"cost","label":"工序成本","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入工序成本","type":"number"}},{"field":"duration","label":"固定时长","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入固定时长"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"duration_per","label":"单位时长","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入单位时长"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"search","label":"搜索模式","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入搜索模式"},"options":[{"label":"PRIORITY","value":"PRIORITY"},{"label":"MINCOST","value":"MINCOST"},{"label":"MINPENALTY","value":"MINPENALTY"},{"label":"MINCOSTPENALTY","value":"MINCOSTPENALTY"}]},{"field":"available_id","label":"可用日历","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择可用日历","filterable":true},"optionsSourceKey":"planning_calendarOptions","optionProps":{"label":"label","value":"id"}},{"field":"batchwindow","label":"合批窗口","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入合批窗口"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_operation-list'
  and edit_page.code = 'planning_operation-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_operation-list', 'planning_operation-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_operation', '工序', 'public.planning_operation',
  '/dashboard/planning/operation', 'planning_operation-list', 'ri-settings-3-line', '制造工序、路线、备选与拆分结构。',
  'id', 'active', 334, '{"sourceTable":"operation","freppleModel":"operation","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"名称","kind":"text","required":true},{"name":"type","label":"类型","kind":"text","default":"fixed_time","options":[{"label":"fixed_time","value":"fixed_time"},{"label":"time_per","value":"time_per"},{"label":"routing","value":"routing"},{"label":"alternate","value":"alternate"},{"label":"split","value":"split"}]},{"name":"description","label":"说明","kind":"text"},{"name":"category","label":"分类","kind":"text"},{"name":"subcategory","label":"子分类","kind":"text"},{"name":"item_id","label":"产出物料","kind":"relation","relation":"planning_item"},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location","required":true},{"name":"owner_id","label":"上级工序","kind":"relation","relation":"planning_operation"},{"name":"priority","label":"优先级","kind":"integer","default":1},{"name":"effective_start","label":"生效开始","kind":"datetime"},{"name":"effective_end","label":"生效结束","kind":"datetime"},{"name":"fence","label":"冻结期","kind":"interval"},{"name":"posttime","label":"后处理时间","kind":"interval"},{"name":"sizeminimum","label":"最小批量","kind":"number","default":1},{"name":"sizemultiple","label":"批量倍数","kind":"number"},{"name":"sizemaximum","label":"最大批量","kind":"number"},{"name":"cost","label":"工序成本","kind":"number"},{"name":"duration","label":"固定时长","kind":"interval"},{"name":"duration_per","label":"单位时长","kind":"interval"},{"name":"search","label":"搜索模式","kind":"text","options":[{"label":"PRIORITY","value":"PRIORITY"},{"label":"MINCOST","value":"MINCOST"},{"label":"MINPENALTY","value":"MINPENALTY"},{"label":"MINCOSTPENALTY","value":"MINCOSTPENALTY"}]},{"name":"available_id","label":"可用日历","kind":"relation","relation":"planning_calendar"},{"name":"batchwindow","label":"合批窗口","kind":"interval"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_operationmaterial-list', '/dashboard/planning/operationmaterial', '工序物料', '工序的物料消耗、产出和批量转移。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_operationmaterial-list","route":"/dashboard/planning/operationmaterial","title":"工序物料","description":"工序的物料消耗、产出和批量转移。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_operationmaterialRows":{"key":"planning_operationmaterialRows","label":"工序物料数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationmaterial","postData":{"resource":"planning_operationmaterial","tableName":"planning_operationmaterial","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_operationmaterial-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/operationmaterial/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationmaterialRows"]}]}]},{"id":"planning_operationmaterial-search","kind":"searchForm","targetSourceKey":"planning_operationmaterialRows","schema":{"columns":4,"fields":[{"field":"type","label":"流动时点","component":"vxe-select","options":[{"label":"start","value":"start"},{"label":"end","value":"end"},{"label":"transfer_batch","value":"transfer_batch"}],"props":{"clearable":true}},{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_operationmaterial-grid","kind":"grid","title":"工序物料列表","sourceKey":"planning_operationmaterialRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"operation_id_label","title":"工序","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item_id_label","title":"物料","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"变动用量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"quantity_fixed","title":"固定用量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"type","title":"流动时点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"start":"start","end":"end","transfer_batch":"transfer_batch"},"emptyText":"-"}},{"field":"effective_start","title":"生效开始","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"effective_end","title":"生效结束","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_operationmaterial-edit', '/dashboard/planning/operationmaterial/edit', '工序物料编辑', '工序的物料消耗、产出和批量转移。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_operationmaterial-edit","route":"/dashboard/planning/operationmaterial/edit","title":"工序物料编辑","description":"工序的物料消耗、产出和批量转移。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_operationmaterialRows":{"key":"planning_operationmaterialRows","label":"工序物料数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationmaterial","postData":{"resource":"planning_operationmaterial","tableName":"planning_operationmaterial","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_operationmaterial-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/operationmaterial"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationmaterialRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_operationmaterialRows","serviceMethod":"saveItem","postData":{"resource":"planning_operationmaterial","id":"{{ forms.planning_operationmaterial_edit_form.id }}","data":{"operation_id":"{{ forms.planning_operationmaterial_edit_form.operation_id }}","item_id":"{{ forms.planning_operationmaterial_edit_form.item_id }}","location_id":"{{ forms.planning_operationmaterial_edit_form.location_id }}","quantity":"{{ forms.planning_operationmaterial_edit_form.quantity }}","quantity_fixed":"{{ forms.planning_operationmaterial_edit_form.quantity_fixed }}","type":"{{ forms.planning_operationmaterial_edit_form.type }}","effective_start":"{{ forms.planning_operationmaterial_edit_form.effective_start }}","effective_end":"{{ forms.planning_operationmaterial_edit_form.effective_end }}","name":"{{ forms.planning_operationmaterial_edit_form.name }}","priority":"{{ forms.planning_operationmaterial_edit_form.priority }}","search":"{{ forms.planning_operationmaterial_edit_form.search }}","transferbatch":"{{ forms.planning_operationmaterial_edit_form.transferbatch }}","offset":"{{ forms.planning_operationmaterial_edit_form.offset }}","source":"{{ forms.planning_operationmaterial_edit_form.source }}"}},"assignTo":"planning_operationmaterialSaved"},{"type":"navigate","route":"/dashboard/planning/operationmaterial/edit?id={{ data.planning_operationmaterialSaved.id }}&fromPage=planning_operationmaterial-list"},{"type":"showMessage","status":"success","message":"工序物料已保存。"}]}]},{"id":"planning_operationmaterial-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_operationmaterial_edit_form","kind":"form","title":"工序物料信息","sourceKey":"planning_operationmaterialRows","submitSourceKey":"planning_operationmaterialRows","initialValues":{"id":"","operation_id":"","item_id":"","location_id":"","quantity":1,"quantity_fixed":"","type":"start","effective_start":"1971-01-01T00:00:00Z","effective_end":"2030-12-31T00:00:00Z","name":"","priority":1,"search":"","transferbatch":"","offset":"","source":""},"schema":{"columns":4,"fields":[{"field":"operation_id","label":"工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入工序"}]},{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"}},{"field":"quantity","label":"变动用量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入变动用量","type":"number"}},{"field":"quantity_fixed","label":"固定用量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入固定用量","type":"number"}},{"field":"type","label":"流动时点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入流动时点"},"options":[{"label":"start","value":"start"},{"label":"end","value":"end"},{"label":"transfer_batch","value":"transfer_batch"}]},{"field":"effective_start","label":"生效开始","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效开始"}},{"field":"effective_end","label":"生效结束","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效结束"}},{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"}},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"}},{"field":"search","label":"搜索模式","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入搜索模式"},"options":[{"label":"PRIORITY","value":"PRIORITY"},{"label":"MINCOST","value":"MINCOST"},{"label":"MINPENALTY","value":"MINPENALTY"},{"label":"MINCOSTPENALTY","value":"MINCOSTPENALTY"}]},{"field":"transferbatch","label":"转移批量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入转移批量","type":"number"}},{"field":"offset","label":"偏移时间","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入偏移时间"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_operationmaterial-list'
  and edit_page.code = 'planning_operationmaterial-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_operationmaterial-list', 'planning_operationmaterial-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_operationmaterial', '工序物料', 'public.planning_operationmaterial',
  '/dashboard/planning/operationmaterial', 'planning_operationmaterial-list', 'ri-node-tree', '工序的物料消耗、产出和批量转移。',
  'id', 'active', 335, '{"sourceTable":"operationmaterial","freppleModel":"operationmaterial","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"operation_id","label":"工序","kind":"relation","relation":"planning_operation","required":true},{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item","required":true},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location"},{"name":"quantity","label":"变动用量","kind":"number","default":1},{"name":"quantity_fixed","label":"固定用量","kind":"number"},{"name":"type","label":"流动时点","kind":"text","default":"start","options":[{"label":"start","value":"start"},{"label":"end","value":"end"},{"label":"transfer_batch","value":"transfer_batch"}]},{"name":"effective_start","label":"生效开始","kind":"datetime","default":"1971-01-01T00:00:00Z"},{"name":"effective_end","label":"生效结束","kind":"datetime","default":"2030-12-31T00:00:00Z"},{"name":"name","label":"名称","kind":"text"},{"name":"priority","label":"优先级","kind":"integer","default":1},{"name":"search","label":"搜索模式","kind":"text","options":[{"label":"PRIORITY","value":"PRIORITY"},{"label":"MINCOST","value":"MINCOST"},{"label":"MINPENALTY","value":"MINPENALTY"},{"label":"MINCOSTPENALTY","value":"MINCOSTPENALTY"}]},{"name":"transferbatch","label":"转移批量","kind":"number"},{"name":"offset","label":"偏移时间","kind":"interval"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_operationresource-list', '/dashboard/planning/operationresource', '工序资源', '工序所消耗的资源与技能。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_operationresource-list","route":"/dashboard/planning/operationresource","title":"工序资源","description":"工序所消耗的资源与技能。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_operationresourceRows":{"key":"planning_operationresourceRows","label":"工序资源数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationresource","postData":{"resource":"planning_operationresource","tableName":"planning_operationresource","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true},"planning_skillOptions":{"key":"planning_skillOptions","label":"技能选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_skill","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_operationresource-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/operationresource/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationresourceRows"]}]}]},{"id":"planning_operationresource-search","kind":"searchForm","targetSourceKey":"planning_operationresourceRows","schema":{"columns":4,"fields":[{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_operationresource-grid","kind":"grid","title":"工序资源列表","sourceKey":"planning_operationresourceRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"operation_id_label","title":"工序","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"resource_id_label","title":"资源","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"skill_id_label","title":"技能","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"变动用量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"quantity_fixed","title":"固定用量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"effective_start","title":"生效开始","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"effective_end","title":"生效结束","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"name","title":"名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"priority","title":"优先级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_operationresource-edit', '/dashboard/planning/operationresource/edit', '工序资源编辑', '工序所消耗的资源与技能。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_operationresource-edit","route":"/dashboard/planning/operationresource/edit","title":"工序资源编辑","description":"工序所消耗的资源与技能。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_operationresourceRows":{"key":"planning_operationresourceRows","label":"工序资源数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationresource","postData":{"resource":"planning_operationresource","tableName":"planning_operationresource","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true},"planning_skillOptions":{"key":"planning_skillOptions","label":"技能选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_skill","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_operationresource-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/operationresource"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationresourceRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_operationresourceRows","serviceMethod":"saveItem","postData":{"resource":"planning_operationresource","id":"{{ forms.planning_operationresource_edit_form.id }}","data":{"operation_id":"{{ forms.planning_operationresource_edit_form.operation_id }}","resource_id":"{{ forms.planning_operationresource_edit_form.resource_id }}","skill_id":"{{ forms.planning_operationresource_edit_form.skill_id }}","quantity":"{{ forms.planning_operationresource_edit_form.quantity }}","quantity_fixed":"{{ forms.planning_operationresource_edit_form.quantity_fixed }}","effective_start":"{{ forms.planning_operationresource_edit_form.effective_start }}","effective_end":"{{ forms.planning_operationresource_edit_form.effective_end }}","name":"{{ forms.planning_operationresource_edit_form.name }}","priority":"{{ forms.planning_operationresource_edit_form.priority }}","setup":"{{ forms.planning_operationresource_edit_form.setup }}","search":"{{ forms.planning_operationresource_edit_form.search }}","source":"{{ forms.planning_operationresource_edit_form.source }}"}},"assignTo":"planning_operationresourceSaved"},{"type":"navigate","route":"/dashboard/planning/operationresource/edit?id={{ data.planning_operationresourceSaved.id }}&fromPage=planning_operationresource-list"},{"type":"showMessage","status":"success","message":"工序资源已保存。"}]}]},{"id":"planning_operationresource-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_operationresource_edit_form","kind":"form","title":"工序资源信息","sourceKey":"planning_operationresourceRows","submitSourceKey":"planning_operationresourceRows","initialValues":{"id":"","operation_id":"","resource_id":"","skill_id":"","quantity":1,"quantity_fixed":"","effective_start":"1971-01-01T00:00:00Z","effective_end":"2030-12-31T00:00:00Z","name":"","priority":1,"setup":"","search":"","source":""},"schema":{"columns":4,"fields":[{"field":"operation_id","label":"工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入工序"}]},{"field":"resource_id","label":"资源","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择资源","filterable":true},"optionsSourceKey":"planning_resourceOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入资源"}]},{"field":"skill_id","label":"技能","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择技能","filterable":true},"optionsSourceKey":"planning_skillOptions","optionProps":{"label":"label","value":"id"}},{"field":"quantity","label":"变动用量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入变动用量","type":"number"}},{"field":"quantity_fixed","label":"固定用量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入固定用量","type":"number"}},{"field":"effective_start","label":"生效开始","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效开始"}},{"field":"effective_end","label":"生效结束","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效结束"}},{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"}},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"}},{"field":"setup","label":"换型","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入换型"}},{"field":"search","label":"搜索模式","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入搜索模式"},"options":[{"label":"PRIORITY","value":"PRIORITY"},{"label":"MINCOST","value":"MINCOST"},{"label":"MINPENALTY","value":"MINPENALTY"},{"label":"MINCOSTPENALTY","value":"MINCOSTPENALTY"}]},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_operationresource-list'
  and edit_page.code = 'planning_operationresource-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_operationresource-list', 'planning_operationresource-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_operationresource', '工序资源', 'public.planning_operationresource',
  '/dashboard/planning/operationresource', 'planning_operationresource-list', 'ri-tools-line', '工序所消耗的资源与技能。',
  'id', 'active', 336, '{"sourceTable":"operationresource","freppleModel":"operationresource","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"operation_id","label":"工序","kind":"relation","relation":"planning_operation","required":true},{"name":"resource_id","label":"资源","kind":"relation","relation":"planning_resource","required":true},{"name":"skill_id","label":"技能","kind":"relation","relation":"planning_skill"},{"name":"quantity","label":"变动用量","kind":"number","default":1},{"name":"quantity_fixed","label":"固定用量","kind":"number"},{"name":"effective_start","label":"生效开始","kind":"datetime","default":"1971-01-01T00:00:00Z"},{"name":"effective_end","label":"生效结束","kind":"datetime","default":"2030-12-31T00:00:00Z"},{"name":"name","label":"名称","kind":"text"},{"name":"priority","label":"优先级","kind":"integer","default":1},{"name":"setup","label":"换型","kind":"text"},{"name":"search","label":"搜索模式","kind":"text","options":[{"label":"PRIORITY","value":"PRIORITY"},{"label":"MINCOST","value":"MINCOST"},{"label":"MINPENALTY","value":"MINPENALTY"},{"label":"MINCOSTPENALTY","value":"MINCOSTPENALTY"}]},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_suboperation-list', '/dashboard/planning/suboperation', '子工序', '路线、备选和拆分工序的成员关系。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_suboperation-list","route":"/dashboard/planning/suboperation","title":"子工序","description":"路线、备选和拆分工序的成员关系。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_suboperationRows":{"key":"planning_suboperationRows","label":"子工序数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_suboperation","postData":{"resource":"planning_suboperation","tableName":"planning_suboperation","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"父工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_suboperation-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/suboperation/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_suboperationRows"]}]}]},{"id":"planning_suboperation-grid","kind":"grid","title":"子工序列表","sourceKey":"planning_suboperationRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"operation_id_label","title":"父工序","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"priority","title":"优先级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"suboperation_id_label","title":"子工序","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"effective_start","title":"生效开始","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"effective_end","title":"生效结束","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_suboperation-edit', '/dashboard/planning/suboperation/edit', '子工序编辑', '路线、备选和拆分工序的成员关系。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_suboperation-edit","route":"/dashboard/planning/suboperation/edit","title":"子工序编辑","description":"路线、备选和拆分工序的成员关系。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_suboperationRows":{"key":"planning_suboperationRows","label":"子工序数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_suboperation","postData":{"resource":"planning_suboperation","tableName":"planning_suboperation","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"父工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_suboperation-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/suboperation"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_suboperationRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_suboperationRows","serviceMethod":"saveItem","postData":{"resource":"planning_suboperation","id":"{{ forms.planning_suboperation_edit_form.id }}","data":{"operation_id":"{{ forms.planning_suboperation_edit_form.operation_id }}","priority":"{{ forms.planning_suboperation_edit_form.priority }}","suboperation_id":"{{ forms.planning_suboperation_edit_form.suboperation_id }}","effective_start":"{{ forms.planning_suboperation_edit_form.effective_start }}","effective_end":"{{ forms.planning_suboperation_edit_form.effective_end }}","source":"{{ forms.planning_suboperation_edit_form.source }}"}},"assignTo":"planning_suboperationSaved"},{"type":"navigate","route":"/dashboard/planning/suboperation/edit?id={{ data.planning_suboperationSaved.id }}&fromPage=planning_suboperation-list"},{"type":"showMessage","status":"success","message":"子工序已保存。"}]}]},{"id":"planning_suboperation-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_suboperation_edit_form","kind":"form","title":"子工序信息","sourceKey":"planning_suboperationRows","submitSourceKey":"planning_suboperationRows","initialValues":{"id":"","operation_id":"","priority":1,"suboperation_id":"","effective_start":"1971-01-01T00:00:00Z","effective_end":"2030-12-31T00:00:00Z","source":""},"schema":{"columns":4,"fields":[{"field":"operation_id","label":"父工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择父工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入父工序"}]},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"},"rules":[{"required":true,"message":"请输入优先级"}]},{"field":"suboperation_id","label":"子工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择子工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入子工序"}]},{"field":"effective_start","label":"生效开始","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效开始"}},{"field":"effective_end","label":"生效结束","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入生效结束"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_suboperation-list'
  and edit_page.code = 'planning_suboperation-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_suboperation-list', 'planning_suboperation-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_suboperation', '子工序', 'public.planning_suboperation',
  '/dashboard/planning/suboperation', 'planning_suboperation-list', 'ri-git-branch-line', '路线、备选和拆分工序的成员关系。',
  'id', 'active', 337, '{"sourceTable":"suboperation","freppleModel":"suboperation","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"operation_id","label":"父工序","kind":"relation","relation":"planning_operation","required":true},{"name":"priority","label":"优先级","kind":"integer","required":true,"default":1},{"name":"suboperation_id","label":"子工序","kind":"relation","relation":"planning_operation","required":true},{"name":"effective_start","label":"生效开始","kind":"datetime","default":"1971-01-01T00:00:00Z"},{"name":"effective_end","label":"生效结束","kind":"datetime","default":"2030-12-31T00:00:00Z"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_operation_dependency-list', '/dashboard/planning/operation-dependency', '工序依赖', '工序之间的前置依赖和安全提前期。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_operation_dependency-list","route":"/dashboard/planning/operation-dependency","title":"工序依赖","description":"工序之间的前置依赖和安全提前期。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_operation_dependencyRows":{"key":"planning_operation_dependencyRows","label":"工序依赖数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operation_dependency","postData":{"resource":"planning_operation_dependency","tableName":"planning_operation_dependency","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_operation_dependency-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/operation-dependency/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operation_dependencyRows"]}]}]},{"id":"planning_operation_dependency-grid","kind":"grid","title":"工序依赖列表","sourceKey":"planning_operation_dependencyRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"operation_id_label","title":"工序","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"blockedby_id_label","title":"前置工序","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"数量比例","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"safety_leadtime","title":"安全提前期","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"hard_safety_leadtime","title":"硬安全提前期","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_operation_dependency-edit', '/dashboard/planning/operation-dependency/edit', '工序依赖编辑', '工序之间的前置依赖和安全提前期。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_operation_dependency-edit","route":"/dashboard/planning/operation-dependency/edit","title":"工序依赖编辑","description":"工序之间的前置依赖和安全提前期。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_operation_dependencyRows":{"key":"planning_operation_dependencyRows","label":"工序依赖数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operation_dependency","postData":{"resource":"planning_operation_dependency","tableName":"planning_operation_dependency","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_operation_dependency-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/operation-dependency"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operation_dependencyRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_operation_dependencyRows","serviceMethod":"saveItem","postData":{"resource":"planning_operation_dependency","id":"{{ forms.planning_operation_dependency_edit_form.id }}","data":{"operation_id":"{{ forms.planning_operation_dependency_edit_form.operation_id }}","blockedby_id":"{{ forms.planning_operation_dependency_edit_form.blockedby_id }}","quantity":"{{ forms.planning_operation_dependency_edit_form.quantity }}","safety_leadtime":"{{ forms.planning_operation_dependency_edit_form.safety_leadtime }}","hard_safety_leadtime":"{{ forms.planning_operation_dependency_edit_form.hard_safety_leadtime }}","source":"{{ forms.planning_operation_dependency_edit_form.source }}"}},"assignTo":"planning_operation_dependencySaved"},{"type":"navigate","route":"/dashboard/planning/operation-dependency/edit?id={{ data.planning_operation_dependencySaved.id }}&fromPage=planning_operation_dependency-list"},{"type":"showMessage","status":"success","message":"工序依赖已保存。"}]}]},{"id":"planning_operation_dependency-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_operation_dependency_edit_form","kind":"form","title":"工序依赖信息","sourceKey":"planning_operation_dependencyRows","submitSourceKey":"planning_operation_dependencyRows","initialValues":{"id":"","operation_id":"","blockedby_id":"","quantity":1,"safety_leadtime":"","hard_safety_leadtime":"","source":""},"schema":{"columns":4,"fields":[{"field":"operation_id","label":"工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入工序"}]},{"field":"blockedby_id","label":"前置工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择前置工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入前置工序"}]},{"field":"quantity","label":"数量比例","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数量比例","type":"number"}},{"field":"safety_leadtime","label":"安全提前期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入安全提前期"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"hard_safety_leadtime","label":"硬安全提前期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入硬安全提前期"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_operation_dependency-list'
  and edit_page.code = 'planning_operation_dependency-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_operation_dependency-list', 'planning_operation_dependency-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_operation_dependency', '工序依赖', 'public.planning_operation_dependency',
  '/dashboard/planning/operation-dependency', 'planning_operation_dependency-list', 'ri-links-line', '工序之间的前置依赖和安全提前期。',
  'id', 'active', 338, '{"sourceTable":"operation_dependency","freppleModel":"operation_dependency","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"operation_id","label":"工序","kind":"relation","relation":"planning_operation","required":true},{"name":"blockedby_id","label":"前置工序","kind":"relation","relation":"planning_operation","required":true},{"name":"quantity","label":"数量比例","kind":"number","default":1},{"name":"safety_leadtime","label":"安全提前期","kind":"interval"},{"name":"hard_safety_leadtime","label":"硬安全提前期","kind":"interval"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_demand-list', '/dashboard/planning/demand', '需求', '待交付的客户需求和计划结果。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_demand-list","route":"/dashboard/planning/demand","title":"需求","description":"待交付的客户需求和计划结果。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_demandRows":{"key":"planning_demandRows","label":"需求数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_demand","postData":{"resource":"planning_demand","tableName":"planning_demand","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"客户选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"交付工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_demand-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/demand/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_demandRows"]}]}]},{"id":"planning_demand-search","kind":"searchForm","targetSourceKey":"planning_demandRows","schema":{"columns":4,"fields":[{"field":"name","label":"需求编号","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}},{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"inquiry","value":"inquiry"},{"label":"quote","value":"quote"},{"label":"open","value":"open"},{"label":"closed","value":"closed"},{"label":"canceled","value":"canceled"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_demand-grid","kind":"grid","title":"需求列表","sourceKey":"planning_demandRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"需求编号","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"customer_id_label","title":"客户","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item_id_label","title":"物料","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"due","title":"交期","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"quantity","title":"数量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"priority","title":"优先级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"owner","title":"上级需求","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_demand-edit', '/dashboard/planning/demand/edit', '需求编辑', '待交付的客户需求和计划结果。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_demand-edit","route":"/dashboard/planning/demand/edit","title":"需求编辑","description":"待交付的客户需求和计划结果。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_demandRows":{"key":"planning_demandRows","label":"需求数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_demand","postData":{"resource":"planning_demand","tableName":"planning_demand","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"客户选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"交付工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_demand-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/demand"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_demandRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_demandRows","serviceMethod":"saveItem","postData":{"resource":"planning_demand","id":"{{ forms.planning_demand_edit_form.id }}","data":{"name":"{{ forms.planning_demand_edit_form.name }}","owner":"{{ forms.planning_demand_edit_form.owner }}","description":"{{ forms.planning_demand_edit_form.description }}","category":"{{ forms.planning_demand_edit_form.category }}","subcategory":"{{ forms.planning_demand_edit_form.subcategory }}","customer_id":"{{ forms.planning_demand_edit_form.customer_id }}","item_id":"{{ forms.planning_demand_edit_form.item_id }}","location_id":"{{ forms.planning_demand_edit_form.location_id }}","due":"{{ forms.planning_demand_edit_form.due }}","status":"{{ forms.planning_demand_edit_form.status }}","operation_id":"{{ forms.planning_demand_edit_form.operation_id }}","quantity":"{{ forms.planning_demand_edit_form.quantity }}","priority":"{{ forms.planning_demand_edit_form.priority }}","minshipment":"{{ forms.planning_demand_edit_form.minshipment }}","maxlateness":"{{ forms.planning_demand_edit_form.maxlateness }}","policy":"{{ forms.planning_demand_edit_form.policy }}","batch":"{{ forms.planning_demand_edit_form.batch }}","source":"{{ forms.planning_demand_edit_form.source }}"}},"assignTo":"planning_demandSaved"},{"type":"navigate","route":"/dashboard/planning/demand/edit?id={{ data.planning_demandSaved.id }}&fromPage=planning_demand-list"},{"type":"showMessage","status":"success","message":"需求已保存。"}]}]},{"id":"planning_demand-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_demand_edit_form","kind":"form","title":"需求信息","sourceKey":"planning_demandRows","submitSourceKey":"planning_demandRows","initialValues":{"id":"","name":"","owner":"","description":"","category":"","subcategory":"","customer_id":"","item_id":"","location_id":"","due":"","status":"open","operation_id":"","quantity":"","priority":10,"minshipment":"","maxlateness":"","policy":"independent","batch":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"需求编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入需求编号"},"rules":[{"required":true,"message":"请输入需求编号"}]},{"field":"owner","label":"上级需求","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入上级需求"}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类"}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类"}},{"field":"customer_id","label":"客户","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择客户","filterable":true},"optionsSourceKey":"planning_customerOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入客户"}]},{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入地点"}]},{"field":"due","label":"交期","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入交期"},"rules":[{"required":true,"message":"请输入交期"}]},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态"},"options":[{"label":"inquiry","value":"inquiry"},{"label":"quote","value":"quote"},{"label":"open","value":"open"},{"label":"closed","value":"closed"},{"label":"canceled","value":"canceled"}]},{"field":"operation_id","label":"交付工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择交付工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"}},{"field":"quantity","label":"数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数量","type":"number"},"rules":[{"required":true,"message":"请输入数量"}]},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"},"rules":[{"required":true,"message":"请输入优先级"}]},{"field":"minshipment","label":"最小发运量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最小发运量","type":"number"}},{"field":"maxlateness","label":"最大延期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最大延期"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"policy","label":"计划策略","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入计划策略"},"options":[{"label":"independent","value":"independent"},{"label":"alltogether","value":"alltogether"},{"label":"inratio","value":"inratio"}]},{"field":"batch","label":"批次","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入批次"}},{"field":"delay","label":"延期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入延期","disabled":true},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"plannedquantity","label":"已计划量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入已计划量","type":"number","disabled":true}},{"field":"deliverydate","label":"计划交期","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入计划交期","disabled":true}},{"field":"plan","label":"计划明细","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入计划明细","disabled":true}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_demand-list'
  and edit_page.code = 'planning_demand-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_demand-list', 'planning_demand-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_demand', '需求', 'public.planning_demand',
  '/dashboard/planning/demand', 'planning_demand-list', 'ri-file-list-3-line', '待交付的客户需求和计划结果。',
  'id', 'active', 339, '{"sourceTable":"demand","freppleModel":"demand","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"需求编号","kind":"text","required":true},{"name":"owner","label":"上级需求","kind":"text"},{"name":"description","label":"说明","kind":"text"},{"name":"category","label":"分类","kind":"text"},{"name":"subcategory","label":"子分类","kind":"text"},{"name":"customer_id","label":"客户","kind":"relation","relation":"planning_customer","required":true},{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item","required":true},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location","required":true},{"name":"due","label":"交期","kind":"datetime","required":true},{"name":"status","label":"状态","kind":"text","default":"open","options":[{"label":"inquiry","value":"inquiry"},{"label":"quote","value":"quote"},{"label":"open","value":"open"},{"label":"closed","value":"closed"},{"label":"canceled","value":"canceled"}]},{"name":"operation_id","label":"交付工序","kind":"relation","relation":"planning_operation"},{"name":"quantity","label":"数量","kind":"number","required":true},{"name":"priority","label":"优先级","kind":"integer","required":true,"default":10},{"name":"minshipment","label":"最小发运量","kind":"number"},{"name":"maxlateness","label":"最大延期","kind":"interval"},{"name":"policy","label":"计划策略","kind":"text","default":"independent","options":[{"label":"independent","value":"independent"},{"label":"alltogether","value":"alltogether"},{"label":"inratio","value":"inratio"}]},{"name":"batch","label":"批次","kind":"text"},{"name":"delay","label":"延期","kind":"interval","readOnly":true},{"name":"plannedquantity","label":"已计划量","kind":"number","readOnly":true},{"name":"deliverydate","label":"计划交期","kind":"datetime","readOnly":true},{"name":"plan","label":"计划明细","kind":"json","readOnly":true,"default":{}},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_operationplan-list', '/dashboard/planning/operationplan', '计划订单', '制造、采购、配送、交付和库存计划订单。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_operationplan-list","route":"/dashboard/planning/operationplan","title":"计划订单","description":"制造、采购、配送、交付和库存计划订单。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_operationplanRows":{"key":"planning_operationplanRows","label":"计划订单数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationplan","postData":{"resource":"planning_operationplan","tableName":"planning_operationplan","limit":300,"orderBy":"reference","orderDirection":"asc"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true},"planning_operationplanOptions":{"key":"planning_operationplanOptions","label":"上级计划单选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operationplan","labelField":"reference"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"来源地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_supplierOptions":{"key":"planning_supplierOptions","label":"供应商选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_supplier","labelField":"name"},"autoLoad":true},"planning_demandOptions":{"key":"planning_demandOptions","label":"需求选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_demand","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_operationplan-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/operationplan/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationplanRows"]}]}]},{"id":"planning_operationplan-search","kind":"searchForm","targetSourceKey":"planning_operationplanRows","schema":{"columns":4,"fields":[{"field":"reference","label":"计划单号","component":"vxe-input","props":{"clearable":true}},{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"proposed","value":"proposed"},{"label":"approved","value":"approved"},{"label":"confirmed","value":"confirmed"},{"label":"completed","value":"completed"},{"label":"closed","value":"closed"}],"props":{"clearable":true}},{"field":"type","label":"订单类型","component":"vxe-select","options":[{"label":"STCK","value":"STCK"},{"label":"MO","value":"MO"},{"label":"WO","value":"WO"},{"label":"PO","value":"PO"},{"label":"DO","value":"DO"},{"label":"DLVR","value":"DLVR"}],"props":{"clearable":true}},{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_operationplan-grid","kind":"grid","title":"计划订单列表","sourceKey":"planning_operationplanRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"reference","title":"计划单号","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"type","title":"订单类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"STCK":"STCK","MO":"MO","WO":"WO","PO":"PO","DO":"DO","DLVR":"DLVR"},"emptyText":"-"}},{"field":"quantity","title":"数量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"status","title":"状态","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"proposed":"proposed","approved":"approved","confirmed":"confirmed","completed":"completed","closed":"closed"},"emptyText":"-"}},{"field":"quantity_completed","title":"完成数量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"color","title":"颜色值","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"startdate","title":"开始时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"enddate","title":"结束时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"remark","title":"备注","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_operationplan-edit', '/dashboard/planning/operationplan/edit', '计划订单编辑', '制造、采购、配送、交付和库存计划订单。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_operationplan-edit","route":"/dashboard/planning/operationplan/edit","title":"计划订单编辑","description":"制造、采购、配送、交付和库存计划订单。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_operationplanRows":{"key":"planning_operationplanRows","label":"计划订单数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationplan","postData":{"resource":"planning_operationplan","tableName":"planning_operationplan","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true},"planning_operationplanOptions":{"key":"planning_operationplanOptions","label":"上级计划单选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operationplan","labelField":"reference"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"来源地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_supplierOptions":{"key":"planning_supplierOptions","label":"供应商选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_supplier","labelField":"name"},"autoLoad":true},"planning_demandOptions":{"key":"planning_demandOptions","label":"需求选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_demand","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_operationplan-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/operationplan"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationplanRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_operationplanRows","serviceMethod":"saveItem","postData":{"resource":"planning_operationplan","id":"{{ forms.planning_operationplan_edit_form.id }}","data":{"reference":"{{ forms.planning_operationplan_edit_form.reference }}","status":"{{ forms.planning_operationplan_edit_form.status }}","type":"{{ forms.planning_operationplan_edit_form.type }}","quantity":"{{ forms.planning_operationplan_edit_form.quantity }}","quantity_completed":"{{ forms.planning_operationplan_edit_form.quantity_completed }}","color":"{{ forms.planning_operationplan_edit_form.color }}","startdate":"{{ forms.planning_operationplan_edit_form.startdate }}","enddate":"{{ forms.planning_operationplan_edit_form.enddate }}","remark":"{{ forms.planning_operationplan_edit_form.remark }}","operation_id":"{{ forms.planning_operationplan_edit_form.operation_id }}","owner_id":"{{ forms.planning_operationplan_edit_form.owner_id }}","batch":"{{ forms.planning_operationplan_edit_form.batch }}","item_id":"{{ forms.planning_operationplan_edit_form.item_id }}","origin_id":"{{ forms.planning_operationplan_edit_form.origin_id }}","destination_id":"{{ forms.planning_operationplan_edit_form.destination_id }}","supplier_id":"{{ forms.planning_operationplan_edit_form.supplier_id }}","location_id":"{{ forms.planning_operationplan_edit_form.location_id }}","demand_id":"{{ forms.planning_operationplan_edit_form.demand_id }}","due":"{{ forms.planning_operationplan_edit_form.due }}","name":"{{ forms.planning_operationplan_edit_form.name }}","forecast":"{{ forms.planning_operationplan_edit_form.forecast }}","source":"{{ forms.planning_operationplan_edit_form.source }}"}},"assignTo":"planning_operationplanSaved"},{"type":"navigate","route":"/dashboard/planning/operationplan/edit?id={{ data.planning_operationplanSaved.id }}&fromPage=planning_operationplan-list"},{"type":"showMessage","status":"success","message":"计划订单已保存。"}]}]},{"id":"planning_operationplan-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_operationplan_edit_form","kind":"form","title":"计划订单信息","sourceKey":"planning_operationplanRows","submitSourceKey":"planning_operationplanRows","initialValues":{"id":"","reference":"","status":"","type":"MO","quantity":1,"quantity_completed":"","color":0,"startdate":"","enddate":"","remark":"","operation_id":"","owner_id":"","batch":"","item_id":"","origin_id":"","destination_id":"","supplier_id":"","location_id":"","demand_id":"","due":"","name":"","forecast":"","source":""},"schema":{"columns":4,"fields":[{"field":"reference","label":"计划单号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入计划单号"},"rules":[{"required":true,"message":"请输入计划单号"}]},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态"},"options":[{"label":"proposed","value":"proposed"},{"label":"approved","value":"approved"},{"label":"confirmed","value":"confirmed"},{"label":"completed","value":"completed"},{"label":"closed","value":"closed"}]},{"field":"type","label":"订单类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入订单类型"},"options":[{"label":"STCK","value":"STCK"},{"label":"MO","value":"MO"},{"label":"WO","value":"WO"},{"label":"PO","value":"PO"},{"label":"DO","value":"DO"},{"label":"DLVR","value":"DLVR"}],"rules":[{"required":true,"message":"请输入订单类型"}]},{"field":"quantity","label":"数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数量","type":"number"},"rules":[{"required":true,"message":"请输入数量"}]},{"field":"quantity_completed","label":"完成数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入完成数量","type":"number"}},{"field":"color","label":"颜色值","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入颜色值","type":"number"}},{"field":"startdate","label":"开始时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入开始时间"}},{"field":"enddate","label":"结束时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入结束时间"}},{"field":"remark","label":"备注","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入备注"}},{"field":"criticality","label":"关键度","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入关键度","type":"number","disabled":true}},{"field":"delay","label":"延期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入延期","disabled":true},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"plan","label":"计划明细","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入计划明细","disabled":true}},{"field":"operation_id","label":"工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"}},{"field":"owner_id","label":"上级计划单","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择上级计划单","filterable":true},"optionsSourceKey":"planning_operationplanOptions","optionProps":{"label":"label","value":"id"}},{"field":"batch","label":"批次","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入批次"}},{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"}},{"field":"origin_id","label":"来源地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择来源地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"}},{"field":"destination_id","label":"目的地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择目的地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"}},{"field":"supplier_id","label":"供应商","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择供应商","filterable":true},"optionsSourceKey":"planning_supplierOptions","optionProps":{"label":"label","value":"id"}},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"}},{"field":"demand_id","label":"需求","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择需求","filterable":true},"optionsSourceKey":"planning_demandOptions","optionProps":{"label":"label","value":"id"}},{"field":"due","label":"需求日期","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入需求日期"}},{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"}},{"field":"forecast","label":"预测编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入预测编号"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_operationplan-list'
  and edit_page.code = 'planning_operationplan-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_operationplan-list', 'planning_operationplan-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_operationplan', '计划订单', 'public.planning_operationplan',
  '/dashboard/planning/operationplan', 'planning_operationplan-list', 'ri-calendar-check-line', '制造、采购、配送、交付和库存计划订单。',
  'id', 'active', 340, '{"sourceTable":"operationplan","freppleModel":"operationplan","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"reference","label":"计划单号","kind":"text","required":true},{"name":"status","label":"状态","kind":"text","options":[{"label":"proposed","value":"proposed"},{"label":"approved","value":"approved"},{"label":"confirmed","value":"confirmed"},{"label":"completed","value":"completed"},{"label":"closed","value":"closed"}]},{"name":"type","label":"订单类型","kind":"text","required":true,"default":"MO","options":[{"label":"STCK","value":"STCK"},{"label":"MO","value":"MO"},{"label":"WO","value":"WO"},{"label":"PO","value":"PO"},{"label":"DO","value":"DO"},{"label":"DLVR","value":"DLVR"}]},{"name":"quantity","label":"数量","kind":"number","required":true,"default":1},{"name":"quantity_completed","label":"完成数量","kind":"number"},{"name":"color","label":"颜色值","kind":"number","default":0},{"name":"startdate","label":"开始时间","kind":"datetime"},{"name":"enddate","label":"结束时间","kind":"datetime"},{"name":"remark","label":"备注","kind":"text"},{"name":"criticality","label":"关键度","kind":"number","readOnly":true},{"name":"delay","label":"延期","kind":"interval","readOnly":true},{"name":"plan","label":"计划明细","kind":"json","readOnly":true,"default":{}},{"name":"operation_id","label":"工序","kind":"relation","relation":"planning_operation"},{"name":"owner_id","label":"上级计划单","kind":"relation","relation":"planning_operationplan"},{"name":"batch","label":"批次","kind":"text"},{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item"},{"name":"origin_id","label":"来源地点","kind":"relation","relation":"planning_location"},{"name":"destination_id","label":"目的地点","kind":"relation","relation":"planning_location"},{"name":"supplier_id","label":"供应商","kind":"relation","relation":"planning_supplier"},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location"},{"name":"demand_id","label":"需求","kind":"relation","relation":"planning_demand"},{"name":"due","label":"需求日期","kind":"datetime"},{"name":"name","label":"名称","kind":"text"},{"name":"forecast","label":"预测编号","kind":"text"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_operationplanresource-list', '/dashboard/planning/operationplanresource', '计划资源', '计划订单的资源负荷明细。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_operationplanresource-list","route":"/dashboard/planning/operationplanresource","title":"计划资源","description":"计划订单的资源负荷明细。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_operationplanresourceRows":{"key":"planning_operationplanresourceRows","label":"计划资源数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationplanresource","postData":{"resource":"planning_operationplanresource","tableName":"planning_operationplanresource","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true},"planning_operationplanOptions":{"key":"planning_operationplanOptions","label":"计划订单选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operationplan","labelField":"reference"},"autoLoad":true}},"blocks":[{"id":"planning_operationplanresource-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/operationplanresource/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationplanresourceRows"]}]}]},{"id":"planning_operationplanresource-search","kind":"searchForm","targetSourceKey":"planning_operationplanresourceRows","schema":{"columns":4,"fields":[{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"proposed","value":"proposed"},{"label":"confirmed","value":"confirmed"},{"label":"closed","value":"closed"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_operationplanresource-grid","kind":"grid","title":"计划资源列表","sourceKey":"planning_operationplanresourceRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"resource_id_label","title":"资源","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"operationplan_id_label","title":"计划订单","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"负荷数量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"setup","title":"换型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"status","title":"状态","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"proposed":"proposed","confirmed":"confirmed","closed":"closed"},"emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_operationplanresource-edit', '/dashboard/planning/operationplanresource/edit', '计划资源编辑', '计划订单的资源负荷明细。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_operationplanresource-edit","route":"/dashboard/planning/operationplanresource/edit","title":"计划资源编辑","description":"计划订单的资源负荷明细。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_operationplanresourceRows":{"key":"planning_operationplanresourceRows","label":"计划资源数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationplanresource","postData":{"resource":"planning_operationplanresource","tableName":"planning_operationplanresource","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true},"planning_operationplanOptions":{"key":"planning_operationplanOptions","label":"计划订单选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operationplan","labelField":"reference"},"autoLoad":true}},"blocks":[{"id":"planning_operationplanresource-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/operationplanresource"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationplanresourceRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_operationplanresourceRows","serviceMethod":"saveItem","postData":{"resource":"planning_operationplanresource","id":"{{ forms.planning_operationplanresource_edit_form.id }}","data":{"resource_id":"{{ forms.planning_operationplanresource_edit_form.resource_id }}","operationplan_id":"{{ forms.planning_operationplanresource_edit_form.operationplan_id }}","quantity":"{{ forms.planning_operationplanresource_edit_form.quantity }}","setup":"{{ forms.planning_operationplanresource_edit_form.setup }}","status":"{{ forms.planning_operationplanresource_edit_form.status }}","source":"{{ forms.planning_operationplanresource_edit_form.source }}"}},"assignTo":"planning_operationplanresourceSaved"},{"type":"navigate","route":"/dashboard/planning/operationplanresource/edit?id={{ data.planning_operationplanresourceSaved.id }}&fromPage=planning_operationplanresource-list"},{"type":"showMessage","status":"success","message":"计划资源已保存。"}]}]},{"id":"planning_operationplanresource-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_operationplanresource_edit_form","kind":"form","title":"计划资源信息","sourceKey":"planning_operationplanresourceRows","submitSourceKey":"planning_operationplanresourceRows","initialValues":{"id":"","resource_id":"","operationplan_id":"","quantity":1,"setup":"","status":"","source":""},"schema":{"columns":4,"fields":[{"field":"resource_id","label":"资源","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择资源","filterable":true},"optionsSourceKey":"planning_resourceOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入资源"}]},{"field":"operationplan_id","label":"计划订单","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择计划订单","filterable":true},"optionsSourceKey":"planning_operationplanOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入计划订单"}]},{"field":"quantity","label":"负荷数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入负荷数量","type":"number"}},{"field":"setup","label":"换型","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入换型"}},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态"},"options":[{"label":"proposed","value":"proposed"},{"label":"confirmed","value":"confirmed"},{"label":"closed","value":"closed"}]},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_operationplanresource-list'
  and edit_page.code = 'planning_operationplanresource-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_operationplanresource-list', 'planning_operationplanresource-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_operationplanresource', '计划资源', 'public.planning_operationplanresource',
  '/dashboard/planning/operationplanresource', 'planning_operationplanresource-list', 'ri-speed-up-line', '计划订单的资源负荷明细。',
  'id', 'active', 341, '{"sourceTable":"operationplanresource","freppleModel":"operationplanresource","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"resource_id","label":"资源","kind":"relation","relation":"planning_resource","required":true},{"name":"operationplan_id","label":"计划订单","kind":"relation","relation":"planning_operationplan","required":true},{"name":"quantity","label":"负荷数量","kind":"number","default":1},{"name":"setup","label":"换型","kind":"text"},{"name":"status","label":"状态","kind":"text","options":[{"label":"proposed","value":"proposed"},{"label":"confirmed","value":"confirmed"},{"label":"closed","value":"closed"}]},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_operationplanmaterial-list', '/dashboard/planning/operationplanmaterial', '计划物料', '计划订单的库存消耗和产出明细。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_operationplanmaterial-list","route":"/dashboard/planning/operationplanmaterial","title":"计划物料","description":"计划订单的库存消耗和产出明细。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_operationplanmaterialRows":{"key":"planning_operationplanmaterialRows","label":"计划物料数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationplanmaterial","postData":{"resource":"planning_operationplanmaterial","tableName":"planning_operationplanmaterial","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_operationplanOptions":{"key":"planning_operationplanOptions","label":"计划订单选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operationplan","labelField":"reference"},"autoLoad":true}},"blocks":[{"id":"planning_operationplanmaterial-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/operationplanmaterial/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationplanmaterialRows"]}]}]},{"id":"planning_operationplanmaterial-search","kind":"searchForm","targetSourceKey":"planning_operationplanmaterialRows","schema":{"columns":4,"fields":[{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"proposed","value":"proposed"},{"label":"confirmed","value":"confirmed"},{"label":"closed","value":"closed"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_operationplanmaterial-grid","kind":"grid","title":"计划物料列表","sourceKey":"planning_operationplanmaterialRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"item_id_label","title":"物料","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"operationplan_id_label","title":"计划订单","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"数量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"flowdate","title":"流动时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"status","title":"状态","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"proposed":"proposed","confirmed":"confirmed","closed":"closed"},"emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"onhand","title":"结余库存","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"minimum","title":"最小库存","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_operationplanmaterial-edit', '/dashboard/planning/operationplanmaterial/edit', '计划物料编辑', '计划订单的库存消耗和产出明细。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_operationplanmaterial-edit","route":"/dashboard/planning/operationplanmaterial/edit","title":"计划物料编辑","description":"计划订单的库存消耗和产出明细。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_operationplanmaterialRows":{"key":"planning_operationplanmaterialRows","label":"计划物料数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationplanmaterial","postData":{"resource":"planning_operationplanmaterial","tableName":"planning_operationplanmaterial","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_operationplanOptions":{"key":"planning_operationplanOptions","label":"计划订单选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operationplan","labelField":"reference"},"autoLoad":true}},"blocks":[{"id":"planning_operationplanmaterial-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/operationplanmaterial"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationplanmaterialRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_operationplanmaterialRows","serviceMethod":"saveItem","postData":{"resource":"planning_operationplanmaterial","id":"{{ forms.planning_operationplanmaterial_edit_form.id }}","data":{"item_id":"{{ forms.planning_operationplanmaterial_edit_form.item_id }}","location_id":"{{ forms.planning_operationplanmaterial_edit_form.location_id }}","operationplan_id":"{{ forms.planning_operationplanmaterial_edit_form.operationplan_id }}","quantity":"{{ forms.planning_operationplanmaterial_edit_form.quantity }}","flowdate":"{{ forms.planning_operationplanmaterial_edit_form.flowdate }}","status":"{{ forms.planning_operationplanmaterial_edit_form.status }}","source":"{{ forms.planning_operationplanmaterial_edit_form.source }}"}},"assignTo":"planning_operationplanmaterialSaved"},{"type":"navigate","route":"/dashboard/planning/operationplanmaterial/edit?id={{ data.planning_operationplanmaterialSaved.id }}&fromPage=planning_operationplanmaterial-list"},{"type":"showMessage","status":"success","message":"计划物料已保存。"}]}]},{"id":"planning_operationplanmaterial-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_operationplanmaterial_edit_form","kind":"form","title":"计划物料信息","sourceKey":"planning_operationplanmaterialRows","submitSourceKey":"planning_operationplanmaterialRows","initialValues":{"id":"","item_id":"","location_id":"","operationplan_id":"","quantity":"","flowdate":"","status":"","source":""},"schema":{"columns":4,"fields":[{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入地点"}]},{"field":"operationplan_id","label":"计划订单","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择计划订单","filterable":true},"optionsSourceKey":"planning_operationplanOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入计划订单"}]},{"field":"quantity","label":"数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数量","type":"number"},"rules":[{"required":true,"message":"请输入数量"}]},{"field":"flowdate","label":"流动时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入流动时间"},"rules":[{"required":true,"message":"请输入流动时间"}]},{"field":"onhand","label":"结余库存","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入结余库存","type":"number","disabled":true}},{"field":"minimum","label":"最小库存","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最小库存","type":"number","disabled":true}},{"field":"periodofcover","label":"覆盖周期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入覆盖周期","type":"number","disabled":true}},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态"},"options":[{"label":"proposed","value":"proposed"},{"label":"confirmed","value":"confirmed"},{"label":"closed","value":"closed"}]},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'planning_operationplanmaterial-list'
  and edit_page.code = 'planning_operationplanmaterial-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_operationplanmaterial-list', 'planning_operationplanmaterial-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_operationplanmaterial', '计划物料', 'public.planning_operationplanmaterial',
  '/dashboard/planning/operationplanmaterial', 'planning_operationplanmaterial-list', 'ri-exchange-box-line', '计划订单的库存消耗和产出明细。',
  'id', 'active', 342, '{"sourceTable":"operationplanmaterial","freppleModel":"operationplanmaterial","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item","required":true},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location","required":true},{"name":"operationplan_id","label":"计划订单","kind":"relation","relation":"planning_operationplan","required":true},{"name":"quantity","label":"数量","kind":"number","required":true},{"name":"flowdate","label":"流动时间","kind":"datetime","required":true},{"name":"onhand","label":"结余库存","kind":"number","readOnly":true},{"name":"minimum","label":"最小库存","kind":"number","readOnly":true},{"name":"periodofcover","label":"覆盖周期","kind":"number","readOnly":true},{"name":"status","label":"状态","kind":"text","options":[{"label":"proposed","value":"proposed"},{"label":"confirmed","value":"confirmed"},{"label":"closed","value":"closed"}]},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  code, title, path, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
) values (
  'planning-root', '排产管理', '/dashboard/planning', 'group', 'ri-calendar-schedule-line', null,
  'planning.models.view', true, true, 'dashboard', 'active', 40,
  '{"navigation":"sidebar","module":"planning"}'::jsonb
)
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
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

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  'planning-1', '基础数据', '/dashboard/planning/1', root.id,
  'group', 'ri-database-2-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 10,
  '{"module":"planning"}'::jsonb
from public.admin_routes root
where root.code = 'planning-root'
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

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  'planning-2', '采购配送', '/dashboard/planning/2', root.id,
  'group', 'ri-truck-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 20,
  '{"module":"planning"}'::jsonb
from public.admin_routes root
where root.code = 'planning-root'
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

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  'planning-3', '产能工艺', '/dashboard/planning/3', root.id,
  'group', 'ri-settings-3-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 30,
  '{"module":"planning"}'::jsonb
from public.admin_routes root
where root.code = 'planning-root'
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

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  'planning-4', '需求计划', '/dashboard/planning/4', root.id,
  'group', 'ri-file-list-3-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 40,
  '{"module":"planning"}'::jsonb
from public.admin_routes root
where root.code = 'planning-root'
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

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  'planning-5', '计划结果', '/dashboard/planning/5', root.id,
  'group', 'ri-line-chart-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 50,
  '{"module":"planning"}'::jsonb
from public.admin_routes root
where root.code = 'planning-root'
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

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
) values
(
    'planning-calendar', '日历',
    '/dashboard/planning/calendar',
    (select id from public.admin_routes where code = 'planning-1'),
    'page', 'ri-calendar-line', 'planning_calendar-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 10,
    '{"module":"planning","group":"基础数据","sourceTable":"calendar"}'::jsonb
  ),
(
    'planning-calendarbucket', '日历明细',
    '/dashboard/planning/calendarbucket',
    (select id from public.admin_routes where code = 'planning-1'),
    'page', 'ri-calendar-event-line', 'planning_calendarbucket-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 20,
    '{"module":"planning","group":"基础数据","sourceTable":"calendarbucket"}'::jsonb
  ),
(
    'planning-location', '地点',
    '/dashboard/planning/location',
    (select id from public.admin_routes where code = 'planning-1'),
    'page', 'ri-map-pin-line', 'planning_location-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 30,
    '{"module":"planning","group":"基础数据","sourceTable":"location"}'::jsonb
  ),
(
    'planning-customer', '客户',
    '/dashboard/planning/customer',
    (select id from public.admin_routes where code = 'planning-1'),
    'page', 'ri-user-star-line', 'planning_customer-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 40,
    '{"module":"planning","group":"基础数据","sourceTable":"customer"}'::jsonb
  ),
(
    'planning-item', '物料',
    '/dashboard/planning/item',
    (select id from public.admin_routes where code = 'planning-1'),
    'page', 'ri-box-3-line', 'planning_item-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 50,
    '{"module":"planning","group":"基础数据","sourceTable":"item"}'::jsonb
  ),
(
    'planning-supplier', '供应商',
    '/dashboard/planning/supplier',
    (select id from public.admin_routes where code = 'planning-1'),
    'page', 'ri-truck-line', 'planning_supplier-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 60,
    '{"module":"planning","group":"基础数据","sourceTable":"supplier"}'::jsonb
  ),
(
    'planning-itemsupplier', '物料供应',
    '/dashboard/planning/itemsupplier',
    (select id from public.admin_routes where code = 'planning-2'),
    'page', 'ri-shopping-bag-3-line', 'planning_itemsupplier-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 70,
    '{"module":"planning","group":"采购配送","sourceTable":"itemsupplier"}'::jsonb
  ),
(
    'planning-itemdistribution', '物料配送',
    '/dashboard/planning/itemdistribution',
    (select id from public.admin_routes where code = 'planning-2'),
    'page', 'ri-route-line', 'planning_itemdistribution-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 80,
    '{"module":"planning","group":"采购配送","sourceTable":"itemdistribution"}'::jsonb
  ),
(
    'planning-buffer', '库存缓冲区',
    '/dashboard/planning/buffer',
    (select id from public.admin_routes where code = 'planning-2'),
    'page', 'ri-stack-line', 'planning_buffer-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 90,
    '{"module":"planning","group":"采购配送","sourceTable":"buffer"}'::jsonb
  ),
(
    'planning-setupmatrix', '换型矩阵',
    '/dashboard/planning/setupmatrix',
    (select id from public.admin_routes where code = 'planning-3'),
    'page', 'ri-table-line', 'planning_setupmatrix-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 100,
    '{"module":"planning","group":"产能工艺","sourceTable":"setupmatrix"}'::jsonb
  ),
(
    'planning-resource', '资源',
    '/dashboard/planning/resource',
    (select id from public.admin_routes where code = 'planning-3'),
    'page', 'ri-hammer-line', 'planning_resource-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 110,
    '{"module":"planning","group":"产能工艺","sourceTable":"resource"}'::jsonb
  ),
(
    'planning-skill', '技能',
    '/dashboard/planning/skill',
    (select id from public.admin_routes where code = 'planning-3'),
    'page', 'ri-award-line', 'planning_skill-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 120,
    '{"module":"planning","group":"产能工艺","sourceTable":"skill"}'::jsonb
  ),
(
    'planning-resourceskill', '资源技能',
    '/dashboard/planning/resourceskill',
    (select id from public.admin_routes where code = 'planning-3'),
    'page', 'ri-user-settings-line', 'planning_resourceskill-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 130,
    '{"module":"planning","group":"产能工艺","sourceTable":"resourceskill"}'::jsonb
  ),
(
    'planning-setuprule', '换型规则',
    '/dashboard/planning/setuprule',
    (select id from public.admin_routes where code = 'planning-3'),
    'page', 'ri-git-merge-line', 'planning_setuprule-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 140,
    '{"module":"planning","group":"产能工艺","sourceTable":"setuprule"}'::jsonb
  ),
(
    'planning-operation', '工序',
    '/dashboard/planning/operation',
    (select id from public.admin_routes where code = 'planning-3'),
    'page', 'ri-settings-3-line', 'planning_operation-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 150,
    '{"module":"planning","group":"产能工艺","sourceTable":"operation"}'::jsonb
  ),
(
    'planning-operationmaterial', '工序物料',
    '/dashboard/planning/operationmaterial',
    (select id from public.admin_routes where code = 'planning-3'),
    'page', 'ri-node-tree', 'planning_operationmaterial-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 160,
    '{"module":"planning","group":"产能工艺","sourceTable":"operationmaterial"}'::jsonb
  ),
(
    'planning-operationresource', '工序资源',
    '/dashboard/planning/operationresource',
    (select id from public.admin_routes where code = 'planning-3'),
    'page', 'ri-tools-line', 'planning_operationresource-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 170,
    '{"module":"planning","group":"产能工艺","sourceTable":"operationresource"}'::jsonb
  ),
(
    'planning-suboperation', '子工序',
    '/dashboard/planning/suboperation',
    (select id from public.admin_routes where code = 'planning-3'),
    'page', 'ri-git-branch-line', 'planning_suboperation-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 180,
    '{"module":"planning","group":"产能工艺","sourceTable":"suboperation"}'::jsonb
  ),
(
    'planning-operation-dependency', '工序依赖',
    '/dashboard/planning/operation-dependency',
    (select id from public.admin_routes where code = 'planning-3'),
    'page', 'ri-links-line', 'planning_operation_dependency-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 190,
    '{"module":"planning","group":"产能工艺","sourceTable":"operation_dependency"}'::jsonb
  ),
(
    'planning-demand', '需求',
    '/dashboard/planning/demand',
    (select id from public.admin_routes where code = 'planning-4'),
    'page', 'ri-file-list-3-line', 'planning_demand-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 200,
    '{"module":"planning","group":"需求计划","sourceTable":"demand"}'::jsonb
  ),
(
    'planning-operationplan', '计划订单',
    '/dashboard/planning/operationplan',
    (select id from public.admin_routes where code = 'planning-5'),
    'page', 'ri-calendar-check-line', 'planning_operationplan-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 210,
    '{"module":"planning","group":"计划结果","sourceTable":"operationplan"}'::jsonb
  ),
(
    'planning-operationplanresource', '计划资源',
    '/dashboard/planning/operationplanresource',
    (select id from public.admin_routes where code = 'planning-5'),
    'page', 'ri-speed-up-line', 'planning_operationplanresource-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 220,
    '{"module":"planning","group":"计划结果","sourceTable":"operationplanresource"}'::jsonb
  ),
(
    'planning-operationplanmaterial', '计划物料',
    '/dashboard/planning/operationplanmaterial',
    (select id from public.admin_routes where code = 'planning-5'),
    'page', 'ri-exchange-box-line', 'planning_operationplanmaterial-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 230,
    '{"module":"planning","group":"计划结果","sourceTable":"operationplanmaterial"}'::jsonb
  )
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

select pg_notify('pgrst', 'reload schema');

commit;

