-- frePPLe-compatible planning data service for enLearn.
-- Scope: extended configuration, forecast, diagnostic, execution, scenario,
-- time-bucket, attribute, archive, source-integration and plan-version models.
-- The C++ solver remains external.

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

create table if not exists public.planning_parameter (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "value" text,
  "description" text,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_forecast (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "description" text,
  "category" text,
  "subcategory" text,
  "customer_id" uuid not null,
  "item_id" uuid not null,
  "location_id" uuid not null,
  "batch" text,
  "method" text default 'automatic' check ("method" in ('automatic', 'constant', 'trend', 'seasonal', 'intermittent', 'moving average', 'manual', 'aggregate')),
  "priority" integer not null default 10,
  "minshipment" numeric(30, 8),
  "maxlateness" interval,
  "discrete" boolean default true,
  "out_smape" numeric(30, 8),
  "out_method" text,
  "out_deviation" numeric(30, 8),
  "planned" boolean default true,
  "operation_id" uuid,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name"),
  unique (account_id, "item_id", "location_id", "customer_id")
);

create table if not exists public.planning_measure (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "label" text,
  "description" text,
  "type" text default 'aggregate' check ("type" in ('aggregate', 'local', 'computed')),
  "mode_future" text default 'edit' check ("mode_future" in ('edit', 'view', 'hide')),
  "mode_past" text default 'edit' check ("mode_past" in ('edit', 'view', 'hide')),
  "compute_expression" text,
  "update_expression" text,
  "initially_hidden" boolean,
  "formatter" text default 'number' check ("formatter" in ('number', 'currency')),
  "discrete" boolean,
  "defaultvalue" numeric(30, 8) default 0,
  "overrides" text,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_forecastplan (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "forecast_id" uuid,
  "item_id" uuid not null,
  "location_id" uuid not null,
  "customer_id" uuid not null,
  "startdate" timestamptz not null,
  "enddate" timestamptz not null,
  "value" jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "item_id", "location_id", "customer_id", "startdate")
);

create table if not exists public.planning_run (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "scenario_id" uuid,
  "workflow_job_id" uuid,
  "name" text not null,
  "submitted" timestamptz not null,
  "started" timestamptz,
  "finished" timestamptz,
  "arguments" jsonb default '{}'::jsonb,
  "status" text not null default 'queued' check ("status" in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  "message" text,
  "logfile" text,
  "trigger_run_id" text,
  "processid" integer,
  "progress" integer default 0,
  "attempt" integer default 1,
  "output" jsonb,
  "submitted_by" uuid,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id)
);

create table if not exists public.planning_schedule (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "job_type" text not null default 'supply_plan' check ("job_type" in ('supply_plan', 'forecast', 'archive', 'export', 'scenario_copy')),
  "scenario_id" uuid,
  "next_run" timestamptz,
  "timezone" text default 'Asia/Shanghai',
  "cron_expr" text,
  "enabled" boolean default false,
  "email_failure" text,
  "email_success" text,
  "data" jsonb default '{}'::jsonb,
  "trigger_task_id" text,
  "schedule_id" text,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_export (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "sql" text,
  "report" text,
  "arguments" jsonb default '{}'::jsonb,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_scenario (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "description" text,
  "status" text not null default 'free' check ("status" in ('free', 'in use', 'busy')),
  "source_scenario_id" uuid,
  "help_url" text,
  "info" jsonb default '{}'::jsonb,
  "copied_at" timestamptz,
  "released_at" timestamptz,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_bucket (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "name" text not null,
  "description" text,
  "level" integer not null,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "name")
);

create table if not exists public.planning_bucketdetail (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "bucket_id" uuid not null,
  "name" text not null,
  "startdate" timestamptz not null,
  "enddate" timestamptz not null,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "bucket_id", "startdate")
);

create table if not exists public.planning_attribute (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "model" text not null,
  "name" text not null,
  "label" text not null,
  "type" text not null check ("type" in ('string', 'boolean', 'number', 'integer', 'date', 'datetime', 'duration', 'time', 'jsonb')),
  "editable" boolean default true,
  "initially_hidden" boolean default false,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "model", "name")
);

create table if not exists public.planning_archive_manager (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "scenario_id" uuid,
  "snapshot_date" timestamptz not null,
  "total_records" integer not null,
  "buffer_records" integer not null,
  "demand_records" integer not null,
  "operationplan_records" integer not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "snapshot_date")
);

create table if not exists public.planning_archived_buffer (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "snapshot_id" uuid not null,
  "item" text not null,
  "location" text not null,
  "batch" text,
  "cost" numeric(30, 8),
  "onhand" numeric(30, 8),
  "safetystock" numeric(30, 8),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id)
);

create table if not exists public.planning_archived_demand (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "snapshot_id" uuid not null,
  "name" text not null,
  "item" text not null,
  "cost" numeric(30, 8),
  "location" text not null,
  "customer" text not null,
  "due" timestamptz not null,
  "status" text,
  "priority" integer not null,
  "quantity" numeric(30, 8) not null,
  "deliverydate" timestamptz,
  "quantityplanned" numeric(30, 8),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id)
);

create table if not exists public.planning_archived_operationplan (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "snapshot_id" uuid not null,
  "reference" text not null,
  "status" text,
  "type" text not null,
  "quantity" numeric(30, 8) not null,
  "startdate" timestamptz,
  "enddate" timestamptz,
  "operation" text,
  "owner" text,
  "batch" text,
  "item" text not null,
  "item_cost" numeric(30, 8),
  "itemsupplier_cost" numeric(30, 8),
  "origin" text,
  "destination" text,
  "supplier" text,
  "location" text,
  "demand" text,
  "due" timestamptz,
  "name" text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id)
);

create table if not exists public.planning_source_mapping (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "source_system" text not null default 'enlearn',
  "entity_type" text not null check ("entity_type" in ('item', 'customer', 'location', 'supplier', 'resource', 'operation')),
  "source_key" text not null,
  "source_name" text,
  "item_id" uuid,
  "customer_id" uuid,
  "location_id" uuid,
  "supplier_id" uuid,
  "resource_id" uuid,
  "operation_id" uuid,
  "status" text not null default 'active' check ("status" in ('active', 'inactive')),
  "metadata" jsonb default '{}'::jsonb,
  "last_synced_at" timestamptz,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "source_system", "entity_type", "source_key")
);

create table if not exists public.planning_plan_version (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "code" text not null,
  "name" text not null,
  "scenario_id" uuid not null,
  "run_id" uuid,
  "parent_version_id" uuid,
  "version_no" integer,
  "status" text default 'draft' check ("status" in ('draft', 'running', 'completed', 'published', 'superseded', 'failed', 'canceled')),
  "is_current" boolean default false,
  "input_cutoff" timestamptz,
  "horizon_start" timestamptz,
  "horizon_end" timestamptz,
  "solver" text,
  "parameters" jsonb default '{}'::jsonb,
  "input_snapshot" jsonb default '{}'::jsonb,
  "result_summary" jsonb default '{}'::jsonb,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "published_at" timestamptz,
  "published_by" uuid,
  "source" text,
  "lastmodified" timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "code"),
  unique (account_id, "scenario_id", "version_no")
);

create table if not exists public.planning_demand_sync_state (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  "source_type" text not null default 'sales_order_line' check ("source_type" in ('sales_order_line')),
  "source_system" text not null default 'enlearn',
  "source_key" text not null,
  "source_order_id" uuid,
  "source_line_id" uuid,
  "source_doc_no" text,
  "source_line_no" text,
  "demand_id" uuid,
  "status" text not null default 'pending' check ("status" in ('pending', 'synced', 'ignored', 'error')),
  "message" text,
  "source_updated_at" timestamptz,
  "attempted_at" timestamptz,
  "payload" jsonb default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, "source_system", "source_type", "source_key")
);

alter table public.planning_demand add column if not exists "source_type" text default 'manual';
alter table public.planning_demand drop constraint if exists planning_demand_source_type_check;
alter table public.planning_demand add constraint planning_demand_source_type_check check ("source_type" in ('manual', 'sales_order_line', 'forecast', 'external'));

alter table public.planning_demand add column if not exists "source_system" text default 'enlearn';

alter table public.planning_demand add column if not exists "source_key" text;

alter table public.planning_demand add column if not exists "source_order_id" uuid;

alter table public.planning_demand add column if not exists "source_line_id" uuid;

alter table public.planning_demand add column if not exists "source_doc_no" text;

alter table public.planning_demand add column if not exists "source_line_no" text;

alter table public.planning_demand add column if not exists "source_updated_at" timestamptz;

alter table public.planning_demand add column if not exists "sync_status" text default 'manual';
alter table public.planning_demand drop constraint if exists planning_demand_sync_status_check;
alter table public.planning_demand add constraint planning_demand_sync_status_check check ("sync_status" in ('manual', 'pending', 'synced', 'ignored', 'error'));

alter table public.planning_demand add column if not exists "sync_message" text;

alter table public.planning_operationplan add column if not exists "plan_version_id" uuid;

alter table public.planning_operationplanresource add column if not exists "plan_version_id" uuid;

alter table public.planning_operationplanmaterial add column if not exists "plan_version_id" uuid;

alter table public.planning_problem add column if not exists "plan_version_id" uuid;

alter table public.planning_constraint add column if not exists "plan_version_id" uuid;

alter table public.planning_resourceplan add column if not exists "plan_version_id" uuid;

