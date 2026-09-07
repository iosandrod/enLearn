-- MES execution core. Planning data is referenced at release time and copied
-- into immutable work-order snapshots before shop-floor execution starts.

begin;

create extension if not exists pgcrypto;

insert into public.admin_permissions (
  code, name, description, resource_type, resource_key, action_code, status, sort_order
) values
  ('mes.execution.view', '查看生产执行', '查看 MES 工单、工序进度、物料事务和生产事件。', 'menu', 'mes', 'view', 'active', 340),
  ('mes.execution.manage', '执行生产任务', '释放工单并执行开工、报工、投料和完工命令。', 'action', 'mes', 'manage', 'active', 341)
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
  on permissions.code in ('mes.execution.view', 'mes.execution.manage')
where roles.code in ('system_admin', 'operations_admin')
on conflict do nothing;

create table if not exists public.mes_work_order (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,
  work_order_no text not null,
  source_operationplan_id uuid,
  source_plan_version_id uuid,
  source_demand_id uuid,
  item_id uuid not null,
  location_id uuid,
  status text not null default 'released'
    check (status in ('released', 'in_progress', 'paused', 'completed', 'closed', 'canceled')),
  planned_quantity numeric(30, 8) not null check (planned_quantity > 0),
  good_quantity numeric(30, 8) not null default 0 check (good_quantity >= 0),
  scrap_quantity numeric(30, 8) not null default 0 check (scrap_quantity >= 0),
  uom text,
  batch text,
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  row_version bigint not null default 0 check (row_version >= 0),
  route_snapshot jsonb not null default '{}'::jsonb,
  bom_snapshot jsonb not null default '[]'::jsonb,
  resource_snapshot jsonb not null default '[]'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  released_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, work_order_no)
);

create table if not exists public.mes_work_order_operation (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,
  work_order_id uuid not null,
  source_operation_id uuid,
  operation_code text not null,
  operation_name text not null,
  sequence_no integer not null check (sequence_no > 0),
  status text not null default 'ready'
    check (status in ('pending', 'ready', 'in_progress', 'paused', 'completed', 'skipped', 'canceled')),
  planned_quantity numeric(30, 8) not null check (planned_quantity > 0),
  good_quantity numeric(30, 8) not null default 0 check (good_quantity >= 0),
  scrap_quantity numeric(30, 8) not null default 0 check (scrap_quantity >= 0),
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  row_version bigint not null default 0 check (row_version >= 0),
  operation_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  foreign key (account_id, work_order_id)
    references public.mes_work_order(account_id, id) on delete restrict,
  foreign key (account_id, source_operation_id)
    references public.planning_operation(account_id, id) on delete restrict,
  unique (account_id, id),
  unique (account_id, work_order_id, sequence_no),
  unique (account_id, work_order_id, source_operation_id)
);

create table if not exists public.mes_work_order_component (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,
  work_order_id uuid not null,
  operation_id uuid,
  item_id uuid not null,
  location_id uuid,
  requirement_type text not null default 'consume'
    check (requirement_type in ('consume', 'produce')),
  required_quantity numeric(30, 8) not null check (required_quantity >= 0),
  issued_quantity numeric(30, 8) not null default 0 check (issued_quantity >= 0),
  returned_quantity numeric(30, 8) not null default 0 check (returned_quantity >= 0),
  source_operationmaterial_id uuid,
  component_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  foreign key (account_id, work_order_id)
    references public.mes_work_order(account_id, id) on delete restrict,
  foreign key (account_id, operation_id)
    references public.mes_work_order_operation(account_id, id) on delete restrict,
  foreign key (account_id, item_id)
    references public.planning_item(account_id, id) on delete restrict,
  foreign key (account_id, location_id)
    references public.planning_location(account_id, id) on delete restrict,
  foreign key (account_id, source_operationmaterial_id)
    references public.planning_operationmaterial(account_id, id) on delete restrict,
  unique (account_id, id)
);

create table if not exists public.mes_production_transaction (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,
  work_order_id uuid not null,
  operation_id uuid not null,
  command_id uuid not null,
  transaction_type text not null
    check (transaction_type in ('report', 'reverse')),
  good_quantity numeric(30, 8) not null default 0,
  scrap_quantity numeric(30, 8) not null default 0,
  operator_id uuid references auth.users(id) on delete set null,
  device_id text,
  local_sequence bigint,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default timezone('utc'::text, now()),
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  foreign key (account_id, work_order_id)
    references public.mes_work_order(account_id, id) on delete restrict,
  foreign key (account_id, operation_id)
    references public.mes_work_order_operation(account_id, id) on delete restrict,
  unique (account_id, id),
  unique (account_id, command_id),
  unique (account_id, device_id, local_sequence)
);

