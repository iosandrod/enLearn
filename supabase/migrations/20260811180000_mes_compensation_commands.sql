-- MES compensation commands. Facts remain immutable: every correction appends
-- a linked transaction and updates only the current aggregate projection.

begin;

alter table public.mes_production_transaction
  add column if not exists original_transaction_id uuid;

alter table public.mes_material_transaction
  add column if not exists original_transaction_id uuid,
  add column if not exists reason_code text;

alter table public.mes_production_transaction
  drop constraint if exists mes_production_transaction_original_account_fk;
alter table public.mes_production_transaction
  add constraint mes_production_transaction_original_account_fk
  foreign key (account_id, original_transaction_id)
  references public.mes_production_transaction(account_id, id) on delete restrict;

alter table public.mes_material_transaction
  drop constraint if exists mes_material_transaction_original_account_fk;
alter table public.mes_material_transaction
  add constraint mes_material_transaction_original_account_fk
  foreign key (account_id, original_transaction_id)
  references public.mes_material_transaction(account_id, id) on delete restrict;

alter table public.mes_production_transaction
  drop constraint if exists mes_production_transaction_original_not_self;
alter table public.mes_production_transaction
  add constraint mes_production_transaction_original_not_self
  check (original_transaction_id is null or original_transaction_id <> id);

alter table public.mes_material_transaction
  drop constraint if exists mes_material_transaction_original_not_self;
alter table public.mes_material_transaction
  add constraint mes_material_transaction_original_not_self
  check (original_transaction_id is null or original_transaction_id <> id);

create unique index if not exists uq_mes_production_single_reversal
  on public.mes_production_transaction(account_id, original_transaction_id)
  where original_transaction_id is not null;

create unique index if not exists uq_mes_material_single_reversal
  on public.mes_material_transaction(account_id, original_transaction_id)
  where original_transaction_id is not null;

create index if not exists idx_mes_production_original_transaction
  on public.mes_production_transaction(account_id, original_transaction_id);

create index if not exists idx_mes_material_original_transaction
  on public.mes_material_transaction(account_id, original_transaction_id);

update public.admin_permissions
set
  description = '释放工单并执行开工、暂停、恢复、报工、投料、退料、完工和反向事务命令。',
  updated_at = timezone('utc'::text, now())
where code = 'mes.execution.manage';