alter table public.planning_forecast drop constraint if exists planning_forecast_customer_id_account_fk;
alter table public.planning_forecast add constraint planning_forecast_customer_id_account_fk
  foreign key (account_id, "customer_id") references public.planning_customer(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_forecast drop constraint if exists planning_forecast_item_id_account_fk;
alter table public.planning_forecast add constraint planning_forecast_item_id_account_fk
  foreign key (account_id, "item_id") references public.planning_item(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_forecast drop constraint if exists planning_forecast_location_id_account_fk;
alter table public.planning_forecast add constraint planning_forecast_location_id_account_fk
  foreign key (account_id, "location_id") references public.planning_location(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_forecast drop constraint if exists planning_forecast_operation_id_account_fk;
alter table public.planning_forecast add constraint planning_forecast_operation_id_account_fk
  foreign key (account_id, "operation_id") references public.planning_operation(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_forecastplan drop constraint if exists planning_forecastplan_forecast_id_account_fk;
alter table public.planning_forecastplan add constraint planning_forecastplan_forecast_id_account_fk
  foreign key (account_id, "forecast_id") references public.planning_forecast(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_forecastplan drop constraint if exists planning_forecastplan_item_id_account_fk;
alter table public.planning_forecastplan add constraint planning_forecastplan_item_id_account_fk
  foreign key (account_id, "item_id") references public.planning_item(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_forecastplan drop constraint if exists planning_forecastplan_location_id_account_fk;
alter table public.planning_forecastplan add constraint planning_forecastplan_location_id_account_fk
  foreign key (account_id, "location_id") references public.planning_location(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_forecastplan drop constraint if exists planning_forecastplan_customer_id_account_fk;
alter table public.planning_forecastplan add constraint planning_forecastplan_customer_id_account_fk
  foreign key (account_id, "customer_id") references public.planning_customer(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_run drop constraint if exists planning_run_scenario_id_account_fk;
alter table public.planning_run add constraint planning_run_scenario_id_account_fk
  foreign key (account_id, "scenario_id") references public.planning_scenario(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_run drop constraint if exists planning_run_workflow_job_id_account_fk;
alter table public.planning_run add constraint planning_run_workflow_job_id_account_fk
  foreign key (account_id, "workflow_job_id") references public.planning_schedule(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_schedule drop constraint if exists planning_schedule_scenario_id_account_fk;
alter table public.planning_schedule add constraint planning_schedule_scenario_id_account_fk
  foreign key (account_id, "scenario_id") references public.planning_scenario(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_scenario drop constraint if exists planning_scenario_source_scenario_id_account_fk;
alter table public.planning_scenario add constraint planning_scenario_source_scenario_id_account_fk
  foreign key (account_id, "source_scenario_id") references public.planning_scenario(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_bucketdetail drop constraint if exists planning_bucketdetail_bucket_id_account_fk;
alter table public.planning_bucketdetail add constraint planning_bucketdetail_bucket_id_account_fk
  foreign key (account_id, "bucket_id") references public.planning_bucket(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_archive_manager drop constraint if exists planning_archive_manager_scenario_id_account_fk;
alter table public.planning_archive_manager add constraint planning_archive_manager_scenario_id_account_fk
  foreign key (account_id, "scenario_id") references public.planning_scenario(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_archived_buffer drop constraint if exists planning_archived_buffer_snapshot_id_account_fk;
alter table public.planning_archived_buffer add constraint planning_archived_buffer_snapshot_id_account_fk
  foreign key (account_id, "snapshot_id") references public.planning_archive_manager(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_archived_demand drop constraint if exists planning_archived_demand_snapshot_id_account_fk;
alter table public.planning_archived_demand add constraint planning_archived_demand_snapshot_id_account_fk
  foreign key (account_id, "snapshot_id") references public.planning_archive_manager(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_archived_operationplan drop constraint if exists planning_archived_operationplan_snapshot_id_account_fk;
alter table public.planning_archived_operationplan add constraint planning_archived_operationplan_snapshot_id_account_fk
  foreign key (account_id, "snapshot_id") references public.planning_archive_manager(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_source_mapping drop constraint if exists planning_source_mapping_item_id_account_fk;
alter table public.planning_source_mapping add constraint planning_source_mapping_item_id_account_fk
  foreign key (account_id, "item_id") references public.planning_item(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_source_mapping drop constraint if exists planning_source_mapping_customer_id_account_fk;
alter table public.planning_source_mapping add constraint planning_source_mapping_customer_id_account_fk
  foreign key (account_id, "customer_id") references public.planning_customer(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_source_mapping drop constraint if exists planning_source_mapping_location_id_account_fk;
alter table public.planning_source_mapping add constraint planning_source_mapping_location_id_account_fk
  foreign key (account_id, "location_id") references public.planning_location(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_source_mapping drop constraint if exists planning_source_mapping_supplier_id_account_fk;
alter table public.planning_source_mapping add constraint planning_source_mapping_supplier_id_account_fk
  foreign key (account_id, "supplier_id") references public.planning_supplier(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_source_mapping drop constraint if exists planning_source_mapping_resource_id_account_fk;
alter table public.planning_source_mapping add constraint planning_source_mapping_resource_id_account_fk
  foreign key (account_id, "resource_id") references public.planning_resource(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_source_mapping drop constraint if exists planning_source_mapping_operation_id_account_fk;
alter table public.planning_source_mapping add constraint planning_source_mapping_operation_id_account_fk
  foreign key (account_id, "operation_id") references public.planning_operation(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_plan_version drop constraint if exists planning_plan_version_scenario_id_account_fk;
alter table public.planning_plan_version add constraint planning_plan_version_scenario_id_account_fk
  foreign key (account_id, "scenario_id") references public.planning_scenario(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_plan_version drop constraint if exists planning_plan_version_run_id_account_fk;
alter table public.planning_plan_version add constraint planning_plan_version_run_id_account_fk
  foreign key (account_id, "run_id") references public.planning_run(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_plan_version drop constraint if exists planning_plan_version_parent_version_id_account_fk;
alter table public.planning_plan_version add constraint planning_plan_version_parent_version_id_account_fk
  foreign key (account_id, "parent_version_id") references public.planning_plan_version(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_demand_sync_state drop constraint if exists planning_demand_sync_state_demand_id_account_fk;
alter table public.planning_demand_sync_state add constraint planning_demand_sync_state_demand_id_account_fk
  foreign key (account_id, "demand_id") references public.planning_demand(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationplan drop constraint if exists planning_operationplan_plan_version_id_account_fk;
alter table public.planning_operationplan add constraint planning_operationplan_plan_version_id_account_fk
  foreign key (account_id, "plan_version_id") references public.planning_plan_version(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationplanresource drop constraint if exists planning_operationplanresource_plan_version_id_account_fk;
alter table public.planning_operationplanresource add constraint planning_operationplanresource_plan_version_id_account_fk
  foreign key (account_id, "plan_version_id") references public.planning_plan_version(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_operationplanmaterial drop constraint if exists planning_operationplanmaterial_plan_version_id_account_fk;
alter table public.planning_operationplanmaterial add constraint planning_operationplanmaterial_plan_version_id_account_fk
  foreign key (account_id, "plan_version_id") references public.planning_plan_version(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_problem drop constraint if exists planning_problem_plan_version_id_account_fk;
alter table public.planning_problem add constraint planning_problem_plan_version_id_account_fk
  foreign key (account_id, "plan_version_id") references public.planning_plan_version(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_constraint drop constraint if exists planning_constraint_plan_version_id_account_fk;
alter table public.planning_constraint add constraint planning_constraint_plan_version_id_account_fk
  foreign key (account_id, "plan_version_id") references public.planning_plan_version(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_resourceplan drop constraint if exists planning_resourceplan_plan_version_id_account_fk;
alter table public.planning_resourceplan add constraint planning_resourceplan_plan_version_id_account_fk
  foreign key (account_id, "plan_version_id") references public.planning_plan_version(account_id, id)
  on delete set null deferrable initially deferred;

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

create index if not exists idx_planning_parameter_account on public.planning_parameter(account_id);
create index if not exists idx_planning_parameter_updated on public.planning_parameter(account_id, updated_at desc);
alter table public.planning_parameter enable row level security;
drop policy if exists "Planning viewers can read planning_parameter" on public.planning_parameter;
create policy "Planning viewers can read planning_parameter" on public.planning_parameter
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_parameter" on public.planning_parameter;
drop policy if exists "Planning managers can update planning_parameter" on public.planning_parameter;
drop policy if exists "Planning managers can delete planning_parameter" on public.planning_parameter;
create policy "Planning managers can insert planning_parameter" on public.planning_parameter
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can update planning_parameter" on public.planning_parameter
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can delete planning_parameter" on public.planning_parameter
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_parameter to authenticated, service_role;
drop trigger if exists planning_parameter_audit on public.planning_parameter;
create trigger planning_parameter_audit before insert or update on public.planning_parameter
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_forecast_account on public.planning_forecast(account_id);
create index if not exists idx_planning_forecast_updated on public.planning_forecast(account_id, updated_at desc);
alter table public.planning_forecast enable row level security;
drop policy if exists "Planning viewers can read planning_forecast" on public.planning_forecast;
create policy "Planning viewers can read planning_forecast" on public.planning_forecast
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_forecast" on public.planning_forecast;
drop policy if exists "Planning managers can update planning_forecast" on public.planning_forecast;
drop policy if exists "Planning managers can delete planning_forecast" on public.planning_forecast;
create policy "Planning managers can insert planning_forecast" on public.planning_forecast
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can update planning_forecast" on public.planning_forecast
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can delete planning_forecast" on public.planning_forecast
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_forecast to authenticated, service_role;
drop trigger if exists planning_forecast_audit on public.planning_forecast;
create trigger planning_forecast_audit before insert or update on public.planning_forecast
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_measure_account on public.planning_measure(account_id);
create index if not exists idx_planning_measure_updated on public.planning_measure(account_id, updated_at desc);
alter table public.planning_measure enable row level security;
drop policy if exists "Planning viewers can read planning_measure" on public.planning_measure;
create policy "Planning viewers can read planning_measure" on public.planning_measure
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_measure" on public.planning_measure;
drop policy if exists "Planning managers can update planning_measure" on public.planning_measure;
drop policy if exists "Planning managers can delete planning_measure" on public.planning_measure;
create policy "Planning managers can insert planning_measure" on public.planning_measure
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can update planning_measure" on public.planning_measure
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can delete planning_measure" on public.planning_measure
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_measure to authenticated, service_role;
drop trigger if exists planning_measure_audit on public.planning_measure;
create trigger planning_measure_audit before insert or update on public.planning_measure
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_forecastplan_account on public.planning_forecastplan(account_id);
create index if not exists idx_planning_forecastplan_updated on public.planning_forecastplan(account_id, updated_at desc);
alter table public.planning_forecastplan enable row level security;
drop policy if exists "Planning viewers can read planning_forecastplan" on public.planning_forecastplan;
create policy "Planning viewers can read planning_forecastplan" on public.planning_forecastplan
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_forecastplan" on public.planning_forecastplan;
drop policy if exists "Planning managers can update planning_forecastplan" on public.planning_forecastplan;
drop policy if exists "Planning managers can delete planning_forecastplan" on public.planning_forecastplan;
create policy "Planning managers can insert planning_forecastplan" on public.planning_forecastplan
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can update planning_forecastplan" on public.planning_forecastplan
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can delete planning_forecastplan" on public.planning_forecastplan
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_forecastplan to authenticated, service_role;
drop trigger if exists planning_forecastplan_audit on public.planning_forecastplan;
create trigger planning_forecastplan_audit before insert or update on public.planning_forecastplan
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_problem_account on public.planning_problem(account_id);
create index if not exists idx_planning_problem_updated on public.planning_problem(account_id, updated_at desc);
alter table public.planning_problem enable row level security;
drop policy if exists "Planning viewers can read planning_problem" on public.planning_problem;
create policy "Planning viewers can read planning_problem" on public.planning_problem
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_problem" on public.planning_problem;
drop policy if exists "Planning managers can update planning_problem" on public.planning_problem;
drop policy if exists "Planning managers can delete planning_problem" on public.planning_problem;
revoke insert, update, delete on public.planning_problem from authenticated;
grant select on public.planning_problem to authenticated;
grant select, insert, update, delete on public.planning_problem to service_role;
drop trigger if exists planning_problem_audit on public.planning_problem;
create trigger planning_problem_audit before insert or update on public.planning_problem
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_constraint_account on public.planning_constraint(account_id);
create index if not exists idx_planning_constraint_updated on public.planning_constraint(account_id, updated_at desc);
alter table public.planning_constraint enable row level security;
drop policy if exists "Planning viewers can read planning_constraint" on public.planning_constraint;
create policy "Planning viewers can read planning_constraint" on public.planning_constraint
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_constraint" on public.planning_constraint;
drop policy if exists "Planning managers can update planning_constraint" on public.planning_constraint;
drop policy if exists "Planning managers can delete planning_constraint" on public.planning_constraint;
revoke insert, update, delete on public.planning_constraint from authenticated;
grant select on public.planning_constraint to authenticated;
grant select, insert, update, delete on public.planning_constraint to service_role;
drop trigger if exists planning_constraint_audit on public.planning_constraint;
create trigger planning_constraint_audit before insert or update on public.planning_constraint
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_resourceplan_account on public.planning_resourceplan(account_id);
create index if not exists idx_planning_resourceplan_updated on public.planning_resourceplan(account_id, updated_at desc);
alter table public.planning_resourceplan enable row level security;
drop policy if exists "Planning viewers can read planning_resourceplan" on public.planning_resourceplan;
create policy "Planning viewers can read planning_resourceplan" on public.planning_resourceplan
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_resourceplan" on public.planning_resourceplan;
drop policy if exists "Planning managers can update planning_resourceplan" on public.planning_resourceplan;
drop policy if exists "Planning managers can delete planning_resourceplan" on public.planning_resourceplan;
revoke insert, update, delete on public.planning_resourceplan from authenticated;
grant select on public.planning_resourceplan to authenticated;
grant select, insert, update, delete on public.planning_resourceplan to service_role;
drop trigger if exists planning_resourceplan_audit on public.planning_resourceplan;
create trigger planning_resourceplan_audit before insert or update on public.planning_resourceplan
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_run_account on public.planning_run(account_id);
create index if not exists idx_planning_run_updated on public.planning_run(account_id, updated_at desc);
alter table public.planning_run enable row level security;
drop policy if exists "Planning viewers can read planning_run" on public.planning_run;
create policy "Planning viewers can read planning_run" on public.planning_run
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_run" on public.planning_run;
drop policy if exists "Planning managers can update planning_run" on public.planning_run;
drop policy if exists "Planning managers can delete planning_run" on public.planning_run;
revoke insert, update, delete on public.planning_run from authenticated;
grant select on public.planning_run to authenticated;
grant select, insert, update, delete on public.planning_run to service_role;
drop trigger if exists planning_run_audit on public.planning_run;
create trigger planning_run_audit before insert or update on public.planning_run
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_schedule_account on public.planning_schedule(account_id);
create index if not exists idx_planning_schedule_updated on public.planning_schedule(account_id, updated_at desc);
alter table public.planning_schedule enable row level security;
drop policy if exists "Planning viewers can read planning_schedule" on public.planning_schedule;
create policy "Planning viewers can read planning_schedule" on public.planning_schedule
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_schedule" on public.planning_schedule;
drop policy if exists "Planning managers can update planning_schedule" on public.planning_schedule;
drop policy if exists "Planning managers can delete planning_schedule" on public.planning_schedule;
create policy "Planning managers can insert planning_schedule" on public.planning_schedule
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can update planning_schedule" on public.planning_schedule
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can delete planning_schedule" on public.planning_schedule
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_schedule to authenticated, service_role;
drop trigger if exists planning_schedule_audit on public.planning_schedule;
create trigger planning_schedule_audit before insert or update on public.planning_schedule
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_export_account on public.planning_export(account_id);
create index if not exists idx_planning_export_updated on public.planning_export(account_id, updated_at desc);
alter table public.planning_export enable row level security;
drop policy if exists "Planning viewers can read planning_export" on public.planning_export;
create policy "Planning viewers can read planning_export" on public.planning_export
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_export" on public.planning_export;
drop policy if exists "Planning managers can update planning_export" on public.planning_export;
drop policy if exists "Planning managers can delete planning_export" on public.planning_export;
create policy "Planning managers can insert planning_export" on public.planning_export
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can update planning_export" on public.planning_export
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can delete planning_export" on public.planning_export
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_export to authenticated, service_role;
drop trigger if exists planning_export_audit on public.planning_export;
create trigger planning_export_audit before insert or update on public.planning_export
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_scenario_account on public.planning_scenario(account_id);
create index if not exists idx_planning_scenario_updated on public.planning_scenario(account_id, updated_at desc);
alter table public.planning_scenario enable row level security;
drop policy if exists "Planning viewers can read planning_scenario" on public.planning_scenario;
create policy "Planning viewers can read planning_scenario" on public.planning_scenario
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_scenario" on public.planning_scenario;
drop policy if exists "Planning managers can update planning_scenario" on public.planning_scenario;
drop policy if exists "Planning managers can delete planning_scenario" on public.planning_scenario;
create policy "Planning managers can insert planning_scenario" on public.planning_scenario
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can update planning_scenario" on public.planning_scenario
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can delete planning_scenario" on public.planning_scenario
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_scenario to authenticated, service_role;
drop trigger if exists planning_scenario_audit on public.planning_scenario;
create trigger planning_scenario_audit before insert or update on public.planning_scenario
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_bucket_account on public.planning_bucket(account_id);
create index if not exists idx_planning_bucket_updated on public.planning_bucket(account_id, updated_at desc);
alter table public.planning_bucket enable row level security;
drop policy if exists "Planning viewers can read planning_bucket" on public.planning_bucket;
create policy "Planning viewers can read planning_bucket" on public.planning_bucket
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_bucket" on public.planning_bucket;
drop policy if exists "Planning managers can update planning_bucket" on public.planning_bucket;
drop policy if exists "Planning managers can delete planning_bucket" on public.planning_bucket;
create policy "Planning managers can insert planning_bucket" on public.planning_bucket
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can update planning_bucket" on public.planning_bucket
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can delete planning_bucket" on public.planning_bucket
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_bucket to authenticated, service_role;
drop trigger if exists planning_bucket_audit on public.planning_bucket;
create trigger planning_bucket_audit before insert or update on public.planning_bucket
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_bucketdetail_account on public.planning_bucketdetail(account_id);
create index if not exists idx_planning_bucketdetail_updated on public.planning_bucketdetail(account_id, updated_at desc);
alter table public.planning_bucketdetail enable row level security;
drop policy if exists "Planning viewers can read planning_bucketdetail" on public.planning_bucketdetail;
create policy "Planning viewers can read planning_bucketdetail" on public.planning_bucketdetail
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_bucketdetail" on public.planning_bucketdetail;
drop policy if exists "Planning managers can update planning_bucketdetail" on public.planning_bucketdetail;
drop policy if exists "Planning managers can delete planning_bucketdetail" on public.planning_bucketdetail;
create policy "Planning managers can insert planning_bucketdetail" on public.planning_bucketdetail
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can update planning_bucketdetail" on public.planning_bucketdetail
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can delete planning_bucketdetail" on public.planning_bucketdetail
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_bucketdetail to authenticated, service_role;
drop trigger if exists planning_bucketdetail_audit on public.planning_bucketdetail;
create trigger planning_bucketdetail_audit before insert or update on public.planning_bucketdetail
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_attribute_account on public.planning_attribute(account_id);
create index if not exists idx_planning_attribute_updated on public.planning_attribute(account_id, updated_at desc);
alter table public.planning_attribute enable row level security;
drop policy if exists "Planning viewers can read planning_attribute" on public.planning_attribute;
create policy "Planning viewers can read planning_attribute" on public.planning_attribute
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_attribute" on public.planning_attribute;
drop policy if exists "Planning managers can update planning_attribute" on public.planning_attribute;
drop policy if exists "Planning managers can delete planning_attribute" on public.planning_attribute;
create policy "Planning managers can insert planning_attribute" on public.planning_attribute
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can update planning_attribute" on public.planning_attribute
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can delete planning_attribute" on public.planning_attribute
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_attribute to authenticated, service_role;
drop trigger if exists planning_attribute_audit on public.planning_attribute;
create trigger planning_attribute_audit before insert or update on public.planning_attribute
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_archive_manager_account on public.planning_archive_manager(account_id);
create index if not exists idx_planning_archive_manager_updated on public.planning_archive_manager(account_id, updated_at desc);
alter table public.planning_archive_manager enable row level security;
drop policy if exists "Planning viewers can read planning_archive_manager" on public.planning_archive_manager;
create policy "Planning viewers can read planning_archive_manager" on public.planning_archive_manager
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_archive_manager" on public.planning_archive_manager;
drop policy if exists "Planning managers can update planning_archive_manager" on public.planning_archive_manager;
drop policy if exists "Planning managers can delete planning_archive_manager" on public.planning_archive_manager;
revoke insert, update, delete on public.planning_archive_manager from authenticated;
grant select on public.planning_archive_manager to authenticated;
grant select, insert, update, delete on public.planning_archive_manager to service_role;
drop trigger if exists planning_archive_manager_audit on public.planning_archive_manager;
create trigger planning_archive_manager_audit before insert or update on public.planning_archive_manager
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_archived_buffer_account on public.planning_archived_buffer(account_id);
create index if not exists idx_planning_archived_buffer_updated on public.planning_archived_buffer(account_id, updated_at desc);
alter table public.planning_archived_buffer enable row level security;
drop policy if exists "Planning viewers can read planning_archived_buffer" on public.planning_archived_buffer;
create policy "Planning viewers can read planning_archived_buffer" on public.planning_archived_buffer
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_archived_buffer" on public.planning_archived_buffer;
drop policy if exists "Planning managers can update planning_archived_buffer" on public.planning_archived_buffer;
drop policy if exists "Planning managers can delete planning_archived_buffer" on public.planning_archived_buffer;
revoke insert, update, delete on public.planning_archived_buffer from authenticated;
grant select on public.planning_archived_buffer to authenticated;
grant select, insert, update, delete on public.planning_archived_buffer to service_role;
drop trigger if exists planning_archived_buffer_audit on public.planning_archived_buffer;
create trigger planning_archived_buffer_audit before insert or update on public.planning_archived_buffer
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_archived_demand_account on public.planning_archived_demand(account_id);
create index if not exists idx_planning_archived_demand_updated on public.planning_archived_demand(account_id, updated_at desc);
alter table public.planning_archived_demand enable row level security;
drop policy if exists "Planning viewers can read planning_archived_demand" on public.planning_archived_demand;
create policy "Planning viewers can read planning_archived_demand" on public.planning_archived_demand
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_archived_demand" on public.planning_archived_demand;
drop policy if exists "Planning managers can update planning_archived_demand" on public.planning_archived_demand;
drop policy if exists "Planning managers can delete planning_archived_demand" on public.planning_archived_demand;
revoke insert, update, delete on public.planning_archived_demand from authenticated;
grant select on public.planning_archived_demand to authenticated;
grant select, insert, update, delete on public.planning_archived_demand to service_role;
drop trigger if exists planning_archived_demand_audit on public.planning_archived_demand;
create trigger planning_archived_demand_audit before insert or update on public.planning_archived_demand
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_archived_operationplan_account on public.planning_archived_operationplan(account_id);
create index if not exists idx_planning_archived_operationplan_updated on public.planning_archived_operationplan(account_id, updated_at desc);
alter table public.planning_archived_operationplan enable row level security;
drop policy if exists "Planning viewers can read planning_archived_operationplan" on public.planning_archived_operationplan;
create policy "Planning viewers can read planning_archived_operationplan" on public.planning_archived_operationplan
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_archived_operationplan" on public.planning_archived_operationplan;
drop policy if exists "Planning managers can update planning_archived_operationplan" on public.planning_archived_operationplan;
drop policy if exists "Planning managers can delete planning_archived_operationplan" on public.planning_archived_operationplan;
revoke insert, update, delete on public.planning_archived_operationplan from authenticated;
grant select on public.planning_archived_operationplan to authenticated;
grant select, insert, update, delete on public.planning_archived_operationplan to service_role;
drop trigger if exists planning_archived_operationplan_audit on public.planning_archived_operationplan;
create trigger planning_archived_operationplan_audit before insert or update on public.planning_archived_operationplan
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_source_mapping_account on public.planning_source_mapping(account_id);
create index if not exists idx_planning_source_mapping_updated on public.planning_source_mapping(account_id, updated_at desc);
alter table public.planning_source_mapping enable row level security;
drop policy if exists "Planning viewers can read planning_source_mapping" on public.planning_source_mapping;
create policy "Planning viewers can read planning_source_mapping" on public.planning_source_mapping
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_source_mapping" on public.planning_source_mapping;
drop policy if exists "Planning managers can update planning_source_mapping" on public.planning_source_mapping;
drop policy if exists "Planning managers can delete planning_source_mapping" on public.planning_source_mapping;
create policy "Planning managers can insert planning_source_mapping" on public.planning_source_mapping
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can update planning_source_mapping" on public.planning_source_mapping
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can delete planning_source_mapping" on public.planning_source_mapping
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_source_mapping to authenticated, service_role;
drop trigger if exists planning_source_mapping_audit on public.planning_source_mapping;
create trigger planning_source_mapping_audit before insert or update on public.planning_source_mapping
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_plan_version_account on public.planning_plan_version(account_id);
create index if not exists idx_planning_plan_version_updated on public.planning_plan_version(account_id, updated_at desc);
alter table public.planning_plan_version enable row level security;
drop policy if exists "Planning viewers can read planning_plan_version" on public.planning_plan_version;
create policy "Planning viewers can read planning_plan_version" on public.planning_plan_version
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_plan_version" on public.planning_plan_version;
drop policy if exists "Planning managers can update planning_plan_version" on public.planning_plan_version;
drop policy if exists "Planning managers can delete planning_plan_version" on public.planning_plan_version;
create policy "Planning managers can insert planning_plan_version" on public.planning_plan_version
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can update planning_plan_version" on public.planning_plan_version
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));
create policy "Planning managers can delete planning_plan_version" on public.planning_plan_version
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));
grant select, insert, update, delete on public.planning_plan_version to authenticated, service_role;
drop trigger if exists planning_plan_version_audit on public.planning_plan_version;
create trigger planning_plan_version_audit before insert or update on public.planning_plan_version
  for each row execute function public.planning_set_audit_fields();

create index if not exists idx_planning_demand_sync_state_account on public.planning_demand_sync_state(account_id);
create index if not exists idx_planning_demand_sync_state_updated on public.planning_demand_sync_state(account_id, updated_at desc);
alter table public.planning_demand_sync_state enable row level security;
drop policy if exists "Planning viewers can read planning_demand_sync_state" on public.planning_demand_sync_state;
create policy "Planning viewers can read planning_demand_sync_state" on public.planning_demand_sync_state
  for select to authenticated
  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));
drop policy if exists "Planning managers can insert planning_demand_sync_state" on public.planning_demand_sync_state;
drop policy if exists "Planning managers can update planning_demand_sync_state" on public.planning_demand_sync_state;
drop policy if exists "Planning managers can delete planning_demand_sync_state" on public.planning_demand_sync_state;
revoke insert, update, delete on public.planning_demand_sync_state from authenticated;
grant select on public.planning_demand_sync_state to authenticated;
grant select, insert, update, delete on public.planning_demand_sync_state to service_role;
drop trigger if exists planning_demand_sync_state_audit on public.planning_demand_sync_state;
create trigger planning_demand_sync_state_audit before insert or update on public.planning_demand_sync_state
  for each row execute function public.planning_set_audit_fields();

alter table public.planning_forecastplan
  drop constraint if exists planning_forecastplan_dates_check;
alter table public.planning_forecastplan
  add constraint planning_forecastplan_dates_check check (enddate > startdate);

alter table public.planning_bucketdetail
  drop constraint if exists planning_bucketdetail_dates_check;
alter table public.planning_bucketdetail
  add constraint planning_bucketdetail_dates_check check (enddate > startdate);

alter table public.planning_problem
  drop constraint if exists planning_problem_dates_check;
alter table public.planning_problem
  add constraint planning_problem_dates_check check (enddate >= startdate);

alter table public.planning_constraint
  drop constraint if exists planning_constraint_dates_check;
alter table public.planning_constraint
  add constraint planning_constraint_dates_check check (enddate >= startdate);

alter table public.planning_run
  drop constraint if exists planning_run_progress_check;
alter table public.planning_run
  add constraint planning_run_progress_check check (progress between 0 and 100);

alter table public.planning_schedule
  drop constraint if exists planning_schedule_cron_check;
alter table public.planning_schedule
  add constraint planning_schedule_cron_check check (not enabled or cron_expr is not null or next_run is not null);

alter table public.planning_export
  drop constraint if exists planning_export_definition_check;
alter table public.planning_export
  add constraint planning_export_definition_check check (sql is not null or report is not null);

alter table public.planning_attribute
  drop constraint if exists planning_attribute_name_check;
alter table public.planning_attribute
  add constraint planning_attribute_name_check check (name ~ '^[a-z][a-z0-9_]*$');

create index if not exists idx_planning_problem_run on public.planning_problem(account_id, run_id, startdate);
create index if not exists idx_planning_constraint_run on public.planning_constraint(account_id, run_id, startdate);
create index if not exists idx_planning_resourceplan_run on public.planning_resourceplan(account_id, run_id, startdate);
create index if not exists idx_planning_run_status on public.planning_run(account_id, status, submitted desc);
create index if not exists idx_planning_schedule_next_run on public.planning_schedule(account_id, enabled, next_run);
create index if not exists idx_planning_archive_snapshot on public.planning_archive_manager(account_id, snapshot_date desc);

alter table public.planning_demand
  drop constraint if exists planning_demand_source_shape_check;
alter table public.planning_demand
  add constraint planning_demand_source_shape_check check (
    (source_type = 'manual' and source_key is null and source_line_id is null)
    or (source_type <> 'manual' and source_key is not null)
  );

create unique index if not exists planning_demand_source_key
  on public.planning_demand(account_id, source_system, source_type, source_key)
  where source_key is not null;
create unique index if not exists planning_demand_sales_order_line_key
  on public.planning_demand(account_id, source_line_id)
  where source_type = 'sales_order_line' and source_line_id is not null;
create index if not exists idx_planning_demand_sync_status
  on public.planning_demand(account_id, sync_status, source_updated_at desc);

alter table public.planning_source_mapping
  drop constraint if exists planning_source_mapping_target_check;
alter table public.planning_source_mapping
  add constraint planning_source_mapping_target_check check (
    num_nonnulls(item_id, customer_id, location_id, supplier_id, resource_id, operation_id) = 1
    and case entity_type
      when 'item' then item_id is not null
      when 'customer' then customer_id is not null
      when 'location' then location_id is not null
      when 'supplier' then supplier_id is not null
      when 'resource' then resource_id is not null
      when 'operation' then operation_id is not null
      else false
    end
  );
create index if not exists idx_planning_source_mapping_lookup
  on public.planning_source_mapping(account_id, source_system, entity_type, source_key)
  where status = 'active';

alter table public.planning_plan_version
  drop constraint if exists planning_plan_version_horizon_check;
alter table public.planning_plan_version
  add constraint planning_plan_version_horizon_check check (
    horizon_start is null or horizon_end is null or horizon_end > horizon_start
  );
alter table public.planning_plan_version
  drop constraint if exists planning_plan_version_parent_check;
alter table public.planning_plan_version
  add constraint planning_plan_version_parent_check check (parent_version_id is null or parent_version_id <> id);
create unique index if not exists planning_plan_version_run_key
  on public.planning_plan_version(account_id, run_id)
  where run_id is not null;
create unique index if not exists planning_plan_version_current_key
  on public.planning_plan_version(account_id, scenario_id)
  where is_current;
create index if not exists idx_planning_plan_version_status
  on public.planning_plan_version(account_id, scenario_id, status, version_no desc);

alter table public.planning_demand_sync_state
  drop constraint if exists planning_demand_sync_state_source_check;
alter table public.planning_demand_sync_state
  add constraint planning_demand_sync_state_source_check check (
    source_type <> 'sales_order_line' or source_line_id is not null
  );
create unique index if not exists planning_demand_sync_state_line_key
  on public.planning_demand_sync_state(account_id, source_line_id)
  where source_line_id is not null;
create index if not exists idx_planning_demand_sync_state_status
  on public.planning_demand_sync_state(account_id, status, attempted_at desc);

create index if not exists idx_planning_operationplan_version
  on public.planning_operationplan(account_id, plan_version_id, type, status);
alter table public.planning_operationplan
  drop constraint if exists planning_operationplan_account_id_reference_key;
create unique index if not exists planning_operationplan_manual_reference_key
  on public.planning_operationplan(account_id, reference)
  where plan_version_id is null;
create unique index if not exists planning_operationplan_version_reference_key
  on public.planning_operationplan(account_id, plan_version_id, reference)
  where plan_version_id is not null;
create index if not exists idx_planning_operationplanresource_version
  on public.planning_operationplanresource(account_id, plan_version_id);
create index if not exists idx_planning_operationplanmaterial_version
  on public.planning_operationplanmaterial(account_id, plan_version_id, flowdate);
create index if not exists idx_planning_problem_version
  on public.planning_problem(account_id, plan_version_id, startdate);
create index if not exists idx_planning_constraint_version
  on public.planning_constraint(account_id, plan_version_id, startdate);
create index if not exists idx_planning_resourceplan_version
  on public.planning_resourceplan(account_id, plan_version_id, startdate);
alter table public.planning_resourceplan
  drop constraint if exists planning_resourceplan_account_id_resource_id_startdate_key;
create unique index if not exists planning_resourceplan_legacy_bucket_key
  on public.planning_resourceplan(account_id, resource_id, startdate)
  where plan_version_id is null;
create unique index if not exists planning_resourceplan_version_bucket_key
  on public.planning_resourceplan(account_id, plan_version_id, resource_id, startdate)
  where plan_version_id is not null;

create or replace function public.planning_assign_version_number()
returns trigger
language plpgsql
as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.account_id::text || ':' || new.scenario_id::text, 0));
  if new.version_no is null then
    select coalesce(max(version_no), 0) + 1
      into new.version_no
    from public.planning_plan_version
    where account_id = new.account_id and scenario_id = new.scenario_id;
  elsif exists (
    select 1 from public.planning_plan_version
    where account_id = new.account_id and scenario_id = new.scenario_id and version_no = new.version_no
  ) then
    raise exception 'Plan version number already exists in this scenario.' using errcode = '23505';
  end if;
  return new;
end;
$function$;

drop trigger if exists planning_plan_version_number on public.planning_plan_version;
create trigger planning_plan_version_number
before insert on public.planning_plan_version
for each row execute function public.planning_assign_version_number();

create or replace function public.planning_guard_plan_version()
returns trigger
language plpgsql
as $function$
declare
  system_write boolean := coalesce(current_setting('planning.system_version_write', true), '') = 'on';
begin
  if tg_op = 'INSERT' and not system_write then
    new.status := 'draft';
    new.is_current := false;
    new.started_at := null;
    new.completed_at := null;
    new.published_at := null;
    new.published_by := null;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not system_write
       and current_setting('planning.publish_version_id', true) is distinct from new.id::text then
      raise exception 'Plan version status is maintained by the planning execution lifecycle.' using errcode = '42501';
    end if;
    if not (
      (old.status = 'draft' and new.status in ('running', 'completed', 'failed', 'canceled'))
      or (old.status = 'running' and new.status in ('completed', 'failed', 'canceled'))
      or (old.status = 'completed' and new.status in ('published', 'failed', 'canceled'))
      or (old.status = 'published' and new.status = 'superseded')
    ) then
      raise exception 'Invalid plan version status transition: % -> %.', old.status, new.status using errcode = '23514';
    end if;

  end if;

  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and old.status not in ('published', 'superseded') then
    new.is_current := old.is_current;
  end if;

  if tg_op = 'UPDATE' and not system_write
     and current_setting('planning.publish_version_id', true) is distinct from new.id::text
     and (
       new.is_current is distinct from old.is_current
       or new.result_summary is distinct from old.result_summary
       or new.started_at is distinct from old.started_at
       or new.completed_at is distinct from old.completed_at
       or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by
     ) then
    raise exception 'Plan version execution fields are system maintained.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.status in ('published', 'superseded') then
    if new.code is distinct from old.code
       or new.scenario_id is distinct from old.scenario_id
       or new.run_id is distinct from old.run_id
       or new.parent_version_id is distinct from old.parent_version_id
       or new.version_no is distinct from old.version_no
       or new.input_cutoff is distinct from old.input_cutoff
       or new.horizon_start is distinct from old.horizon_start
       or new.horizon_end is distinct from old.horizon_end
       or new.solver is distinct from old.solver
       or new.parameters is distinct from old.parameters
       or new.input_snapshot is distinct from old.input_snapshot then
      raise exception 'Published or superseded plan versions are immutable.' using errcode = '23514';
    end if;
  end if;

  if new.status = 'published' then
    if tg_op = 'INSERT' or new.status is distinct from old.status then
      if current_setting('planning.publish_version_id', true) is distinct from new.id::text then
        raise exception 'Use planning_publish_plan_version to publish a plan version.' using errcode = '42501';
      end if;
      if new.completed_at is null then
        raise exception 'Only a completed plan version can be published.' using errcode = '23514';
      end if;
      perform pg_advisory_xact_lock(hashtextextended(new.account_id::text || ':' || new.scenario_id::text || ':publish', 0));
      perform set_config('planning.system_version_write', 'on', true);
      update public.planning_plan_version
      set status = 'superseded', is_current = false, updated_at = timezone('utc'::text, now())
      where account_id = new.account_id
        and scenario_id = new.scenario_id
        and id <> new.id
        and is_current;
      new.is_current := true;
      new.published_at := coalesce(new.published_at, timezone('utc'::text, now()));
      new.published_by := coalesce(new.published_by, auth.uid());
    elsif new.is_current is distinct from old.is_current
       or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by then
      raise exception 'Published plan version metadata is immutable.' using errcode = '23514';
    end if;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status then
    new.is_current := false;
  end if;

  return new;
end;
$function$;

drop trigger if exists planning_plan_version_guard on public.planning_plan_version;
create trigger planning_plan_version_guard
before insert or update on public.planning_plan_version
for each row execute function public.planning_guard_plan_version();

create or replace function public.planning_publish_plan_version(p_account_id uuid, p_version_id uuid)
returns public.planning_plan_version
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  version_row public.planning_plan_version;
begin
  if auth.uid() is not null and not public.has_account_permission(p_account_id, 'planning.models.manage') then
    raise exception 'Planning manage permission required.' using errcode = '42501';
  end if;
  if auth.uid() is not null and not exists (
    select 1 from basejump.account_user membership
    where membership.account_id = p_account_id and membership.user_id = auth.uid()
  ) then
    raise exception 'Account membership required.' using errcode = '42501';
  end if;

  select * into version_row
  from public.planning_plan_version
  where account_id = p_account_id and id = p_version_id
  for update;
  if not found then
    raise exception 'Plan version not found.' using errcode = 'P0002';
  end if;
  if version_row.status <> 'completed' then
    raise exception 'Only a completed plan version can be published.' using errcode = '23514';
  end if;

  perform set_config('planning.publish_version_id', p_version_id::text, true);
  perform set_config('planning.system_version_write', 'on', true);
  update public.planning_plan_version
  set status = 'published', published_by = coalesce(auth.uid(), published_by)
  where account_id = p_account_id and id = p_version_id
  returning * into version_row;
  perform set_config('planning.publish_version_id', '', true);
  perform set_config('planning.system_version_write', '', true);
  return version_row;
end;
$function$;

revoke all on function public.planning_publish_plan_version(uuid, uuid) from public, anon;
grant execute on function public.planning_publish_plan_version(uuid, uuid) to authenticated, service_role;

create or replace function public.planning_finish_plan_version(
  p_account_id uuid,
  p_version_id uuid,
  p_status text,
  p_result_summary jsonb default '{}'::jsonb
)
returns public.planning_plan_version
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  version_row public.planning_plan_version;
begin
  if p_status not in ('completed', 'failed', 'canceled') then
    raise exception 'Invalid terminal plan version status.' using errcode = '22023';
  end if;
  perform set_config('planning.system_version_write', 'on', true);
  update public.planning_plan_version
  set status = p_status,
      completed_at = timezone('utc'::text, now()),
      result_summary = coalesce(p_result_summary, '{}'::jsonb)
  where account_id = p_account_id and id = p_version_id
  returning * into version_row;
  perform set_config('planning.system_version_write', '', true);
  if version_row.id is null then
    raise exception 'Plan version not found.' using errcode = 'P0002';
  end if;
  return version_row;
end;
$function$;

revoke all on function public.planning_finish_plan_version(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.planning_finish_plan_version(uuid, uuid, text, jsonb) to service_role;

create or replace function public.planning_sync_result_version()
returns trigger
language plpgsql
as $function$
declare
  parent_version_id uuid;
begin
  select plan_version_id into parent_version_id
  from public.planning_operationplan
  where account_id = new.account_id and id = new.operationplan_id;
  if new.plan_version_id is not null and new.plan_version_id is distinct from parent_version_id then
    raise exception 'Plan result detail version must match its plan order.' using errcode = '23514';
  end if;
  new.plan_version_id := parent_version_id;
  return new;
end;
$function$;

drop trigger if exists planning_operationplanresource_version_sync on public.planning_operationplanresource;
create trigger planning_operationplanresource_version_sync
before insert or update of operationplan_id, plan_version_id on public.planning_operationplanresource
for each row execute function public.planning_sync_result_version();

drop trigger if exists planning_operationplanmaterial_version_sync on public.planning_operationplanmaterial;
create trigger planning_operationplanmaterial_version_sync
before insert or update of operationplan_id, plan_version_id on public.planning_operationplanmaterial
for each row execute function public.planning_sync_result_version();

create or replace function public.planning_protect_published_results()
returns trigger
language plpgsql
as $function$
declare
  old_version_id uuid;
  new_version_id uuid;
  parent_version_id uuid;
begin
  if tg_op <> 'INSERT' then
    old_version_id := old.plan_version_id;
  end if;
  if tg_op <> 'DELETE' then
    new_version_id := new.plan_version_id;
    if tg_table_name in ('planning_operationplanmaterial', 'planning_operationplanresource') then
      select plan_version_id into parent_version_id
      from public.planning_operationplan
      where account_id = new.account_id and id = new.operationplan_id;
      new_version_id := coalesce(parent_version_id, new_version_id);
    end if;
  end if;

  if (old_version_id is not null and exists (
    select 1 from public.planning_plan_version version
    where version.account_id = old.account_id
      and version.id = old_version_id
      and version.status in ('published', 'superseded', 'canceled')
  )) or (new_version_id is not null and exists (
    select 1 from public.planning_plan_version version
    where version.account_id = new.account_id
      and version.id = new_version_id
      and version.status in ('published', 'superseded', 'canceled')
  )) then
    raise exception 'Terminal plan results are immutable.' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists planning_operationplan_published_guard on public.planning_operationplan;
create trigger planning_operationplan_published_guard
before insert or update or delete on public.planning_operationplan
for each row execute function public.planning_protect_published_results();

drop trigger if exists planning_problem_published_guard on public.planning_problem;
create trigger planning_problem_published_guard
before insert or update or delete on public.planning_problem
for each row execute function public.planning_protect_published_results();

drop trigger if exists planning_constraint_published_guard on public.planning_constraint;
create trigger planning_constraint_published_guard
before insert or update or delete on public.planning_constraint
for each row execute function public.planning_protect_published_results();

drop trigger if exists planning_resourceplan_published_guard on public.planning_resourceplan;
create trigger planning_resourceplan_published_guard
before insert or update or delete on public.planning_resourceplan
for each row execute function public.planning_protect_published_results();

drop trigger if exists planning_operationplanresource_published_guard on public.planning_operationplanresource;
create trigger planning_operationplanresource_published_guard
before insert or update or delete on public.planning_operationplanresource
for each row execute function public.planning_protect_published_results();

drop trigger if exists planning_operationplanmaterial_published_guard on public.planning_operationplanmaterial;
create trigger planning_operationplanmaterial_published_guard
before insert or update or delete on public.planning_operationplanmaterial
for each row execute function public.planning_protect_published_results();

create or replace function public.planning_sync_sales_order_line(p_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  source_row record;
  mapped_item uuid;
  mapped_customer uuid;
  mapped_location uuid;
  missing_mappings text[] := array[]::text[];
  target_status text;
  target_due timestamptz;
  target_quantity numeric;
  target_demand_id uuid;
  v_sync_status text;
  v_sync_message text;
  snapshot jsonb;
begin
  select orders.account_id, orders.id order_id, orders.doc_no, orders.status order_status,
         orders.approval_status, orders.close_status order_close_status, orders.hold_status,
         orders.customer_code, orders.customer_id, orders.customer_name,
         lines.id line_id, lines.line_no, lines.status line_status, lines.close_status line_close_status,
         lines.item_code, lines.item_id source_item_id, lines.item_name, lines.warehouse_code,
         lines.ordered_qty, lines.open_qty, lines.need_date, lines.promise_date, lines.delivery_date,
         lines.project_code, lines.updated_at line_updated_at
  into source_row
  from public.sales_order_lines lines
  join public.sales_orders orders on orders.id = lines.order_id and orders.account_id = lines.account_id
  where lines.id = p_line_id;
  if not found then
    return jsonb_build_object('status', 'missing', 'sourceLineId', p_line_id);
  end if;

  snapshot := to_jsonb(source_row);
  target_due := coalesce(source_row.need_date, source_row.promise_date, source_row.delivery_date)::timestamptz;
  target_quantity := greatest(coalesce(source_row.open_qty, source_row.ordered_qty, 0), 0);

  select mapping.item_id into mapped_item
  from public.planning_source_mapping mapping
  where mapping.account_id = source_row.account_id and mapping.source_system = 'enlearn'
    and mapping.entity_type = 'item' and mapping.status = 'active'
    and mapping.source_key in (source_row.source_item_id, source_row.item_code)
  order by case when mapping.source_key = source_row.source_item_id then 0 else 1 end limit 1;
  if mapped_item is null then
    select planning_item.id into mapped_item from public.planning_item planning_item
    where planning_item.account_id = source_row.account_id and planning_item.name = source_row.item_code limit 1;
  end if;

  select mapping.customer_id into mapped_customer
  from public.planning_source_mapping mapping
  where mapping.account_id = source_row.account_id and mapping.source_system = 'enlearn'
    and mapping.entity_type = 'customer' and mapping.status = 'active'
    and mapping.source_key in (source_row.customer_id, source_row.customer_code)
  order by case when mapping.source_key = source_row.customer_id then 0 else 1 end limit 1;
  if mapped_customer is null then
    select planning_customer.id into mapped_customer from public.planning_customer planning_customer
    where planning_customer.account_id = source_row.account_id
      and planning_customer.name in (source_row.customer_code, source_row.customer_name)
    order by case when planning_customer.name = source_row.customer_code then 0 else 1 end limit 1;
  end if;

  select mapping.location_id into mapped_location
  from public.planning_source_mapping mapping
  where mapping.account_id = source_row.account_id and mapping.source_system = 'enlearn'
    and mapping.entity_type = 'location' and mapping.status = 'active'
    and mapping.source_key = source_row.warehouse_code limit 1;
  if mapped_location is null then
    select planning_location.id into mapped_location from public.planning_location planning_location
    where planning_location.account_id = source_row.account_id and planning_location.name = source_row.warehouse_code limit 1;
  end if;

  if mapped_item is null then missing_mappings := array_append(missing_mappings, 'item:' || coalesce(source_row.item_code, '(empty)')); end if;
  if mapped_customer is null then missing_mappings := array_append(missing_mappings, 'customer:' || coalesce(source_row.customer_code, source_row.customer_name, '(empty)')); end if;
  if mapped_location is null then missing_mappings := array_append(missing_mappings, 'location:' || coalesce(source_row.warehouse_code, '(empty)')); end if;

  target_status := case
    when lower(coalesce(source_row.order_status, '')) in ('canceled', 'cancelled', 'void', 'rejected') then 'canceled'
    when lower(coalesce(source_row.order_close_status, '')) in ('closed', 'close')
      or lower(coalesce(source_row.line_close_status, '')) in ('closed', 'close')
      or lower(coalesce(source_row.line_status, '')) in ('canceled', 'cancelled', 'closed')
      or target_quantity <= 0 then 'closed'
    else 'open'
  end;

  if target_status in ('closed', 'canceled') and target_demand_id is null then
    select demand.id into target_demand_id
    from public.planning_demand demand
    where demand.account_id = source_row.account_id and demand.source_system = 'enlearn'
      and demand.source_type = 'sales_order_line' and demand.source_key = source_row.line_id::text;
  end if;

  if target_status in ('closed', 'canceled') then
    v_sync_status := 'ignored';
    v_sync_message := case target_status
      when 'canceled' then 'Sales order or line is canceled.'
      else 'Sales order line is closed or has no open quantity.'
    end;
  elsif cardinality(missing_mappings) > 0 then
    v_sync_status := 'error';
    v_sync_message := 'Missing mappings: ' || array_to_string(missing_mappings, ', ');
  elsif target_due is null then
    v_sync_status := 'error';
    v_sync_message := 'Missing demand date.';
  elsif source_row.hold_status then
    v_sync_status := 'ignored';
    v_sync_message := 'Sales order is on hold.';
  elsif lower(coalesce(source_row.approval_status, '')) not in ('approved', 'approve', 'passed') then
    v_sync_status := 'pending';
    v_sync_message := 'Sales order is not approved.';
  else
    v_sync_status := 'synced';
    v_sync_message := null;
  end if;

  if v_sync_status = 'ignored' and target_status = 'open' then
    target_status := 'closed';
  end if;

  if v_sync_status = 'synced' then
    insert into public.planning_demand (
      account_id, name, owner, customer_id, item_id, location_id, due, status, quantity, priority,
      batch, source_type, source_system, source_key, source_order_id, source_line_id,
      source_doc_no, source_line_no, source_updated_at, sync_status, sync_message, source
    ) values (
      source_row.account_id, source_row.doc_no || '-' || source_row.line_no::text, source_row.doc_no,
      mapped_customer, mapped_item, mapped_location, target_due, target_status, target_quantity, 10,
      nullif(source_row.project_code, ''), 'sales_order_line', 'enlearn', source_row.line_id::text,
      source_row.order_id, source_row.line_id, source_row.doc_no, source_row.line_no::text,
      source_row.line_updated_at, 'synced', null, 'sales_order_line:' || source_row.line_id::text
    )
    on conflict (account_id, source_system, source_type, source_key) where source_key is not null
    do update set
      name = excluded.name, owner = excluded.owner, customer_id = excluded.customer_id,
      item_id = excluded.item_id, location_id = excluded.location_id, due = excluded.due,
      status = excluded.status, quantity = excluded.quantity, batch = excluded.batch,
      source_order_id = excluded.source_order_id, source_line_id = excluded.source_line_id,
      source_doc_no = excluded.source_doc_no, source_line_no = excluded.source_line_no,
      source_updated_at = excluded.source_updated_at, sync_status = 'synced', sync_message = null,
      updated_at = timezone('utc'::text, now())
    returning id into target_demand_id;
  else
    select demand.id into target_demand_id
    from public.planning_demand demand
    where demand.account_id = source_row.account_id and demand.source_system = 'enlearn'
      and demand.source_type = 'sales_order_line' and demand.source_key = source_row.line_id::text;
    if target_demand_id is not null then
      update public.planning_demand
      set sync_status = v_sync_status, sync_message = v_sync_message,
          status = case
            when target_status = 'canceled' then 'canceled'
            when v_sync_status = 'ignored' then 'closed'
            when v_sync_status = 'pending' then 'closed'
            else status
          end,
          quantity = case when v_sync_status = 'ignored' then target_quantity else quantity end,
          source_order_id = source_row.order_id, source_line_id = source_row.line_id,
          source_doc_no = source_row.doc_no, source_line_no = source_row.line_no::text,
          source_updated_at = source_row.line_updated_at, updated_at = timezone('utc'::text, now())
      where account_id = source_row.account_id and id = target_demand_id;
    end if;
  end if;

  insert into public.planning_demand_sync_state (
    account_id, source_type, source_system, source_key, source_order_id, source_line_id,
    source_doc_no, source_line_no, demand_id, status, message, source_updated_at, attempted_at, payload
  ) values (
    source_row.account_id, 'sales_order_line', 'enlearn', source_row.line_id::text,
    source_row.order_id, source_row.line_id, source_row.doc_no, source_row.line_no::text,
    target_demand_id, v_sync_status, v_sync_message, source_row.line_updated_at,
    timezone('utc'::text, now()), snapshot
  )
  on conflict (account_id, source_system, source_type, source_key) do update set
    source_order_id = excluded.source_order_id, source_line_id = excluded.source_line_id,
    source_doc_no = excluded.source_doc_no, source_line_no = excluded.source_line_no,
    demand_id = excluded.demand_id, status = excluded.status, message = excluded.message,
    source_updated_at = excluded.source_updated_at, attempted_at = excluded.attempted_at,
    payload = excluded.payload, updated_at = timezone('utc'::text, now());

  return jsonb_build_object('status', v_sync_status, 'message', v_sync_message, 'demandId', target_demand_id, 'sourceLineId', p_line_id);
end;
$function$;

create or replace function public.planning_sync_sales_order_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  row_id uuid;
  deleted_account_id uuid;
  deleted_order_id uuid;
  sync_result jsonb;
begin
  if tg_table_name = 'sales_order_lines' then
    if tg_op = 'DELETE' then
      update public.planning_demand
      set status = 'canceled', quantity = 0, sync_status = 'ignored',
          sync_message = 'Source sales order line was deleted.',
          source_updated_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
      where account_id = old.account_id and source_system = 'enlearn'
        and source_type = 'sales_order_line' and source_line_id = old.id;
      update public.planning_demand_sync_state
      set status = 'ignored', message = 'Source sales order line was deleted.',
          source_updated_at = timezone('utc'::text, now()), attempted_at = timezone('utc'::text, now()),
          payload = payload || jsonb_build_object('deletedAt', timezone('utc'::text, now())),
          updated_at = timezone('utc'::text, now())
      where account_id = old.account_id and source_system = 'enlearn'
        and source_type = 'sales_order_line' and source_line_id = old.id;
      return old;
    end if;
    begin
      sync_result := public.planning_sync_sales_order_line(new.id);
    exception when others then
      insert into public.planning_demand_sync_state (
        account_id, source_type, source_system, source_key, source_order_id, source_line_id,
        source_doc_no, source_line_no, status, message, source_updated_at, attempted_at, payload
      )
      select new.account_id, 'sales_order_line', 'enlearn', new.id::text, new.order_id, new.id,
             orders.doc_no, new.line_no::text, 'error', left(sqlerrm, 4000), new.updated_at,
             timezone('utc'::text, now()), jsonb_build_object('triggerError', sqlerrm)
      from public.sales_orders orders
      where orders.account_id = new.account_id and orders.id = new.order_id
      on conflict (account_id, source_system, source_type, source_key) do update set
        status = 'error', message = excluded.message, attempted_at = excluded.attempted_at,
        payload = excluded.payload, updated_at = timezone('utc'::text, now());
    end;
  else
    deleted_account_id := case when tg_op = 'DELETE' then old.account_id else new.account_id end;
    deleted_order_id := case when tg_op = 'DELETE' then old.id else new.id end;
    if tg_op = 'DELETE' then
      update public.planning_demand
      set status = 'canceled', quantity = 0, sync_status = 'ignored',
          sync_message = 'Source sales order was deleted.',
          source_updated_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
      where account_id = deleted_account_id and source_system = 'enlearn'
        and source_type = 'sales_order_line' and source_order_id = deleted_order_id;
      update public.planning_demand_sync_state
      set status = 'ignored', message = 'Source sales order was deleted.',
          source_updated_at = timezone('utc'::text, now()), attempted_at = timezone('utc'::text, now()),
          payload = payload || jsonb_build_object('deletedAt', timezone('utc'::text, now())),
          updated_at = timezone('utc'::text, now())
      where account_id = deleted_account_id and source_system = 'enlearn'
        and source_type = 'sales_order_line' and source_order_id = deleted_order_id;
      return old;
    end if;
    for row_id in select id from public.sales_order_lines where account_id = new.account_id and order_id = new.id loop
      begin
        sync_result := public.planning_sync_sales_order_line(row_id);
      exception when others then
        insert into public.planning_demand_sync_state (
          account_id, source_type, source_system, source_key, source_order_id, source_line_id,
          source_doc_no, source_line_no, status, message, source_updated_at, attempted_at, payload
        )
        select lines.account_id, 'sales_order_line', 'enlearn', lines.id::text, lines.order_id, lines.id,
               new.doc_no, lines.line_no::text, 'error', left(sqlerrm, 4000), lines.updated_at,
               timezone('utc'::text, now()), jsonb_build_object('triggerError', sqlerrm)
        from public.sales_order_lines lines
        where lines.account_id = new.account_id and lines.id = row_id
        on conflict (account_id, source_system, source_type, source_key) do update set
          status = 'error', message = excluded.message, attempted_at = excluded.attempted_at,
          payload = excluded.payload, updated_at = timezone('utc'::text, now());
      end;
    end loop;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists planning_sales_order_line_sync on public.sales_order_lines;
create trigger planning_sales_order_line_sync
after insert or delete or update of status, close_status, item_id, item_code, item_name, ordered_qty, open_qty,
  need_date, promise_date, delivery_date, warehouse_code, project_code
on public.sales_order_lines
for each row execute function public.planning_sync_sales_order_trigger();

drop trigger if exists planning_sales_order_sync on public.sales_orders;
create trigger planning_sales_order_sync
after delete or update of status, approval_status, close_status, hold_status, customer_id, customer_code, customer_name
on public.sales_orders
for each row execute function public.planning_sync_sales_order_trigger();

create or replace function public.planning_resync_sales_orders(p_account_id uuid, p_line_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  row_id uuid;
  result jsonb;
  synced integer := 0;
  pending integer := 0;
  ignored integer := 0;
  errors integer := 0;
begin
  if auth.uid() is not null and not public.has_account_permission(p_account_id, 'planning.models.manage') then
    raise exception 'Planning manage permission required.' using errcode = '42501';
  end if;
  if auth.uid() is not null and not exists (
    select 1 from basejump.account_user membership
    where membership.account_id = p_account_id and membership.user_id = auth.uid()
  ) then
    raise exception 'Account membership required.' using errcode = '42501';
  end if;
  for row_id in
    select lines.id from public.sales_order_lines lines
    where lines.account_id = p_account_id and (p_line_ids is null or lines.id = any(p_line_ids))
    order by lines.updated_at, lines.id
  loop
    result := public.planning_sync_sales_order_line(row_id);
    case result->>'status'
      when 'synced' then synced := synced + 1;
      when 'pending' then pending := pending + 1;
      when 'ignored' then ignored := ignored + 1;
      else errors := errors + 1;
    end case;
  end loop;
  return jsonb_build_object('synced', synced, 'pending', pending, 'ignored', ignored, 'errors', errors);
end;
$function$;

revoke all on function public.planning_sync_sales_order_line(uuid) from public, anon, authenticated;
grant execute on function public.planning_sync_sales_order_line(uuid) to service_role;
revoke all on function public.planning_resync_sales_orders(uuid, uuid[]) from public, anon;
grant execute on function public.planning_resync_sales_orders(uuid, uuid[]) to authenticated, service_role;

create or replace function public.planning_sync_schedule_to_workflow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  workflow_status text;
  workflow_type text;
  workflow_code text;
  workflow_row public.wf_job%rowtype;
begin
  if to_regclass('public.wf_job') is null then return new; end if;
  workflow_status := case when new.enabled then 'enabled' else 'disabled' end;
  workflow_type := case when new.cron_expr is null then 'manual' else 'cron' end;
  workflow_code := 'planning.' || new.id::text;

  insert into public.wf_job (
    account_id, code, name, type, status, trigger_task_id, schedule_id,
    cron_expr, timezone, payload, retry_policy, created_by, updated_at
  ) values (
    new.account_id, workflow_code, new.name, workflow_type, workflow_status,
    coalesce(nullif(new.trigger_task_id, ''), 'planning.run'), new.schedule_id,
    new.cron_expr, coalesce(new.timezone, 'Asia/Shanghai'),
    coalesce(new.data, '{}'::jsonb) || jsonb_build_object(
      'planningScheduleId', new.id,
      'planningJobType', new.job_type,
      'planningScenarioId', new.scenario_id
    ),
    '{"maxAttempts":3}'::jsonb, new.created_by, timezone('utc'::text, now())
  )
  on conflict (account_id, code) do update set
    name = excluded.name,
    type = excluded.type,
    status = excluded.status,
    trigger_task_id = excluded.trigger_task_id,
    cron_expr = excluded.cron_expr,
    timezone = excluded.timezone,
    payload = excluded.payload,
    updated_at = excluded.updated_at
  returning * into workflow_row;

  new.schedule_id := coalesce(new.schedule_id, workflow_row.schedule_id);
  return new;
end;
$function$;

drop trigger if exists planning_schedule_workflow_bridge on public.planning_schedule;
create trigger planning_schedule_workflow_bridge
before insert or update of name, job_type, scenario_id, cron_expr, timezone, enabled, data, trigger_task_id
on public.planning_schedule
for each row execute function public.planning_sync_schedule_to_workflow();

create or replace function public.planning_sync_workflow_run()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  planning_schedule_id uuid;
  planning_scenario_id uuid;
  planning_status text;
begin
  if new.job_id is null then return new; end if;
  select nullif(job.payload->>'planningScheduleId', '')::uuid,
         nullif(job.payload->>'planningScenarioId', '')::uuid
    into planning_schedule_id, planning_scenario_id
  from public.wf_job job
  where job.id = new.job_id
    and job.account_id = new.account_id;
  if planning_schedule_id is null then return new; end if;

  planning_status := case new.status
    when 'queued' then 'queued'
    when 'running' then 'running'
    when 'succeeded' then 'succeeded'
    when 'failed' then 'failed'
    when 'canceled' then 'canceled'
    else 'running'
  end;

  insert into public.planning_run (
    id, account_id, scenario_id, workflow_job_id, name, submitted, started, finished,
    arguments, status, message, trigger_run_id, progress
  )
  select new.id, new.account_id, planning_scenario_id, planning_schedule_id, job.name, new.created_at,
         new.started_at, new.finished_at, coalesce(new.input, '{}'::jsonb),
         planning_status, new.error_message, new.trigger_run_id,
         case planning_status when 'succeeded' then 100 when 'failed' then 100 when 'canceled' then 100 when 'running' then 50 else 0 end
  from public.wf_job job
  where job.id = new.job_id
  on conflict (id) do update set
    started = excluded.started,
    finished = excluded.finished,
    status = excluded.status,
    message = excluded.message,
    trigger_run_id = excluded.trigger_run_id,
    progress = excluded.progress,
    updated_at = timezone('utc'::text, now());

  if planning_status in ('queued', 'running') and planning_scenario_id is not null then
    perform set_config('planning.system_version_write', 'on', true);
    insert into public.planning_plan_version (
      account_id, code, name, scenario_id, run_id, status, input_cutoff,
      solver, parameters, input_snapshot, started_at
    )
    select new.account_id,
           'RUN-' || upper(left(replace(new.id::text, '-', ''), 12)),
           job.name || ' ' || to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
           planning_scenario_id, new.id,
           case planning_status when 'running' then 'running' else 'draft' end,
           new.created_at,
           coalesce(nullif(job.payload->>'solver', ''), 'external'),
           coalesce(job.payload, '{}'::jsonb),
           jsonb_build_object('workflowInput', coalesce(new.input, '{}'::jsonb)),
           new.started_at
    from public.wf_job job
    where job.id = new.job_id
    on conflict (account_id, run_id) where run_id is not null do update set
      status = excluded.status,
      started_at = coalesce(public.planning_plan_version.started_at, excluded.started_at),
      updated_at = timezone('utc'::text, now());
    perform set_config('planning.system_version_write', '', true);
  elsif planning_status in ('succeeded', 'failed', 'canceled') then
    select id into planning_schedule_id
    from public.planning_plan_version
    where account_id = new.account_id and run_id = new.id;
    if planning_schedule_id is not null then
      perform public.planning_finish_plan_version(
        new.account_id,
        planning_schedule_id,
        case planning_status when 'succeeded' then 'completed' when 'failed' then 'failed' else 'canceled' end,
        coalesce(new.output, '{}'::jsonb)
      );
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists planning_workflow_run_bridge on public.wf_job_run;
create trigger planning_workflow_run_bridge
after insert or update of status, started_at, finished_at, error_message, trigger_run_id
on public.wf_job_run
for each row execute function public.planning_sync_workflow_run();

insert into public.planning_parameter (account_id, name, value, description, source)
select accounts.id, seeded.name, seeded.value, seeded.description, 'frepple-default'
from basejump.accounts accounts
cross join (values
  ('currentdate', 'now', 'Current date of the plan. Use now or a date-time value.'),
  ('last_currentdate', '', 'Date of the last completed plan execution.'),
  ('plan.administrativeLeadtime', '0', 'Administrative lead time in days.'),
  ('plan.minimumdelay', '3600', 'Minimum delivery-date increment in seconds.'),
  ('plan.loglevel', '0', 'Planning log verbosity.'),
  ('plan.rotateResources', 'true', 'Distribute demand across alternate resources.'),
  ('plan.individualPoolResources', 'false', 'Interpret pool quantities as individual members.'),
  ('plan.move_approved_early', '0', 'Controls early rescheduling of approved orders.'),
  ('plan.autoFenceOperations', '999', 'Days to wait for confirmed replenishment.'),
  ('plan.deliveryDuration', '0', 'Final shipment duration in working hours.'),
  ('plan.fixBrokenSupplyPath', 'true', 'Create fallback sourcing for broken supply paths.'),
  ('plan.solver', 'heuristic', 'Solver selection: heuristic or heuristic_2.'),
  ('plan.iterationmax', '0', 'Maximum solver iterations.'),
  ('plan.resourceiterationmax', '500', 'Maximum resource-search iterations.'),
  ('forecast.calendar', 'month', 'Forecast bucket calendar.'),
  ('forecast.Horizon_future', '365', 'Forecast future horizon in days.'),
  ('forecast.Horizon_history', '1095', 'Forecast history horizon in days.'),
  ('forecast.populateForecastTable', 'true', 'Populate missing forecast combinations.'),
  ('forecast.runnetting', 'true', 'Net sales orders against forecast.')
) seeded(name, value, description)
where accounts.status = 'active'
on conflict (account_id, name) do nothing;

insert into public.planning_measure (
  account_id, name, label, type, mode_future, mode_past, formatter, defaultvalue, source
)
select accounts.id, seeded.name, seeded.label, seeded.type, seeded.mode_future,
       seeded.mode_past, seeded.formatter, seeded.defaultvalue, 'frepple-default'
from basejump.accounts accounts
cross join (values
  ('forecastbaseline', 'forecast baseline', 'aggregate', 'view', 'hide', 'number', 0),
  ('forecastoverride', 'forecast override', 'aggregate', 'edit', 'view', 'number', -1),
  ('forecasttotal', 'total forecast', 'computed', 'view', 'view', 'number', 0),
  ('forecastconsumed', 'forecast consumed', 'aggregate', 'view', 'hide', 'number', 0),
  ('forecastnet', 'forecast net', 'aggregate', 'view', 'hide', 'number', 0),
  ('orderstotal', 'total orders', 'aggregate', 'view', 'view', 'number', 0),
  ('ordersadjustment', 'orders adjustment', 'aggregate', 'hide', 'edit', 'number', 0),
  ('ordersopen', 'open orders', 'aggregate', 'view', 'view', 'number', 0),
  ('ordersplanned', 'planned orders', 'aggregate', 'view', 'hide', 'number', 0),
  ('forecastplanned', 'planned forecast', 'aggregate', 'view', 'hide', 'number', 0)
) seeded(name, label, type, mode_future, mode_past, formatter, defaultvalue)
where accounts.status = 'active'
on conflict (account_id, name) do nothing;

insert into public.planning_scenario (account_id, name, description, status, info, source)
select accounts.id, 'baseline', 'Production baseline scenario', 'in use', '{}'::jsonb, 'enlearn-default'
from basejump.accounts accounts
where accounts.status = 'active'
on conflict (account_id, name) do nothing;

select public.register_dynamic_crud_resource(
  'planning_parameter',
  'planning_parameter',
  encode(digest(convert_to('{"resource_name":"planning_parameter","resources":{"planning_parameter":{"code":"planning_parameter","table_name":"planning_parameter","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","value","description","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","value","description","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","value","description","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","value","description","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_parameter","resources":{"planning_parameter":{"code":"planning_parameter","table_name":"planning_parameter","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","value","description","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","value","description","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","value","description","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","value","description","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_forecast',
  'planning_forecast',
  encode(digest(convert_to('{"resource_name":"planning_forecast","resources":{"planning_forecast":{"code":"planning_forecast","table_name":"planning_forecast","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","description","category","subcategory","customer_id","item_id","location_id","batch","method","priority","minshipment","maxlateness","discrete","planned","operation_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","description","category","subcategory","customer_id","item_id","location_id","batch","method","priority","minshipment","maxlateness","discrete","planned","operation_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name","customer_id","item_id","location_id","priority"],"timestamp":true},"update":{"allowed_fields":["name","description","category","subcategory","customer_id","item_id","location_id","batch","method","priority","minshipment","maxlateness","discrete","planned","operation_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","description","category","subcategory","customer_id","item_id","location_id","batch","method","priority","minshipment","maxlateness","discrete","planned","operation_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_forecast","resources":{"planning_forecast":{"code":"planning_forecast","table_name":"planning_forecast","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","description","category","subcategory","customer_id","item_id","location_id","batch","method","priority","minshipment","maxlateness","discrete","planned","operation_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","description","category","subcategory","customer_id","item_id","location_id","batch","method","priority","minshipment","maxlateness","discrete","planned","operation_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name","customer_id","item_id","location_id","priority"],"timestamp":true},"update":{"allowed_fields":["name","description","category","subcategory","customer_id","item_id","location_id","batch","method","priority","minshipment","maxlateness","discrete","planned","operation_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","description","category","subcategory","customer_id","item_id","location_id","batch","method","priority","minshipment","maxlateness","discrete","planned","operation_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_measure',
  'planning_measure',
  encode(digest(convert_to('{"resource_name":"planning_measure","resources":{"planning_measure":{"code":"planning_measure","table_name":"planning_measure","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","label","description","type","mode_future","mode_past","compute_expression","update_expression","initially_hidden","formatter","discrete","defaultvalue","overrides","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","label","description","type","mode_future","mode_past","compute_expression","update_expression","initially_hidden","formatter","discrete","defaultvalue","overrides","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","label","description","type","mode_future","mode_past","compute_expression","update_expression","initially_hidden","formatter","discrete","defaultvalue","overrides","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","label","description","type","mode_future","mode_past","compute_expression","update_expression","initially_hidden","formatter","discrete","defaultvalue","overrides","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_measure","resources":{"planning_measure":{"code":"planning_measure","table_name":"planning_measure","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","label","description","type","mode_future","mode_past","compute_expression","update_expression","initially_hidden","formatter","discrete","defaultvalue","overrides","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","label","description","type","mode_future","mode_past","compute_expression","update_expression","initially_hidden","formatter","discrete","defaultvalue","overrides","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","label","description","type","mode_future","mode_past","compute_expression","update_expression","initially_hidden","formatter","discrete","defaultvalue","overrides","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","label","description","type","mode_future","mode_past","compute_expression","update_expression","initially_hidden","formatter","discrete","defaultvalue","overrides","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_forecastplan',
  'planning_forecastplan',
  encode(digest(convert_to('{"resource_name":"planning_forecastplan","resources":{"planning_forecastplan":{"code":"planning_forecastplan","table_name":"planning_forecastplan","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["forecast_id","item_id","location_id","customer_id","startdate","enddate","value","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["forecast_id","item_id","location_id","customer_id","startdate","enddate","value"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["item_id","location_id","customer_id","startdate","enddate","value"],"timestamp":true},"update":{"allowed_fields":["forecast_id","item_id","location_id","customer_id","startdate","enddate","value","account_id","updated_at","updated_by"],"input_allowed_fields":["forecast_id","item_id","location_id","customer_id","startdate","enddate","value"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_forecastplan","resources":{"planning_forecastplan":{"code":"planning_forecastplan","table_name":"planning_forecastplan","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["forecast_id","item_id","location_id","customer_id","startdate","enddate","value","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["forecast_id","item_id","location_id","customer_id","startdate","enddate","value"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["item_id","location_id","customer_id","startdate","enddate","value"],"timestamp":true},"update":{"allowed_fields":["forecast_id","item_id","location_id","customer_id","startdate","enddate","value","account_id","updated_at","updated_by"],"input_allowed_fields":["forecast_id","item_id","location_id","customer_id","startdate","enddate","value"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_problem',
  'planning_problem',
  encode(digest(convert_to('{"resource_name":"planning_problem","resources":{"planning_problem":{"code":"planning_problem","table_name":"planning_problem","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_problem","resources":{"planning_problem":{"code":"planning_problem","table_name":"planning_problem","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_constraint',
  'planning_constraint',
  encode(digest(convert_to('{"resource_name":"planning_constraint","resources":{"planning_constraint":{"code":"planning_constraint","table_name":"planning_constraint","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_constraint","resources":{"planning_constraint":{"code":"planning_constraint","table_name":"planning_constraint","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_resourceplan',
  'planning_resourceplan',
  encode(digest(convert_to('{"resource_name":"planning_resourceplan","resources":{"planning_resourceplan":{"code":"planning_resourceplan","table_name":"planning_resourceplan","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_resourceplan","resources":{"planning_resourceplan":{"code":"planning_resourceplan","table_name":"planning_resourceplan","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_run',
  'planning_run',
  encode(digest(convert_to('{"resource_name":"planning_run","resources":{"planning_run":{"code":"planning_run","table_name":"planning_run","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_run","resources":{"planning_run":{"code":"planning_run","table_name":"planning_run","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_schedule',
  'planning_schedule',
  encode(digest(convert_to('{"resource_name":"planning_schedule","resources":{"planning_schedule":{"code":"planning_schedule","table_name":"planning_schedule","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","job_type","scenario_id","next_run","timezone","cron_expr","enabled","email_failure","email_success","data","trigger_task_id","schedule_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","job_type","scenario_id","next_run","timezone","cron_expr","enabled","email_failure","email_success","data","trigger_task_id","schedule_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name","job_type"],"timestamp":true},"update":{"allowed_fields":["name","job_type","scenario_id","next_run","timezone","cron_expr","enabled","email_failure","email_success","data","trigger_task_id","schedule_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","job_type","scenario_id","next_run","timezone","cron_expr","enabled","email_failure","email_success","data","trigger_task_id","schedule_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_schedule","resources":{"planning_schedule":{"code":"planning_schedule","table_name":"planning_schedule","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","job_type","scenario_id","next_run","timezone","cron_expr","enabled","email_failure","email_success","data","trigger_task_id","schedule_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","job_type","scenario_id","next_run","timezone","cron_expr","enabled","email_failure","email_success","data","trigger_task_id","schedule_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name","job_type"],"timestamp":true},"update":{"allowed_fields":["name","job_type","scenario_id","next_run","timezone","cron_expr","enabled","email_failure","email_success","data","trigger_task_id","schedule_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","job_type","scenario_id","next_run","timezone","cron_expr","enabled","email_failure","email_success","data","trigger_task_id","schedule_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_export',
  'planning_export',
  encode(digest(convert_to('{"resource_name":"planning_export","resources":{"planning_export":{"code":"planning_export","table_name":"planning_export","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","sql","report","arguments","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","sql","report","arguments","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","sql","report","arguments","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","sql","report","arguments","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_export","resources":{"planning_export":{"code":"planning_export","table_name":"planning_export","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","sql","report","arguments","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","sql","report","arguments","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name"],"timestamp":true},"update":{"allowed_fields":["name","sql","report","arguments","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","sql","report","arguments","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_scenario',
  'planning_scenario',
  encode(digest(convert_to('{"resource_name":"planning_scenario","resources":{"planning_scenario":{"code":"planning_scenario","table_name":"planning_scenario","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","description","status","source_scenario_id","help_url","info","copied_at","released_at","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","description","status","source_scenario_id","help_url","info","copied_at","released_at","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name","status"],"timestamp":true},"update":{"allowed_fields":["name","description","status","source_scenario_id","help_url","info","copied_at","released_at","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","description","status","source_scenario_id","help_url","info","copied_at","released_at","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_scenario","resources":{"planning_scenario":{"code":"planning_scenario","table_name":"planning_scenario","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","description","status","source_scenario_id","help_url","info","copied_at","released_at","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","description","status","source_scenario_id","help_url","info","copied_at","released_at","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name","status"],"timestamp":true},"update":{"allowed_fields":["name","description","status","source_scenario_id","help_url","info","copied_at","released_at","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","description","status","source_scenario_id","help_url","info","copied_at","released_at","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_bucket',
  'planning_bucket',
  encode(digest(convert_to('{"resource_name":"planning_bucket","resources":{"planning_bucket":{"code":"planning_bucket","table_name":"planning_bucket","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","description","level","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","description","level","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name","level"],"timestamp":true},"update":{"allowed_fields":["name","description","level","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","description","level","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_bucket","resources":{"planning_bucket":{"code":"planning_bucket","table_name":"planning_bucket","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["name","description","level","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["name","description","level","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["name","level"],"timestamp":true},"update":{"allowed_fields":["name","description","level","source","account_id","updated_at","updated_by"],"input_allowed_fields":["name","description","level","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_bucketdetail',
  'planning_bucketdetail',
  encode(digest(convert_to('{"resource_name":"planning_bucketdetail","resources":{"planning_bucketdetail":{"code":"planning_bucketdetail","table_name":"planning_bucketdetail","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["bucket_id","name","startdate","enddate","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["bucket_id","name","startdate","enddate","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["bucket_id","name","startdate","enddate"],"timestamp":true},"update":{"allowed_fields":["bucket_id","name","startdate","enddate","source","account_id","updated_at","updated_by"],"input_allowed_fields":["bucket_id","name","startdate","enddate","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_bucketdetail","resources":{"planning_bucketdetail":{"code":"planning_bucketdetail","table_name":"planning_bucketdetail","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["bucket_id","name","startdate","enddate","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["bucket_id","name","startdate","enddate","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["bucket_id","name","startdate","enddate"],"timestamp":true},"update":{"allowed_fields":["bucket_id","name","startdate","enddate","source","account_id","updated_at","updated_by"],"input_allowed_fields":["bucket_id","name","startdate","enddate","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_attribute',
  'planning_attribute',
  encode(digest(convert_to('{"resource_name":"planning_attribute","resources":{"planning_attribute":{"code":"planning_attribute","table_name":"planning_attribute","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["model","name","label","type","editable","initially_hidden","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["model","name","label","type","editable","initially_hidden","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["model","name","label","type"],"timestamp":true},"update":{"allowed_fields":["model","name","label","type","editable","initially_hidden","source","account_id","updated_at","updated_by"],"input_allowed_fields":["model","name","label","type","editable","initially_hidden","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_attribute","resources":{"planning_attribute":{"code":"planning_attribute","table_name":"planning_attribute","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["model","name","label","type","editable","initially_hidden","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["model","name","label","type","editable","initially_hidden","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["model","name","label","type"],"timestamp":true},"update":{"allowed_fields":["model","name","label","type","editable","initially_hidden","source","account_id","updated_at","updated_by"],"input_allowed_fields":["model","name","label","type","editable","initially_hidden","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_archive_manager',
  'planning_archive_manager',
  encode(digest(convert_to('{"resource_name":"planning_archive_manager","resources":{"planning_archive_manager":{"code":"planning_archive_manager","table_name":"planning_archive_manager","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_archive_manager","resources":{"planning_archive_manager":{"code":"planning_archive_manager","table_name":"planning_archive_manager","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_archived_buffer',
  'planning_archived_buffer',
  encode(digest(convert_to('{"resource_name":"planning_archived_buffer","resources":{"planning_archived_buffer":{"code":"planning_archived_buffer","table_name":"planning_archived_buffer","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_archived_buffer","resources":{"planning_archived_buffer":{"code":"planning_archived_buffer","table_name":"planning_archived_buffer","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_archived_demand',
  'planning_archived_demand',
  encode(digest(convert_to('{"resource_name":"planning_archived_demand","resources":{"planning_archived_demand":{"code":"planning_archived_demand","table_name":"planning_archived_demand","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_archived_demand","resources":{"planning_archived_demand":{"code":"planning_archived_demand","table_name":"planning_archived_demand","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_archived_operationplan',
  'planning_archived_operationplan',
  encode(digest(convert_to('{"resource_name":"planning_archived_operationplan","resources":{"planning_archived_operationplan":{"code":"planning_archived_operationplan","table_name":"planning_archived_operationplan","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_archived_operationplan","resources":{"planning_archived_operationplan":{"code":"planning_archived_operationplan","table_name":"planning_archived_operationplan","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_source_mapping',
  'planning_source_mapping',
  encode(digest(convert_to('{"resource_name":"planning_source_mapping","resources":{"planning_source_mapping":{"code":"planning_source_mapping","table_name":"planning_source_mapping","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["source_system","entity_type","source_key","source_name","item_id","customer_id","location_id","supplier_id","resource_id","operation_id","status","metadata","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["source_system","entity_type","source_key","source_name","item_id","customer_id","location_id","supplier_id","resource_id","operation_id","status","metadata","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["source_system","entity_type","source_key","status"],"timestamp":true},"update":{"allowed_fields":["source_system","entity_type","source_key","source_name","item_id","customer_id","location_id","supplier_id","resource_id","operation_id","status","metadata","source","account_id","updated_at","updated_by"],"input_allowed_fields":["source_system","entity_type","source_key","source_name","item_id","customer_id","location_id","supplier_id","resource_id","operation_id","status","metadata","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_source_mapping","resources":{"planning_source_mapping":{"code":"planning_source_mapping","table_name":"planning_source_mapping","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["source_system","entity_type","source_key","source_name","item_id","customer_id","location_id","supplier_id","resource_id","operation_id","status","metadata","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["source_system","entity_type","source_key","source_name","item_id","customer_id","location_id","supplier_id","resource_id","operation_id","status","metadata","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["source_system","entity_type","source_key","status"],"timestamp":true},"update":{"allowed_fields":["source_system","entity_type","source_key","source_name","item_id","customer_id","location_id","supplier_id","resource_id","operation_id","status","metadata","source","account_id","updated_at","updated_by"],"input_allowed_fields":["source_system","entity_type","source_key","source_name","item_id","customer_id","location_id","supplier_id","resource_id","operation_id","status","metadata","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_plan_version',
  'planning_plan_version',
  encode(digest(convert_to('{"resource_name":"planning_plan_version","resources":{"planning_plan_version":{"code":"planning_plan_version","table_name":"planning_plan_version","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["code","name","scenario_id","parent_version_id","input_cutoff","horizon_start","horizon_end","solver","parameters","input_snapshot","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["code","name","scenario_id","parent_version_id","input_cutoff","horizon_start","horizon_end","solver","parameters","input_snapshot","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["code","name","scenario_id"],"timestamp":true},"update":{"allowed_fields":["code","name","scenario_id","parent_version_id","input_cutoff","horizon_start","horizon_end","solver","parameters","input_snapshot","source","account_id","updated_at","updated_by"],"input_allowed_fields":["code","name","scenario_id","parent_version_id","input_cutoff","horizon_start","horizon_end","solver","parameters","input_snapshot","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_plan_version","resources":{"planning_plan_version":{"code":"planning_plan_version","table_name":"planning_plan_version","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["code","name","scenario_id","parent_version_id","input_cutoff","horizon_start","horizon_end","solver","parameters","input_snapshot","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["code","name","scenario_id","parent_version_id","input_cutoff","horizon_start","horizon_end","solver","parameters","input_snapshot","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["code","name","scenario_id"],"timestamp":true},"update":{"allowed_fields":["code","name","scenario_id","parent_version_id","input_cutoff","horizon_start","horizon_end","solver","parameters","input_snapshot","source","account_id","updated_at","updated_by"],"input_allowed_fields":["code","name","scenario_id","parent_version_id","input_cutoff","horizon_start","horizon_end","solver","parameters","input_snapshot","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_demand_sync_state',
  'planning_demand_sync_state',
  encode(digest(convert_to('{"resource_name":"planning_demand_sync_state","resources":{"planning_demand_sync_state":{"code":"planning_demand_sync_state","table_name":"planning_demand_sync_state","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_demand_sync_state","resources":{"planning_demand_sync_state":{"code":"planning_demand_sync_state","table_name":"planning_demand_sync_state","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}'::jsonb
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
  encode(digest(convert_to('{"resource_name":"planning_operationplan","resources":{"planning_operationplan":{"code":"planning_operationplan","table_name":"planning_operationplan","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","plan_version_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","plan_version_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["reference","type","quantity"],"timestamp":true},"update":{"allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","plan_version_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","plan_version_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_operationplan","resources":{"planning_operationplan":{"code":"planning_operationplan","table_name":"planning_operationplan","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":{"allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","plan_version_id","source","account_id","created_at","updated_at","created_by","updated_by"],"input_allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","plan_version_id","source"],"managed_fields":["account_id","created_at","updated_at","created_by","updated_by"],"hook_input_fields":[],"required_fields":["reference","type","quantity"],"timestamp":true},"update":{"allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","plan_version_id","source","account_id","updated_at","updated_by"],"input_allowed_fields":["reference","status","type","quantity","quantity_completed","color","startdate","enddate","remark","operation_id","owner_id","batch","item_id","origin_id","destination_id","supplier_id","location_id","demand_id","due","name","forecast","plan_version_id","source"],"managed_fields":["account_id","updated_at","updated_by"],"hook_input_fields":[],"required_fields":[],"timestamp":true},"delete":{"allowed_fields":[],"input_allowed_fields":[],"managed_fields":[],"hook_input_fields":[],"required_fields":[],"timestamp":false,"soft_delete":false,"deleted_at_field":"deleted_at","status_field":null,"deleted_status":null,"deleted_by_field":null}}},"detail_relations":{},"after_save_relations":{}}'::jsonb
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

select public.register_dynamic_crud_resource(
  'planning_problem',
  'planning_problem',
  encode(digest(convert_to('{"resource_name":"planning_problem","resources":{"planning_problem":{"code":"planning_problem","table_name":"planning_problem","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_problem","resources":{"planning_problem":{"code":"planning_problem","table_name":"planning_problem","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_constraint',
  'planning_constraint',
  encode(digest(convert_to('{"resource_name":"planning_constraint","resources":{"planning_constraint":{"code":"planning_constraint","table_name":"planning_constraint","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_constraint","resources":{"planning_constraint":{"code":"planning_constraint","table_name":"planning_constraint","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

select public.register_dynamic_crud_resource(
  'planning_resourceplan',
  'planning_resourceplan',
  encode(digest(convert_to('{"resource_name":"planning_resourceplan","resources":{"planning_resourceplan":{"code":"planning_resourceplan","table_name":"planning_resourceplan","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}', 'UTF8'), 'sha256'), 'hex'),
  '{"resource_name":"planning_resourceplan","resources":{"planning_resourceplan":{"code":"planning_resourceplan","table_name":"planning_resourceplan","primary_key":"id","owner_field":null,"account_field":"account_id","client_mode":"user","hooks":{},"create":null,"update":null,"delete":null}},"detail_relations":{},"after_save_relations":{}}'::jsonb
);

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive, schema, version, published_at
) values
  ('planning_demand-list', '/dashboard/planning/demand', '需求', '待交付的客户需求和计划结果。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_demand-list","route":"/dashboard/planning/demand","title":"需求","description":"待交付的客户需求和计划结果。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_demandRows":{"key":"planning_demandRows","label":"需求数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_demand","postData":{"resource":"planning_demand","tableName":"planning_demand","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"客户选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"交付工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_demand-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/demand/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_demandRows"]}]}]},{"id":"planning_demand-search","kind":"searchForm","targetSourceKey":"planning_demandRows","schema":{"columns":4,"fields":[{"field":"name","label":"需求编号","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}},{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"inquiry","value":"inquiry"},{"label":"quote","value":"quote"},{"label":"open","value":"open"},{"label":"closed","value":"closed"},{"label":"canceled","value":"canceled"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_demand-grid","kind":"grid","title":"需求列表","sourceKey":"planning_demandRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"需求编号","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"customer_id_label","title":"客户","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item_id_label","title":"物料","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"due","title":"交期","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"quantity","title":"数量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"priority","title":"优先级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"owner","title":"上级需求","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_demand-edit', '/dashboard/planning/demand/edit', '需求编辑', '待交付的客户需求和计划结果。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_demand-edit","route":"/dashboard/planning/demand/edit","title":"需求编辑","description":"待交付的客户需求和计划结果。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_demandRows":{"key":"planning_demandRows","label":"需求数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_demand","postData":{"resource":"planning_demand","tableName":"planning_demand","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"客户选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"交付工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_demand-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/demand"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_demandRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_demandRows","serviceMethod":"saveItem","postData":{"resource":"planning_demand","id":"{{ forms.planning_demand_edit_form.id }}","data":{"name":"{{ forms.planning_demand_edit_form.name }}","owner":"{{ forms.planning_demand_edit_form.owner }}","description":"{{ forms.planning_demand_edit_form.description }}","category":"{{ forms.planning_demand_edit_form.category }}","subcategory":"{{ forms.planning_demand_edit_form.subcategory }}","customer_id":"{{ forms.planning_demand_edit_form.customer_id }}","item_id":"{{ forms.planning_demand_edit_form.item_id }}","location_id":"{{ forms.planning_demand_edit_form.location_id }}","due":"{{ forms.planning_demand_edit_form.due }}","status":"{{ forms.planning_demand_edit_form.status }}","operation_id":"{{ forms.planning_demand_edit_form.operation_id }}","quantity":"{{ forms.planning_demand_edit_form.quantity }}","priority":"{{ forms.planning_demand_edit_form.priority }}","minshipment":"{{ forms.planning_demand_edit_form.minshipment }}","maxlateness":"{{ forms.planning_demand_edit_form.maxlateness }}","policy":"{{ forms.planning_demand_edit_form.policy }}","batch":"{{ forms.planning_demand_edit_form.batch }}","source":"{{ forms.planning_demand_edit_form.source }}"}},"assignTo":"planning_demandSaved"},{"type":"navigate","route":"/dashboard/planning/demand/edit?id={{ data.planning_demandSaved.id }}&fromPage=planning_demand-list"},{"type":"showMessage","status":"success","message":"需求已保存。"}]}]},{"id":"planning_demand-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_demand_edit_form","kind":"form","title":"需求信息","sourceKey":"planning_demandRows","submitSourceKey":"planning_demandRows","initialValues":{"id":"","name":"","owner":"","description":"","category":"","subcategory":"","customer_id":"","item_id":"","location_id":"","due":"","status":"open","operation_id":"","quantity":"","priority":10,"minshipment":"","maxlateness":"","policy":"independent","batch":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"需求编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入需求编号"},"rules":[{"required":true,"message":"请输入需求编号"}]},{"field":"owner","label":"上级需求","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入上级需求"}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类"}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类"}},{"field":"customer_id","label":"客户","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择客户","filterable":true},"optionsSourceKey":"planning_customerOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入客户"}]},{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入地点"}]},{"field":"due","label":"交期","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入交期"},"rules":[{"required":true,"message":"请输入交期"}]},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态"},"options":[{"label":"inquiry","value":"inquiry"},{"label":"quote","value":"quote"},{"label":"open","value":"open"},{"label":"closed","value":"closed"},{"label":"canceled","value":"canceled"}]},{"field":"operation_id","label":"交付工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择交付工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"}},{"field":"quantity","label":"数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数量","type":"number"},"rules":[{"required":true,"message":"请输入数量"}]},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"},"rules":[{"required":true,"message":"请输入优先级"}]},{"field":"minshipment","label":"最小发运量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最小发运量","type":"number"}},{"field":"maxlateness","label":"最大延期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最大延期"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"policy","label":"计划策略","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入计划策略"},"options":[{"label":"independent","value":"independent"},{"label":"alltogether","value":"alltogether"},{"label":"inratio","value":"inratio"}]},{"field":"batch","label":"批次","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入批次"}},{"field":"delay","label":"延期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入延期","disabled":true},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"plannedquantity","label":"已计划量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入已计划量","type":"number","disabled":true}},{"field":"deliverydate","label":"计划交期","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入计划交期","disabled":true}},{"field":"plan","label":"计划明细","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入计划明细","disabled":true}},{"field":"source_type","label":"来源类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入来源类型","disabled":true},"options":[{"label":"manual","value":"manual"},{"label":"sales_order_line","value":"sales_order_line"},{"label":"forecast","value":"forecast"},{"label":"external","value":"external"}]},{"field":"source_system","label":"来源系统","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源系统","disabled":true}},{"field":"source_key","label":"来源唯一键","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源唯一键","disabled":true}},{"field":"source_order_id","label":"来源订单编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源订单编号","disabled":true}},{"field":"source_line_id","label":"来源明细编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源明细编号","disabled":true}},{"field":"source_doc_no","label":"来源单号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源单号","disabled":true}},{"field":"source_line_no","label":"来源行号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源行号","disabled":true}},{"field":"source_updated_at","label":"来源更新时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入来源更新时间","disabled":true}},{"field":"sync_status","label":"同步状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入同步状态","disabled":true},"options":[{"label":"manual","value":"manual"},{"label":"pending","value":"pending"},{"label":"synced","value":"synced"},{"label":"ignored","value":"ignored"},{"label":"error","value":"error"}]},{"field":"sync_message","label":"同步消息","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入同步消息","disabled":true}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
  'id', 'active', 320, '{"sourceTable":"demand","freppleModel":"demand","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"需求编号","kind":"text","required":true},{"name":"owner","label":"上级需求","kind":"text"},{"name":"description","label":"说明","kind":"text"},{"name":"category","label":"分类","kind":"text"},{"name":"subcategory","label":"子分类","kind":"text"},{"name":"customer_id","label":"客户","kind":"relation","relation":"planning_customer","required":true},{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item","required":true},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location","required":true},{"name":"due","label":"交期","kind":"datetime","required":true},{"name":"status","label":"状态","kind":"text","default":"open","options":[{"label":"inquiry","value":"inquiry"},{"label":"quote","value":"quote"},{"label":"open","value":"open"},{"label":"closed","value":"closed"},{"label":"canceled","value":"canceled"}]},{"name":"operation_id","label":"交付工序","kind":"relation","relation":"planning_operation"},{"name":"quantity","label":"数量","kind":"number","required":true},{"name":"priority","label":"优先级","kind":"integer","required":true,"default":10},{"name":"minshipment","label":"最小发运量","kind":"number"},{"name":"maxlateness","label":"最大延期","kind":"interval"},{"name":"policy","label":"计划策略","kind":"text","default":"independent","options":[{"label":"independent","value":"independent"},{"label":"alltogether","value":"alltogether"},{"label":"inratio","value":"inratio"}]},{"name":"batch","label":"批次","kind":"text"},{"name":"delay","label":"延期","kind":"interval","readOnly":true},{"name":"plannedquantity","label":"已计划量","kind":"number","readOnly":true},{"name":"deliverydate","label":"计划交期","kind":"datetime","readOnly":true},{"name":"plan","label":"计划明细","kind":"json","readOnly":true,"default":{}},{"name":"source_type","label":"来源类型","kind":"text","readOnly":true,"default":"manual","options":[{"label":"manual","value":"manual"},{"label":"sales_order_line","value":"sales_order_line"},{"label":"forecast","value":"forecast"},{"label":"external","value":"external"}]},{"name":"source_system","label":"来源系统","kind":"text","readOnly":true,"default":"enlearn"},{"name":"source_key","label":"来源唯一键","kind":"text","readOnly":true},{"name":"source_order_id","label":"来源订单编号","kind":"uuid","readOnly":true},{"name":"source_line_id","label":"来源明细编号","kind":"uuid","readOnly":true},{"name":"source_doc_no","label":"来源单号","kind":"text","readOnly":true},{"name":"source_line_no","label":"来源行号","kind":"text","readOnly":true},{"name":"source_updated_at","label":"来源更新时间","kind":"datetime","readOnly":true},{"name":"sync_status","label":"同步状态","kind":"text","readOnly":true,"default":"manual","options":[{"label":"manual","value":"manual"},{"label":"pending","value":"pending"},{"label":"synced","value":"synced"},{"label":"ignored","value":"ignored"},{"label":"error","value":"error"}]},{"name":"sync_message","label":"同步消息","kind":"text","readOnly":true},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_operationplan-list', '/dashboard/planning/operationplan', '计划订单', '制造、采购、配送、交付和库存计划订单。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_operationplan-list","route":"/dashboard/planning/operationplan","title":"计划订单","description":"制造、采购、配送、交付和库存计划订单。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_operationplanRows":{"key":"planning_operationplanRows","label":"计划订单数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationplan","postData":{"resource":"planning_operationplan","tableName":"planning_operationplan","limit":300,"orderBy":"reference","orderDirection":"asc"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true},"planning_operationplanOptions":{"key":"planning_operationplanOptions","label":"上级计划单选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operationplan","labelField":"reference"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"来源地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_supplierOptions":{"key":"planning_supplierOptions","label":"供应商选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_supplier","labelField":"name"},"autoLoad":true},"planning_demandOptions":{"key":"planning_demandOptions","label":"需求选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_demand","labelField":"name"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"计划版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true}},"blocks":[{"id":"planning_operationplan-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/operationplan/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationplanRows"]}]}]},{"id":"planning_operationplan-search","kind":"searchForm","targetSourceKey":"planning_operationplanRows","schema":{"columns":4,"fields":[{"field":"reference","label":"计划单号","component":"vxe-input","props":{"clearable":true}},{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"proposed","value":"proposed"},{"label":"approved","value":"approved"},{"label":"confirmed","value":"confirmed"},{"label":"completed","value":"completed"},{"label":"closed","value":"closed"}],"props":{"clearable":true}},{"field":"type","label":"订单类型","component":"vxe-select","options":[{"label":"STCK","value":"STCK"},{"label":"MO","value":"MO"},{"label":"WO","value":"WO"},{"label":"PO","value":"PO"},{"label":"DO","value":"DO"},{"label":"DLVR","value":"DLVR"}],"props":{"clearable":true}},{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_operationplan-grid","kind":"grid","title":"计划订单列表","sourceKey":"planning_operationplanRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"reference","title":"计划单号","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"type","title":"订单类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"STCK":"STCK","MO":"MO","WO":"WO","PO":"PO","DO":"DO","DLVR":"DLVR"},"emptyText":"-"}},{"field":"quantity","title":"数量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"status","title":"状态","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"proposed":"proposed","approved":"approved","confirmed":"confirmed","completed":"completed","closed":"closed"},"emptyText":"-"}},{"field":"quantity_completed","title":"完成数量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"color","title":"颜色值","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"startdate","title":"开始时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"enddate","title":"结束时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"remark","title":"备注","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_operationplan-edit', '/dashboard/planning/operationplan/edit', '计划订单编辑', '制造、采购、配送、交付和库存计划订单。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_operationplan-edit","route":"/dashboard/planning/operationplan/edit","title":"计划订单编辑","description":"制造、采购、配送、交付和库存计划订单。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_operationplanRows":{"key":"planning_operationplanRows","label":"计划订单数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationplan","postData":{"resource":"planning_operationplan","tableName":"planning_operationplan","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true},"planning_operationplanOptions":{"key":"planning_operationplanOptions","label":"上级计划单选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operationplan","labelField":"reference"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"来源地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_supplierOptions":{"key":"planning_supplierOptions","label":"供应商选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_supplier","labelField":"name"},"autoLoad":true},"planning_demandOptions":{"key":"planning_demandOptions","label":"需求选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_demand","labelField":"name"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"计划版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true}},"blocks":[{"id":"planning_operationplan-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/operationplan"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationplanRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_operationplanRows","serviceMethod":"saveItem","postData":{"resource":"planning_operationplan","id":"{{ forms.planning_operationplan_edit_form.id }}","data":{"reference":"{{ forms.planning_operationplan_edit_form.reference }}","status":"{{ forms.planning_operationplan_edit_form.status }}","type":"{{ forms.planning_operationplan_edit_form.type }}","quantity":"{{ forms.planning_operationplan_edit_form.quantity }}","quantity_completed":"{{ forms.planning_operationplan_edit_form.quantity_completed }}","color":"{{ forms.planning_operationplan_edit_form.color }}","startdate":"{{ forms.planning_operationplan_edit_form.startdate }}","enddate":"{{ forms.planning_operationplan_edit_form.enddate }}","remark":"{{ forms.planning_operationplan_edit_form.remark }}","operation_id":"{{ forms.planning_operationplan_edit_form.operation_id }}","owner_id":"{{ forms.planning_operationplan_edit_form.owner_id }}","batch":"{{ forms.planning_operationplan_edit_form.batch }}","item_id":"{{ forms.planning_operationplan_edit_form.item_id }}","origin_id":"{{ forms.planning_operationplan_edit_form.origin_id }}","destination_id":"{{ forms.planning_operationplan_edit_form.destination_id }}","supplier_id":"{{ forms.planning_operationplan_edit_form.supplier_id }}","location_id":"{{ forms.planning_operationplan_edit_form.location_id }}","demand_id":"{{ forms.planning_operationplan_edit_form.demand_id }}","due":"{{ forms.planning_operationplan_edit_form.due }}","name":"{{ forms.planning_operationplan_edit_form.name }}","forecast":"{{ forms.planning_operationplan_edit_form.forecast }}","plan_version_id":"{{ forms.planning_operationplan_edit_form.plan_version_id }}","source":"{{ forms.planning_operationplan_edit_form.source }}"}},"assignTo":"planning_operationplanSaved"},{"type":"navigate","route":"/dashboard/planning/operationplan/edit?id={{ data.planning_operationplanSaved.id }}&fromPage=planning_operationplan-list"},{"type":"showMessage","status":"success","message":"计划订单已保存。"}]}]},{"id":"planning_operationplan-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_operationplan_edit_form","kind":"form","title":"计划订单信息","sourceKey":"planning_operationplanRows","submitSourceKey":"planning_operationplanRows","initialValues":{"id":"","reference":"","status":"","type":"MO","quantity":1,"quantity_completed":"","color":0,"startdate":"","enddate":"","remark":"","operation_id":"","owner_id":"","batch":"","item_id":"","origin_id":"","destination_id":"","supplier_id":"","location_id":"","demand_id":"","due":"","name":"","forecast":"","plan_version_id":"","source":""},"schema":{"columns":4,"fields":[{"field":"reference","label":"计划单号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入计划单号"},"rules":[{"required":true,"message":"请输入计划单号"}]},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态"},"options":[{"label":"proposed","value":"proposed"},{"label":"approved","value":"approved"},{"label":"confirmed","value":"confirmed"},{"label":"completed","value":"completed"},{"label":"closed","value":"closed"}]},{"field":"type","label":"订单类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入订单类型"},"options":[{"label":"STCK","value":"STCK"},{"label":"MO","value":"MO"},{"label":"WO","value":"WO"},{"label":"PO","value":"PO"},{"label":"DO","value":"DO"},{"label":"DLVR","value":"DLVR"}],"rules":[{"required":true,"message":"请输入订单类型"}]},{"field":"quantity","label":"数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数量","type":"number"},"rules":[{"required":true,"message":"请输入数量"}]},{"field":"quantity_completed","label":"完成数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入完成数量","type":"number"}},{"field":"color","label":"颜色值","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入颜色值","type":"number"}},{"field":"startdate","label":"开始时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入开始时间"}},{"field":"enddate","label":"结束时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入结束时间"}},{"field":"remark","label":"备注","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入备注"}},{"field":"criticality","label":"关键度","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入关键度","type":"number","disabled":true}},{"field":"delay","label":"延期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入延期","disabled":true},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"plan","label":"计划明细","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入计划明细","disabled":true}},{"field":"operation_id","label":"工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"}},{"field":"owner_id","label":"上级计划单","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择上级计划单","filterable":true},"optionsSourceKey":"planning_operationplanOptions","optionProps":{"label":"label","value":"id"}},{"field":"batch","label":"批次","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入批次"}},{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"}},{"field":"origin_id","label":"来源地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择来源地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"}},{"field":"destination_id","label":"目的地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择目的地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"}},{"field":"supplier_id","label":"供应商","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择供应商","filterable":true},"optionsSourceKey":"planning_supplierOptions","optionProps":{"label":"label","value":"id"}},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"}},{"field":"demand_id","label":"需求","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择需求","filterable":true},"optionsSourceKey":"planning_demandOptions","optionProps":{"label":"label","value":"id"}},{"field":"due","label":"需求日期","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入需求日期"}},{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"}},{"field":"forecast","label":"预测编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入预测编号"}},{"field":"plan_version_id","label":"计划版本","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择计划版本","filterable":true},"optionsSourceKey":"planning_plan_versionOptions","optionProps":{"label":"label","value":"id"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
  'id', 'active', 321, '{"sourceTable":"operationplan","freppleModel":"operationplan","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"reference","label":"计划单号","kind":"text","required":true},{"name":"status","label":"状态","kind":"text","options":[{"label":"proposed","value":"proposed"},{"label":"approved","value":"approved"},{"label":"confirmed","value":"confirmed"},{"label":"completed","value":"completed"},{"label":"closed","value":"closed"}]},{"name":"type","label":"订单类型","kind":"text","required":true,"default":"MO","options":[{"label":"STCK","value":"STCK"},{"label":"MO","value":"MO"},{"label":"WO","value":"WO"},{"label":"PO","value":"PO"},{"label":"DO","value":"DO"},{"label":"DLVR","value":"DLVR"}]},{"name":"quantity","label":"数量","kind":"number","required":true,"default":1},{"name":"quantity_completed","label":"完成数量","kind":"number"},{"name":"color","label":"颜色值","kind":"number","default":0},{"name":"startdate","label":"开始时间","kind":"datetime"},{"name":"enddate","label":"结束时间","kind":"datetime"},{"name":"remark","label":"备注","kind":"text"},{"name":"criticality","label":"关键度","kind":"number","readOnly":true},{"name":"delay","label":"延期","kind":"interval","readOnly":true},{"name":"plan","label":"计划明细","kind":"json","readOnly":true,"default":{}},{"name":"operation_id","label":"工序","kind":"relation","relation":"planning_operation"},{"name":"owner_id","label":"上级计划单","kind":"relation","relation":"planning_operationplan"},{"name":"batch","label":"批次","kind":"text"},{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item"},{"name":"origin_id","label":"来源地点","kind":"relation","relation":"planning_location"},{"name":"destination_id","label":"目的地点","kind":"relation","relation":"planning_location"},{"name":"supplier_id","label":"供应商","kind":"relation","relation":"planning_supplier"},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location"},{"name":"demand_id","label":"需求","kind":"relation","relation":"planning_demand"},{"name":"due","label":"需求日期","kind":"datetime"},{"name":"name","label":"名称","kind":"text"},{"name":"forecast","label":"预测编号","kind":"text"},{"name":"plan_version_id","label":"计划版本","kind":"relation","relation":"planning_plan_version"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_operationplanresource-list', '/dashboard/planning/operationplanresource', '计划资源', '计划订单的资源负荷明细。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_operationplanresource-list","route":"/dashboard/planning/operationplanresource","title":"计划资源","description":"计划订单的资源负荷明细。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_operationplanresourceRows":{"key":"planning_operationplanresourceRows","label":"计划资源数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationplanresource","postData":{"resource":"planning_operationplanresource","tableName":"planning_operationplanresource","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true},"planning_operationplanOptions":{"key":"planning_operationplanOptions","label":"计划订单选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operationplan","labelField":"reference"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"计划版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true}},"blocks":[{"id":"planning_operationplanresource-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/operationplanresource/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationplanresourceRows"]}]}]},{"id":"planning_operationplanresource-search","kind":"searchForm","targetSourceKey":"planning_operationplanresourceRows","schema":{"columns":4,"fields":[{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"proposed","value":"proposed"},{"label":"confirmed","value":"confirmed"},{"label":"closed","value":"closed"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_operationplanresource-grid","kind":"grid","title":"计划资源列表","sourceKey":"planning_operationplanresourceRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"resource_id_label","title":"资源","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"operationplan_id_label","title":"计划订单","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"负荷数量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"setup","title":"换型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"status","title":"状态","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"proposed":"proposed","confirmed":"confirmed","closed":"closed"},"emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"plan_version_id_label","title":"计划版本","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_operationplanresource-edit', '/dashboard/planning/operationplanresource/edit', '计划资源编辑', '计划订单的资源负荷明细。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_operationplanresource-edit","route":"/dashboard/planning/operationplanresource/edit","title":"计划资源编辑","description":"计划订单的资源负荷明细。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_operationplanresourceRows":{"key":"planning_operationplanresourceRows","label":"计划资源数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationplanresource","postData":{"resource":"planning_operationplanresource","tableName":"planning_operationplanresource","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true},"planning_operationplanOptions":{"key":"planning_operationplanOptions","label":"计划订单选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operationplan","labelField":"reference"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"计划版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true}},"blocks":[{"id":"planning_operationplanresource-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/operationplanresource"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationplanresourceRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_operationplanresourceRows","serviceMethod":"saveItem","postData":{"resource":"planning_operationplanresource","id":"{{ forms.planning_operationplanresource_edit_form.id }}","data":{"resource_id":"{{ forms.planning_operationplanresource_edit_form.resource_id }}","operationplan_id":"{{ forms.planning_operationplanresource_edit_form.operationplan_id }}","quantity":"{{ forms.planning_operationplanresource_edit_form.quantity }}","setup":"{{ forms.planning_operationplanresource_edit_form.setup }}","status":"{{ forms.planning_operationplanresource_edit_form.status }}","source":"{{ forms.planning_operationplanresource_edit_form.source }}"}},"assignTo":"planning_operationplanresourceSaved"},{"type":"navigate","route":"/dashboard/planning/operationplanresource/edit?id={{ data.planning_operationplanresourceSaved.id }}&fromPage=planning_operationplanresource-list"},{"type":"showMessage","status":"success","message":"计划资源已保存。"}]}]},{"id":"planning_operationplanresource-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_operationplanresource_edit_form","kind":"form","title":"计划资源信息","sourceKey":"planning_operationplanresourceRows","submitSourceKey":"planning_operationplanresourceRows","initialValues":{"id":"","resource_id":"","operationplan_id":"","quantity":1,"setup":"","status":"","source":""},"schema":{"columns":4,"fields":[{"field":"resource_id","label":"资源","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择资源","filterable":true},"optionsSourceKey":"planning_resourceOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入资源"}]},{"field":"operationplan_id","label":"计划订单","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择计划订单","filterable":true},"optionsSourceKey":"planning_operationplanOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入计划订单"}]},{"field":"plan_version_id","label":"计划版本","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择计划版本","disabled":true,"filterable":true},"optionsSourceKey":"planning_plan_versionOptions","optionProps":{"label":"label","value":"id"}},{"field":"quantity","label":"负荷数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入负荷数量","type":"number"}},{"field":"setup","label":"换型","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入换型"}},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态"},"options":[{"label":"proposed","value":"proposed"},{"label":"confirmed","value":"confirmed"},{"label":"closed","value":"closed"}]},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
  'id', 'active', 322, '{"sourceTable":"operationplanresource","freppleModel":"operationplanresource","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"resource_id","label":"资源","kind":"relation","relation":"planning_resource","required":true},{"name":"operationplan_id","label":"计划订单","kind":"relation","relation":"planning_operationplan","required":true},{"name":"plan_version_id","label":"计划版本","kind":"relation","relation":"planning_plan_version","readOnly":true},{"name":"quantity","label":"负荷数量","kind":"number","default":1},{"name":"setup","label":"换型","kind":"text"},{"name":"status","label":"状态","kind":"text","options":[{"label":"proposed","value":"proposed"},{"label":"confirmed","value":"confirmed"},{"label":"closed","value":"closed"}]},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_operationplanmaterial-list', '/dashboard/planning/operationplanmaterial', '计划物料', '计划订单的库存消耗和产出明细。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_operationplanmaterial-list","route":"/dashboard/planning/operationplanmaterial","title":"计划物料","description":"计划订单的库存消耗和产出明细。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_operationplanmaterialRows":{"key":"planning_operationplanmaterialRows","label":"计划物料数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationplanmaterial","postData":{"resource":"planning_operationplanmaterial","tableName":"planning_operationplanmaterial","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_operationplanOptions":{"key":"planning_operationplanOptions","label":"计划订单选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operationplan","labelField":"reference"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"计划版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true}},"blocks":[{"id":"planning_operationplanmaterial-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/operationplanmaterial/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationplanmaterialRows"]}]}]},{"id":"planning_operationplanmaterial-search","kind":"searchForm","targetSourceKey":"planning_operationplanmaterialRows","schema":{"columns":4,"fields":[{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"proposed","value":"proposed"},{"label":"confirmed","value":"confirmed"},{"label":"closed","value":"closed"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_operationplanmaterial-grid","kind":"grid","title":"计划物料列表","sourceKey":"planning_operationplanmaterialRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"item_id_label","title":"物料","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"operationplan_id_label","title":"计划订单","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"数量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"flowdate","title":"流动时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"status","title":"状态","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"proposed":"proposed","confirmed":"confirmed","closed":"closed"},"emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"plan_version_id_label","title":"计划版本","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"onhand","title":"结余库存","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_operationplanmaterial-edit', '/dashboard/planning/operationplanmaterial/edit', '计划物料编辑', '计划订单的库存消耗和产出明细。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_operationplanmaterial-edit","route":"/dashboard/planning/operationplanmaterial/edit","title":"计划物料编辑","description":"计划订单的库存消耗和产出明细。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_operationplanmaterialRows":{"key":"planning_operationplanmaterialRows","label":"计划物料数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_operationplanmaterial","postData":{"resource":"planning_operationplanmaterial","tableName":"planning_operationplanmaterial","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_operationplanOptions":{"key":"planning_operationplanOptions","label":"计划订单选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operationplan","labelField":"reference"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"计划版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true}},"blocks":[{"id":"planning_operationplanmaterial-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/operationplanmaterial"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_operationplanmaterialRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_operationplanmaterialRows","serviceMethod":"saveItem","postData":{"resource":"planning_operationplanmaterial","id":"{{ forms.planning_operationplanmaterial_edit_form.id }}","data":{"item_id":"{{ forms.planning_operationplanmaterial_edit_form.item_id }}","location_id":"{{ forms.planning_operationplanmaterial_edit_form.location_id }}","operationplan_id":"{{ forms.planning_operationplanmaterial_edit_form.operationplan_id }}","quantity":"{{ forms.planning_operationplanmaterial_edit_form.quantity }}","flowdate":"{{ forms.planning_operationplanmaterial_edit_form.flowdate }}","status":"{{ forms.planning_operationplanmaterial_edit_form.status }}","source":"{{ forms.planning_operationplanmaterial_edit_form.source }}"}},"assignTo":"planning_operationplanmaterialSaved"},{"type":"navigate","route":"/dashboard/planning/operationplanmaterial/edit?id={{ data.planning_operationplanmaterialSaved.id }}&fromPage=planning_operationplanmaterial-list"},{"type":"showMessage","status":"success","message":"计划物料已保存。"}]}]},{"id":"planning_operationplanmaterial-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_operationplanmaterial_edit_form","kind":"form","title":"计划物料信息","sourceKey":"planning_operationplanmaterialRows","submitSourceKey":"planning_operationplanmaterialRows","initialValues":{"id":"","item_id":"","location_id":"","operationplan_id":"","quantity":"","flowdate":"","status":"","source":""},"schema":{"columns":4,"fields":[{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入地点"}]},{"field":"operationplan_id","label":"计划订单","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择计划订单","filterable":true},"optionsSourceKey":"planning_operationplanOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入计划订单"}]},{"field":"quantity","label":"数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数量","type":"number"},"rules":[{"required":true,"message":"请输入数量"}]},{"field":"plan_version_id","label":"计划版本","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择计划版本","disabled":true,"filterable":true},"optionsSourceKey":"planning_plan_versionOptions","optionProps":{"label":"label","value":"id"}},{"field":"flowdate","label":"流动时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入流动时间"},"rules":[{"required":true,"message":"请输入流动时间"}]},{"field":"onhand","label":"结余库存","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入结余库存","type":"number","disabled":true}},{"field":"minimum","label":"最小库存","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最小库存","type":"number","disabled":true}},{"field":"periodofcover","label":"覆盖周期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入覆盖周期","type":"number","disabled":true}},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态"},"options":[{"label":"proposed","value":"proposed"},{"label":"confirmed","value":"confirmed"},{"label":"closed","value":"closed"}]},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
  'id', 'active', 323, '{"sourceTable":"operationplanmaterial","freppleModel":"operationplanmaterial","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item","required":true},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location","required":true},{"name":"operationplan_id","label":"计划订单","kind":"relation","relation":"planning_operationplan","required":true},{"name":"quantity","label":"数量","kind":"number","required":true},{"name":"plan_version_id","label":"计划版本","kind":"relation","relation":"planning_plan_version","readOnly":true},{"name":"flowdate","label":"流动时间","kind":"datetime","required":true},{"name":"onhand","label":"结余库存","kind":"number","readOnly":true},{"name":"minimum","label":"最小库存","kind":"number","readOnly":true},{"name":"periodofcover","label":"覆盖周期","kind":"number","readOnly":true},{"name":"status","label":"状态","kind":"text","options":[{"label":"proposed","value":"proposed"},{"label":"confirmed","value":"confirmed"},{"label":"closed","value":"closed"}]},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_parameter-list', '/dashboard/planning/common-parameter', '计划参数', '账套级排产、预测和展示参数，对应 frePPLe common_parameter。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_parameter-list","route":"/dashboard/planning/common-parameter","title":"计划参数","description":"账套级排产、预测和展示参数，对应 frePPLe common_parameter。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_parameterRows":{"key":"planning_parameterRows","label":"计划参数数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_parameter","postData":{"resource":"planning_parameter","tableName":"planning_parameter","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true}},"blocks":[{"id":"planning_parameter-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/common-parameter/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_parameterRows"]}]}]},{"id":"planning_parameter-search","kind":"searchForm","targetSourceKey":"planning_parameterRows","schema":{"columns":4,"fields":[{"field":"name","label":"参数编码","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_parameter-grid","kind":"grid","title":"计划参数列表","sourceKey":"planning_parameterRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"参数编码","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"value","title":"参数值","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_parameter-edit', '/dashboard/planning/common-parameter/edit', '计划参数编辑', '账套级排产、预测和展示参数，对应 frePPLe common_parameter。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_parameter-edit","route":"/dashboard/planning/common-parameter/edit","title":"计划参数编辑","description":"账套级排产、预测和展示参数，对应 frePPLe common_parameter。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_parameterRows":{"key":"planning_parameterRows","label":"计划参数数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_parameter","postData":{"resource":"planning_parameter","tableName":"planning_parameter","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true}},"blocks":[{"id":"planning_parameter-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/common-parameter"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_parameterRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_parameterRows","serviceMethod":"saveItem","postData":{"resource":"planning_parameter","id":"{{ forms.planning_parameter_edit_form.id }}","data":{"name":"{{ forms.planning_parameter_edit_form.name }}","value":"{{ forms.planning_parameter_edit_form.value }}","description":"{{ forms.planning_parameter_edit_form.description }}","source":"{{ forms.planning_parameter_edit_form.source }}"}},"assignTo":"planning_parameterSaved"},{"type":"navigate","route":"/dashboard/planning/common-parameter/edit?id={{ data.planning_parameterSaved.id }}&fromPage=planning_parameter-list"},{"type":"showMessage","status":"success","message":"计划参数已保存。"}]}]},{"id":"planning_parameter-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_parameter_edit_form","kind":"form","title":"计划参数信息","sourceKey":"planning_parameterRows","submitSourceKey":"planning_parameterRows","initialValues":{"id":"","name":"","value":"","description":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"参数编码","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入参数编码"},"rules":[{"required":true,"message":"请输入参数编码"}]},{"field":"value","label":"参数值","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入参数值"}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_parameter-list'
  and edit_page.code = 'planning_parameter-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_parameter-list', 'planning_parameter-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_parameter', '计划参数', 'public.planning_parameter',
  '/dashboard/planning/common-parameter', 'planning_parameter-list', 'ri-equalizer-2-line', '账套级排产、预测和展示参数，对应 frePPLe common_parameter。',
  'id', 'active', 324, '{"sourceTable":"common_parameter","freppleModel":"parameter","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"参数编码","kind":"text","required":true},{"name":"value","label":"参数值","kind":"text"},{"name":"description","label":"说明","kind":"text"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_forecast-list', '/dashboard/planning/forecast', '预测对象', '按客户、物料和地点定义的预测对象及预测方法。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_forecast-list","route":"/dashboard/planning/forecast","title":"预测对象","description":"按客户、物料和地点定义的预测对象及预测方法。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_forecastRows":{"key":"planning_forecastRows","label":"预测对象数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_forecast","postData":{"resource":"planning_forecast","tableName":"planning_forecast","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"客户选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"交付工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_forecast-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/forecast/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_forecastRows"]}]}]},{"id":"planning_forecast-search","kind":"searchForm","targetSourceKey":"planning_forecastRows","schema":{"columns":4,"fields":[{"field":"name","label":"预测编号","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"category","label":"分类","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_forecast-grid","kind":"grid","title":"预测对象列表","sourceKey":"planning_forecastRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"预测编号","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"customer_id_label","title":"客户","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item_id_label","title":"物料","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"priority","title":"优先级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"category","title":"分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"subcategory","title":"子分类","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"batch","title":"批次","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_forecast-edit', '/dashboard/planning/forecast/edit', '预测对象编辑', '按客户、物料和地点定义的预测对象及预测方法。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_forecast-edit","route":"/dashboard/planning/forecast/edit","title":"预测对象编辑","description":"按客户、物料和地点定义的预测对象及预测方法。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_forecastRows":{"key":"planning_forecastRows","label":"预测对象数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_forecast","postData":{"resource":"planning_forecast","tableName":"planning_forecast","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"客户选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"交付工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_forecast-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/forecast"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_forecastRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_forecastRows","serviceMethod":"saveItem","postData":{"resource":"planning_forecast","id":"{{ forms.planning_forecast_edit_form.id }}","data":{"name":"{{ forms.planning_forecast_edit_form.name }}","description":"{{ forms.planning_forecast_edit_form.description }}","category":"{{ forms.planning_forecast_edit_form.category }}","subcategory":"{{ forms.planning_forecast_edit_form.subcategory }}","customer_id":"{{ forms.planning_forecast_edit_form.customer_id }}","item_id":"{{ forms.planning_forecast_edit_form.item_id }}","location_id":"{{ forms.planning_forecast_edit_form.location_id }}","batch":"{{ forms.planning_forecast_edit_form.batch }}","method":"{{ forms.planning_forecast_edit_form.method }}","priority":"{{ forms.planning_forecast_edit_form.priority }}","minshipment":"{{ forms.planning_forecast_edit_form.minshipment }}","maxlateness":"{{ forms.planning_forecast_edit_form.maxlateness }}","discrete":"{{ forms.planning_forecast_edit_form.discrete }}","planned":"{{ forms.planning_forecast_edit_form.planned }}","operation_id":"{{ forms.planning_forecast_edit_form.operation_id }}","source":"{{ forms.planning_forecast_edit_form.source }}"}},"assignTo":"planning_forecastSaved"},{"type":"navigate","route":"/dashboard/planning/forecast/edit?id={{ data.planning_forecastSaved.id }}&fromPage=planning_forecast-list"},{"type":"showMessage","status":"success","message":"预测对象已保存。"}]}]},{"id":"planning_forecast-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_forecast_edit_form","kind":"form","title":"预测对象信息","sourceKey":"planning_forecastRows","submitSourceKey":"planning_forecastRows","initialValues":{"id":"","name":"","description":"","category":"","subcategory":"","customer_id":"","item_id":"","location_id":"","batch":"","method":"automatic","priority":10,"minshipment":"","maxlateness":"","discrete":true,"planned":true,"operation_id":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"预测编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入预测编号"},"rules":[{"required":true,"message":"请输入预测编号"}]},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"category","label":"分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入分类"}},{"field":"subcategory","label":"子分类","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入子分类"}},{"field":"customer_id","label":"客户","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择客户","filterable":true},"optionsSourceKey":"planning_customerOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入客户"}]},{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入地点"}]},{"field":"batch","label":"批次","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入批次"}},{"field":"method","label":"预测方法","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入预测方法"},"options":[{"label":"automatic","value":"automatic"},{"label":"constant","value":"constant"},{"label":"trend","value":"trend"},{"label":"seasonal","value":"seasonal"},{"label":"intermittent","value":"intermittent"},{"label":"moving average","value":"moving average"},{"label":"manual","value":"manual"},{"label":"aggregate","value":"aggregate"}]},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"},"rules":[{"required":true,"message":"请输入优先级"}]},{"field":"minshipment","label":"最小发运量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最小发运量","type":"number"}},{"field":"maxlateness","label":"最大延期","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入最大延期"},"help":"使用 PostgreSQL interval 格式，例如 2 hours、3 days。"},{"field":"discrete","label":"离散数量","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入离散数量"}},{"field":"out_smape","label":"预测误差","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入预测误差","type":"number","disabled":true}},{"field":"out_method","label":"计算方法","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入计算方法","disabled":true}},{"field":"out_deviation","label":"标准差","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入标准差","type":"number","disabled":true}},{"field":"planned","label":"参与排产","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入参与排产"}},{"field":"operation_id","label":"交付工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择交付工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_forecast-list'
  and edit_page.code = 'planning_forecast-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_forecast-list', 'planning_forecast-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_forecast', '预测对象', 'public.planning_forecast',
  '/dashboard/planning/forecast', 'planning_forecast-list', 'ri-line-chart-line', '按客户、物料和地点定义的预测对象及预测方法。',
  'id', 'active', 325, '{"sourceTable":"forecast","freppleModel":"forecast","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"预测编号","kind":"text","required":true},{"name":"description","label":"说明","kind":"text"},{"name":"category","label":"分类","kind":"text"},{"name":"subcategory","label":"子分类","kind":"text"},{"name":"customer_id","label":"客户","kind":"relation","relation":"planning_customer","required":true},{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item","required":true},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location","required":true},{"name":"batch","label":"批次","kind":"text"},{"name":"method","label":"预测方法","kind":"text","default":"automatic","options":[{"label":"automatic","value":"automatic"},{"label":"constant","value":"constant"},{"label":"trend","value":"trend"},{"label":"seasonal","value":"seasonal"},{"label":"intermittent","value":"intermittent"},{"label":"moving average","value":"moving average"},{"label":"manual","value":"manual"},{"label":"aggregate","value":"aggregate"}]},{"name":"priority","label":"优先级","kind":"integer","required":true,"default":10},{"name":"minshipment","label":"最小发运量","kind":"number"},{"name":"maxlateness","label":"最大延期","kind":"interval"},{"name":"discrete","label":"离散数量","kind":"boolean","default":true},{"name":"out_smape","label":"预测误差","kind":"number","readOnly":true},{"name":"out_method","label":"计算方法","kind":"text","readOnly":true},{"name":"out_deviation","label":"标准差","kind":"number","readOnly":true},{"name":"planned","label":"参与排产","kind":"boolean","default":true},{"name":"operation_id","label":"交付工序","kind":"relation","relation":"planning_operation"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_measure-list', '/dashboard/planning/measure', '预测度量', '预测时间序列的度量定义、计算表达式和编辑方式。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_measure-list","route":"/dashboard/planning/measure","title":"预测度量","description":"预测时间序列的度量定义、计算表达式和编辑方式。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_measureRows":{"key":"planning_measureRows","label":"预测度量数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_measure","postData":{"resource":"planning_measure","tableName":"planning_measure","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true}},"blocks":[{"id":"planning_measure-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/measure/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_measureRows"]}]}]},{"id":"planning_measure-search","kind":"searchForm","targetSourceKey":"planning_measureRows","schema":{"columns":4,"fields":[{"field":"name","label":"度量编码","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"type","label":"类型","component":"vxe-select","options":[{"label":"aggregate","value":"aggregate"},{"label":"local","value":"local"},{"label":"computed","value":"computed"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_measure-grid","kind":"grid","title":"预测度量列表","sourceKey":"planning_measureRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"度量编码","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"label","title":"显示名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"type","title":"类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"aggregate":"aggregate","local":"local","computed":"computed"},"emptyText":"-"}},{"field":"mode_future","title":"未来模式","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"edit":"edit","view":"view","hide":"hide"},"emptyText":"-"}},{"field":"mode_past","title":"历史模式","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"edit":"edit","view":"view","hide":"hide"},"emptyText":"-"}},{"field":"compute_expression","title":"计算表达式","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"update_expression","title":"更新表达式","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"initially_hidden","title":"默认隐藏","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"true":"是","false":"否"},"emptyText":"-"},"width":90,"align":"center"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_measure-edit', '/dashboard/planning/measure/edit', '预测度量编辑', '预测时间序列的度量定义、计算表达式和编辑方式。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_measure-edit","route":"/dashboard/planning/measure/edit","title":"预测度量编辑","description":"预测时间序列的度量定义、计算表达式和编辑方式。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_measureRows":{"key":"planning_measureRows","label":"预测度量数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_measure","postData":{"resource":"planning_measure","tableName":"planning_measure","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true}},"blocks":[{"id":"planning_measure-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/measure"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_measureRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_measureRows","serviceMethod":"saveItem","postData":{"resource":"planning_measure","id":"{{ forms.planning_measure_edit_form.id }}","data":{"name":"{{ forms.planning_measure_edit_form.name }}","label":"{{ forms.planning_measure_edit_form.label }}","description":"{{ forms.planning_measure_edit_form.description }}","type":"{{ forms.planning_measure_edit_form.type }}","mode_future":"{{ forms.planning_measure_edit_form.mode_future }}","mode_past":"{{ forms.planning_measure_edit_form.mode_past }}","compute_expression":"{{ forms.planning_measure_edit_form.compute_expression }}","update_expression":"{{ forms.planning_measure_edit_form.update_expression }}","initially_hidden":"{{ forms.planning_measure_edit_form.initially_hidden }}","formatter":"{{ forms.planning_measure_edit_form.formatter }}","discrete":"{{ forms.planning_measure_edit_form.discrete }}","defaultvalue":"{{ forms.planning_measure_edit_form.defaultvalue }}","overrides":"{{ forms.planning_measure_edit_form.overrides }}","source":"{{ forms.planning_measure_edit_form.source }}"}},"assignTo":"planning_measureSaved"},{"type":"navigate","route":"/dashboard/planning/measure/edit?id={{ data.planning_measureSaved.id }}&fromPage=planning_measure-list"},{"type":"showMessage","status":"success","message":"预测度量已保存。"}]}]},{"id":"planning_measure-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_measure_edit_form","kind":"form","title":"预测度量信息","sourceKey":"planning_measureRows","submitSourceKey":"planning_measureRows","initialValues":{"id":"","name":"","label":"","description":"","type":"aggregate","mode_future":"edit","mode_past":"edit","compute_expression":"","update_expression":"","initially_hidden":false,"formatter":"number","discrete":false,"defaultvalue":0,"overrides":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"度量编码","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入度量编码"},"rules":[{"required":true,"message":"请输入度量编码"}]},{"field":"label","label":"显示名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入显示名称"}},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"type","label":"类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入类型"},"options":[{"label":"aggregate","value":"aggregate"},{"label":"local","value":"local"},{"label":"computed","value":"computed"}]},{"field":"mode_future","label":"未来模式","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入未来模式"},"options":[{"label":"edit","value":"edit"},{"label":"view","value":"view"},{"label":"hide","value":"hide"}]},{"field":"mode_past","label":"历史模式","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入历史模式"},"options":[{"label":"edit","value":"edit"},{"label":"view","value":"view"},{"label":"hide","value":"hide"}]},{"field":"compute_expression","label":"计算表达式","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入计算表达式"}},{"field":"update_expression","label":"更新表达式","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入更新表达式"}},{"field":"initially_hidden","label":"默认隐藏","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入默认隐藏"}},{"field":"formatter","label":"格式","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入格式"},"options":[{"label":"number","value":"number"},{"label":"currency","value":"currency"}]},{"field":"discrete","label":"离散数量","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入离散数量"}},{"field":"defaultvalue","label":"默认值","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入默认值","type":"number"}},{"field":"overrides","label":"覆盖度量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入覆盖度量"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_measure-list'
  and edit_page.code = 'planning_measure-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_measure-list', 'planning_measure-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_measure', '预测度量', 'public.planning_measure',
  '/dashboard/planning/measure', 'planning_measure-list', 'ri-ruler-2-line', '预测时间序列的度量定义、计算表达式和编辑方式。',
  'id', 'active', 326, '{"sourceTable":"measure","freppleModel":"measure","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"度量编码","kind":"text","required":true},{"name":"label","label":"显示名称","kind":"text"},{"name":"description","label":"说明","kind":"text"},{"name":"type","label":"类型","kind":"text","default":"aggregate","options":[{"label":"aggregate","value":"aggregate"},{"label":"local","value":"local"},{"label":"computed","value":"computed"}]},{"name":"mode_future","label":"未来模式","kind":"text","default":"edit","options":[{"label":"edit","value":"edit"},{"label":"view","value":"view"},{"label":"hide","value":"hide"}]},{"name":"mode_past","label":"历史模式","kind":"text","default":"edit","options":[{"label":"edit","value":"edit"},{"label":"view","value":"view"},{"label":"hide","value":"hide"}]},{"name":"compute_expression","label":"计算表达式","kind":"text"},{"name":"update_expression","label":"更新表达式","kind":"text"},{"name":"initially_hidden","label":"默认隐藏","kind":"boolean"},{"name":"formatter","label":"格式","kind":"text","default":"number","options":[{"label":"number","value":"number"},{"label":"currency","value":"currency"}]},{"name":"discrete","label":"离散数量","kind":"boolean"},{"name":"defaultvalue","label":"默认值","kind":"number","default":0},{"name":"overrides","label":"覆盖度量","kind":"text"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_forecastplan-list', '/dashboard/planning/forecastplan', '预测计划', '按客户、物料、地点和时间桶保存预测及订单度量。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_forecastplan-list","route":"/dashboard/planning/forecastplan","title":"预测计划","description":"按客户、物料、地点和时间桶保存预测及订单度量。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_forecastplanRows":{"key":"planning_forecastplanRows","label":"预测计划数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_forecastplan","postData":{"resource":"planning_forecastplan","tableName":"planning_forecastplan","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_forecastOptions":{"key":"planning_forecastOptions","label":"预测对象选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_forecast","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"客户选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_forecastplan-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/forecastplan/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_forecastplanRows"]}]}]},{"id":"planning_forecastplan-grid","kind":"grid","title":"预测计划列表","sourceKey":"planning_forecastplanRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"item_id_label","title":"物料","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"customer_id_label","title":"客户","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"startdate","title":"开始时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"enddate","title":"结束时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"value","title":"度量值","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"forecast_id_label","title":"预测对象","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_forecastplan-edit', '/dashboard/planning/forecastplan/edit', '预测计划编辑', '按客户、物料、地点和时间桶保存预测及订单度量。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_forecastplan-edit","route":"/dashboard/planning/forecastplan/edit","title":"预测计划编辑","description":"按客户、物料、地点和时间桶保存预测及订单度量。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_forecastplanRows":{"key":"planning_forecastplanRows","label":"预测计划数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_forecastplan","postData":{"resource":"planning_forecastplan","tableName":"planning_forecastplan","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_forecastOptions":{"key":"planning_forecastOptions","label":"预测对象选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_forecast","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"客户选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_forecastplan-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/forecastplan"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_forecastplanRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_forecastplanRows","serviceMethod":"saveItem","postData":{"resource":"planning_forecastplan","id":"{{ forms.planning_forecastplan_edit_form.id }}","data":{"forecast_id":"{{ forms.planning_forecastplan_edit_form.forecast_id }}","item_id":"{{ forms.planning_forecastplan_edit_form.item_id }}","location_id":"{{ forms.planning_forecastplan_edit_form.location_id }}","customer_id":"{{ forms.planning_forecastplan_edit_form.customer_id }}","startdate":"{{ forms.planning_forecastplan_edit_form.startdate }}","enddate":"{{ forms.planning_forecastplan_edit_form.enddate }}","value":"{{ forms.planning_forecastplan_edit_form.value }}"}},"assignTo":"planning_forecastplanSaved"},{"type":"navigate","route":"/dashboard/planning/forecastplan/edit?id={{ data.planning_forecastplanSaved.id }}&fromPage=planning_forecastplan-list"},{"type":"showMessage","status":"success","message":"预测计划已保存。"}]}]},{"id":"planning_forecastplan-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_forecastplan_edit_form","kind":"form","title":"预测计划信息","sourceKey":"planning_forecastplanRows","submitSourceKey":"planning_forecastplanRows","initialValues":{"id":"","forecast_id":"","item_id":"","location_id":"","customer_id":"","startdate":"","enddate":"","value":{}},"schema":{"columns":4,"fields":[{"field":"forecast_id","label":"预测对象","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择预测对象","filterable":true},"optionsSourceKey":"planning_forecastOptions","optionProps":{"label":"label","value":"id"}},{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"location_id","label":"地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入地点"}]},{"field":"customer_id","label":"客户","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择客户","filterable":true},"optionsSourceKey":"planning_customerOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入客户"}]},{"field":"startdate","label":"开始时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入开始时间"},"rules":[{"required":true,"message":"请输入开始时间"}]},{"field":"enddate","label":"结束时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入结束时间"},"rules":[{"required":true,"message":"请输入结束时间"}]},{"field":"value","label":"度量值","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入度量值"},"rules":[{"required":true,"message":"请输入度量值"}]}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_forecastplan-list'
  and edit_page.code = 'planning_forecastplan-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_forecastplan-list', 'planning_forecastplan-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_forecastplan', '预测计划', 'public.planning_forecastplan',
  '/dashboard/planning/forecastplan', 'planning_forecastplan-list', 'ri-calendar-todo-line', '按客户、物料、地点和时间桶保存预测及订单度量。',
  'id', 'active', 327, '{"sourceTable":"forecastplan","freppleModel":"forecastplan","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"forecast_id","label":"预测对象","kind":"relation","relation":"planning_forecast"},{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item","required":true},{"name":"location_id","label":"地点","kind":"relation","relation":"planning_location","required":true},{"name":"customer_id","label":"客户","kind":"relation","relation":"planning_customer","required":true},{"name":"startdate","label":"开始时间","kind":"datetime","required":true},{"name":"enddate","label":"结束时间","kind":"datetime","required":true},{"name":"value","label":"度量值","kind":"json","required":true,"default":{}}]}'::jsonb
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
  ('planning_problem-list', '/dashboard/planning/out-problem', '计划问题', '求解器输出的缺料、延期、超载等计划问题。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_problem-list","route":"/dashboard/planning/out-problem","title":"计划问题","description":"求解器输出的缺料、延期、超载等计划问题。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_problemRows":{"key":"planning_problemRows","label":"计划问题数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_problem","postData":{"resource":"planning_problem","tableName":"planning_problem","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_runOptions":{"key":"planning_runOptions","label":"运行任务选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_run","labelField":"id"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"计划版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true}},"blocks":[{"id":"planning_problem-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_problemRows"]}]}]},{"id":"planning_problem-search","kind":"searchForm","targetSourceKey":"planning_problemRows","schema":{"columns":4,"fields":[{"field":"name","label":"问题类型","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"问题说明","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_problem-grid","kind":"grid","title":"计划问题列表","sourceKey":"planning_problemRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"entity","title":"实体","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"owner","title":"对象","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"name","title":"问题类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"问题说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"startdate","title":"开始时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"enddate","title":"结束时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"run_id_label","title":"运行任务","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"plan_version_id_label","title":"计划版本","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_problem-edit', '/dashboard/planning/out-problem/edit', '计划问题编辑', '求解器输出的缺料、延期、超载等计划问题。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_problem-edit","route":"/dashboard/planning/out-problem/edit","title":"计划问题编辑","description":"求解器输出的缺料、延期、超载等计划问题。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_problemRows":{"key":"planning_problemRows","label":"计划问题数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_problem","postData":{"resource":"planning_problem","tableName":"planning_problem","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_runOptions":{"key":"planning_runOptions","label":"运行任务选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_run","labelField":"id"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"计划版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true}},"blocks":[{"id":"planning_problem-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/out-problem"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_problemRows"]}]}]},{"id":"planning_problem-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_problem_edit_form","kind":"form","title":"计划问题信息","sourceKey":"planning_problemRows","submitSourceKey":"planning_problemRows","initialValues":{"id":"","run_id":"","entity":"","owner":"","name":"","description":"","startdate":"","enddate":""},"schema":{"columns":4,"fields":[{"field":"run_id","label":"运行任务","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择运行任务","filterable":true},"optionsSourceKey":"planning_runOptions","optionProps":{"label":"label","value":"id"}},{"field":"plan_version_id","label":"计划版本","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择计划版本","disabled":true,"filterable":true},"optionsSourceKey":"planning_plan_versionOptions","optionProps":{"label":"label","value":"id"}},{"field":"entity","label":"实体","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入实体"},"rules":[{"required":true,"message":"请输入实体"}]},{"field":"owner","label":"对象","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入对象"},"rules":[{"required":true,"message":"请输入对象"}]},{"field":"name","label":"问题类型","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入问题类型"},"rules":[{"required":true,"message":"请输入问题类型"}]},{"field":"description","label":"问题说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入问题说明"},"rules":[{"required":true,"message":"请输入问题说明"}]},{"field":"startdate","label":"开始时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入开始时间"},"rules":[{"required":true,"message":"请输入开始时间"}]},{"field":"enddate","label":"结束时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入结束时间"},"rules":[{"required":true,"message":"请输入结束时间"}]}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_problem-list'
  and edit_page.code = 'planning_problem-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_problem-list', 'planning_problem-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_problem', '计划问题', 'public.planning_problem',
  '/dashboard/planning/out-problem', 'planning_problem-list', 'ri-error-warning-line', '求解器输出的缺料、延期、超载等计划问题。',
  'id', 'active', 328, '{"sourceTable":"out_problem","freppleModel":"problem","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"run_id","label":"运行任务","kind":"relation","relation":"planning_run"},{"name":"plan_version_id","label":"计划版本","kind":"relation","relation":"planning_plan_version","readOnly":true},{"name":"entity","label":"实体","kind":"text","required":true},{"name":"owner","label":"对象","kind":"text","required":true},{"name":"name","label":"问题类型","kind":"text","required":true},{"name":"description","label":"问题说明","kind":"text","required":true},{"name":"startdate","label":"开始时间","kind":"datetime","required":true},{"name":"enddate","label":"结束时间","kind":"datetime","required":true}]}'::jsonb
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
  ('planning_constraint-list', '/dashboard/planning/out-constraint', '需求约束', '求解器输出的需求、预测和物料约束冲突。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_constraint-list","route":"/dashboard/planning/out-constraint","title":"需求约束","description":"求解器输出的需求、预测和物料约束冲突。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_constraintRows":{"key":"planning_constraintRows","label":"需求约束数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_constraint","postData":{"resource":"planning_constraint","tableName":"planning_constraint","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_runOptions":{"key":"planning_runOptions","label":"运行任务选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_run","labelField":"id"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"计划版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true},"planning_demandOptions":{"key":"planning_demandOptions","label":"需求选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_demand","labelField":"name"},"autoLoad":true},"planning_forecastOptions":{"key":"planning_forecastOptions","label":"预测对象选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_forecast","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_constraint-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_constraintRows"]}]}]},{"id":"planning_constraint-search","kind":"searchForm","targetSourceKey":"planning_constraintRows","schema":{"columns":4,"fields":[{"field":"name","label":"约束类型","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"约束说明","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_constraint-grid","kind":"grid","title":"需求约束列表","sourceKey":"planning_constraintRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"entity","title":"实体","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"owner","title":"对象","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"name","title":"约束类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"约束说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"startdate","title":"开始时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"enddate","title":"结束时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"run_id_label","title":"运行任务","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"demand_id_label","title":"需求","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"forecast_id_label","title":"预测对象","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_constraint-edit', '/dashboard/planning/out-constraint/edit', '需求约束编辑', '求解器输出的需求、预测和物料约束冲突。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_constraint-edit","route":"/dashboard/planning/out-constraint/edit","title":"需求约束编辑","description":"求解器输出的需求、预测和物料约束冲突。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_constraintRows":{"key":"planning_constraintRows","label":"需求约束数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_constraint","postData":{"resource":"planning_constraint","tableName":"planning_constraint","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_runOptions":{"key":"planning_runOptions","label":"运行任务选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_run","labelField":"id"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"计划版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true},"planning_demandOptions":{"key":"planning_demandOptions","label":"需求选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_demand","labelField":"name"},"autoLoad":true},"planning_forecastOptions":{"key":"planning_forecastOptions","label":"预测对象选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_forecast","labelField":"name"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_constraint-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/out-constraint"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_constraintRows"]}]}]},{"id":"planning_constraint-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_constraint_edit_form","kind":"form","title":"需求约束信息","sourceKey":"planning_constraintRows","submitSourceKey":"planning_constraintRows","initialValues":{"id":"","run_id":"","demand_id":"","forecast_id":"","item_id":"","entity":"","owner":"","name":"","description":"","startdate":"","enddate":""},"schema":{"columns":4,"fields":[{"field":"run_id","label":"运行任务","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择运行任务","filterable":true},"optionsSourceKey":"planning_runOptions","optionProps":{"label":"label","value":"id"}},{"field":"plan_version_id","label":"计划版本","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择计划版本","disabled":true,"filterable":true},"optionsSourceKey":"planning_plan_versionOptions","optionProps":{"label":"label","value":"id"}},{"field":"demand_id","label":"需求","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择需求","filterable":true},"optionsSourceKey":"planning_demandOptions","optionProps":{"label":"label","value":"id"}},{"field":"forecast_id","label":"预测对象","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择预测对象","filterable":true},"optionsSourceKey":"planning_forecastOptions","optionProps":{"label":"label","value":"id"}},{"field":"item_id","label":"物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"}},{"field":"entity","label":"实体","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入实体"},"rules":[{"required":true,"message":"请输入实体"}]},{"field":"owner","label":"对象","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入对象"},"rules":[{"required":true,"message":"请输入对象"}]},{"field":"name","label":"约束类型","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入约束类型"},"rules":[{"required":true,"message":"请输入约束类型"}]},{"field":"description","label":"约束说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入约束说明"},"rules":[{"required":true,"message":"请输入约束说明"}]},{"field":"startdate","label":"开始时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入开始时间"},"rules":[{"required":true,"message":"请输入开始时间"}]},{"field":"enddate","label":"结束时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入结束时间"},"rules":[{"required":true,"message":"请输入结束时间"}]}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_constraint-list'
  and edit_page.code = 'planning_constraint-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_constraint-list', 'planning_constraint-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_constraint', '需求约束', 'public.planning_constraint',
  '/dashboard/planning/out-constraint', 'planning_constraint-list', 'ri-git-close-pull-request-line', '求解器输出的需求、预测和物料约束冲突。',
  'id', 'active', 329, '{"sourceTable":"out_constraint","freppleModel":"constraint","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"run_id","label":"运行任务","kind":"relation","relation":"planning_run"},{"name":"plan_version_id","label":"计划版本","kind":"relation","relation":"planning_plan_version","readOnly":true},{"name":"demand_id","label":"需求","kind":"relation","relation":"planning_demand"},{"name":"forecast_id","label":"预测对象","kind":"relation","relation":"planning_forecast"},{"name":"item_id","label":"物料","kind":"relation","relation":"planning_item"},{"name":"entity","label":"实体","kind":"text","required":true},{"name":"owner","label":"对象","kind":"text","required":true},{"name":"name","label":"约束类型","kind":"text","required":true},{"name":"description","label":"约束说明","kind":"text","required":true},{"name":"startdate","label":"开始时间","kind":"datetime","required":true},{"name":"enddate","label":"结束时间","kind":"datetime","required":true}]}'::jsonb
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
  ('planning_resourceplan-list', '/dashboard/planning/out-resourceplan', '资源负荷', '按资源和时间桶汇总的可用、占用、换型及空闲能力。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_resourceplan-list","route":"/dashboard/planning/out-resourceplan","title":"资源负荷","description":"按资源和时间桶汇总的可用、占用、换型及空闲能力。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_resourceplanRows":{"key":"planning_resourceplanRows","label":"资源负荷数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_resourceplan","postData":{"resource":"planning_resourceplan","tableName":"planning_resourceplan","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_runOptions":{"key":"planning_runOptions","label":"运行任务选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_run","labelField":"id"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"计划版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_resourceplan-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_resourceplanRows"]}]}]},{"id":"planning_resourceplan-grid","kind":"grid","title":"资源负荷列表","sourceKey":"planning_resourceplanRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"resource_id_label","title":"资源","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"startdate","title":"开始时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"run_id_label","title":"运行任务","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"available","title":"可用能力","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"unavailable","title":"不可用能力","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"setup","title":"换型负荷","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"load","title":"总负荷","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"free","title":"空闲能力","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"load_confirmed","title":"确认负荷","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_resourceplan-edit', '/dashboard/planning/out-resourceplan/edit', '资源负荷编辑', '按资源和时间桶汇总的可用、占用、换型及空闲能力。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_resourceplan-edit","route":"/dashboard/planning/out-resourceplan/edit","title":"资源负荷编辑","description":"按资源和时间桶汇总的可用、占用、换型及空闲能力。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_resourceplanRows":{"key":"planning_resourceplanRows","label":"资源负荷数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_resourceplan","postData":{"resource":"planning_resourceplan","tableName":"planning_resourceplan","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_runOptions":{"key":"planning_runOptions","label":"运行任务选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_run","labelField":"id"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"计划版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_resourceplan-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/out-resourceplan"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_resourceplanRows"]}]}]},{"id":"planning_resourceplan-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_resourceplan_edit_form","kind":"form","title":"资源负荷信息","sourceKey":"planning_resourceplanRows","submitSourceKey":"planning_resourceplanRows","initialValues":{"id":"","run_id":"","resource_id":"","startdate":"","available":"","unavailable":"","setup":"","load":"","free":"","load_confirmed":""},"schema":{"columns":4,"fields":[{"field":"run_id","label":"运行任务","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择运行任务","filterable":true},"optionsSourceKey":"planning_runOptions","optionProps":{"label":"label","value":"id"}},{"field":"plan_version_id","label":"计划版本","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择计划版本","disabled":true,"filterable":true},"optionsSourceKey":"planning_plan_versionOptions","optionProps":{"label":"label","value":"id"}},{"field":"resource_id","label":"资源","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择资源","filterable":true},"optionsSourceKey":"planning_resourceOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入资源"}]},{"field":"startdate","label":"开始时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入开始时间"},"rules":[{"required":true,"message":"请输入开始时间"}]},{"field":"available","label":"可用能力","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入可用能力","type":"number"}},{"field":"unavailable","label":"不可用能力","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入不可用能力","type":"number"}},{"field":"setup","label":"换型负荷","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入换型负荷","type":"number"}},{"field":"load","label":"总负荷","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入总负荷","type":"number"}},{"field":"free","label":"空闲能力","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入空闲能力","type":"number"}},{"field":"load_confirmed","label":"确认负荷","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入确认负荷","type":"number"}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_resourceplan-list'
  and edit_page.code = 'planning_resourceplan-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_resourceplan-list', 'planning_resourceplan-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_resourceplan', '资源负荷', 'public.planning_resourceplan',
  '/dashboard/planning/out-resourceplan', 'planning_resourceplan-list', 'ri-bar-chart-grouped-line', '按资源和时间桶汇总的可用、占用、换型及空闲能力。',
  'id', 'active', 330, '{"sourceTable":"out_resourceplan","freppleModel":"resourceplan","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"run_id","label":"运行任务","kind":"relation","relation":"planning_run"},{"name":"plan_version_id","label":"计划版本","kind":"relation","relation":"planning_plan_version","readOnly":true},{"name":"resource_id","label":"资源","kind":"relation","relation":"planning_resource","required":true},{"name":"startdate","label":"开始时间","kind":"datetime","required":true},{"name":"available","label":"可用能力","kind":"number"},{"name":"unavailable","label":"不可用能力","kind":"number"},{"name":"setup","label":"换型负荷","kind":"number"},{"name":"load","label":"总负荷","kind":"number"},{"name":"free","label":"空闲能力","kind":"number"},{"name":"load_confirmed","label":"确认负荷","kind":"number"}]}'::jsonb
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
  ('planning_run-list', '/dashboard/planning/execute-log', '排产运行', '排产、预测、归档和导出任务的运行状态与日志投影。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_run-list","route":"/dashboard/planning/execute-log","title":"排产运行","description":"排产、预测、归档和导出任务的运行状态与日志投影。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_runRows":{"key":"planning_runRows","label":"排产运行数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_run","postData":{"resource":"planning_run","tableName":"planning_run","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_scenarioOptions":{"key":"planning_scenarioOptions","label":"场景选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_scenario","labelField":"name"},"autoLoad":true},"planning_scheduleOptions":{"key":"planning_scheduleOptions","label":"作业定义选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_schedule","labelField":"id"},"autoLoad":true}},"blocks":[{"id":"planning_run-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_runRows"]}]}]},{"id":"planning_run-search","kind":"searchForm","targetSourceKey":"planning_runRows","schema":{"columns":4,"fields":[{"field":"name","label":"任务名称","component":"vxe-input","props":{"clearable":true}},{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"queued","value":"queued"},{"label":"running","value":"running"},{"label":"succeeded","value":"succeeded"},{"label":"failed","value":"failed"},{"label":"canceled","value":"canceled"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_run-grid","kind":"grid","title":"排产运行列表","sourceKey":"planning_runRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"任务名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"submitted","title":"提交时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"status","title":"状态","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"queued":"queued","running":"running","succeeded":"succeeded","failed":"failed","canceled":"canceled"},"emptyText":"-"}},{"field":"scenario_id_label","title":"场景","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"workflow_job_id_label","title":"作业定义","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"started","title":"开始时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"finished","title":"完成时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"arguments","title":"运行参数","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"message","title":"消息","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_run-edit', '/dashboard/planning/execute-log/edit', '排产运行编辑', '排产、预测、归档和导出任务的运行状态与日志投影。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_run-edit","route":"/dashboard/planning/execute-log/edit","title":"排产运行编辑","description":"排产、预测、归档和导出任务的运行状态与日志投影。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_runRows":{"key":"planning_runRows","label":"排产运行数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_run","postData":{"resource":"planning_run","tableName":"planning_run","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_scenarioOptions":{"key":"planning_scenarioOptions","label":"场景选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_scenario","labelField":"name"},"autoLoad":true},"planning_scheduleOptions":{"key":"planning_scheduleOptions","label":"作业定义选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_schedule","labelField":"id"},"autoLoad":true}},"blocks":[{"id":"planning_run-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/execute-log"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_runRows"]}]}]},{"id":"planning_run-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_run_edit_form","kind":"form","title":"排产运行信息","sourceKey":"planning_runRows","submitSourceKey":"planning_runRows","initialValues":{"id":"","scenario_id":"","workflow_job_id":"","name":"","submitted":"","started":"","finished":"","arguments":{},"status":"queued","message":"","logfile":"","trigger_run_id":"","processid":"","progress":0,"submitted_by":""},"schema":{"columns":4,"fields":[{"field":"scenario_id","label":"场景","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择场景","filterable":true},"optionsSourceKey":"planning_scenarioOptions","optionProps":{"label":"label","value":"id"}},{"field":"workflow_job_id","label":"作业定义","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择作业定义","filterable":true},"optionsSourceKey":"planning_scheduleOptions","optionProps":{"label":"label","value":"id"}},{"field":"name","label":"任务名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入任务名称"},"rules":[{"required":true,"message":"请输入任务名称"}]},{"field":"submitted","label":"提交时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入提交时间"},"rules":[{"required":true,"message":"请输入提交时间"}]},{"field":"started","label":"开始时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入开始时间"}},{"field":"finished","label":"完成时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入完成时间"}},{"field":"arguments","label":"运行参数","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入运行参数"}},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态"},"options":[{"label":"queued","value":"queued"},{"label":"running","value":"running"},{"label":"succeeded","value":"succeeded"},{"label":"failed","value":"failed"},{"label":"canceled","value":"canceled"}],"rules":[{"required":true,"message":"请输入状态"}]},{"field":"message","label":"消息","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入消息"}},{"field":"logfile","label":"日志文件","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入日志文件"}},{"field":"trigger_run_id","label":"调度运行编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入调度运行编号"}},{"field":"processid","label":"进程编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入进程编号","type":"number"}},{"field":"progress","label":"进度","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入进度","type":"number"}},{"field":"attempt","label":"尝试次数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入尝试次数","type":"number","disabled":true}},{"field":"output","label":"运行输出","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入运行输出","disabled":true}},{"field":"submitted_by","label":"提交人编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入提交人编号"}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_run-list'
  and edit_page.code = 'planning_run-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_run-list', 'planning_run-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_run', '排产运行', 'public.planning_run',
  '/dashboard/planning/execute-log', 'planning_run-list', 'ri-play-circle-line', '排产、预测、归档和导出任务的运行状态与日志投影。',
  'id', 'active', 331, '{"sourceTable":"execute_log","freppleModel":"run","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"scenario_id","label":"场景","kind":"relation","relation":"planning_scenario"},{"name":"workflow_job_id","label":"作业定义","kind":"relation","relation":"planning_schedule"},{"name":"name","label":"任务名称","kind":"text","required":true},{"name":"submitted","label":"提交时间","kind":"datetime","required":true},{"name":"started","label":"开始时间","kind":"datetime"},{"name":"finished","label":"完成时间","kind":"datetime"},{"name":"arguments","label":"运行参数","kind":"json","default":{}},{"name":"status","label":"状态","kind":"text","required":true,"default":"queued","options":[{"label":"queued","value":"queued"},{"label":"running","value":"running"},{"label":"succeeded","value":"succeeded"},{"label":"failed","value":"failed"},{"label":"canceled","value":"canceled"}]},{"name":"message","label":"消息","kind":"text"},{"name":"logfile","label":"日志文件","kind":"text"},{"name":"trigger_run_id","label":"调度运行编号","kind":"text"},{"name":"processid","label":"进程编号","kind":"integer"},{"name":"progress","label":"进度","kind":"integer","default":0},{"name":"attempt","label":"尝试次数","kind":"integer","readOnly":true,"default":1},{"name":"output","label":"运行输出","kind":"json","readOnly":true},{"name":"submitted_by","label":"提交人编号","kind":"uuid"}]}'::jsonb
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
  ('planning_schedule-list', '/dashboard/planning/execute-schedule', '排产调度', '排产作业定义和定时调度配置，可映射到 enLearn 作业调度引擎。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_schedule-list","route":"/dashboard/planning/execute-schedule","title":"排产调度","description":"排产作业定义和定时调度配置，可映射到 enLearn 作业调度引擎。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_scheduleRows":{"key":"planning_scheduleRows","label":"排产调度数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_schedule","postData":{"resource":"planning_schedule","tableName":"planning_schedule","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_scenarioOptions":{"key":"planning_scenarioOptions","label":"场景选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_scenario","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_schedule-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/execute-schedule/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_scheduleRows"]}]}]},{"id":"planning_schedule-search","kind":"searchForm","targetSourceKey":"planning_scheduleRows","schema":{"columns":4,"fields":[{"field":"name","label":"调度名称","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_schedule-grid","kind":"grid","title":"排产调度列表","sourceKey":"planning_scheduleRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"调度名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"job_type","title":"任务类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"supply_plan":"supply_plan","forecast":"forecast","archive":"archive","export":"export","scenario_copy":"scenario_copy"},"emptyText":"-"}},{"field":"scenario_id_label","title":"场景","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"next_run","title":"下次运行","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"timezone","title":"时区","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"cron_expr","title":"Cron 表达式","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"enabled","title":"启用","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"true":"是","false":"否"},"emptyText":"-"},"width":90,"align":"center"},{"field":"email_failure","title":"失败通知邮箱","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"email_success","title":"成功通知邮箱","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_schedule-edit', '/dashboard/planning/execute-schedule/edit', '排产调度编辑', '排产作业定义和定时调度配置，可映射到 enLearn 作业调度引擎。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_schedule-edit","route":"/dashboard/planning/execute-schedule/edit","title":"排产调度编辑","description":"排产作业定义和定时调度配置，可映射到 enLearn 作业调度引擎。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_scheduleRows":{"key":"planning_scheduleRows","label":"排产调度数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_schedule","postData":{"resource":"planning_schedule","tableName":"planning_schedule","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_scenarioOptions":{"key":"planning_scenarioOptions","label":"场景选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_scenario","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_schedule-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/execute-schedule"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_scheduleRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_scheduleRows","serviceMethod":"saveItem","postData":{"resource":"planning_schedule","id":"{{ forms.planning_schedule_edit_form.id }}","data":{"name":"{{ forms.planning_schedule_edit_form.name }}","job_type":"{{ forms.planning_schedule_edit_form.job_type }}","scenario_id":"{{ forms.planning_schedule_edit_form.scenario_id }}","next_run":"{{ forms.planning_schedule_edit_form.next_run }}","timezone":"{{ forms.planning_schedule_edit_form.timezone }}","cron_expr":"{{ forms.planning_schedule_edit_form.cron_expr }}","enabled":"{{ forms.planning_schedule_edit_form.enabled }}","email_failure":"{{ forms.planning_schedule_edit_form.email_failure }}","email_success":"{{ forms.planning_schedule_edit_form.email_success }}","data":"{{ forms.planning_schedule_edit_form.data }}","trigger_task_id":"{{ forms.planning_schedule_edit_form.trigger_task_id }}","schedule_id":"{{ forms.planning_schedule_edit_form.schedule_id }}","source":"{{ forms.planning_schedule_edit_form.source }}"}},"assignTo":"planning_scheduleSaved"},{"type":"navigate","route":"/dashboard/planning/execute-schedule/edit?id={{ data.planning_scheduleSaved.id }}&fromPage=planning_schedule-list"},{"type":"showMessage","status":"success","message":"排产调度已保存。"}]}]},{"id":"planning_schedule-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_schedule_edit_form","kind":"form","title":"排产调度信息","sourceKey":"planning_scheduleRows","submitSourceKey":"planning_scheduleRows","initialValues":{"id":"","name":"","job_type":"supply_plan","scenario_id":"","next_run":"","timezone":"Asia/Shanghai","cron_expr":"","enabled":false,"email_failure":"","email_success":"","data":{},"trigger_task_id":"","schedule_id":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"调度名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入调度名称"},"rules":[{"required":true,"message":"请输入调度名称"}]},{"field":"job_type","label":"任务类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入任务类型"},"options":[{"label":"supply_plan","value":"supply_plan"},{"label":"forecast","value":"forecast"},{"label":"archive","value":"archive"},{"label":"export","value":"export"},{"label":"scenario_copy","value":"scenario_copy"}],"rules":[{"required":true,"message":"请输入任务类型"}]},{"field":"scenario_id","label":"场景","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择场景","filterable":true},"optionsSourceKey":"planning_scenarioOptions","optionProps":{"label":"label","value":"id"}},{"field":"next_run","label":"下次运行","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入下次运行"}},{"field":"timezone","label":"时区","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入时区"}},{"field":"cron_expr","label":"Cron 表达式","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入Cron 表达式"}},{"field":"enabled","label":"启用","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入启用"}},{"field":"email_failure","label":"失败通知邮箱","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入失败通知邮箱"}},{"field":"email_success","label":"成功通知邮箱","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入成功通知邮箱"}},{"field":"data","label":"任务参数","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入任务参数"}},{"field":"trigger_task_id","label":"调度任务编码","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入调度任务编码"}},{"field":"schedule_id","label":"外部调度编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入外部调度编号"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_schedule-list'
  and edit_page.code = 'planning_schedule-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_schedule-list', 'planning_schedule-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_schedule', '排产调度', 'public.planning_schedule',
  '/dashboard/planning/execute-schedule', 'planning_schedule-list', 'ri-timer-line', '排产作业定义和定时调度配置，可映射到 enLearn 作业调度引擎。',
  'id', 'active', 332, '{"sourceTable":"execute_schedule","freppleModel":"schedule","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"调度名称","kind":"text","required":true},{"name":"job_type","label":"任务类型","kind":"text","required":true,"default":"supply_plan","options":[{"label":"supply_plan","value":"supply_plan"},{"label":"forecast","value":"forecast"},{"label":"archive","value":"archive"},{"label":"export","value":"export"},{"label":"scenario_copy","value":"scenario_copy"}]},{"name":"scenario_id","label":"场景","kind":"relation","relation":"planning_scenario"},{"name":"next_run","label":"下次运行","kind":"datetime"},{"name":"timezone","label":"时区","kind":"text","default":"Asia/Shanghai"},{"name":"cron_expr","label":"Cron 表达式","kind":"text"},{"name":"enabled","label":"启用","kind":"boolean","default":false},{"name":"email_failure","label":"失败通知邮箱","kind":"text"},{"name":"email_success","label":"成功通知邮箱","kind":"text"},{"name":"data","label":"任务参数","kind":"json","default":{}},{"name":"trigger_task_id","label":"调度任务编码","kind":"text"},{"name":"schedule_id","label":"外部调度编号","kind":"text"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_export-list', '/dashboard/planning/execute-export', '排产导出', '排产数据和报表导出定义。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_export-list","route":"/dashboard/planning/execute-export","title":"排产导出","description":"排产数据和报表导出定义。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_exportRows":{"key":"planning_exportRows","label":"排产导出数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_export","postData":{"resource":"planning_export","tableName":"planning_export","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true}},"blocks":[{"id":"planning_export-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/execute-export/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_exportRows"]}]}]},{"id":"planning_export-search","kind":"searchForm","targetSourceKey":"planning_exportRows","schema":{"columns":4,"fields":[{"field":"name","label":"导出文件名","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_export-grid","kind":"grid","title":"排产导出列表","sourceKey":"planning_exportRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"导出文件名","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"sql","title":"SQL 定义","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"report","title":"报表编码","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"arguments","title":"导出参数","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_export-edit', '/dashboard/planning/execute-export/edit', '排产导出编辑', '排产数据和报表导出定义。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_export-edit","route":"/dashboard/planning/execute-export/edit","title":"排产导出编辑","description":"排产数据和报表导出定义。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_exportRows":{"key":"planning_exportRows","label":"排产导出数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_export","postData":{"resource":"planning_export","tableName":"planning_export","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true}},"blocks":[{"id":"planning_export-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/execute-export"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_exportRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_exportRows","serviceMethod":"saveItem","postData":{"resource":"planning_export","id":"{{ forms.planning_export_edit_form.id }}","data":{"name":"{{ forms.planning_export_edit_form.name }}","sql":"{{ forms.planning_export_edit_form.sql }}","report":"{{ forms.planning_export_edit_form.report }}","arguments":"{{ forms.planning_export_edit_form.arguments }}","source":"{{ forms.planning_export_edit_form.source }}"}},"assignTo":"planning_exportSaved"},{"type":"navigate","route":"/dashboard/planning/execute-export/edit?id={{ data.planning_exportSaved.id }}&fromPage=planning_export-list"},{"type":"showMessage","status":"success","message":"排产导出已保存。"}]}]},{"id":"planning_export-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_export_edit_form","kind":"form","title":"排产导出信息","sourceKey":"planning_exportRows","submitSourceKey":"planning_exportRows","initialValues":{"id":"","name":"","sql":"","report":"","arguments":{},"source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"导出文件名","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入导出文件名"},"rules":[{"required":true,"message":"请输入导出文件名"}]},{"field":"sql","label":"SQL 定义","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入SQL 定义"}},{"field":"report","label":"报表编码","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入报表编码"}},{"field":"arguments","label":"导出参数","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入导出参数"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_export-list'
  and edit_page.code = 'planning_export-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_export-list', 'planning_export-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_export', '排产导出', 'public.planning_export',
  '/dashboard/planning/execute-export', 'planning_export-list', 'ri-file-download-line', '排产数据和报表导出定义。',
  'id', 'active', 333, '{"sourceTable":"execute_export","freppleModel":"export","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"导出文件名","kind":"text","required":true},{"name":"sql","label":"SQL 定义","kind":"text"},{"name":"report","label":"报表编码","kind":"text"},{"name":"arguments","label":"导出参数","kind":"json","default":{}},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_scenario-list', '/dashboard/planning/common-scenario', '计划场景', '账套内的基线和 what-if 计划场景元数据。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_scenario-list","route":"/dashboard/planning/common-scenario","title":"计划场景","description":"账套内的基线和 what-if 计划场景元数据。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_scenarioRows":{"key":"planning_scenarioRows","label":"计划场景数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_scenario","postData":{"resource":"planning_scenario","tableName":"planning_scenario","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true},"planning_scenarioOptions":{"key":"planning_scenarioOptions","label":"来源场景选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_scenario","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_scenario-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/common-scenario/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_scenarioRows"]}]}]},{"id":"planning_scenario-search","kind":"searchForm","targetSourceKey":"planning_scenarioRows","schema":{"columns":4,"fields":[{"field":"name","label":"场景编码","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}},{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"free","value":"free"},{"label":"in use","value":"in use"},{"label":"busy","value":"busy"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_scenario-grid","kind":"grid","title":"计划场景列表","sourceKey":"planning_scenarioRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"场景编码","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"status","title":"状态","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"free":"free","in use":"in use","busy":"busy"},"emptyText":"-"}},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source_scenario_id_label","title":"来源场景","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"help_url","title":"帮助地址","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"info","title":"场景信息","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"copied_at","title":"复制时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"released_at","title":"释放时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_scenario-edit', '/dashboard/planning/common-scenario/edit', '计划场景编辑', '账套内的基线和 what-if 计划场景元数据。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_scenario-edit","route":"/dashboard/planning/common-scenario/edit","title":"计划场景编辑","description":"账套内的基线和 what-if 计划场景元数据。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_scenarioRows":{"key":"planning_scenarioRows","label":"计划场景数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_scenario","postData":{"resource":"planning_scenario","tableName":"planning_scenario","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_scenarioOptions":{"key":"planning_scenarioOptions","label":"来源场景选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_scenario","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_scenario-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/common-scenario"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_scenarioRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_scenarioRows","serviceMethod":"saveItem","postData":{"resource":"planning_scenario","id":"{{ forms.planning_scenario_edit_form.id }}","data":{"name":"{{ forms.planning_scenario_edit_form.name }}","description":"{{ forms.planning_scenario_edit_form.description }}","status":"{{ forms.planning_scenario_edit_form.status }}","source_scenario_id":"{{ forms.planning_scenario_edit_form.source_scenario_id }}","help_url":"{{ forms.planning_scenario_edit_form.help_url }}","info":"{{ forms.planning_scenario_edit_form.info }}","copied_at":"{{ forms.planning_scenario_edit_form.copied_at }}","released_at":"{{ forms.planning_scenario_edit_form.released_at }}","source":"{{ forms.planning_scenario_edit_form.source }}"}},"assignTo":"planning_scenarioSaved"},{"type":"navigate","route":"/dashboard/planning/common-scenario/edit?id={{ data.planning_scenarioSaved.id }}&fromPage=planning_scenario-list"},{"type":"showMessage","status":"success","message":"计划场景已保存。"}]}]},{"id":"planning_scenario-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_scenario_edit_form","kind":"form","title":"计划场景信息","sourceKey":"planning_scenarioRows","submitSourceKey":"planning_scenarioRows","initialValues":{"id":"","name":"","description":"","status":"free","source_scenario_id":"","help_url":"","info":{},"copied_at":"","released_at":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"场景编码","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入场景编码"},"rules":[{"required":true,"message":"请输入场景编码"}]},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态"},"options":[{"label":"free","value":"free"},{"label":"in use","value":"in use"},{"label":"busy","value":"busy"}],"rules":[{"required":true,"message":"请输入状态"}]},{"field":"source_scenario_id","label":"来源场景","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择来源场景","filterable":true},"optionsSourceKey":"planning_scenarioOptions","optionProps":{"label":"label","value":"id"}},{"field":"help_url","label":"帮助地址","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入帮助地址"}},{"field":"info","label":"场景信息","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入场景信息"}},{"field":"copied_at","label":"复制时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入复制时间"}},{"field":"released_at","label":"释放时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入释放时间"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_scenario-list'
  and edit_page.code = 'planning_scenario-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_scenario-list', 'planning_scenario-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_scenario', '计划场景', 'public.planning_scenario',
  '/dashboard/planning/common-scenario', 'planning_scenario-list', 'ri-git-branch-line', '账套内的基线和 what-if 计划场景元数据。',
  'id', 'active', 334, '{"sourceTable":"common_scenario","freppleModel":"scenario","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"场景编码","kind":"text","required":true},{"name":"description","label":"说明","kind":"text"},{"name":"status","label":"状态","kind":"text","required":true,"default":"free","options":[{"label":"free","value":"free"},{"label":"in use","value":"in use"},{"label":"busy","value":"busy"}]},{"name":"source_scenario_id","label":"来源场景","kind":"relation","relation":"planning_scenario"},{"name":"help_url","label":"帮助地址","kind":"text"},{"name":"info","label":"场景信息","kind":"json","default":{}},{"name":"copied_at","label":"复制时间","kind":"datetime"},{"name":"released_at","label":"释放时间","kind":"datetime"},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_bucket-list', '/dashboard/planning/common-bucket', '时间桶', '日、周、月、季度等报表和预测时间维度。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_bucket-list","route":"/dashboard/planning/common-bucket","title":"时间桶","description":"日、周、月、季度等报表和预测时间维度。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_bucketRows":{"key":"planning_bucketRows","label":"时间桶数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_bucket","postData":{"resource":"planning_bucket","tableName":"planning_bucket","limit":300,"orderBy":"name","orderDirection":"asc"},"autoLoad":true}},"blocks":[{"id":"planning_bucket-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/common-bucket/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_bucketRows"]}]}]},{"id":"planning_bucket-search","kind":"searchForm","targetSourceKey":"planning_bucketRows","schema":{"columns":4,"fields":[{"field":"name","label":"时间桶编码","component":"vxe-input","props":{"clearable":true}},{"field":"description","label":"说明","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_bucket-grid","kind":"grid","title":"时间桶列表","sourceKey":"planning_bucketRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"name","title":"时间桶编码","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"level","title":"粒度级别","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"description","title":"说明","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_bucket-edit', '/dashboard/planning/common-bucket/edit', '时间桶编辑', '日、周、月、季度等报表和预测时间维度。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_bucket-edit","route":"/dashboard/planning/common-bucket/edit","title":"时间桶编辑","description":"日、周、月、季度等报表和预测时间维度。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_bucketRows":{"key":"planning_bucketRows","label":"时间桶数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_bucket","postData":{"resource":"planning_bucket","tableName":"planning_bucket","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true}},"blocks":[{"id":"planning_bucket-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/common-bucket"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_bucketRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_bucketRows","serviceMethod":"saveItem","postData":{"resource":"planning_bucket","id":"{{ forms.planning_bucket_edit_form.id }}","data":{"name":"{{ forms.planning_bucket_edit_form.name }}","description":"{{ forms.planning_bucket_edit_form.description }}","level":"{{ forms.planning_bucket_edit_form.level }}","source":"{{ forms.planning_bucket_edit_form.source }}"}},"assignTo":"planning_bucketSaved"},{"type":"navigate","route":"/dashboard/planning/common-bucket/edit?id={{ data.planning_bucketSaved.id }}&fromPage=planning_bucket-list"},{"type":"showMessage","status":"success","message":"时间桶已保存。"}]}]},{"id":"planning_bucket-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_bucket_edit_form","kind":"form","title":"时间桶信息","sourceKey":"planning_bucketRows","submitSourceKey":"planning_bucketRows","initialValues":{"id":"","name":"","description":"","level":"","source":""},"schema":{"columns":4,"fields":[{"field":"name","label":"时间桶编码","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入时间桶编码"},"rules":[{"required":true,"message":"请输入时间桶编码"}]},{"field":"description","label":"说明","component":"vxe-input","span":4,"props":{"clearable":true,"placeholder":"请输入说明"}},{"field":"level","label":"粒度级别","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入粒度级别","type":"number"},"rules":[{"required":true,"message":"请输入粒度级别"}]},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_bucket-list'
  and edit_page.code = 'planning_bucket-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_bucket-list', 'planning_bucket-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_bucket', '时间桶', 'public.planning_bucket',
  '/dashboard/planning/common-bucket', 'planning_bucket-list', 'ri-calendar-2-line', '日、周、月、季度等报表和预测时间维度。',
  'id', 'active', 335, '{"sourceTable":"common_bucket","freppleModel":"bucket","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"name","label":"时间桶编码","kind":"text","required":true},{"name":"description","label":"说明","kind":"text"},{"name":"level","label":"粒度级别","kind":"integer","required":true},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_bucketdetail-list', '/dashboard/planning/common-bucketdetail', '时间桶明细', '时间桶中的具体起止区间。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_bucketdetail-list","route":"/dashboard/planning/common-bucketdetail","title":"时间桶明细","description":"时间桶中的具体起止区间。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_bucketdetailRows":{"key":"planning_bucketdetailRows","label":"时间桶明细数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_bucketdetail","postData":{"resource":"planning_bucketdetail","tableName":"planning_bucketdetail","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_bucketOptions":{"key":"planning_bucketOptions","label":"时间桶选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_bucket","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_bucketdetail-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/common-bucketdetail/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_bucketdetailRows"]}]}]},{"id":"planning_bucketdetail-search","kind":"searchForm","targetSourceKey":"planning_bucketdetailRows","schema":{"columns":4,"fields":[{"field":"name","label":"期间名称","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_bucketdetail-grid","kind":"grid","title":"时间桶明细列表","sourceKey":"planning_bucketdetailRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"bucket_id_label","title":"时间桶","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"name","title":"期间名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"startdate","title":"开始时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"enddate","title":"结束时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_bucketdetail-edit', '/dashboard/planning/common-bucketdetail/edit', '时间桶明细编辑', '时间桶中的具体起止区间。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_bucketdetail-edit","route":"/dashboard/planning/common-bucketdetail/edit","title":"时间桶明细编辑","description":"时间桶中的具体起止区间。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_bucketdetailRows":{"key":"planning_bucketdetailRows","label":"时间桶明细数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_bucketdetail","postData":{"resource":"planning_bucketdetail","tableName":"planning_bucketdetail","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_bucketOptions":{"key":"planning_bucketOptions","label":"时间桶选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_bucket","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_bucketdetail-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/common-bucketdetail"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_bucketdetailRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_bucketdetailRows","serviceMethod":"saveItem","postData":{"resource":"planning_bucketdetail","id":"{{ forms.planning_bucketdetail_edit_form.id }}","data":{"bucket_id":"{{ forms.planning_bucketdetail_edit_form.bucket_id }}","name":"{{ forms.planning_bucketdetail_edit_form.name }}","startdate":"{{ forms.planning_bucketdetail_edit_form.startdate }}","enddate":"{{ forms.planning_bucketdetail_edit_form.enddate }}","source":"{{ forms.planning_bucketdetail_edit_form.source }}"}},"assignTo":"planning_bucketdetailSaved"},{"type":"navigate","route":"/dashboard/planning/common-bucketdetail/edit?id={{ data.planning_bucketdetailSaved.id }}&fromPage=planning_bucketdetail-list"},{"type":"showMessage","status":"success","message":"时间桶明细已保存。"}]}]},{"id":"planning_bucketdetail-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_bucketdetail_edit_form","kind":"form","title":"时间桶明细信息","sourceKey":"planning_bucketdetailRows","submitSourceKey":"planning_bucketdetailRows","initialValues":{"id":"","bucket_id":"","name":"","startdate":"","enddate":"","source":""},"schema":{"columns":4,"fields":[{"field":"bucket_id","label":"时间桶","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择时间桶","filterable":true},"optionsSourceKey":"planning_bucketOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入时间桶"}]},{"field":"name","label":"期间名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入期间名称"},"rules":[{"required":true,"message":"请输入期间名称"}]},{"field":"startdate","label":"开始时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入开始时间"},"rules":[{"required":true,"message":"请输入开始时间"}]},{"field":"enddate","label":"结束时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入结束时间"},"rules":[{"required":true,"message":"请输入结束时间"}]},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_bucketdetail-list'
  and edit_page.code = 'planning_bucketdetail-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_bucketdetail-list', 'planning_bucketdetail-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_bucketdetail', '时间桶明细', 'public.planning_bucketdetail',
  '/dashboard/planning/common-bucketdetail', 'planning_bucketdetail-list', 'ri-calendar-event-line', '时间桶中的具体起止区间。',
  'id', 'active', 336, '{"sourceTable":"common_bucketdetail","freppleModel":"bucketdetail","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"bucket_id","label":"时间桶","kind":"relation","relation":"planning_bucket","required":true},{"name":"name","label":"期间名称","kind":"text","required":true},{"name":"startdate","label":"开始时间","kind":"datetime","required":true},{"name":"enddate","label":"结束时间","kind":"datetime","required":true},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_attribute-list', '/dashboard/planning/common-attribute', '扩展属性', '排产模型的自定义字段定义；字段值由模型扩展 JSON 保存。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_attribute-list","route":"/dashboard/planning/common-attribute","title":"扩展属性","description":"排产模型的自定义字段定义；字段值由模型扩展 JSON 保存。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_attributeRows":{"key":"planning_attributeRows","label":"扩展属性数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_attribute","postData":{"resource":"planning_attribute","tableName":"planning_attribute","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true}},"blocks":[{"id":"planning_attribute-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/common-attribute/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_attributeRows"]}]}]},{"id":"planning_attribute-search","kind":"searchForm","targetSourceKey":"planning_attributeRows","schema":{"columns":4,"fields":[{"field":"name","label":"字段编码","component":"vxe-input","props":{"clearable":true}},{"field":"type","label":"字段类型","component":"vxe-select","options":[{"label":"string","value":"string"},{"label":"boolean","value":"boolean"},{"label":"number","value":"number"},{"label":"integer","value":"integer"},{"label":"date","value":"date"},{"label":"datetime","value":"datetime"},{"label":"duration","value":"duration"},{"label":"time","value":"time"},{"label":"jsonb","value":"jsonb"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_attribute-grid","kind":"grid","title":"扩展属性列表","sourceKey":"planning_attributeRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"model","title":"模型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"name","title":"字段编码","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"label","title":"显示名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"type","title":"字段类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"string":"string","boolean":"boolean","number":"number","integer":"integer","date":"date","datetime":"datetime","duration":"duration","time":"time","jsonb":"jsonb"},"emptyText":"-"}},{"field":"editable","title":"可编辑","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"true":"是","false":"否"},"emptyText":"-"},"width":90,"align":"center"},{"field":"initially_hidden","title":"默认隐藏","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"true":"是","false":"否"},"emptyText":"-"},"width":90,"align":"center"},{"field":"source","title":"数据来源","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"lastmodified","title":"最后修改","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_attribute-edit', '/dashboard/planning/common-attribute/edit', '扩展属性编辑', '排产模型的自定义字段定义；字段值由模型扩展 JSON 保存。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_attribute-edit","route":"/dashboard/planning/common-attribute/edit","title":"扩展属性编辑","description":"排产模型的自定义字段定义；字段值由模型扩展 JSON 保存。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_attributeRows":{"key":"planning_attributeRows","label":"扩展属性数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_attribute","postData":{"resource":"planning_attribute","tableName":"planning_attribute","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true}},"blocks":[{"id":"planning_attribute-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/common-attribute"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_attributeRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_attributeRows","serviceMethod":"saveItem","postData":{"resource":"planning_attribute","id":"{{ forms.planning_attribute_edit_form.id }}","data":{"model":"{{ forms.planning_attribute_edit_form.model }}","name":"{{ forms.planning_attribute_edit_form.name }}","label":"{{ forms.planning_attribute_edit_form.label }}","type":"{{ forms.planning_attribute_edit_form.type }}","editable":"{{ forms.planning_attribute_edit_form.editable }}","initially_hidden":"{{ forms.planning_attribute_edit_form.initially_hidden }}","source":"{{ forms.planning_attribute_edit_form.source }}"}},"assignTo":"planning_attributeSaved"},{"type":"navigate","route":"/dashboard/planning/common-attribute/edit?id={{ data.planning_attributeSaved.id }}&fromPage=planning_attribute-list"},{"type":"showMessage","status":"success","message":"扩展属性已保存。"}]}]},{"id":"planning_attribute-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_attribute_edit_form","kind":"form","title":"扩展属性信息","sourceKey":"planning_attributeRows","submitSourceKey":"planning_attributeRows","initialValues":{"id":"","model":"","name":"","label":"","type":"","editable":true,"initially_hidden":false,"source":""},"schema":{"columns":4,"fields":[{"field":"model","label":"模型","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入模型"},"rules":[{"required":true,"message":"请输入模型"}]},{"field":"name","label":"字段编码","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入字段编码"},"rules":[{"required":true,"message":"请输入字段编码"}]},{"field":"label","label":"显示名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入显示名称"},"rules":[{"required":true,"message":"请输入显示名称"}]},{"field":"type","label":"字段类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入字段类型"},"options":[{"label":"string","value":"string"},{"label":"boolean","value":"boolean"},{"label":"number","value":"number"},{"label":"integer","value":"integer"},{"label":"date","value":"date"},{"label":"datetime","value":"datetime"},{"label":"duration","value":"duration"},{"label":"time","value":"time"},{"label":"jsonb","value":"jsonb"}],"rules":[{"required":true,"message":"请输入字段类型"}]},{"field":"editable","label":"可编辑","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入可编辑"}},{"field":"initially_hidden","label":"默认隐藏","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入默认隐藏"}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_attribute-list'
  and edit_page.code = 'planning_attribute-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_attribute-list', 'planning_attribute-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_attribute', '扩展属性', 'public.planning_attribute',
  '/dashboard/planning/common-attribute', 'planning_attribute-list', 'ri-list-settings-line', '排产模型的自定义字段定义；字段值由模型扩展 JSON 保存。',
  'id', 'active', 337, '{"sourceTable":"common_attribute","freppleModel":"attribute","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"model","label":"模型","kind":"text","required":true},{"name":"name","label":"字段编码","kind":"text","required":true},{"name":"label","label":"显示名称","kind":"text","required":true},{"name":"type","label":"字段类型","kind":"text","required":true,"options":[{"label":"string","value":"string"},{"label":"boolean","value":"boolean"},{"label":"number","value":"number"},{"label":"integer","value":"integer"},{"label":"date","value":"date"},{"label":"datetime","value":"datetime"},{"label":"duration","value":"duration"},{"label":"time","value":"time"},{"label":"jsonb","value":"jsonb"}]},{"name":"editable","label":"可编辑","kind":"boolean","default":true},{"name":"initially_hidden","label":"默认隐藏","kind":"boolean","default":false},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_archive_manager-list', '/dashboard/planning/ax-manager', '归档快照', '计划历史快照的统计和保留信息。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_archive_manager-list","route":"/dashboard/planning/ax-manager","title":"归档快照","description":"计划历史快照的统计和保留信息。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_archive_managerRows":{"key":"planning_archive_managerRows","label":"归档快照数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_archive_manager","postData":{"resource":"planning_archive_manager","tableName":"planning_archive_manager","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_scenarioOptions":{"key":"planning_scenarioOptions","label":"场景选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_scenario","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_archive_manager-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_archive_managerRows"]}]}]},{"id":"planning_archive_manager-grid","kind":"grid","title":"归档快照列表","sourceKey":"planning_archive_managerRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"snapshot_date","title":"快照时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"total_records","title":"总记录数","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"buffer_records","title":"库存记录数","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"demand_records","title":"需求记录数","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"operationplan_records","title":"计划单记录数","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"scenario_id_label","title":"场景","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_archive_manager-edit', '/dashboard/planning/ax-manager/edit', '归档快照编辑', '计划历史快照的统计和保留信息。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_archive_manager-edit","route":"/dashboard/planning/ax-manager/edit","title":"归档快照编辑","description":"计划历史快照的统计和保留信息。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_archive_managerRows":{"key":"planning_archive_managerRows","label":"归档快照数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_archive_manager","postData":{"resource":"planning_archive_manager","tableName":"planning_archive_manager","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_scenarioOptions":{"key":"planning_scenarioOptions","label":"场景选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_scenario","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_archive_manager-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/ax-manager"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_archive_managerRows"]}]}]},{"id":"planning_archive_manager-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_archive_manager_edit_form","kind":"form","title":"归档快照信息","sourceKey":"planning_archive_managerRows","submitSourceKey":"planning_archive_managerRows","initialValues":{"id":"","scenario_id":"","snapshot_date":"","total_records":"","buffer_records":"","demand_records":"","operationplan_records":""},"schema":{"columns":4,"fields":[{"field":"scenario_id","label":"场景","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择场景","filterable":true},"optionsSourceKey":"planning_scenarioOptions","optionProps":{"label":"label","value":"id"}},{"field":"snapshot_date","label":"快照时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入快照时间"},"rules":[{"required":true,"message":"请输入快照时间"}]},{"field":"total_records","label":"总记录数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入总记录数","type":"number"},"rules":[{"required":true,"message":"请输入总记录数"}]},{"field":"buffer_records","label":"库存记录数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入库存记录数","type":"number"},"rules":[{"required":true,"message":"请输入库存记录数"}]},{"field":"demand_records","label":"需求记录数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入需求记录数","type":"number"},"rules":[{"required":true,"message":"请输入需求记录数"}]},{"field":"operationplan_records","label":"计划单记录数","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入计划单记录数","type":"number"},"rules":[{"required":true,"message":"请输入计划单记录数"}]}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_archive_manager-list'
  and edit_page.code = 'planning_archive_manager-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_archive_manager-list', 'planning_archive_manager-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_archive_manager', '归档快照', 'public.planning_archive_manager',
  '/dashboard/planning/ax-manager', 'planning_archive_manager-list', 'ri-archive-line', '计划历史快照的统计和保留信息。',
  'id', 'active', 338, '{"sourceTable":"ax_manager","freppleModel":"archive_manager","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"scenario_id","label":"场景","kind":"relation","relation":"planning_scenario"},{"name":"snapshot_date","label":"快照时间","kind":"datetime","required":true},{"name":"total_records","label":"总记录数","kind":"integer","required":true},{"name":"buffer_records","label":"库存记录数","kind":"integer","required":true},{"name":"demand_records","label":"需求记录数","kind":"integer","required":true},{"name":"operationplan_records","label":"计划单记录数","kind":"integer","required":true}]}'::jsonb
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
  ('planning_archived_buffer-list', '/dashboard/planning/ax-buffer', '历史库存', '快照时点的物料库存和安全库存。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_archived_buffer-list","route":"/dashboard/planning/ax-buffer","title":"历史库存","description":"快照时点的物料库存和安全库存。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_archived_bufferRows":{"key":"planning_archived_bufferRows","label":"历史库存数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_archived_buffer","postData":{"resource":"planning_archived_buffer","tableName":"planning_archived_buffer","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_archive_managerOptions":{"key":"planning_archive_managerOptions","label":"归档快照选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_archive_manager","labelField":"id"},"autoLoad":true}},"blocks":[{"id":"planning_archived_buffer-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_archived_bufferRows"]}]}]},{"id":"planning_archived_buffer-grid","kind":"grid","title":"历史库存列表","sourceKey":"planning_archived_bufferRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"snapshot_id_label","title":"归档快照","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item","title":"物料","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location","title":"地点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"batch","title":"批次","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"cost","title":"成本","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"onhand","title":"现有量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"safetystock","title":"安全库存","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_archived_buffer-edit', '/dashboard/planning/ax-buffer/edit', '历史库存编辑', '快照时点的物料库存和安全库存。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_archived_buffer-edit","route":"/dashboard/planning/ax-buffer/edit","title":"历史库存编辑","description":"快照时点的物料库存和安全库存。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_archived_bufferRows":{"key":"planning_archived_bufferRows","label":"历史库存数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_archived_buffer","postData":{"resource":"planning_archived_buffer","tableName":"planning_archived_buffer","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_archive_managerOptions":{"key":"planning_archive_managerOptions","label":"归档快照选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_archive_manager","labelField":"id"},"autoLoad":true}},"blocks":[{"id":"planning_archived_buffer-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/ax-buffer"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_archived_bufferRows"]}]}]},{"id":"planning_archived_buffer-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_archived_buffer_edit_form","kind":"form","title":"历史库存信息","sourceKey":"planning_archived_bufferRows","submitSourceKey":"planning_archived_bufferRows","initialValues":{"id":"","snapshot_id":"","item":"","location":"","batch":"","cost":"","onhand":"","safetystock":""},"schema":{"columns":4,"fields":[{"field":"snapshot_id","label":"归档快照","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择归档快照","filterable":true},"optionsSourceKey":"planning_archive_managerOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入归档快照"}]},{"field":"item","label":"物料","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入物料"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"location","label":"地点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入地点"},"rules":[{"required":true,"message":"请输入地点"}]},{"field":"batch","label":"批次","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入批次"}},{"field":"cost","label":"成本","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入成本","type":"number"}},{"field":"onhand","label":"现有量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入现有量","type":"number"}},{"field":"safetystock","label":"安全库存","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入安全库存","type":"number"}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_archived_buffer-list'
  and edit_page.code = 'planning_archived_buffer-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_archived_buffer-list', 'planning_archived_buffer-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_archived_buffer', '历史库存', 'public.planning_archived_buffer',
  '/dashboard/planning/ax-buffer', 'planning_archived_buffer-list', 'ri-stack-history-line', '快照时点的物料库存和安全库存。',
  'id', 'active', 339, '{"sourceTable":"ax_buffer","freppleModel":"archived_buffer","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"snapshot_id","label":"归档快照","kind":"relation","relation":"planning_archive_manager","required":true},{"name":"item","label":"物料","kind":"text","required":true},{"name":"location","label":"地点","kind":"text","required":true},{"name":"batch","label":"批次","kind":"text"},{"name":"cost","label":"成本","kind":"number"},{"name":"onhand","label":"现有量","kind":"number"},{"name":"safetystock","label":"安全库存","kind":"number"}]}'::jsonb
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
  ('planning_archived_demand-list', '/dashboard/planning/ax-demand', '历史需求', '快照时点的需求、交付日期和已计划数量。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_archived_demand-list","route":"/dashboard/planning/ax-demand","title":"历史需求","description":"快照时点的需求、交付日期和已计划数量。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_archived_demandRows":{"key":"planning_archived_demandRows","label":"历史需求数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_archived_demand","postData":{"resource":"planning_archived_demand","tableName":"planning_archived_demand","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_archive_managerOptions":{"key":"planning_archive_managerOptions","label":"归档快照选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_archive_manager","labelField":"id"},"autoLoad":true}},"blocks":[{"id":"planning_archived_demand-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_archived_demandRows"]}]}]},{"id":"planning_archived_demand-search","kind":"searchForm","targetSourceKey":"planning_archived_demandRows","schema":{"columns":4,"fields":[{"field":"name","label":"需求编号","component":"vxe-input","props":{"clearable":true}},{"field":"status","label":"状态","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_archived_demand-grid","kind":"grid","title":"历史需求列表","sourceKey":"planning_archived_demandRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"snapshot_id_label","title":"归档快照","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"name","title":"需求编号","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item","title":"物料","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location","title":"地点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"customer","title":"客户","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"due","title":"交期","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"priority","title":"优先级","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"quantity","title":"数量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"cost","title":"成本","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_archived_demand-edit', '/dashboard/planning/ax-demand/edit', '历史需求编辑', '快照时点的需求、交付日期和已计划数量。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_archived_demand-edit","route":"/dashboard/planning/ax-demand/edit","title":"历史需求编辑","description":"快照时点的需求、交付日期和已计划数量。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_archived_demandRows":{"key":"planning_archived_demandRows","label":"历史需求数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_archived_demand","postData":{"resource":"planning_archived_demand","tableName":"planning_archived_demand","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_archive_managerOptions":{"key":"planning_archive_managerOptions","label":"归档快照选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_archive_manager","labelField":"id"},"autoLoad":true}},"blocks":[{"id":"planning_archived_demand-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/ax-demand"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_archived_demandRows"]}]}]},{"id":"planning_archived_demand-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_archived_demand_edit_form","kind":"form","title":"历史需求信息","sourceKey":"planning_archived_demandRows","submitSourceKey":"planning_archived_demandRows","initialValues":{"id":"","snapshot_id":"","name":"","item":"","cost":"","location":"","customer":"","due":"","status":"","priority":"","quantity":"","deliverydate":"","quantityplanned":""},"schema":{"columns":4,"fields":[{"field":"snapshot_id","label":"归档快照","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择归档快照","filterable":true},"optionsSourceKey":"planning_archive_managerOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入归档快照"}]},{"field":"name","label":"需求编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入需求编号"},"rules":[{"required":true,"message":"请输入需求编号"}]},{"field":"item","label":"物料","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入物料"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"cost","label":"成本","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入成本","type":"number"}},{"field":"location","label":"地点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入地点"},"rules":[{"required":true,"message":"请输入地点"}]},{"field":"customer","label":"客户","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入客户"},"rules":[{"required":true,"message":"请输入客户"}]},{"field":"due","label":"交期","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入交期"},"rules":[{"required":true,"message":"请输入交期"}]},{"field":"status","label":"状态","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入状态"}},{"field":"priority","label":"优先级","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入优先级","type":"number"},"rules":[{"required":true,"message":"请输入优先级"}]},{"field":"quantity","label":"数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数量","type":"number"},"rules":[{"required":true,"message":"请输入数量"}]},{"field":"deliverydate","label":"计划交期","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入计划交期"}},{"field":"quantityplanned","label":"已计划数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入已计划数量","type":"number"}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_archived_demand-list'
  and edit_page.code = 'planning_archived_demand-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_archived_demand-list', 'planning_archived_demand-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_archived_demand', '历史需求', 'public.planning_archived_demand',
  '/dashboard/planning/ax-demand', 'planning_archived_demand-list', 'ri-file-history-line', '快照时点的需求、交付日期和已计划数量。',
  'id', 'active', 340, '{"sourceTable":"ax_demand","freppleModel":"archived_demand","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"snapshot_id","label":"归档快照","kind":"relation","relation":"planning_archive_manager","required":true},{"name":"name","label":"需求编号","kind":"text","required":true},{"name":"item","label":"物料","kind":"text","required":true},{"name":"cost","label":"成本","kind":"number"},{"name":"location","label":"地点","kind":"text","required":true},{"name":"customer","label":"客户","kind":"text","required":true},{"name":"due","label":"交期","kind":"datetime","required":true},{"name":"status","label":"状态","kind":"text"},{"name":"priority","label":"优先级","kind":"integer","required":true},{"name":"quantity","label":"数量","kind":"number","required":true},{"name":"deliverydate","label":"计划交期","kind":"datetime"},{"name":"quantityplanned","label":"已计划数量","kind":"number"}]}'::jsonb
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
  ('planning_archived_operationplan-list', '/dashboard/planning/ax-operationplan', '历史计划订单', '快照时点的制造、采购、配送和交付计划。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_archived_operationplan-list","route":"/dashboard/planning/ax-operationplan","title":"历史计划订单","description":"快照时点的制造、采购、配送和交付计划。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_archived_operationplanRows":{"key":"planning_archived_operationplanRows","label":"历史计划订单数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_archived_operationplan","postData":{"resource":"planning_archived_operationplan","tableName":"planning_archived_operationplan","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_archive_managerOptions":{"key":"planning_archive_managerOptions","label":"归档快照选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_archive_manager","labelField":"id"},"autoLoad":true}},"blocks":[{"id":"planning_archived_operationplan-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_archived_operationplanRows"]}]}]},{"id":"planning_archived_operationplan-search","kind":"searchForm","targetSourceKey":"planning_archived_operationplanRows","schema":{"columns":4,"fields":[{"field":"reference","label":"计划单号","component":"vxe-input","props":{"clearable":true}},{"field":"status","label":"状态","component":"vxe-input","props":{"clearable":true}},{"field":"type","label":"订单类型","component":"vxe-input","props":{"clearable":true}},{"field":"name","label":"名称","component":"vxe-input","props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_archived_operationplan-grid","kind":"grid","title":"历史计划订单列表","sourceKey":"planning_archived_operationplanRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"snapshot_id_label","title":"归档快照","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"reference","title":"计划单号","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"type","title":"订单类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"数量","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"item","title":"物料","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"status","title":"状态","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"startdate","title":"开始时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"enddate","title":"结束时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"operation","title":"工序","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_archived_operationplan-edit', '/dashboard/planning/ax-operationplan/edit', '历史计划订单编辑', '快照时点的制造、采购、配送和交付计划。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_archived_operationplan-edit","route":"/dashboard/planning/ax-operationplan/edit","title":"历史计划订单编辑","description":"快照时点的制造、采购、配送和交付计划。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_archived_operationplanRows":{"key":"planning_archived_operationplanRows","label":"历史计划订单数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_archived_operationplan","postData":{"resource":"planning_archived_operationplan","tableName":"planning_archived_operationplan","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_archive_managerOptions":{"key":"planning_archive_managerOptions","label":"归档快照选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_archive_manager","labelField":"id"},"autoLoad":true}},"blocks":[{"id":"planning_archived_operationplan-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/ax-operationplan"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_archived_operationplanRows"]}]}]},{"id":"planning_archived_operationplan-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_archived_operationplan_edit_form","kind":"form","title":"历史计划订单信息","sourceKey":"planning_archived_operationplanRows","submitSourceKey":"planning_archived_operationplanRows","initialValues":{"id":"","snapshot_id":"","reference":"","status":"","type":"","quantity":"","startdate":"","enddate":"","operation":"","owner":"","batch":"","item":"","item_cost":"","itemsupplier_cost":"","origin":"","destination":"","supplier":"","location":"","demand":"","due":"","name":""},"schema":{"columns":4,"fields":[{"field":"snapshot_id","label":"归档快照","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择归档快照","filterable":true},"optionsSourceKey":"planning_archive_managerOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入归档快照"}]},{"field":"reference","label":"计划单号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入计划单号"},"rules":[{"required":true,"message":"请输入计划单号"}]},{"field":"status","label":"状态","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入状态"}},{"field":"type","label":"订单类型","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入订单类型"},"rules":[{"required":true,"message":"请输入订单类型"}]},{"field":"quantity","label":"数量","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数量","type":"number"},"rules":[{"required":true,"message":"请输入数量"}]},{"field":"startdate","label":"开始时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入开始时间"}},{"field":"enddate","label":"结束时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入结束时间"}},{"field":"operation","label":"工序","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入工序"}},{"field":"owner","label":"上级计划单","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入上级计划单"}},{"field":"batch","label":"批次","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入批次"}},{"field":"item","label":"物料","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入物料"},"rules":[{"required":true,"message":"请输入物料"}]},{"field":"item_cost","label":"物料成本","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入物料成本","type":"number"}},{"field":"itemsupplier_cost","label":"采购成本","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入采购成本","type":"number"}},{"field":"origin","label":"来源地点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源地点"}},{"field":"destination","label":"目的地点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入目的地点"}},{"field":"supplier","label":"供应商","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入供应商"}},{"field":"location","label":"地点","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入地点"}},{"field":"demand","label":"需求","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入需求"}},{"field":"due","label":"需求日期","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入需求日期"}},{"field":"name","label":"名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入名称"}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_archived_operationplan-list'
  and edit_page.code = 'planning_archived_operationplan-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_archived_operationplan-list', 'planning_archived_operationplan-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_archived_operationplan', '历史计划订单', 'public.planning_archived_operationplan',
  '/dashboard/planning/ax-operationplan', 'planning_archived_operationplan-list', 'ri-calendar-check-line', '快照时点的制造、采购、配送和交付计划。',
  'id', 'active', 341, '{"sourceTable":"ax_operationplan","freppleModel":"archived_operationplan","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"snapshot_id","label":"归档快照","kind":"relation","relation":"planning_archive_manager","required":true},{"name":"reference","label":"计划单号","kind":"text","required":true},{"name":"status","label":"状态","kind":"text"},{"name":"type","label":"订单类型","kind":"text","required":true},{"name":"quantity","label":"数量","kind":"number","required":true},{"name":"startdate","label":"开始时间","kind":"datetime"},{"name":"enddate","label":"结束时间","kind":"datetime"},{"name":"operation","label":"工序","kind":"text"},{"name":"owner","label":"上级计划单","kind":"text"},{"name":"batch","label":"批次","kind":"text"},{"name":"item","label":"物料","kind":"text","required":true},{"name":"item_cost","label":"物料成本","kind":"number"},{"name":"itemsupplier_cost","label":"采购成本","kind":"number"},{"name":"origin","label":"来源地点","kind":"text"},{"name":"destination","label":"目的地点","kind":"text"},{"name":"supplier","label":"供应商","kind":"text"},{"name":"location","label":"地点","kind":"text"},{"name":"demand","label":"需求","kind":"text"},{"name":"due","label":"需求日期","kind":"datetime"},{"name":"name","label":"名称","kind":"text"}]}'::jsonb
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
  ('planning_source_mapping-list', '/dashboard/planning/source-mapping', '主数据映射', '外部或业务系统编码到排产客户、物料、地点、供应商、资源和工序的账套内映射。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_source_mapping-list","route":"/dashboard/planning/source-mapping","title":"主数据映射","description":"外部或业务系统编码到排产客户、物料、地点、供应商、资源和工序的账套内映射。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_source_mappingRows":{"key":"planning_source_mappingRows","label":"主数据映射数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_source_mapping","postData":{"resource":"planning_source_mapping","tableName":"planning_source_mapping","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"目标物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"目标客户选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"目标地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_supplierOptions":{"key":"planning_supplierOptions","label":"目标供应商选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_supplier","labelField":"name"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"目标资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"目标工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_source_mapping-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/source-mapping/edit"},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_source_mappingRows"]}]}]},{"id":"planning_source_mapping-search","kind":"searchForm","targetSourceKey":"planning_source_mappingRows","schema":{"columns":4,"fields":[{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"active","value":"active"},{"label":"inactive","value":"inactive"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_source_mapping-grid","kind":"grid","title":"主数据映射列表","sourceKey":"planning_source_mappingRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"source_system","title":"来源系统","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"entity_type","title":"实体类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"item":"item","customer":"customer","location":"location","supplier":"supplier","resource":"resource","operation":"operation"},"emptyText":"-"}},{"field":"source_key","title":"来源编码","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"status","title":"状态","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"active":"active","inactive":"inactive"},"emptyText":"-"}},{"field":"source_name","title":"来源名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item_id_label","title":"目标物料","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"customer_id_label","title":"目标客户","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"目标地点","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"supplier_id_label","title":"目标供应商","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_source_mapping-edit', '/dashboard/planning/source-mapping/edit', '主数据映射编辑', '外部或业务系统编码到排产客户、物料、地点、供应商、资源和工序的账套内映射。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_source_mapping-edit","route":"/dashboard/planning/source-mapping/edit","title":"主数据映射编辑","description":"外部或业务系统编码到排产客户、物料、地点、供应商、资源和工序的账套内映射。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_source_mappingRows":{"key":"planning_source_mappingRows","label":"主数据映射数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_source_mapping","postData":{"resource":"planning_source_mapping","tableName":"planning_source_mapping","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_itemOptions":{"key":"planning_itemOptions","label":"目标物料选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_item","labelField":"name"},"autoLoad":true},"planning_customerOptions":{"key":"planning_customerOptions","label":"目标客户选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_customer","labelField":"name"},"autoLoad":true},"planning_locationOptions":{"key":"planning_locationOptions","label":"目标地点选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_location","labelField":"name"},"autoLoad":true},"planning_supplierOptions":{"key":"planning_supplierOptions","label":"目标供应商选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_supplier","labelField":"name"},"autoLoad":true},"planning_resourceOptions":{"key":"planning_resourceOptions","label":"目标资源选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_resource","labelField":"name"},"autoLoad":true},"planning_operationOptions":{"key":"planning_operationOptions","label":"目标工序选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_operation","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_source_mapping-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/source-mapping"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_source_mappingRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_source_mappingRows","serviceMethod":"saveItem","postData":{"resource":"planning_source_mapping","id":"{{ forms.planning_source_mapping_edit_form.id }}","data":{"source_system":"{{ forms.planning_source_mapping_edit_form.source_system }}","entity_type":"{{ forms.planning_source_mapping_edit_form.entity_type }}","source_key":"{{ forms.planning_source_mapping_edit_form.source_key }}","source_name":"{{ forms.planning_source_mapping_edit_form.source_name }}","item_id":"{{ forms.planning_source_mapping_edit_form.item_id }}","customer_id":"{{ forms.planning_source_mapping_edit_form.customer_id }}","location_id":"{{ forms.planning_source_mapping_edit_form.location_id }}","supplier_id":"{{ forms.planning_source_mapping_edit_form.supplier_id }}","resource_id":"{{ forms.planning_source_mapping_edit_form.resource_id }}","operation_id":"{{ forms.planning_source_mapping_edit_form.operation_id }}","status":"{{ forms.planning_source_mapping_edit_form.status }}","metadata":"{{ forms.planning_source_mapping_edit_form.metadata }}","source":"{{ forms.planning_source_mapping_edit_form.source }}"}},"assignTo":"planning_source_mappingSaved"},{"type":"navigate","route":"/dashboard/planning/source-mapping/edit?id={{ data.planning_source_mappingSaved.id }}&fromPage=planning_source_mapping-list"},{"type":"showMessage","status":"success","message":"主数据映射已保存。"}]}]},{"id":"planning_source_mapping-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_source_mapping_edit_form","kind":"form","title":"主数据映射信息","sourceKey":"planning_source_mappingRows","submitSourceKey":"planning_source_mappingRows","initialValues":{"id":"","source_system":"enlearn","entity_type":"","source_key":"","source_name":"","item_id":"","customer_id":"","location_id":"","supplier_id":"","resource_id":"","operation_id":"","status":"active","metadata":{},"source":""},"schema":{"columns":4,"fields":[{"field":"source_system","label":"来源系统","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源系统"},"rules":[{"required":true,"message":"请输入来源系统"}]},{"field":"entity_type","label":"实体类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入实体类型"},"options":[{"label":"item","value":"item"},{"label":"customer","value":"customer"},{"label":"location","value":"location"},{"label":"supplier","value":"supplier"},{"label":"resource","value":"resource"},{"label":"operation","value":"operation"}],"rules":[{"required":true,"message":"请输入实体类型"}]},{"field":"source_key","label":"来源编码","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源编码"},"rules":[{"required":true,"message":"请输入来源编码"}]},{"field":"source_name","label":"来源名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源名称"}},{"field":"item_id","label":"目标物料","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择目标物料","filterable":true},"optionsSourceKey":"planning_itemOptions","optionProps":{"label":"label","value":"id"}},{"field":"customer_id","label":"目标客户","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择目标客户","filterable":true},"optionsSourceKey":"planning_customerOptions","optionProps":{"label":"label","value":"id"}},{"field":"location_id","label":"目标地点","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择目标地点","filterable":true},"optionsSourceKey":"planning_locationOptions","optionProps":{"label":"label","value":"id"}},{"field":"supplier_id","label":"目标供应商","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择目标供应商","filterable":true},"optionsSourceKey":"planning_supplierOptions","optionProps":{"label":"label","value":"id"}},{"field":"resource_id","label":"目标资源","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择目标资源","filterable":true},"optionsSourceKey":"planning_resourceOptions","optionProps":{"label":"label","value":"id"}},{"field":"operation_id","label":"目标工序","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择目标工序","filterable":true},"optionsSourceKey":"planning_operationOptions","optionProps":{"label":"label","value":"id"}},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态"},"options":[{"label":"active","value":"active"},{"label":"inactive","value":"inactive"}],"rules":[{"required":true,"message":"请输入状态"}]},{"field":"metadata","label":"扩展信息","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入扩展信息"}},{"field":"last_synced_at","label":"最后同步","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后同步","disabled":true}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_source_mapping-list'
  and edit_page.code = 'planning_source_mapping-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_source_mapping-list', 'planning_source_mapping-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_source_mapping', '主数据映射', 'public.planning_source_mapping',
  '/dashboard/planning/source-mapping', 'planning_source_mapping-list', 'ri-git-merge-line', '外部或业务系统编码到排产客户、物料、地点、供应商、资源和工序的账套内映射。',
  'id', 'active', 342, '{"sourceTable":"source_mapping","freppleModel":"source_mapping","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"source_system","label":"来源系统","kind":"text","required":true,"default":"enlearn"},{"name":"entity_type","label":"实体类型","kind":"text","required":true,"options":[{"label":"item","value":"item"},{"label":"customer","value":"customer"},{"label":"location","value":"location"},{"label":"supplier","value":"supplier"},{"label":"resource","value":"resource"},{"label":"operation","value":"operation"}]},{"name":"source_key","label":"来源编码","kind":"text","required":true},{"name":"source_name","label":"来源名称","kind":"text"},{"name":"item_id","label":"目标物料","kind":"relation","relation":"planning_item"},{"name":"customer_id","label":"目标客户","kind":"relation","relation":"planning_customer"},{"name":"location_id","label":"目标地点","kind":"relation","relation":"planning_location"},{"name":"supplier_id","label":"目标供应商","kind":"relation","relation":"planning_supplier"},{"name":"resource_id","label":"目标资源","kind":"relation","relation":"planning_resource"},{"name":"operation_id","label":"目标工序","kind":"relation","relation":"planning_operation"},{"name":"status","label":"状态","kind":"text","required":true,"default":"active","options":[{"label":"active","value":"active"},{"label":"inactive","value":"inactive"}]},{"name":"metadata","label":"扩展信息","kind":"json","default":{}},{"name":"last_synced_at","label":"最后同步","kind":"datetime","readOnly":true},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_plan_version-list', '/dashboard/planning/plan-version', '计划版本', '一次排产运行的可追溯结果版本，承载场景、输入快照、发布状态和结果汇总。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_plan_version-list","route":"/dashboard/planning/plan-version","title":"计划版本","description":"一次排产运行的可追溯结果版本，承载场景、输入快照、发布状态和结果汇总。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_plan_versionRows":{"key":"planning_plan_versionRows","label":"计划版本数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_plan_version","postData":{"resource":"planning_plan_version","tableName":"planning_plan_version","limit":300,"orderBy":"code","orderDirection":"asc"},"autoLoad":true},"planning_scenarioOptions":{"key":"planning_scenarioOptions","label":"计划场景选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_scenario","labelField":"name"},"autoLoad":true},"planning_runOptions":{"key":"planning_runOptions","label":"运行任务选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_run","labelField":"id"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"来源版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true}},"blocks":[{"id":"planning_plan_version-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","label":"新增","type":"button","mode":"button","status":"primary","icon":"ri-add-line","permissionCode":"planning.models.manage","route":"/dashboard/planning/plan-version/edit"},{"code":"publish","label":"发布选中版本","type":"button","mode":"button","status":"primary","icon":"ri-send-plane-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","serviceName":"planning","serviceMethod":"publishPlanVersion","postData":{"id":"{{ grids.planning_plan_version-grid.currentRow.id }}"},"assignTo":"planningPlanVersionPublished"},{"type":"refreshDataSource","sourceKeys":["planning_plan_versionRows"]},{"type":"showMessage","status":"success","message":"计划版本已发布。"}]},{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_plan_versionRows"]}]}]},{"id":"planning_plan_version-search","kind":"searchForm","targetSourceKey":"planning_plan_versionRows","schema":{"columns":4,"fields":[{"field":"name","label":"版本名称","component":"vxe-input","props":{"clearable":true}},{"field":"status","label":"状态","component":"vxe-select","options":[{"label":"draft","value":"draft"},{"label":"running","value":"running"},{"label":"completed","value":"completed"},{"label":"published","value":"published"},{"label":"superseded","value":"superseded"},{"label":"failed","value":"failed"},{"label":"canceled","value":"canceled"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_plan_version-grid","kind":"grid","title":"计划版本列表","sourceKey":"planning_plan_versionRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"code","title":"版本编码","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"name","title":"版本名称","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"scenario_id_label","title":"计划场景","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"parent_version_id_label","title":"来源版本","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"input_cutoff","title":"输入截止时间","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"horizon_start","title":"计划开始","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"horizon_end","title":"计划结束","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"solver","title":"求解器","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"parameters","title":"参数快照","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":true,"editLabel":"编辑","delete":true,"deleteLabel":"删除"}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_plan_version-edit', '/dashboard/planning/plan-version/edit', '计划版本编辑', '一次排产运行的可追溯结果版本，承载场景、输入快照、发布状态和结果汇总。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_plan_version-edit","route":"/dashboard/planning/plan-version/edit","title":"计划版本编辑","description":"一次排产运行的可追溯结果版本，承载场景、输入快照、发布状态和结果汇总。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_plan_versionRows":{"key":"planning_plan_versionRows","label":"计划版本数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_plan_version","postData":{"resource":"planning_plan_version","tableName":"planning_plan_version","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_scenarioOptions":{"key":"planning_scenarioOptions","label":"计划场景选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_scenario","labelField":"name"},"autoLoad":true},"planning_runOptions":{"key":"planning_runOptions","label":"运行任务选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_run","labelField":"id"},"autoLoad":true},"planning_plan_versionOptions":{"key":"planning_plan_versionOptions","label":"来源版本选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_plan_version","labelField":"code"},"autoLoad":true}},"blocks":[{"id":"planning_plan_version-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/plan-version"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_plan_versionRows"]}]},{"code":"save","label":"保存","type":"button","mode":"button","status":"primary","icon":"ri-save-3-line","permissionCode":"planning.models.manage","directives":[{"type":"invokeService","sourceKey":"planning_plan_versionRows","serviceMethod":"saveItem","postData":{"resource":"planning_plan_version","id":"{{ forms.planning_plan_version_edit_form.id }}","data":{"code":"{{ forms.planning_plan_version_edit_form.code }}","name":"{{ forms.planning_plan_version_edit_form.name }}","scenario_id":"{{ forms.planning_plan_version_edit_form.scenario_id }}","parent_version_id":"{{ forms.planning_plan_version_edit_form.parent_version_id }}","input_cutoff":"{{ forms.planning_plan_version_edit_form.input_cutoff }}","horizon_start":"{{ forms.planning_plan_version_edit_form.horizon_start }}","horizon_end":"{{ forms.planning_plan_version_edit_form.horizon_end }}","solver":"{{ forms.planning_plan_version_edit_form.solver }}","parameters":"{{ forms.planning_plan_version_edit_form.parameters }}","input_snapshot":"{{ forms.planning_plan_version_edit_form.input_snapshot }}","source":"{{ forms.planning_plan_version_edit_form.source }}"}},"assignTo":"planning_plan_versionSaved"},{"type":"navigate","route":"/dashboard/planning/plan-version/edit?id={{ data.planning_plan_versionSaved.id }}&fromPage=planning_plan_version-list"},{"type":"showMessage","status":"success","message":"计划版本已保存。"}]}]},{"id":"planning_plan_version-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_plan_version_edit_form","kind":"form","title":"计划版本信息","sourceKey":"planning_plan_versionRows","submitSourceKey":"planning_plan_versionRows","initialValues":{"id":"","code":"","name":"","scenario_id":"","parent_version_id":"","input_cutoff":"","horizon_start":"","horizon_end":"","solver":"","parameters":{},"input_snapshot":{},"source":""},"schema":{"columns":4,"fields":[{"field":"code","label":"版本编码","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入版本编码"},"rules":[{"required":true,"message":"请输入版本编码"}]},{"field":"name","label":"版本名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入版本名称"},"rules":[{"required":true,"message":"请输入版本名称"}]},{"field":"scenario_id","label":"计划场景","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择计划场景","filterable":true},"optionsSourceKey":"planning_scenarioOptions","optionProps":{"label":"label","value":"id"},"rules":[{"required":true,"message":"请输入计划场景"}]},{"field":"run_id","label":"运行任务","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择运行任务","disabled":true,"filterable":true},"optionsSourceKey":"planning_runOptions","optionProps":{"label":"label","value":"id"}},{"field":"parent_version_id","label":"来源版本","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择来源版本","filterable":true},"optionsSourceKey":"planning_plan_versionOptions","optionProps":{"label":"label","value":"id"}},{"field":"version_no","label":"版本序号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入版本序号","type":"number","disabled":true}},{"field":"status","label":"状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入状态","disabled":true},"options":[{"label":"draft","value":"draft"},{"label":"running","value":"running"},{"label":"completed","value":"completed"},{"label":"published","value":"published"},{"label":"superseded","value":"superseded"},{"label":"failed","value":"failed"},{"label":"canceled","value":"canceled"}]},{"field":"is_current","label":"当前发布版本","component":"vxe-switch","span":2,"props":{"clearable":false,"placeholder":"请输入当前发布版本","disabled":true}},{"field":"input_cutoff","label":"输入截止时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入输入截止时间"}},{"field":"horizon_start","label":"计划开始","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入计划开始"}},{"field":"horizon_end","label":"计划结束","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入计划结束"}},{"field":"solver","label":"求解器","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入求解器"}},{"field":"parameters","label":"参数快照","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入参数快照"}},{"field":"input_snapshot","label":"输入快照","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入输入快照"}},{"field":"result_summary","label":"结果汇总","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入结果汇总","disabled":true}},{"field":"started_at","label":"开始时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入开始时间","disabled":true}},{"field":"completed_at","label":"完成时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入完成时间","disabled":true}},{"field":"published_at","label":"发布时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入发布时间","disabled":true}},{"field":"published_by","label":"发布人","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入发布人","disabled":true}},{"field":"source","label":"数据来源","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入数据来源"}},{"field":"lastmodified","label":"最后修改","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入最后修改","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_plan_version-list'
  and edit_page.code = 'planning_plan_version-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_plan_version-list', 'planning_plan_version-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_plan_version', '计划版本', 'public.planning_plan_version',
  '/dashboard/planning/plan-version', 'planning_plan_version-list', 'ri-git-commit-line', '一次排产运行的可追溯结果版本，承载场景、输入快照、发布状态和结果汇总。',
  'id', 'active', 343, '{"sourceTable":"plan_version","freppleModel":"plan_version","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"code","label":"版本编码","kind":"text","required":true},{"name":"name","label":"版本名称","kind":"text","required":true},{"name":"scenario_id","label":"计划场景","kind":"relation","relation":"planning_scenario","required":true},{"name":"run_id","label":"运行任务","kind":"relation","relation":"planning_run","readOnly":true},{"name":"parent_version_id","label":"来源版本","kind":"relation","relation":"planning_plan_version"},{"name":"version_no","label":"版本序号","kind":"integer","readOnly":true},{"name":"status","label":"状态","kind":"text","readOnly":true,"default":"draft","options":[{"label":"draft","value":"draft"},{"label":"running","value":"running"},{"label":"completed","value":"completed"},{"label":"published","value":"published"},{"label":"superseded","value":"superseded"},{"label":"failed","value":"failed"},{"label":"canceled","value":"canceled"}]},{"name":"is_current","label":"当前发布版本","kind":"boolean","readOnly":true,"default":false},{"name":"input_cutoff","label":"输入截止时间","kind":"datetime"},{"name":"horizon_start","label":"计划开始","kind":"datetime"},{"name":"horizon_end","label":"计划结束","kind":"datetime"},{"name":"solver","label":"求解器","kind":"text"},{"name":"parameters","label":"参数快照","kind":"json","default":{}},{"name":"input_snapshot","label":"输入快照","kind":"json","default":{}},{"name":"result_summary","label":"结果汇总","kind":"json","readOnly":true,"default":{}},{"name":"started_at","label":"开始时间","kind":"datetime","readOnly":true},{"name":"completed_at","label":"完成时间","kind":"datetime","readOnly":true},{"name":"published_at","label":"发布时间","kind":"datetime","readOnly":true},{"name":"published_by","label":"发布人","kind":"uuid","readOnly":true},{"name":"source","label":"数据来源","kind":"text"},{"name":"lastmodified","label":"最后修改","kind":"datetime","readOnly":true}]}'::jsonb
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
  ('planning_demand_sync_state-list', '/dashboard/planning/demand-sync-state', '需求同步状态', '销售订单明细到排产需求的幂等同步状态、映射缺口和错误信息。', 'list', 'dashboard', 'published', true, '{"schemaVersion":1,"code":"planning_demand_sync_state-list","route":"/dashboard/planning/demand-sync-state","title":"需求同步状态","description":"销售订单明细到排产需求的幂等同步状态、映射缺口和错误信息。","layout":"dashboard","status":"published","keepAlive":true,"pageType":"list","dataSources":{"planning_demand_sync_stateRows":{"key":"planning_demand_sync_stateRows","label":"需求同步状态数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_demand_sync_state","postData":{"resource":"planning_demand_sync_state","tableName":"planning_demand_sync_state","limit":300,"orderBy":"updated_at","orderDirection":"desc"},"autoLoad":true},"planning_demandOptions":{"key":"planning_demandOptions","label":"排产需求选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_demand","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_demand_sync_state-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"refresh","label":"刷新","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_demand_sync_stateRows"]}]}]},{"id":"planning_demand_sync_state-search","kind":"searchForm","targetSourceKey":"planning_demand_sync_stateRows","schema":{"columns":4,"fields":[{"field":"status","label":"同步状态","component":"vxe-select","options":[{"label":"pending","value":"pending"},{"label":"synced","value":"synced"},{"label":"ignored","value":"ignored"},{"label":"error","value":"error"}],"props":{"clearable":true}}],"actions":[{"code":"submit","label":"筛选","type":"submit","status":"primary"},{"code":"reset","label":"重置","type":"reset"}]}},{"id":"planning_demand_sync_state-grid","kind":"grid","title":"需求同步状态列表","sourceKey":"planning_demand_sync_stateRows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":520,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"source_type","title":"来源类型","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"sales_order_line":"sales_order_line"},"emptyText":"-"}},{"field":"source_system","title":"来源系统","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source_key","title":"来源唯一键","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"status","title":"同步状态","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"enum","map":{"pending":"pending","synced":"synced","ignored":"ignored","error":"error"},"emptyText":"-"}},{"field":"source_order_id","title":"来源订单编号","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source_line_id","title":"来源明细编号","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source_doc_no","title":"来源单号","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"source_line_no","title":"来源行号","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"demand_id_label","title":"排产需求","minWidth":230,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}}}]}'::jsonb, 1, timezone('utc'::text, now())),
  ('planning_demand_sync_state-edit', '/dashboard/planning/demand-sync-state/edit', '需求同步状态编辑', '销售订单明细到排产需求的幂等同步状态、映射缺口和错误信息。', 'edit', 'dashboard', 'published', false, '{"schemaVersion":1,"code":"planning_demand_sync_state-edit","route":"/dashboard/planning/demand-sync-state/edit","title":"需求同步状态编辑","description":"销售订单明细到排产需求的幂等同步状态、映射缺口和错误信息。","layout":"dashboard","status":"published","keepAlive":false,"pageType":"edit","dataSources":{"planning_demand_sync_stateRows":{"key":"planning_demand_sync_stateRows","label":"需求同步状态数据","serviceName":"planning","serviceMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","tableName":"planning_demand_sync_state","postData":{"resource":"planning_demand_sync_state","tableName":"planning_demand_sync_state","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"],"limit":1},"autoLoad":true},"planning_demandOptions":{"key":"planning_demandOptions","label":"排产需求选项","serviceName":"planning","serviceMethod":"listRelationOptions","postData":{"resource":"planning_demand","labelField":"name"},"autoLoad":true}},"blocks":[{"id":"planning_demand_sync_state-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"back","label":"返回列表","type":"button","mode":"button","icon":"ri-arrow-left-line","route":"/dashboard/planning/demand-sync-state"},{"code":"refresh","label":"重新载入","type":"button","mode":"button","icon":"ri-refresh-line","directives":[{"type":"refreshDataSource","sourceKeys":["planning_demand_sync_stateRows"]}]}]},{"id":"planning_demand_sync_state-edit-tabs","kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础信息","blocks":[{"id":"planning_demand_sync_state_edit_form","kind":"form","title":"需求同步状态信息","sourceKey":"planning_demand_sync_stateRows","submitSourceKey":"planning_demand_sync_stateRows","initialValues":{"id":"","source_type":"sales_order_line","source_system":"enlearn","source_key":"","source_order_id":"","source_line_id":"","source_doc_no":"","source_line_no":"","demand_id":"","status":"pending","message":"","source_updated_at":""},"schema":{"columns":4,"fields":[{"field":"source_type","label":"来源类型","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入来源类型"},"options":[{"label":"sales_order_line","value":"sales_order_line"}],"rules":[{"required":true,"message":"请输入来源类型"}]},{"field":"source_system","label":"来源系统","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源系统"},"rules":[{"required":true,"message":"请输入来源系统"}]},{"field":"source_key","label":"来源唯一键","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源唯一键"},"rules":[{"required":true,"message":"请输入来源唯一键"}]},{"field":"source_order_id","label":"来源订单编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源订单编号"}},{"field":"source_line_id","label":"来源明细编号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源明细编号"}},{"field":"source_doc_no","label":"来源单号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源单号"}},{"field":"source_line_no","label":"来源行号","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入来源行号"}},{"field":"demand_id","label":"排产需求","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请选择排产需求","filterable":true},"optionsSourceKey":"planning_demandOptions","optionProps":{"label":"label","value":"id"}},{"field":"status","label":"同步状态","component":"vxe-select","span":2,"props":{"clearable":true,"placeholder":"请输入同步状态"},"options":[{"label":"pending","value":"pending"},{"label":"synced","value":"synced"},{"label":"ignored","value":"ignored"},{"label":"error","value":"error"}],"rules":[{"required":true,"message":"请输入同步状态"}]},{"field":"message","label":"同步消息","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入同步消息"}},{"field":"source_updated_at","label":"来源更新时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入来源更新时间"}},{"field":"attempted_at","label":"尝试时间","component":"vxe-date-picker","span":2,"props":{"clearable":true,"placeholder":"请输入尝试时间","disabled":true}},{"field":"payload","label":"同步快照","component":"lc-json-editor","span":4,"props":{"clearable":true,"placeholder":"请输入同步快照","disabled":true}}],"actions":[]}}]}]}]}'::jsonb, 1, timezone('utc'::text, now()))
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
where list_page.code = 'planning_demand_sync_state-list'
  and edit_page.code = 'planning_demand_sync_state-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_demand_sync_state-list', 'planning_demand_sync_state-edit')
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'planning_demand_sync_state', '需求同步状态', 'public.planning_demand_sync_state',
  '/dashboard/planning/demand-sync-state', 'planning_demand_sync_state-list', 'ri-refresh-line', '销售订单明细到排产需求的幂等同步状态、映射缺口和错误信息。',
  'id', 'active', 344, '{"sourceTable":"demand_sync_state","freppleModel":"demand_sync_state","service":"planning","listMethod":"listItems","saveMethod":"saveItem","deleteMethod":"deleteItem","accountScoped":true,"fields":[{"name":"source_type","label":"来源类型","kind":"text","required":true,"default":"sales_order_line","options":[{"label":"sales_order_line","value":"sales_order_line"}]},{"name":"source_system","label":"来源系统","kind":"text","required":true,"default":"enlearn"},{"name":"source_key","label":"来源唯一键","kind":"text","required":true},{"name":"source_order_id","label":"来源订单编号","kind":"uuid"},{"name":"source_line_id","label":"来源明细编号","kind":"uuid"},{"name":"source_doc_no","label":"来源单号","kind":"text"},{"name":"source_line_no","label":"来源行号","kind":"text"},{"name":"demand_id","label":"排产需求","kind":"relation","relation":"planning_demand"},{"name":"status","label":"同步状态","kind":"text","required":true,"default":"pending","options":[{"label":"pending","value":"pending"},{"label":"synced","value":"synced"},{"label":"ignored","value":"ignored"},{"label":"error","value":"error"}]},{"name":"message","label":"同步消息","kind":"text"},{"name":"source_updated_at","label":"来源更新时间","kind":"datetime"},{"name":"attempted_at","label":"尝试时间","kind":"datetime","readOnly":true},{"name":"payload","label":"同步快照","kind":"json","readOnly":true,"default":{}}]}'::jsonb
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
)
select
  'planning-6', '计划配置', '/dashboard/planning/6', root.id,
  'group', 'ri-equalizer-2-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 60,
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
  'planning-7', '预测管理', '/dashboard/planning/7', root.id,
  'group', 'ri-line-chart-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 70,
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
  'planning-8', '诊断分析', '/dashboard/planning/8', root.id,
  'group', 'ri-error-warning-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 80,
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
  'planning-9', '执行管理', '/dashboard/planning/9', root.id,
  'group', 'ri-play-circle-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 90,
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
  'planning-10', '场景管理', '/dashboard/planning/10', root.id,
  'group', 'ri-git-branch-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 100,
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
  'planning-11', '时间维度', '/dashboard/planning/11', root.id,
  'group', 'ri-calendar-2-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 110,
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
  'planning-12', '扩展属性', '/dashboard/planning/12', root.id,
  'group', 'ri-list-settings-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 120,
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
  'planning-13', '历史归档', '/dashboard/planning/13', root.id,
  'group', 'ri-archive-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 130,
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
  'planning-14', '集成管理', '/dashboard/planning/14', root.id,
  'group', 'ri-folder-line',
  null, 'planning.models.view', true, true, 'dashboard', 'active', 140,
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
  ),
(
    'planning-common-parameter', '计划参数',
    '/dashboard/planning/common-parameter',
    (select id from public.admin_routes where code = 'planning-6'),
    'page', 'ri-equalizer-2-line', 'planning_parameter-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 240,
    '{"module":"planning","group":"计划配置","sourceTable":"common_parameter"}'::jsonb
  ),
(
    'planning-forecast', '预测对象',
    '/dashboard/planning/forecast',
    (select id from public.admin_routes where code = 'planning-7'),
    'page', 'ri-line-chart-line', 'planning_forecast-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 250,
    '{"module":"planning","group":"预测管理","sourceTable":"forecast"}'::jsonb
  ),
(
    'planning-measure', '预测度量',
    '/dashboard/planning/measure',
    (select id from public.admin_routes where code = 'planning-7'),
    'page', 'ri-ruler-2-line', 'planning_measure-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 260,
    '{"module":"planning","group":"预测管理","sourceTable":"measure"}'::jsonb
  ),
(
    'planning-forecastplan', '预测计划',
    '/dashboard/planning/forecastplan',
    (select id from public.admin_routes where code = 'planning-7'),
    'page', 'ri-calendar-todo-line', 'planning_forecastplan-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 270,
    '{"module":"planning","group":"预测管理","sourceTable":"forecastplan"}'::jsonb
  ),
(
    'planning-out-problem', '计划问题',
    '/dashboard/planning/out-problem',
    (select id from public.admin_routes where code = 'planning-8'),
    'page', 'ri-error-warning-line', 'planning_problem-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 280,
    '{"module":"planning","group":"诊断分析","sourceTable":"out_problem"}'::jsonb
  ),
(
    'planning-out-constraint', '需求约束',
    '/dashboard/planning/out-constraint',
    (select id from public.admin_routes where code = 'planning-8'),
    'page', 'ri-git-close-pull-request-line', 'planning_constraint-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 290,
    '{"module":"planning","group":"诊断分析","sourceTable":"out_constraint"}'::jsonb
  ),
(
    'planning-out-resourceplan', '资源负荷',
    '/dashboard/planning/out-resourceplan',
    (select id from public.admin_routes where code = 'planning-8'),
    'page', 'ri-bar-chart-grouped-line', 'planning_resourceplan-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 300,
    '{"module":"planning","group":"诊断分析","sourceTable":"out_resourceplan"}'::jsonb
  ),
(
    'planning-execute-log', '排产运行',
    '/dashboard/planning/execute-log',
    (select id from public.admin_routes where code = 'planning-9'),
    'page', 'ri-play-circle-line', 'planning_run-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 310,
    '{"module":"planning","group":"执行管理","sourceTable":"execute_log"}'::jsonb
  ),
(
    'planning-execute-schedule', '排产调度',
    '/dashboard/planning/execute-schedule',
    (select id from public.admin_routes where code = 'planning-9'),
    'page', 'ri-timer-line', 'planning_schedule-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 320,
    '{"module":"planning","group":"执行管理","sourceTable":"execute_schedule"}'::jsonb
  ),
(
    'planning-execute-export', '排产导出',
    '/dashboard/planning/execute-export',
    (select id from public.admin_routes where code = 'planning-9'),
    'page', 'ri-file-download-line', 'planning_export-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 330,
    '{"module":"planning","group":"执行管理","sourceTable":"execute_export"}'::jsonb
  ),
(
    'planning-common-scenario', '计划场景',
    '/dashboard/planning/common-scenario',
    (select id from public.admin_routes where code = 'planning-10'),
    'page', 'ri-git-branch-line', 'planning_scenario-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 340,
    '{"module":"planning","group":"场景管理","sourceTable":"common_scenario"}'::jsonb
  ),
(
    'planning-common-bucket', '时间桶',
    '/dashboard/planning/common-bucket',
    (select id from public.admin_routes where code = 'planning-11'),
    'page', 'ri-calendar-2-line', 'planning_bucket-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 350,
    '{"module":"planning","group":"时间维度","sourceTable":"common_bucket"}'::jsonb
  ),
(
    'planning-common-bucketdetail', '时间桶明细',
    '/dashboard/planning/common-bucketdetail',
    (select id from public.admin_routes where code = 'planning-11'),
    'page', 'ri-calendar-event-line', 'planning_bucketdetail-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 360,
    '{"module":"planning","group":"时间维度","sourceTable":"common_bucketdetail"}'::jsonb
  ),
(
    'planning-common-attribute', '扩展属性',
    '/dashboard/planning/common-attribute',
    (select id from public.admin_routes where code = 'planning-12'),
    'page', 'ri-list-settings-line', 'planning_attribute-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 370,
    '{"module":"planning","group":"扩展属性","sourceTable":"common_attribute"}'::jsonb
  ),
(
    'planning-ax-manager', '归档快照',
    '/dashboard/planning/ax-manager',
    (select id from public.admin_routes where code = 'planning-13'),
    'page', 'ri-archive-line', 'planning_archive_manager-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 380,
    '{"module":"planning","group":"历史归档","sourceTable":"ax_manager"}'::jsonb
  ),
(
    'planning-ax-buffer', '历史库存',
    '/dashboard/planning/ax-buffer',
    (select id from public.admin_routes where code = 'planning-13'),
    'page', 'ri-stack-history-line', 'planning_archived_buffer-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 390,
    '{"module":"planning","group":"历史归档","sourceTable":"ax_buffer"}'::jsonb
  ),
(
    'planning-ax-demand', '历史需求',
    '/dashboard/planning/ax-demand',
    (select id from public.admin_routes where code = 'planning-13'),
    'page', 'ri-file-history-line', 'planning_archived_demand-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 400,
    '{"module":"planning","group":"历史归档","sourceTable":"ax_demand"}'::jsonb
  ),
(
    'planning-ax-operationplan', '历史计划订单',
    '/dashboard/planning/ax-operationplan',
    (select id from public.admin_routes where code = 'planning-13'),
    'page', 'ri-calendar-check-line', 'planning_archived_operationplan-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 410,
    '{"module":"planning","group":"历史归档","sourceTable":"ax_operationplan"}'::jsonb
  ),
(
    'planning-source-mapping', '主数据映射',
    '/dashboard/planning/source-mapping',
    (select id from public.admin_routes where code = 'planning-14'),
    'page', 'ri-git-merge-line', 'planning_source_mapping-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 420,
    '{"module":"planning","group":"集成管理","sourceTable":"source_mapping"}'::jsonb
  ),
(
    'planning-plan-version', '计划版本',
    '/dashboard/planning/plan-version',
    (select id from public.admin_routes where code = 'planning-5'),
    'page', 'ri-git-commit-line', 'planning_plan_version-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 430,
    '{"module":"planning","group":"计划结果","sourceTable":"plan_version"}'::jsonb
  ),
(
    'planning-demand-sync-state', '需求同步状态',
    '/dashboard/planning/demand-sync-state',
    (select id from public.admin_routes where code = 'planning-14'),
    'page', 'ri-refresh-line', 'planning_demand_sync_state-list', 'planning.models.view',
    true, true, 'dashboard', 'active', 440,
    '{"module":"planning","group":"集成管理","sourceTable":"demand_sync_state"}'::jsonb
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

update public.admin_routes
set status = 'inactive', visible = false, updated_at = timezone('utc'::text, now())
where (code = 'planning-root' or code like 'planning-%')
  and code not in ('planning-root', 'planning-1', 'planning-2', 'planning-3', 'planning-4', 'planning-5', 'planning-6', 'planning-7', 'planning-8', 'planning-9', 'planning-10', 'planning-11', 'planning-12', 'planning-13', 'planning-14', 'planning-calendar', 'planning-calendarbucket', 'planning-location', 'planning-customer', 'planning-item', 'planning-supplier', 'planning-itemsupplier', 'planning-itemdistribution', 'planning-buffer', 'planning-setupmatrix', 'planning-resource', 'planning-skill', 'planning-resourceskill', 'planning-setuprule', 'planning-operation', 'planning-operationmaterial', 'planning-operationresource', 'planning-suboperation', 'planning-operation-dependency', 'planning-demand', 'planning-operationplan', 'planning-operationplanresource', 'planning-operationplanmaterial', 'planning-common-parameter', 'planning-forecast', 'planning-measure', 'planning-forecastplan', 'planning-out-problem', 'planning-out-constraint', 'planning-out-resourceplan', 'planning-execute-log', 'planning-execute-schedule', 'planning-execute-export', 'planning-common-scenario', 'planning-common-bucket', 'planning-common-bucketdetail', 'planning-common-attribute', 'planning-ax-manager', 'planning-ax-buffer', 'planning-ax-demand', 'planning-ax-operationplan', 'planning-source-mapping', 'planning-plan-version', 'planning-demand-sync-state');

select pg_notify('pgrst', 'reload schema');

commit;