create table if not exists public.mes_material_transaction (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,
  work_order_id uuid not null,
  operation_id uuid,
  component_id uuid,
  command_id uuid not null,
  transaction_type text not null
    check (transaction_type in ('issue', 'return', 'consume', 'reverse')),
  item_id uuid not null,
  location_id uuid,
  lot_no text,
  serial_no text,
  quantity numeric(30, 8) not null check (quantity <> 0),
  operator_id uuid references auth.users(id) on delete set null,
  device_id text,
  local_sequence bigint,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default timezone('utc'::text, now()),
  metadata jsonb not null default '{}'::jsonb,
  foreign key (account_id, work_order_id)
    references public.mes_work_order(account_id, id) on delete restrict,
  foreign key (account_id, operation_id)
    references public.mes_work_order_operation(account_id, id) on delete restrict,
  foreign key (account_id, component_id)
    references public.mes_work_order_component(account_id, id) on delete restrict,
  foreign key (account_id, item_id)
    references public.planning_item(account_id, id) on delete restrict,
  foreign key (account_id, location_id)
    references public.planning_location(account_id, id) on delete restrict,
  unique (account_id, id),
  unique (account_id, command_id),
  unique (account_id, device_id, local_sequence)
);

create table if not exists public.mes_command_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  command_id uuid not null,
  command_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'processing'
    check (status in ('processing', 'completed')),
  result jsonb,
  user_id uuid not null references auth.users(id) on delete restrict,
  device_id text,
  local_sequence bigint,
  occurred_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, command_id),
  unique (account_id, device_id, local_sequence)
);

create table if not exists public.mes_outbox_event (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_version bigint not null,
  event_type text not null,
  payload jsonb not null,
  occurred_at timestamptz not null default timezone('utc'::text, now()),
  published_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id)
);

create table if not exists public.mes_inbox_message (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  consumer text not null,
  message_id text not null,
  payload_hash text,
  result jsonb,
  processed_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, consumer, message_id)
);

alter table public.mes_work_order
  drop constraint if exists mes_work_order_source_operationplan_account_fk;
alter table public.mes_work_order
  add constraint mes_work_order_source_operationplan_account_fk
  foreign key (account_id, source_operationplan_id)
  references public.planning_operationplan(account_id, id) on delete restrict;

alter table public.mes_work_order
  drop constraint if exists mes_work_order_source_plan_version_account_fk;
alter table public.mes_work_order
  add constraint mes_work_order_source_plan_version_account_fk
  foreign key (account_id, source_plan_version_id)
  references public.planning_plan_version(account_id, id) on delete restrict;

alter table public.mes_work_order
  drop constraint if exists mes_work_order_source_demand_account_fk;
alter table public.mes_work_order
  add constraint mes_work_order_source_demand_account_fk
  foreign key (account_id, source_demand_id)
  references public.planning_demand(account_id, id) on delete restrict;

alter table public.mes_work_order
  drop constraint if exists mes_work_order_item_account_fk;
alter table public.mes_work_order
  add constraint mes_work_order_item_account_fk
  foreign key (account_id, item_id)
  references public.planning_item(account_id, id) on delete restrict;

alter table public.mes_work_order
  drop constraint if exists mes_work_order_location_account_fk;
alter table public.mes_work_order
  add constraint mes_work_order_location_account_fk
  foreign key (account_id, location_id)
  references public.planning_location(account_id, id) on delete restrict;

create index if not exists idx_mes_work_order_account_status
  on public.mes_work_order(account_id, status, planned_start, work_order_no);
create index if not exists idx_mes_work_order_source_plan
  on public.mes_work_order(account_id, source_operationplan_id);
create index if not exists idx_mes_work_order_operation_work_order
  on public.mes_work_order_operation(account_id, work_order_id, sequence_no);
create index if not exists idx_mes_component_work_order
  on public.mes_work_order_component(account_id, work_order_id, operation_id);
create index if not exists idx_mes_production_work_order
  on public.mes_production_transaction(account_id, work_order_id, operation_id, occurred_at);
create index if not exists idx_mes_material_trace
  on public.mes_material_transaction(account_id, item_id, lot_no, occurred_at);
create index if not exists idx_mes_outbox_pending
  on public.mes_outbox_event(account_id, occurred_at)
  where published_at is null;

create or replace function public.mes_block_immutable_fact_mutation()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'MES fact records are immutable; append a compensating transaction instead.'
    using errcode = '42501';
end;
$function$;

drop trigger if exists mes_production_transaction_immutable on public.mes_production_transaction;
create trigger mes_production_transaction_immutable
before update or delete on public.mes_production_transaction
for each row execute function public.mes_block_immutable_fact_mutation();

drop trigger if exists mes_material_transaction_immutable on public.mes_material_transaction;
create trigger mes_material_transaction_immutable
before update or delete on public.mes_material_transaction
for each row execute function public.mes_block_immutable_fact_mutation();