create or replace function public.mes_pause_operation(
  p_account_id uuid,
  p_operation_id uuid,
  p_expected_version bigint,
  p_reason_code text,
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
  has_other_in_progress boolean;
  result jsonb;
begin
  perform public.mes_assert_command_permission(p_account_id);
  claim := public.mes_claim_command(
    p_account_id, p_command_id, 'PauseOperation', 'work_order_operation',
    p_operation_id, p_request_hash, p_user_id, p_device_id,
    p_local_sequence, p_occurred_at
  );
  if coalesce((claim->>'replayed')::boolean, false) then return claim->'result'; end if;
  if nullif(btrim(p_reason_code), '') is null then
    raise exception 'Pause reason is required.' using errcode = '23514';
  end if;

  select * into operation_row
  from public.mes_work_order_operation
  where account_id = p_account_id and id = p_operation_id
  for update;
  if not found then raise exception 'MES operation not found.' using errcode = 'P0002'; end if;

  select * into work_order_row
  from public.mes_work_order
  where account_id = p_account_id and id = operation_row.work_order_id
  for update;

  if operation_row.row_version <> p_expected_version then
    raise exception 'MES operation version conflict.' using errcode = '40001';
  end if;
  if operation_row.status <> 'in_progress' then
    raise exception 'Only an in-progress operation can be paused.' using errcode = '23514';
  end if;
  if work_order_row.status not in ('in_progress', 'paused') then
    raise exception 'Work order cannot be paused from status %.', work_order_row.status using errcode = '23514';
  end if;

  update public.mes_work_order_operation
  set status = 'paused', row_version = row_version + 1,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = operation_row.id
  returning * into operation_row;

  select exists (
    select 1
    from public.mes_work_order_operation other_operation
    where other_operation.account_id = p_account_id
      and other_operation.work_order_id = operation_row.work_order_id
      and other_operation.id <> operation_row.id
      and other_operation.status = 'in_progress'
  ) into has_other_in_progress;

  update public.mes_work_order
  set status = case when has_other_in_progress then 'in_progress' else 'paused' end,
      row_version = row_version + 1,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = operation_row.work_order_id
  returning * into work_order_row;

  perform public.mes_emit_event(
    p_account_id, 'work_order_operation', operation_row.id, operation_row.row_version,
    'mes.operation.paused',
    jsonb_build_object(
      'workOrderId', work_order_row.id,
      'operationId', operation_row.id,
      'reasonCode', btrim(p_reason_code),
      'operatorId', p_user_id,
      'occurredAt', event_time
    )
  );

  result := jsonb_build_object(
    'operation', to_jsonb(operation_row),
    'workOrder', to_jsonb(work_order_row)
  );
  return public.mes_complete_command(p_account_id, p_command_id, result);
end;
$function$;

create or replace function public.mes_resume_operation(
  p_account_id uuid,
  p_operation_id uuid,
  p_expected_version bigint,
  p_reason_code text,
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
    p_account_id, p_command_id, 'ResumeOperation', 'work_order_operation',
    p_operation_id, p_request_hash, p_user_id, p_device_id,
    p_local_sequence, p_occurred_at
  );
  if coalesce((claim->>'replayed')::boolean, false) then return claim->'result'; end if;

  select * into operation_row
  from public.mes_work_order_operation
  where account_id = p_account_id and id = p_operation_id
  for update;
  if not found then raise exception 'MES operation not found.' using errcode = 'P0002'; end if;

  select * into work_order_row
  from public.mes_work_order
  where account_id = p_account_id and id = operation_row.work_order_id
  for update;

  if operation_row.row_version <> p_expected_version then
    raise exception 'MES operation version conflict.' using errcode = '40001';
  end if;
  if operation_row.status <> 'paused' then
    raise exception 'Only a paused operation can be resumed.' using errcode = '23514';
  end if;
  if work_order_row.status not in ('paused', 'in_progress') then
    raise exception 'Work order cannot resume from status %.', work_order_row.status using errcode = '23514';
  end if;

  update public.mes_work_order_operation
  set status = 'in_progress', row_version = row_version + 1,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = operation_row.id
  returning * into operation_row;

  update public.mes_work_order
  set status = 'in_progress', actual_end = null,
      row_version = row_version + 1,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = operation_row.work_order_id
  returning * into work_order_row;

  perform public.mes_emit_event(
    p_account_id, 'work_order_operation', operation_row.id, operation_row.row_version,
    'mes.operation.resumed',
    jsonb_build_object(
      'workOrderId', work_order_row.id,
      'operationId', operation_row.id,
      'reasonCode', nullif(btrim(p_reason_code), ''),
      'operatorId', p_user_id,
      'occurredAt', event_time
    )
  );

  result := jsonb_build_object(
    'operation', to_jsonb(operation_row),
    'workOrder', to_jsonb(work_order_row)
  );
  return public.mes_complete_command(p_account_id, p_command_id, result);
end;
$function$;

create or replace function public.mes_return_material(
  p_account_id uuid,
  p_component_id uuid,
  p_expected_operation_version bigint,
  p_quantity numeric,
  p_lot_no text,
  p_serial_no text,
  p_reason_code text,
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
  trace_available numeric;
  event_time timestamptz := coalesce(p_occurred_at, timezone('utc'::text, now()));
  result jsonb;
begin
  perform public.mes_assert_command_permission(p_account_id);
  claim := public.mes_claim_command(
    p_account_id, p_command_id, 'ReturnMaterial', 'work_order_component',
    p_component_id, p_request_hash, p_user_id, p_device_id,
    p_local_sequence, p_occurred_at
  );
  if coalesce((claim->>'replayed')::boolean, false) then return claim->'result'; end if;
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Material return quantity must be positive.' using errcode = '23514';
  end if;
  if nullif(btrim(p_reason_code), '') is null then
    raise exception 'Material return reason is required.' using errcode = '23514';
  end if;

  select * into component_row
  from public.mes_work_order_component
  where account_id = p_account_id and id = p_component_id
  for update;
  if not found then raise exception 'MES work-order component not found.' using errcode = 'P0002'; end if;
  if component_row.requirement_type <> 'consume' then
    raise exception 'Only consumption components can be returned.' using errcode = '23514';
  end if;
  if component_row.operation_id is null then
    raise exception 'Material component is not assigned to an operation.' using errcode = '23514';
  end if;

  select * into operation_row
  from public.mes_work_order_operation
  where account_id = p_account_id and id = component_row.operation_id
  for update;
  select * into work_order_row
  from public.mes_work_order
  where account_id = p_account_id and id = component_row.work_order_id
  for update;

  if operation_row.row_version <> p_expected_operation_version then
    raise exception 'MES operation version conflict.' using errcode = '40001';
  end if;
  if operation_row.status not in ('ready', 'in_progress', 'paused', 'completed') then
    raise exception 'Material cannot be returned for the current operation status.' using errcode = '23514';
  end if;
  if work_order_row.status in ('closed', 'canceled') then
    raise exception 'Material cannot be returned for a closed or canceled work order.' using errcode = '23514';
  end if;
  if component_row.returned_quantity + p_quantity > component_row.issued_quantity then
    raise exception 'Material return exceeds the net issued quantity.' using errcode = '23514';
  end if;

  if nullif(btrim(p_lot_no), '') is not null or nullif(btrim(p_serial_no), '') is not null then
    select coalesce(sum(transaction.quantity), 0)
    into trace_available
    from public.mes_material_transaction transaction
    where transaction.account_id = p_account_id
      and transaction.component_id = component_row.id
      and transaction.lot_no is not distinct from nullif(btrim(p_lot_no), '')
      and transaction.serial_no is not distinct from nullif(btrim(p_serial_no), '')
      and transaction.transaction_type in ('issue', 'return', 'reverse');
    if trace_available < p_quantity then
      raise exception 'Material return exceeds the issued quantity for the selected lot or serial.' using errcode = '23514';
    end if;
  end if;

  insert into public.mes_material_transaction (
    account_id, work_order_id, operation_id, component_id, command_id,
    transaction_type, item_id, location_id, lot_no, serial_no, quantity,
    operator_id, device_id, local_sequence, occurred_at, reason_code, metadata
  ) values (
    p_account_id, component_row.work_order_id, component_row.operation_id,
    component_row.id, p_command_id, 'return', component_row.item_id,
    component_row.location_id, nullif(btrim(p_lot_no), ''),
    nullif(btrim(p_serial_no), ''), -p_quantity, p_user_id,
    nullif(btrim(p_device_id), ''), p_local_sequence, event_time,
    btrim(p_reason_code), coalesce(p_metadata, '{}'::jsonb)
  ) returning * into transaction_row;

  update public.mes_work_order_component
  set returned_quantity = returned_quantity + p_quantity,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = component_row.id
  returning * into component_row;

  update public.mes_work_order_operation
  set row_version = row_version + 1,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = operation_row.id
  returning * into operation_row;

  perform public.mes_emit_event(
    p_account_id, 'work_order_operation', operation_row.id, operation_row.row_version,
    'mes.material.returned',
    jsonb_build_object(
      'workOrderId', work_order_row.id,
      'operationId', operation_row.id,
      'componentId', component_row.id,
      'transactionId', transaction_row.id,
      'itemId', component_row.item_id,
      'lotNo', transaction_row.lot_no,
      'serialNo', transaction_row.serial_no,
      'quantity', p_quantity,
      'reasonCode', btrim(p_reason_code),
      'occurredAt', event_time
    )
  );

  result := jsonb_build_object(
    'transaction', to_jsonb(transaction_row),
    'component', to_jsonb(component_row),
    'operation', to_jsonb(operation_row)
  );
  return public.mes_complete_command(p_account_id, p_command_id, result);
end;
$function$;

create or replace function public.mes_reverse_production(
  p_account_id uuid,
  p_transaction_id uuid,
  p_expected_operation_version bigint,
  p_reason_code text,
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
  original_row public.mes_production_transaction;
  reversal_row public.mes_production_transaction;
  operation_row public.mes_work_order_operation;
  work_order_row public.mes_work_order;
  is_final_operation boolean;
  has_downstream_facts boolean;
  downstream_reset_count integer := 0;
  remaining_quantity numeric;
  event_time timestamptz := coalesce(p_occurred_at, timezone('utc'::text, now()));
  result jsonb;
begin
  perform public.mes_assert_command_permission(p_account_id);
  claim := public.mes_claim_command(
    p_account_id, p_command_id, 'ReverseProduction', 'production_transaction',
    p_transaction_id, p_request_hash, p_user_id, p_device_id,
    p_local_sequence, p_occurred_at
  );
  if coalesce((claim->>'replayed')::boolean, false) then return claim->'result'; end if;
  if nullif(btrim(p_reason_code), '') is null then
    raise exception 'Production reversal reason is required.' using errcode = '23514';
  end if;

  select * into original_row
  from public.mes_production_transaction
  where account_id = p_account_id and id = p_transaction_id
  for update;
  if not found then raise exception 'MES production transaction not found.' using errcode = 'P0002'; end if;
  if original_row.transaction_type <> 'report' or original_row.original_transaction_id is not null then
    raise exception 'Only an original production report can be reversed.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.mes_production_transaction reversal
    where reversal.account_id = p_account_id
      and reversal.original_transaction_id = original_row.id
  ) then
    raise exception 'Production transaction has already been reversed.' using errcode = '23505';
  end if;

  select * into operation_row
  from public.mes_work_order_operation
  where account_id = p_account_id and id = original_row.operation_id
  for update;
  select * into work_order_row
  from public.mes_work_order
  where account_id = p_account_id and id = original_row.work_order_id
  for update;

  if operation_row.row_version <> p_expected_operation_version then
    raise exception 'MES operation version conflict.' using errcode = '40001';
  end if;
  if work_order_row.status in ('closed', 'canceled') then
    raise exception 'Production cannot be reversed for a closed or canceled work order.' using errcode = '23514';
  end if;
  if operation_row.good_quantity < original_row.good_quantity
     or operation_row.scrap_quantity < original_row.scrap_quantity then
    raise exception 'Production aggregate no longer contains the original report quantity.' using errcode = '23514';
  end if;

  select exists (
    select 1
    from public.mes_work_order_operation later_operation
    where later_operation.account_id = p_account_id
      and later_operation.work_order_id = operation_row.work_order_id
      and later_operation.sequence_no > operation_row.sequence_no
      and later_operation.status not in ('pending', 'ready', 'canceled')
  ) or exists (
    select 1
    from public.mes_production_transaction downstream_transaction
    join public.mes_work_order_operation later_operation
      on later_operation.account_id = downstream_transaction.account_id
     and later_operation.id = downstream_transaction.operation_id
    where downstream_transaction.account_id = p_account_id
      and later_operation.work_order_id = operation_row.work_order_id
      and later_operation.sequence_no > operation_row.sequence_no
      and downstream_transaction.transaction_type = 'report'
      and not exists (
        select 1 from public.mes_production_transaction downstream_reversal
        where downstream_reversal.account_id = downstream_transaction.account_id
          and downstream_reversal.original_transaction_id = downstream_transaction.id
      )
  ) or exists (
    select 1
    from public.mes_material_transaction downstream_transaction
    join public.mes_work_order_operation later_operation
      on later_operation.account_id = downstream_transaction.account_id
     and later_operation.id = downstream_transaction.operation_id
    where downstream_transaction.account_id = p_account_id
      and later_operation.work_order_id = operation_row.work_order_id
      and later_operation.sequence_no > operation_row.sequence_no
      and downstream_transaction.transaction_type in ('issue', 'return', 'consume')
      and not exists (
        select 1 from public.mes_material_transaction downstream_reversal
        where downstream_reversal.account_id = downstream_transaction.account_id
          and downstream_reversal.original_transaction_id = downstream_transaction.id
      )
  ) into has_downstream_facts;

  if has_downstream_facts then
    raise exception 'Downstream execution facts must be compensated in reverse sequence first.' using errcode = '23514';
  end if;

  select not exists (
    select 1 from public.mes_work_order_operation later_operation
    where later_operation.account_id = p_account_id
      and later_operation.work_order_id = operation_row.work_order_id
      and later_operation.sequence_no > operation_row.sequence_no
      and later_operation.status <> 'canceled'
  ) into is_final_operation;

  if is_final_operation and (
    work_order_row.good_quantity < original_row.good_quantity
    or work_order_row.scrap_quantity < original_row.scrap_quantity
  ) then
    raise exception 'Work-order aggregate no longer contains the original report quantity.' using errcode = '23514';
  end if;

  insert into public.mes_production_transaction (
    account_id, work_order_id, operation_id, command_id, transaction_type,
    original_transaction_id, good_quantity, scrap_quantity, operator_id,
    device_id, local_sequence, occurred_at, reason_code, metadata
  ) values (
    p_account_id, original_row.work_order_id, original_row.operation_id,
    p_command_id, 'reverse', original_row.id,
    -original_row.good_quantity, -original_row.scrap_quantity, p_user_id,
    nullif(btrim(p_device_id), ''), p_local_sequence, event_time,
    btrim(p_reason_code),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'originalTransactionId', original_row.id,
      'originalCommandId', original_row.command_id
    )
  ) returning * into reversal_row;

  remaining_quantity := operation_row.good_quantity + operation_row.scrap_quantity
    - original_row.good_quantity - original_row.scrap_quantity;

  update public.mes_work_order_operation
  set good_quantity = good_quantity - original_row.good_quantity,
      scrap_quantity = scrap_quantity - original_row.scrap_quantity,
      status = case
        when status = 'completed' and remaining_quantity > 0 then 'in_progress'
        when status = 'completed' then 'ready'
        else status
      end,
      actual_end = case when status = 'completed' then null else actual_end end,
      row_version = row_version + 1,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = operation_row.id
  returning * into operation_row;

  if operation_row.status in ('ready', 'in_progress') then
    update public.mes_work_order_operation later_operation
    set status = 'pending', row_version = row_version + 1,
        updated_at = timezone('utc'::text, now())
    where later_operation.account_id = p_account_id
      and later_operation.work_order_id = operation_row.work_order_id
      and later_operation.sequence_no > operation_row.sequence_no
      and later_operation.status = 'ready';
    get diagnostics downstream_reset_count = row_count;
  end if;

  update public.mes_work_order
  set good_quantity = good_quantity
        - case when is_final_operation then original_row.good_quantity else 0 end,
      scrap_quantity = scrap_quantity
        - case when is_final_operation then original_row.scrap_quantity else 0 end,
      status = case when status = 'completed' then 'in_progress' else status end,
      actual_end = case when status = 'completed' then null else actual_end end,
      row_version = row_version + 1,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = operation_row.work_order_id
  returning * into work_order_row;

  perform public.mes_emit_event(
    p_account_id, 'work_order_operation', operation_row.id, operation_row.row_version,
    'mes.production.reversed',
    jsonb_build_object(
      'workOrderId', work_order_row.id,
      'operationId', operation_row.id,
      'transactionId', reversal_row.id,
      'originalTransactionId', original_row.id,
      'goodQuantity', original_row.good_quantity,
      'scrapQuantity', original_row.scrap_quantity,
      'reasonCode', btrim(p_reason_code),
      'downstreamResetCount', downstream_reset_count,
      'operatorId', p_user_id,
      'occurredAt', event_time
    )
  );

  result := jsonb_build_object(
    'transaction', to_jsonb(reversal_row),
    'originalTransaction', to_jsonb(original_row),
    'operation', to_jsonb(operation_row),
    'workOrder', to_jsonb(work_order_row),
    'downstreamResetCount', downstream_reset_count
  );
  return public.mes_complete_command(p_account_id, p_command_id, result);
end;
$function$;

create or replace function public.mes_reverse_material(
  p_account_id uuid,
  p_transaction_id uuid,
  p_expected_operation_version bigint,
  p_reason_code text,
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
  original_row public.mes_material_transaction;
  reversal_row public.mes_material_transaction;
  component_row public.mes_work_order_component;
  operation_row public.mes_work_order_operation;
  work_order_row public.mes_work_order;
  aggregate_id uuid;
  aggregate_type text;
  aggregate_version bigint;
  event_time timestamptz := coalesce(p_occurred_at, timezone('utc'::text, now()));
  result jsonb;
begin
  perform public.mes_assert_command_permission(p_account_id);
  claim := public.mes_claim_command(
    p_account_id, p_command_id, 'ReverseMaterial', 'material_transaction',
    p_transaction_id, p_request_hash, p_user_id, p_device_id,
    p_local_sequence, p_occurred_at
  );
  if coalesce((claim->>'replayed')::boolean, false) then return claim->'result'; end if;
  if nullif(btrim(p_reason_code), '') is null then
    raise exception 'Material reversal reason is required.' using errcode = '23514';
  end if;

  select * into original_row
  from public.mes_material_transaction
  where account_id = p_account_id and id = p_transaction_id
  for update;
  if not found then raise exception 'MES material transaction not found.' using errcode = 'P0002'; end if;
  if original_row.transaction_type not in ('issue', 'return', 'consume')
     or original_row.original_transaction_id is not null then
    raise exception 'Only an original material transaction can be reversed.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.mes_material_transaction reversal
    where reversal.account_id = p_account_id
      and reversal.original_transaction_id = original_row.id
  ) then
    raise exception 'Material transaction has already been reversed.' using errcode = '23505';
  end if;

  select * into work_order_row
  from public.mes_work_order
  where account_id = p_account_id and id = original_row.work_order_id
  for update;
  if work_order_row.status in ('closed', 'canceled') then
    raise exception 'Material cannot be reversed for a closed or canceled work order.' using errcode = '23514';
  end if;

  if original_row.operation_id is not null then
    select * into operation_row
    from public.mes_work_order_operation
    where account_id = p_account_id and id = original_row.operation_id
    for update;
    if operation_row.row_version <> p_expected_operation_version then
      raise exception 'MES operation version conflict.' using errcode = '40001';
    end if;
  elsif work_order_row.row_version <> p_expected_operation_version then
    raise exception 'MES work-order version conflict.' using errcode = '40001';
  end if;

  if original_row.component_id is not null then
    select * into component_row
    from public.mes_work_order_component
    where account_id = p_account_id and id = original_row.component_id
    for update;

    if original_row.transaction_type = 'issue' then
      if original_row.quantity <= 0
         or component_row.issued_quantity - original_row.quantity < component_row.returned_quantity then
        raise exception 'Return transactions must be compensated before reversing this material issue.' using errcode = '23514';
      end if;
      update public.mes_work_order_component
      set issued_quantity = issued_quantity - original_row.quantity,
          updated_at = timezone('utc'::text, now())
      where account_id = p_account_id and id = component_row.id
      returning * into component_row;
    elsif original_row.transaction_type = 'return' then
      if original_row.quantity >= 0
         or component_row.returned_quantity < abs(original_row.quantity) then
        raise exception 'Material return aggregate is inconsistent with the original transaction.' using errcode = '23514';
      end if;
      update public.mes_work_order_component
      set returned_quantity = returned_quantity - abs(original_row.quantity),
          updated_at = timezone('utc'::text, now())
      where account_id = p_account_id and id = component_row.id
      returning * into component_row;
    end if;
  end if;

  insert into public.mes_material_transaction (
    account_id, work_order_id, operation_id, component_id, command_id,
    transaction_type, original_transaction_id, item_id, location_id,
    lot_no, serial_no, quantity, operator_id, device_id, local_sequence,
    occurred_at, reason_code, metadata
  ) values (
    p_account_id, original_row.work_order_id, original_row.operation_id,
    original_row.component_id, p_command_id, 'reverse', original_row.id,
    original_row.item_id, original_row.location_id, original_row.lot_no,
    original_row.serial_no, -original_row.quantity, p_user_id,
    nullif(btrim(p_device_id), ''), p_local_sequence, event_time,
    btrim(p_reason_code),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'originalTransactionId', original_row.id,
      'originalCommandId', original_row.command_id,
      'originalTransactionType', original_row.transaction_type
    )
  ) returning * into reversal_row;

  if original_row.operation_id is not null then
    update public.mes_work_order_operation
    set row_version = row_version + 1,
        updated_at = timezone('utc'::text, now())
    where account_id = p_account_id and id = operation_row.id
    returning * into operation_row;
    aggregate_id := operation_row.id;
    aggregate_type := 'work_order_operation';
    aggregate_version := operation_row.row_version;
  else
    update public.mes_work_order
    set row_version = row_version + 1,
        updated_at = timezone('utc'::text, now())
    where account_id = p_account_id and id = work_order_row.id
    returning * into work_order_row;
    aggregate_id := work_order_row.id;
    aggregate_type := 'work_order';
    aggregate_version := work_order_row.row_version;
  end if;

  perform public.mes_emit_event(
    p_account_id, aggregate_type, aggregate_id, aggregate_version,
    'mes.material.reversed',
    jsonb_build_object(
      'workOrderId', work_order_row.id,
      'operationId', original_row.operation_id,
      'componentId', original_row.component_id,
      'transactionId', reversal_row.id,
      'originalTransactionId', original_row.id,
      'originalTransactionType', original_row.transaction_type,
      'quantity', original_row.quantity,
      'reasonCode', btrim(p_reason_code),
      'operatorId', p_user_id,
      'occurredAt', event_time
    )
  );

  result := jsonb_build_object(
    'transaction', to_jsonb(reversal_row),
    'originalTransaction', to_jsonb(original_row),
    'component', case when component_row.id is null then null else to_jsonb(component_row) end,
    'operation', case when operation_row.id is null then null else to_jsonb(operation_row) end,
    'workOrder', to_jsonb(work_order_row)
  );
  return public.mes_complete_command(p_account_id, p_command_id, result);