create or replace function public.mes_claim_command(
  p_account_id uuid,
  p_command_id uuid,
  p_command_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_request_hash text,
  p_user_id uuid,
  p_device_id text default null,
  p_local_sequence bigint default null,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  command_row public.mes_command_log;
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'MES command user must match the authenticated user.' using errcode = '42501';
  end if;
  if p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid MES request hash is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_command_type), '') is null then
    raise exception 'MES command type is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_aggregate_type), '') is null then
    raise exception 'MES aggregate type is required.' using errcode = '22023';
  end if;
  if p_device_id is null and p_local_sequence is not null
     or p_device_id is not null and p_local_sequence is null then
    raise exception 'deviceId and localSequence must be supplied together.' using errcode = '22023';
  end if;
  if p_device_id is not null and nullif(btrim(p_device_id), '') is null then
    raise exception 'deviceId cannot be empty.' using errcode = '22023';
  end if;
  if p_local_sequence is not null and p_local_sequence < 0 then
    raise exception 'localSequence must be non-negative.' using errcode = '22023';
  end if;

  select * into command_row
  from public.mes_command_log
  where account_id = p_account_id and command_id = p_command_id
  for update;

  if found then
    if command_row.request_hash <> p_request_hash
       or command_row.command_type <> p_command_type then
      raise exception 'MES command id was reused with different data.' using errcode = '23505';
    end if;
    if command_row.status = 'completed' then
      return jsonb_build_object('replayed', true, 'result', command_row.result);
    end if;
    raise exception 'MES command is already being processed.' using errcode = '55P03';
  end if;

  if p_device_id is not null then
    select * into command_row
    from public.mes_command_log
    where account_id = p_account_id
      and device_id = btrim(p_device_id)
      and local_sequence = p_local_sequence
    for update;
    if found then
      if command_row.request_hash <> p_request_hash then
        raise exception 'MES device sequence was reused with different data.' using errcode = '23505';
      end if;
      if command_row.status = 'completed' then
        return jsonb_build_object('replayed', true, 'result', command_row.result);
      end if;
      raise exception 'MES device command is already being processed.' using errcode = '55P03';
    end if;
  end if;

  insert into public.mes_command_log (
    account_id, command_id, command_type, aggregate_type, aggregate_id,
    request_hash, user_id, device_id, local_sequence, occurred_at
  ) values (
    p_account_id, p_command_id, p_command_type, p_aggregate_type, p_aggregate_id,
    p_request_hash, p_user_id, nullif(btrim(p_device_id), ''), p_local_sequence, p_occurred_at
  );

  return jsonb_build_object('replayed', false);
end;
$function$;