end;
$function$;

revoke all on function public.mes_pause_operation(uuid, uuid, bigint, text, uuid, text, uuid, text, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.mes_resume_operation(uuid, uuid, bigint, text, uuid, text, uuid, text, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.mes_return_material(uuid, uuid, bigint, numeric, text, text, text, uuid, text, uuid, text, bigint, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.mes_reverse_production(uuid, uuid, bigint, text, uuid, text, uuid, text, bigint, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.mes_reverse_material(uuid, uuid, bigint, text, uuid, text, uuid, text, bigint, timestamptz, jsonb)
  from public, anon, authenticated;

grant execute on function public.mes_pause_operation(uuid, uuid, bigint, text, uuid, text, uuid, text, bigint, timestamptz)
  to authenticated, service_role;
grant execute on function public.mes_resume_operation(uuid, uuid, bigint, text, uuid, text, uuid, text, bigint, timestamptz)
  to authenticated, service_role;
grant execute on function public.mes_return_material(uuid, uuid, bigint, numeric, text, text, text, uuid, text, uuid, text, bigint, timestamptz, jsonb)
  to authenticated, service_role;
grant execute on function public.mes_reverse_production(uuid, uuid, bigint, text, uuid, text, uuid, text, bigint, timestamptz, jsonb)
  to authenticated, service_role;
grant execute on function public.mes_reverse_material(uuid, uuid, bigint, text, uuid, text, uuid, text, bigint, timestamptz, jsonb)
  to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

commit;