create or replace function public.mes_complete_command(
  p_account_id uuid,
  p_command_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  update public.mes_command_log
  set status = 'completed', result = coalesce(p_result, '{}'::jsonb),
      completed_at = timezone('utc'::text, now())
  where account_id = p_account_id and command_id = p_command_id and status = 'processing';
  if not found then
    raise exception 'MES command claim is missing.' using errcode = '40001';
  end if;
  return p_result;
end;
$function$;

create or replace function public.mes_emit_event(
  p_account_id uuid,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_aggregate_version bigint,
  p_event_type text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  event_id uuid;
begin
  insert into public.mes_outbox_event (
    account_id, aggregate_type, aggregate_id, aggregate_version, event_type, payload
  ) values (
    p_account_id, p_aggregate_type, p_aggregate_id, p_aggregate_version,
    p_event_type, coalesce(p_payload, '{}'::jsonb)
  ) returning id into event_id;
  return event_id;
end;
$function$;

create or replace function public.mes_assert_command_permission(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authenticated MES caller required.' using errcode = '42501';
  end if;
  if not public.has_account_permission(p_account_id, 'mes.execution.manage') then
    raise exception 'MES execution manage permission required.' using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.mes_release_work_order(
  p_account_id uuid,
  p_operationplan_id uuid,
  p_command_id uuid,
  p_request_hash text,
  p_user_id uuid,
  p_work_order_no text default null,
  p_quantity numeric default null,
  p_device_id text default null,
  p_local_sequence bigint default null,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  claim jsonb;
  plan_row public.planning_operationplan;
  version_row public.planning_plan_version;
  item_row public.planning_item;
  work_order_row public.mes_work_order;
  released_quantity numeric;
  previously_released numeric := 0;
  release_sequence integer := 1;
  route_root_id uuid;
  route_json jsonb;
  bom_json jsonb;
  resource_json jsonb;
  operation_count integer := 0;
  result jsonb;
begin
  perform public.mes_assert_command_permission(p_account_id);
  claim := public.mes_claim_command(
    p_account_id, p_command_id, 'ReleaseWorkOrder', 'planning_operationplan',
    p_operationplan_id, p_request_hash, p_user_id, p_device_id,
    p_local_sequence, p_occurred_at
  );
  if coalesce((claim->>'replayed')::boolean, false) then return claim->'result'; end if;

  select * into plan_row
  from public.planning_operationplan
  where account_id = p_account_id and id = p_operationplan_id
  for update;
  if not found then raise exception 'Planning operation plan not found.' using errcode = 'P0002'; end if;
  if plan_row.type not in ('MO', 'WO') then
    raise exception 'Only MO or WO planning orders can be released to MES.' using errcode = '23514';
  end if;
  if plan_row.status not in ('proposed', 'approved', 'confirmed') then
    raise exception 'Planning order is not releasable from its current status.' using errcode = '23514';
  end if;
  if plan_row.plan_version_id is null then
    raise exception 'Planning order is not attached to a plan version.' using errcode = '23514';
  end if;
  select * into version_row
  from public.planning_plan_version
  where account_id = p_account_id and id = plan_row.plan_version_id;
  if not found or version_row.status <> 'published' then
    raise exception 'Only a published plan version can be released to MES.' using errcode = '23514';
  end if;
  if plan_row.item_id is null then
    raise exception 'Planning order has no output item.' using errcode = '23514';
  end if;
  select * into item_row
  from public.planning_item
  where account_id = p_account_id and id = plan_row.item_id;
  if not found then raise exception 'Planning item not found.' using errcode = 'P0002'; end if;

  released_quantity := coalesce(p_quantity, plan_row.quantity);
  select coalesce(sum(planned_quantity), 0), count(*) + 1
  into previously_released, release_sequence
  from public.mes_work_order
  where account_id = p_account_id and source_operationplan_id = plan_row.id
    and status <> 'canceled';
  if released_quantity <= 0 or previously_released + released_quantity > plan_row.quantity then
    raise exception 'Released quantity must be positive and cannot exceed the remaining planning quantity.' using errcode = '23514';
  end if;

  route_root_id := plan_row.operation_id;
  select coalesce(jsonb_agg(to_jsonb(route_rows) order by route_rows.sequence_no), '[]'::jsonb)
  into route_json
  from (
    select
      operation.id, operation.name, operation.type, operation.description,
      operation.duration, operation.duration_per, operation.location_id,
      operation.available_id, operation.batchwindow, operation.cost,
      coalesce(suboperation.priority, operation.priority, 1) as sequence_no
    from public.planning_operation operation
    left join public.planning_suboperation suboperation
      on suboperation.account_id = operation.account_id
     and suboperation.suboperation_id = operation.id
     and suboperation.operation_id = route_root_id
    where operation.account_id = p_account_id
      and (
        operation.id = route_root_id
        or suboperation.operation_id = route_root_id
      )
      and operation.type in ('fixed_time', 'time_per')
  ) route_rows;

  if jsonb_array_length(route_json) = 0 and route_root_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', operation.id, 'name', operation.name, 'type', operation.type,
      'description', operation.description, 'duration', operation.duration,
      'duration_per', operation.duration_per, 'location_id', operation.location_id,
      'available_id', operation.available_id, 'batchwindow', operation.batchwindow,
      'cost', operation.cost, 'sequence_no', 1
    )), '[]'::jsonb)
    into route_json
    from public.planning_operation operation
    where operation.account_id = p_account_id and operation.id = route_root_id;
  end if;

  select coalesce(jsonb_agg(to_jsonb(material_rows) order by material_rows.operation_id, material_rows.item_id), '[]'::jsonb)
  into bom_json
  from (
    select material.*
    from public.planning_operationmaterial material
    where material.account_id = p_account_id
      and material.operation_id in (
        select (node->>'id')::uuid from jsonb_array_elements(route_json) node
      )
  ) material_rows;

  select coalesce(jsonb_agg(to_jsonb(resource_rows) order by resource_rows.operation_id, resource_rows.resource_id), '[]'::jsonb)
  into resource_json
  from (
    select requirement.*
    from public.planning_operationresource requirement
    where requirement.account_id = p_account_id
      and requirement.operation_id in (
        select (node->>'id')::uuid from jsonb_array_elements(route_json) node
      )
  ) resource_rows;

  insert into public.mes_work_order (
    account_id, work_order_no, source_operationplan_id, source_plan_version_id,
    source_demand_id, item_id, location_id, planned_quantity, uom, batch,
    planned_start, planned_end, route_snapshot, bom_snapshot, resource_snapshot,
    source_snapshot, released_by
  ) values (
    p_account_id,
    coalesce(
      nullif(btrim(p_work_order_no), ''),
      'MES-' || plan_row.reference || '-' || lpad(release_sequence::text, 3, '0')
    ),
    plan_row.id, plan_row.plan_version_id, plan_row.demand_id, plan_row.item_id,
    plan_row.location_id, released_quantity, item_row.uom, plan_row.batch,
    plan_row.startdate, plan_row.enddate,
    jsonb_build_object('sourceOperationId', route_root_id, 'operations', route_json),
    bom_json, resource_json,
    jsonb_build_object('operationPlan', to_jsonb(plan_row), 'planVersion', to_jsonb(version_row)),
    p_user_id
  ) returning * into work_order_row;

  with route_nodes as (
    select node, ordinality::integer as fallback_sequence
    from jsonb_array_elements(route_json) with ordinality as nodes(node, ordinality)
  )
  insert into public.mes_work_order_operation (
    account_id, work_order_id, source_operation_id, operation_code,
    operation_name, sequence_no, status, planned_quantity,
    planned_start, planned_end, operation_snapshot
  )
  select
    p_account_id, work_order_row.id, (node->>'id')::uuid,
    coalesce(nullif(node->>'name', ''), node->>'id'),
    coalesce(nullif(node->>'name', ''), 'Operation'),
    row_number() over (
      order by coalesce(nullif(node->>'sequence_no', '')::integer, fallback_sequence), node->>'id'
    )::integer,
    case when row_number() over (
      order by coalesce(nullif(node->>'sequence_no', '')::integer, fallback_sequence), node->>'id'
    ) = 1 then 'ready' else 'pending' end,
    released_quantity, plan_row.startdate, plan_row.enddate, node
  from route_nodes;
  get diagnostics operation_count = row_count;

  if operation_count = 0 then
    insert into public.mes_work_order_operation (
      account_id, work_order_id, operation_code, operation_name, sequence_no,
      status, planned_quantity, planned_start, planned_end, operation_snapshot
    ) values (
      p_account_id, work_order_row.id, 'DEFAULT',
      coalesce(plan_row.name, plan_row.reference, '生产工序'), 1, 'ready',
      released_quantity, plan_row.startdate, plan_row.enddate,
      jsonb_build_object('generated', true, 'reason', 'planning route was empty')
    );
    operation_count := 1;
  end if;

  insert into public.mes_work_order_component (
    account_id, work_order_id, operation_id, item_id, location_id,
    requirement_type, required_quantity, source_operationmaterial_id,
    component_snapshot
  )
  select
    p_account_id, work_order_row.id, work_operation.id,
    (material->>'item_id')::uuid,
    nullif(material->>'location_id', '')::uuid,
    case when coalesce((material->>'quantity')::numeric, 0) < 0 then 'consume' else 'produce' end,
    abs(coalesce((material->>'quantity')::numeric, 0) * released_quantity
      + coalesce((material->>'quantity_fixed')::numeric, 0)),
    (material->>'id')::uuid,
    material
  from jsonb_array_elements(bom_json) material
  join public.mes_work_order_operation work_operation
    on work_operation.account_id = p_account_id
   and work_operation.work_order_id = work_order_row.id
   and work_operation.source_operation_id = (material->>'operation_id')::uuid
  where coalesce((material->>'quantity')::numeric, 0) <> 0
     or coalesce((material->>'quantity_fixed')::numeric, 0) <> 0;

  perform public.mes_emit_event(
    p_account_id, 'work_order', work_order_row.id, work_order_row.row_version,
    'mes.work_order.released',
    jsonb_build_object(
      'workOrderId', work_order_row.id,
      'workOrderNo', work_order_row.work_order_no,
      'sourceOperationPlanId', plan_row.id,
      'planVersionId', plan_row.plan_version_id,
      'plannedQuantity', released_quantity,
      'operationCount', operation_count
    )
  );

  result := jsonb_build_object(
    'workOrder', to_jsonb(work_order_row),
    'operationCount', operation_count,
    'snapshot', jsonb_build_object(
      'route', route_json, 'bom', bom_json, 'resources', resource_json
    )
  );
  return public.mes_complete_command(p_account_id, p_command_id, result);
end;
$function$;

create or replace function public.mes_start_operation(
  p_account_id uuid,
  p_operation_id uuid,
  p_expected_version bigint,
  p_command_id uuid,
  p_request_hash text,
  p_user_id uuid,
  p_device_id text default null,
  p_local_sequence bigint default null,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  claim jsonb;
  operation_row public.mes_work_order_operation;
  work_order_row public.mes_work_order;
  event_time timestamptz := coalesce(p_occurred_at, timezone('utc'::text, now()));
  result jsonb;
begin
  perform public.mes_assert_command_permission(p_account_id);
  claim := public.mes_claim_command(
    p_account_id, p_command_id, 'StartOperation', 'work_order_operation',
    p_operation_id, p_request_hash, p_user_id, p_device_id,
    p_local_sequence, p_occurred_at
  );
  if coalesce((claim->>'replayed')::boolean, false) then return claim->'result'; end if;

  select * into operation_row from public.mes_work_order_operation
  where account_id = p_account_id and id = p_operation_id for update;
  if not found then raise exception 'MES operation not found.' using errcode = 'P0002'; end if;
  select * into work_order_row from public.mes_work_order
  where account_id = p_account_id and id = operation_row.work_order_id for update;
  if operation_row.row_version <> p_expected_version then
    raise exception 'MES operation version conflict.' using errcode = '40001';
  end if;
  if operation_row.status not in ('ready', 'paused') then
    raise exception 'Only ready or paused operations can be started.' using errcode = '23514';
  end if;
  if work_order_row.status not in ('released', 'in_progress', 'paused') then
    raise exception 'Work order cannot start from status %.', work_order_row.status using errcode = '23514';
  end if;

  update public.mes_work_order_operation
  set status = 'in_progress', actual_start = coalesce(actual_start, event_time),
      row_version = row_version + 1, updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = p_operation_id
  returning * into operation_row;

  update public.mes_work_order
  set status = 'in_progress', actual_start = coalesce(actual_start, event_time),
      row_version = row_version + 1, updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = operation_row.work_order_id
  returning * into work_order_row;

  perform public.mes_emit_event(
    p_account_id, 'work_order_operation', operation_row.id, operation_row.row_version,
    'mes.operation.started',
    jsonb_build_object('workOrderId', work_order_row.id, 'operationId', operation_row.id,
      'operatorId', p_user_id, 'occurredAt', event_time)
  );
  result := jsonb_build_object('operation', to_jsonb(operation_row), 'workOrder', to_jsonb(work_order_row));
  return public.mes_complete_command(p_account_id, p_command_id, result);
end;
$function$;

create or replace function public.mes_report_production(
  p_account_id uuid,
  p_operation_id uuid,
  p_expected_version bigint,
  p_good_quantity numeric,
  p_scrap_quantity numeric,
  p_command_id uuid,
  p_request_hash text,
  p_user_id uuid,
  p_device_id text default null,
  p_local_sequence bigint default null,
  p_occurred_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  claim jsonb;
  operation_row public.mes_work_order_operation;
  work_order_row public.mes_work_order;
  transaction_row public.mes_production_transaction;
  is_final_operation boolean;
  event_time timestamptz := coalesce(p_occurred_at, timezone('utc'::text, now()));
  result jsonb;
begin
  perform public.mes_assert_command_permission(p_account_id);
  claim := public.mes_claim_command(
    p_account_id, p_command_id, 'ReportProduction', 'work_order_operation',
    p_operation_id, p_request_hash, p_user_id, p_device_id,
    p_local_sequence, p_occurred_at
  );
  if coalesce((claim->>'replayed')::boolean, false) then return claim->'result'; end if;
  if coalesce(p_good_quantity, 0) < 0 or coalesce(p_scrap_quantity, 0) < 0
     or coalesce(p_good_quantity, 0) + coalesce(p_scrap_quantity, 0) <= 0 then
    raise exception 'Production report quantities must be non-negative and not both zero.' using errcode = '23514';
  end if;

  select * into operation_row from public.mes_work_order_operation
  where account_id = p_account_id and id = p_operation_id for update;
  if not found then raise exception 'MES operation not found.' using errcode = 'P0002'; end if;
  select * into work_order_row from public.mes_work_order
  where account_id = p_account_id and id = operation_row.work_order_id for update;
  if operation_row.row_version <> p_expected_version then
    raise exception 'MES operation version conflict.' using errcode = '40001';
  end if;
  if operation_row.status <> 'in_progress' then
    raise exception 'Production can only be reported for an in-progress operation.' using errcode = '23514';
  end if;
  if operation_row.good_quantity + operation_row.scrap_quantity
       + p_good_quantity + p_scrap_quantity > operation_row.planned_quantity then
    raise exception 'Production report exceeds the operation planned quantity.' using errcode = '23514';
  end if;

  insert into public.mes_production_transaction (
    account_id, work_order_id, operation_id, command_id, transaction_type,
    good_quantity, scrap_quantity, operator_id, device_id, local_sequence,
    occurred_at, metadata
  ) values (
    p_account_id, work_order_row.id, operation_row.id, p_command_id, 'report',
    p_good_quantity, p_scrap_quantity, p_user_id, nullif(btrim(p_device_id), ''),
    p_local_sequence, event_time, coalesce(p_metadata, '{}'::jsonb)
  ) returning * into transaction_row;

  update public.mes_work_order_operation
  set good_quantity = good_quantity + p_good_quantity,
      scrap_quantity = scrap_quantity + p_scrap_quantity,
      row_version = row_version + 1,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = p_operation_id
  returning * into operation_row;

  select not exists (
    select 1 from public.mes_work_order_operation later_operation
    where later_operation.account_id = p_account_id
      and later_operation.work_order_id = operation_row.work_order_id
      and later_operation.sequence_no > operation_row.sequence_no
      and later_operation.status <> 'canceled'
  ) into is_final_operation;

  update public.mes_work_order
  set good_quantity = good_quantity + case when is_final_operation then p_good_quantity else 0 end,
      scrap_quantity = scrap_quantity + case when is_final_operation then p_scrap_quantity else 0 end,
      row_version = row_version + 1,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = operation_row.work_order_id
  returning * into work_order_row;

  perform public.mes_emit_event(
    p_account_id, 'work_order_operation', operation_row.id, operation_row.row_version,
    'mes.production.reported',
    jsonb_build_object('workOrderId', work_order_row.id, 'operationId', operation_row.id,
      'transactionId', transaction_row.id, 'goodQuantity', p_good_quantity,
      'scrapQuantity', p_scrap_quantity, 'operatorId', p_user_id, 'occurredAt', event_time)
  );
  result := jsonb_build_object(
    'transaction', to_jsonb(transaction_row),
    'operation', to_jsonb(operation_row),
    'workOrder', to_jsonb(work_order_row)
  );
  return public.mes_complete_command(p_account_id, p_command_id, result);
end;
$function$;

create or replace function public.mes_issue_material(
  p_account_id uuid,
  p_component_id uuid,
  p_expected_operation_version bigint,
  p_quantity numeric,
  p_lot_no text,
  p_serial_no text,
  p_command_id uuid,
  p_request_hash text,
  p_user_id uuid,
  p_device_id text default null,
  p_local_sequence bigint default null,
  p_occurred_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  claim jsonb;
  component_row public.mes_work_order_component;
  operation_row public.mes_work_order_operation;
  work_order_row public.mes_work_order;
  transaction_row public.mes_material_transaction;
  event_time timestamptz := coalesce(p_occurred_at, timezone('utc'::text, now()));
  result jsonb;
begin
  perform public.mes_assert_command_permission(p_account_id);
  claim := public.mes_claim_command(
    p_account_id, p_command_id, 'IssueMaterial', 'work_order_component',
    p_component_id, p_request_hash, p_user_id, p_device_id,
    p_local_sequence, p_occurred_at
  );
  if coalesce((claim->>'replayed')::boolean, false) then return claim->'result'; end if;
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Material issue quantity must be positive.' using errcode = '23514';
  end if;

  select * into component_row from public.mes_work_order_component
  where account_id = p_account_id and id = p_component_id for update;
  if not found then raise exception 'MES work-order component not found.' using errcode = 'P0002'; end if;
  if component_row.requirement_type <> 'consume' then
    raise exception 'Only consumption components can be issued.' using errcode = '23514';
  end if;
  if component_row.operation_id is null then
    raise exception 'Material component is not assigned to an operation.' using errcode = '23514';
  end if;
  select * into operation_row from public.mes_work_order_operation
  where account_id = p_account_id and id = component_row.operation_id for update;
  select * into work_order_row from public.mes_work_order
  where account_id = p_account_id and id = component_row.work_order_id for update;
  if operation_row.row_version <> p_expected_operation_version then
    raise exception 'MES operation version conflict.' using errcode = '40001';
  end if;
  if operation_row.status not in ('ready', 'in_progress', 'paused') then
    raise exception 'Material cannot be issued for the current operation status.' using errcode = '23514';
  end if;
  if component_row.issued_quantity - component_row.returned_quantity + p_quantity
       > component_row.required_quantity then
    raise exception 'Material issue exceeds the snapshotted requirement.' using errcode = '23514';
  end if;

  insert into public.mes_material_transaction (
    account_id, work_order_id, operation_id, component_id, command_id,
    transaction_type, item_id, location_id, lot_no, serial_no, quantity,
    operator_id, device_id, local_sequence, occurred_at, metadata
  ) values (
    p_account_id, component_row.work_order_id, component_row.operation_id,
    component_row.id, p_command_id, 'issue', component_row.item_id,
    component_row.location_id, nullif(btrim(p_lot_no), ''),
    nullif(btrim(p_serial_no), ''), p_quantity, p_user_id,
    nullif(btrim(p_device_id), ''), p_local_sequence, event_time,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning * into transaction_row;

  update public.mes_work_order_component
  set issued_quantity = issued_quantity + p_quantity,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = p_component_id
  returning * into component_row;

  update public.mes_work_order_operation
  set row_version = row_version + 1, updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = operation_row.id
  returning * into operation_row;

  perform public.mes_emit_event(
    p_account_id, 'work_order_operation', operation_row.id, operation_row.row_version,
    'mes.material.issued',
    jsonb_build_object('workOrderId', work_order_row.id, 'operationId', operation_row.id,
      'componentId', component_row.id, 'transactionId', transaction_row.id,
      'itemId', component_row.item_id, 'lotNo', nullif(btrim(p_lot_no), ''),
      'quantity', p_quantity, 'occurredAt', event_time)
  );
  result := jsonb_build_object(
    'transaction', to_jsonb(transaction_row),
    'component', to_jsonb(component_row),
    'operation', to_jsonb(operation_row)
  );
  return public.mes_complete_command(p_account_id, p_command_id, result);
end;
$function$;

create or replace function public.mes_complete_operation(
  p_account_id uuid,
  p_operation_id uuid,
  p_expected_version bigint,
  p_command_id uuid,
  p_request_hash text,
  p_user_id uuid,
  p_device_id text default null,
  p_local_sequence bigint default null,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  claim jsonb;
  operation_row public.mes_work_order_operation;
  work_order_row public.mes_work_order;
  next_operation_row public.mes_work_order_operation;
  event_time timestamptz := coalesce(p_occurred_at, timezone('utc'::text, now()));
  incomplete_count integer;
  result jsonb;
begin
  perform public.mes_assert_command_permission(p_account_id);
  claim := public.mes_claim_command(
    p_account_id, p_command_id, 'CompleteOperation', 'work_order_operation',
    p_operation_id, p_request_hash, p_user_id, p_device_id,
    p_local_sequence, p_occurred_at
  );
  if coalesce((claim->>'replayed')::boolean, false) then return claim->'result'; end if;

  select * into operation_row from public.mes_work_order_operation
  where account_id = p_account_id and id = p_operation_id for update;
  if not found then raise exception 'MES operation not found.' using errcode = 'P0002'; end if;
  select * into work_order_row from public.mes_work_order
  where account_id = p_account_id and id = operation_row.work_order_id for update;
  if operation_row.row_version <> p_expected_version then
    raise exception 'MES operation version conflict.' using errcode = '40001';
  end if;
  if operation_row.status <> 'in_progress' then
    raise exception 'Only an in-progress operation can be completed.' using errcode = '23514';
  end if;
  if operation_row.good_quantity + operation_row.scrap_quantity <= 0 then
    raise exception 'Operation cannot complete before production is reported.' using errcode = '23514';
  end if;

  update public.mes_work_order_operation
  set status = 'completed', actual_end = event_time, row_version = row_version + 1,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = p_operation_id
  returning * into operation_row;

  select * into next_operation_row
  from public.mes_work_order_operation
  where account_id = p_account_id and work_order_id = operation_row.work_order_id
    and sequence_no > operation_row.sequence_no and status = 'pending'
  order by sequence_no
  limit 1
  for update;
  if found then
    update public.mes_work_order_operation
    set status = 'ready', row_version = row_version + 1,
        updated_at = timezone('utc'::text, now())
    where account_id = p_account_id and id = next_operation_row.id
    returning * into next_operation_row;
  end if;

  select count(*) into incomplete_count
  from public.mes_work_order_operation
  where account_id = p_account_id and work_order_id = operation_row.work_order_id
    and status not in ('completed', 'skipped', 'canceled');

  update public.mes_work_order
  set status = case when incomplete_count = 0 then 'completed' else 'in_progress' end,
      actual_end = case when incomplete_count = 0 then event_time else actual_end end,
      row_version = row_version + 1,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = operation_row.work_order_id
  returning * into work_order_row;

  perform public.mes_emit_event(
    p_account_id, 'work_order_operation', operation_row.id, operation_row.row_version,
    'mes.operation.completed',
    jsonb_build_object('workOrderId', work_order_row.id, 'operationId', operation_row.id,
      'nextOperationId', next_operation_row.id, 'workOrderStatus', work_order_row.status,
      'occurredAt', event_time)
  );
  if work_order_row.status = 'completed' then
    perform public.mes_emit_event(
      p_account_id, 'work_order', work_order_row.id, work_order_row.row_version,
      'mes.work_order.completed',
      jsonb_build_object('workOrderId', work_order_row.id, 'workOrderNo', work_order_row.work_order_no,
        'goodQuantity', work_order_row.good_quantity, 'scrapQuantity', work_order_row.scrap_quantity,
        'sourceOperationPlanId', work_order_row.source_operationplan_id,
        'occurredAt', event_time)
    );
  end if;

  result := jsonb_build_object(
    'operation', to_jsonb(operation_row),
    'workOrder', to_jsonb(work_order_row),
    'nextOperation', case when next_operation_row.id is null then null else to_jsonb(next_operation_row) end
  );
  return public.mes_complete_command(p_account_id, p_command_id, result);
end;
$function$;

-- Command functions run through the authenticated MES service and validate
-- the caller again in PostgreSQL as defense in depth.

alter table public.mes_work_order enable row level security;
alter table public.mes_work_order_operation enable row level security;
alter table public.mes_work_order_component enable row level security;
alter table public.mes_production_transaction enable row level security;
alter table public.mes_material_transaction enable row level security;
alter table public.mes_command_log enable row level security;
alter table public.mes_outbox_event enable row level security;
alter table public.mes_inbox_message enable row level security;

do $policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'mes_work_order', 'mes_work_order_operation', 'mes_work_order_component',
    'mes_production_transaction', 'mes_material_transaction'
  ] loop
    execute format('drop policy if exists "MES viewers can read %I" on public.%I', table_name, table_name);
    execute format(
      'create policy "MES viewers can read %I" on public.%I for select to authenticated using (public.has_account_permission(account_id, ''mes.execution.view'') or public.has_account_permission(account_id, ''mes.execution.manage''))',
      table_name, table_name
    );
    execute format('revoke insert, update, delete on public.%I from authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
  end loop;

  foreach table_name in array array[
    'mes_command_log', 'mes_outbox_event', 'mes_inbox_message'
  ] loop
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
  end loop;
end;
$policies$;

revoke all on function public.mes_claim_command(uuid, uuid, text, text, uuid, text, uuid, text, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.mes_complete_command(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.mes_emit_event(uuid, text, uuid, bigint, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.mes_assert_command_permission(uuid)
  from public, anon, authenticated;

grant execute on function public.mes_claim_command(uuid, uuid, text, text, uuid, text, uuid, text, bigint, timestamptz)
  to service_role;
grant execute on function public.mes_complete_command(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.mes_emit_event(uuid, text, uuid, bigint, text, jsonb)
  to service_role;
grant execute on function public.mes_assert_command_permission(uuid)
  to service_role;

revoke all on function public.mes_release_work_order(uuid, uuid, uuid, text, uuid, text, numeric, text, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.mes_start_operation(uuid, uuid, bigint, uuid, text, uuid, text, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.mes_report_production(uuid, uuid, bigint, numeric, numeric, uuid, text, uuid, text, bigint, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.mes_issue_material(uuid, uuid, bigint, numeric, text, text, uuid, text, uuid, text, bigint, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.mes_complete_operation(uuid, uuid, bigint, uuid, text, uuid, text, bigint, timestamptz)
  from public, anon, authenticated;

grant execute on function public.mes_release_work_order(uuid, uuid, uuid, text, uuid, text, numeric, text, bigint, timestamptz)
  to authenticated, service_role;
grant execute on function public.mes_start_operation(uuid, uuid, bigint, uuid, text, uuid, text, bigint, timestamptz)
  to authenticated, service_role;
grant execute on function public.mes_report_production(uuid, uuid, bigint, numeric, numeric, uuid, text, uuid, text, bigint, timestamptz, jsonb)
  to authenticated, service_role;
grant execute on function public.mes_issue_material(uuid, uuid, bigint, numeric, text, text, uuid, text, uuid, text, bigint, timestamptz, jsonb)
  to authenticated, service_role;
grant execute on function public.mes_complete_operation(uuid, uuid, bigint, uuid, text, uuid, text, bigint, timestamptz)
  to authenticated, service_role;

commit;
