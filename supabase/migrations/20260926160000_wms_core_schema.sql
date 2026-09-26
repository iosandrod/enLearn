begin;

-- WMS core schema.  The tables intentionally use the wms_ prefix so that
-- execution inventory remains separate from APS planning projections.

create or replace function public.wms_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.wms_warehouse (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  code text not null,
  name text not null,
  warehouse_type text not null default 'standard' check (warehouse_type in ('standard', '3pl', 'virtual', 'transit')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  address text,
  timezone text not null default 'Asia/Shanghai',
  planning_location_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, code)
);

create table if not exists public.wms_zone (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  warehouse_id uuid not null,
  code text not null,
  name text not null,
  zone_type text not null default 'storage' check (zone_type in ('receiving', 'storage', 'picking', 'packing', 'shipping', 'quarantine', 'counting', 'staging', 'transit')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  sequence_no integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, warehouse_id, code),
  foreign key (account_id, warehouse_id) references public.wms_warehouse(account_id, id) on delete cascade
);

create table if not exists public.wms_location (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  warehouse_id uuid not null,
  zone_id uuid,
  parent_id uuid,
  code text not null,
  name text not null,
  location_type text not null default 'bin' check (location_type in ('aisle', 'rack', 'shelf', 'bin', 'floor', 'dock', 'staging', 'virtual')),
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked')),
  pick_sequence integer not null default 0,
  capacity_qty numeric(30,8),
  capacity_weight numeric(30,8),
  capacity_volume numeric(30,8),
  allow_mixed_item boolean not null default true,
  allow_mixed_lot boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, warehouse_id, code),
  foreign key (account_id, warehouse_id) references public.wms_warehouse(account_id, id) on delete cascade,
  foreign key (account_id, zone_id) references public.wms_zone(account_id, id) on delete set null,
  foreign key (account_id, parent_id) references public.wms_location(account_id, id) on delete set null
);

create table if not exists public.wms_partner (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  code text not null,
  name text not null,
  partner_type text not null default 'other' check (partner_type in ('supplier', 'customer', 'carrier', 'owner', 'other')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  contact_name text,
  phone text,
  address text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, code)
);

create table if not exists public.wms_uom (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  code text not null,
  name text not null,
  precision_scale integer not null default 3 check (precision_scale between 0 and 8),
  status text not null default 'active' check (status in ('active', 'inactive')),
  unique (account_id, id),
  unique (account_id, code)
);

create table if not exists public.wms_item (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  code text not null,
  name text not null,
  item_type text not null default 'finished' check (item_type in ('raw', 'semi_finished', 'finished', 'packaging', 'service', 'other')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  base_uom_id uuid,
  tracking_mode text not null default 'none' check (tracking_mode in ('none', 'lot', 'serial')),
  lot_rule text not null default 'optional' check (lot_rule in ('none', 'optional', 'required')),
  shelf_life_days integer,
  weight numeric(30,8),
  volume numeric(30,8),
  planning_item_id uuid,
  attributes jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, code),
  foreign key (account_id, base_uom_id) references public.wms_uom(account_id, id) on delete restrict,
  check (shelf_life_days is null or shelf_life_days >= 0)
);

create table if not exists public.wms_item_uom (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  item_id uuid not null,
  uom_id uuid not null,
  conversion_rate numeric(30,8) not null check (conversion_rate > 0),
  is_default boolean not null default false,
  barcode text,
  unique (account_id, id),
  unique (account_id, item_id, uom_id),
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete cascade,
  foreign key (account_id, uom_id) references public.wms_uom(account_id, id) on delete restrict
);

create table if not exists public.wms_item_barcode (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  item_id uuid not null,
  item_uom_id uuid,
  barcode text not null,
  barcode_type text not null default 'ean13' check (barcode_type in ('ean8', 'ean13', 'upca', 'code128', 'qr', 'custom')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  unique (account_id, id),
  unique (account_id, barcode),
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete cascade,
  foreign key (account_id, item_uom_id) references public.wms_item_uom(account_id, id) on delete set null
);

create table if not exists public.wms_lot (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  item_id uuid not null,
  lot_no text not null,
  manufacture_date date,
  expiry_date date,
  status text not null default 'released' check (status in ('released', 'quarantine', 'blocked', 'expired')),
  supplier_id uuid,
  attributes jsonb not null default '{}'::jsonb,
  unique (account_id, id),
  unique (account_id, item_id, lot_no),
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete restrict,
  foreign key (account_id, supplier_id) references public.wms_partner(account_id, id) on delete set null,
  check (expiry_date is null or manufacture_date is null or expiry_date >= manufacture_date)
);

create table if not exists public.wms_serial (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  item_id uuid not null,
  serial_no text not null,
  lot_id uuid,
  status text not null default 'available' check (status in ('available', 'reserved', 'picked', 'shipped', 'blocked', 'consumed')),
  received_at timestamptz,
  shipped_at timestamptz,
  unique (account_id, id),
  unique (account_id, item_id, serial_no),
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete restrict,
  foreign key (account_id, lot_id) references public.wms_lot(account_id, id) on delete set null
);

create table if not exists public.wms_lpn (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  lpn_no text not null,
  lpn_type text not null default 'pallet' check (lpn_type in ('pallet', 'carton', 'tote', 'container', 'other')),
  status text not null default 'open' check (status in ('open', 'stored', 'picked', 'shipped', 'closed')),
  current_location_id uuid,
  parent_lpn_id uuid,
  weight numeric(30,8),
  volume numeric(30,8),
  metadata jsonb not null default '{}'::jsonb,
  unique (account_id, id),
  unique (account_id, lpn_no),
  foreign key (account_id, current_location_id) references public.wms_location(account_id, id) on delete set null,
  foreign key (account_id, parent_lpn_id) references public.wms_lpn(account_id, id) on delete set null
);

create table if not exists public.wms_inventory_balance (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  warehouse_id uuid not null,
  location_id uuid not null,
  item_id uuid not null,
  lot_id uuid,
  serial_id uuid,
  lpn_id uuid,
  inventory_status text not null default 'available' check (inventory_status in ('available', 'quarantine', 'blocked', 'damaged', 'in_transit')),
  on_hand_qty numeric(30,8) not null default 0,
  reserved_qty numeric(30,8) not null default 0,
  picked_qty numeric(30,8) not null default 0,
  available_qty numeric(30,8) generated always as (on_hand_qty - reserved_qty - picked_qty) stored,
  last_movement_at timestamptz,
  unique (account_id, id),
  unique (account_id, warehouse_id, location_id, item_id, lot_id, serial_id, lpn_id, inventory_status),
  foreign key (account_id, warehouse_id) references public.wms_warehouse(account_id, id) on delete restrict,
  foreign key (account_id, location_id) references public.wms_location(account_id, id) on delete restrict,
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete restrict,
  foreign key (account_id, lot_id) references public.wms_lot(account_id, id) on delete restrict,
  foreign key (account_id, serial_id) references public.wms_serial(account_id, id) on delete restrict,
  foreign key (account_id, lpn_id) references public.wms_lpn(account_id, id) on delete restrict,
  check (on_hand_qty >= 0 and reserved_qty >= 0 and picked_qty >= 0),
  check (reserved_qty + picked_qty <= on_hand_qty)
);

create table if not exists public.wms_inventory_reservation (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  inventory_balance_id uuid not null,
  source_type text not null,
  source_id uuid not null,
  quantity numeric(30,8) not null check (quantity > 0),
  status text not null default 'reserved' check (status in ('reserved', 'released', 'consumed', 'cancelled')),
  expires_at timestamptz,
  unique (account_id, id),
  foreign key (account_id, inventory_balance_id) references public.wms_inventory_balance(account_id, id) on delete restrict
);

create table if not exists public.wms_inventory_hold (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  inventory_balance_id uuid not null,
  reason text not null,
  quantity numeric(30,8) not null check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'released')),
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete set null,
  unique (account_id, id),
  foreign key (account_id, inventory_balance_id) references public.wms_inventory_balance(account_id, id) on delete restrict
);

create table if not exists public.wms_inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  warehouse_id uuid not null,
  location_id uuid not null,
  item_id uuid not null,
  lot_id uuid,
  serial_id uuid,
  lpn_id uuid,
  movement_type text not null check (movement_type in ('receipt', 'putaway', 'pick', 'ship', 'transfer_in', 'transfer_out', 'adjustment', 'count', 'hold', 'release', 'return')),
  quantity numeric(30,8) not null check (quantity <> 0),
  inventory_status text not null default 'available',
  source_type text,
  source_id uuid,
  idempotency_key text,
  occurred_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  unique (account_id, id),
  unique (account_id, idempotency_key),
  foreign key (account_id, warehouse_id) references public.wms_warehouse(account_id, id) on delete restrict,
  foreign key (account_id, location_id) references public.wms_location(account_id, id) on delete restrict,
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete restrict,
  foreign key (account_id, lot_id) references public.wms_lot(account_id, id) on delete restrict,
  foreign key (account_id, serial_id) references public.wms_serial(account_id, id) on delete restrict,
  foreign key (account_id, lpn_id) references public.wms_lpn(account_id, id) on delete restrict
);

create table if not exists public.wms_receipt (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  receipt_no text not null,
  receipt_type text not null default 'purchase' check (receipt_type in ('purchase', 'return', 'transfer', 'production', 'other')),
  warehouse_id uuid not null,
  partner_id uuid,
  status text not null default 'draft' check (status in ('draft', 'expected', 'receiving', 'received', 'closed', 'cancelled')),
  expected_at timestamptz,
  received_at timestamptz,
  source_type text,
  source_id uuid,
  remark text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, receipt_no),
  foreign key (account_id, warehouse_id) references public.wms_warehouse(account_id, id) on delete restrict,
  foreign key (account_id, partner_id) references public.wms_partner(account_id, id) on delete set null
);

create table if not exists public.wms_receipt_line (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  receipt_id uuid not null,
  line_no integer not null,
  item_id uuid not null,
  expected_qty numeric(30,8) not null default 0 check (expected_qty >= 0),
  received_qty numeric(30,8) not null default 0 check (received_qty >= 0),
  rejected_qty numeric(30,8) not null default 0 check (rejected_qty >= 0),
  uom_id uuid,
  lot_no text,
  target_location_id uuid,
  status text not null default 'open' check (status in ('open', 'receiving', 'received', 'closed', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  unique (account_id, id),
  unique (account_id, receipt_id, line_no),
  foreign key (account_id, receipt_id) references public.wms_receipt(account_id, id) on delete cascade,
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete restrict,
  foreign key (account_id, uom_id) references public.wms_uom(account_id, id) on delete set null,
  foreign key (account_id, target_location_id) references public.wms_location(account_id, id) on delete set null
);

create table if not exists public.wms_shipment (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  shipment_no text not null,
  shipment_type text not null default 'sales' check (shipment_type in ('sales', 'return', 'transfer', 'sample', 'other')),
  warehouse_id uuid not null,
  customer_id uuid,
  status text not null default 'draft' check (status in ('draft', 'approved', 'allocated', 'picking', 'packed', 'shipped', 'closed', 'cancelled')),
  required_at timestamptz,
  shipped_at timestamptz,
  carrier_name text,
  tracking_no text,
  source_type text,
  source_id uuid,
  remark text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, shipment_no),
  foreign key (account_id, warehouse_id) references public.wms_warehouse(account_id, id) on delete restrict,
  foreign key (account_id, customer_id) references public.wms_partner(account_id, id) on delete set null
);

create table if not exists public.wms_shipment_line (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  shipment_id uuid not null,
  line_no integer not null,
  item_id uuid not null,
  ordered_qty numeric(30,8) not null default 0 check (ordered_qty > 0),
  allocated_qty numeric(30,8) not null default 0 check (allocated_qty >= 0),
  picked_qty numeric(30,8) not null default 0 check (picked_qty >= 0),
  shipped_qty numeric(30,8) not null default 0 check (shipped_qty >= 0),
  uom_id uuid,
  lot_no text,
  status text not null default 'open' check (status in ('open', 'allocated', 'picking', 'picked', 'shipped', 'closed', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  unique (account_id, id),
  unique (account_id, shipment_id, line_no),
  foreign key (account_id, shipment_id) references public.wms_shipment(account_id, id) on delete cascade,
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete restrict,
  foreign key (account_id, uom_id) references public.wms_uom(account_id, id) on delete set null
);

create table if not exists public.wms_transfer_order (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  transfer_no text not null,
  source_warehouse_id uuid not null,
  target_warehouse_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'picking', 'in_transit', 'received', 'closed', 'cancelled')),
  requested_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz,
  remark text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, transfer_no),
  foreign key (account_id, source_warehouse_id) references public.wms_warehouse(account_id, id) on delete restrict,
  foreign key (account_id, target_warehouse_id) references public.wms_warehouse(account_id, id) on delete restrict,
  check (source_warehouse_id <> target_warehouse_id)
);

create table if not exists public.wms_transfer_order_line (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  transfer_id uuid not null,
  line_no integer not null,
  item_id uuid not null,
  requested_qty numeric(30,8) not null check (requested_qty > 0),
  shipped_qty numeric(30,8) not null default 0 check (shipped_qty >= 0),
  received_qty numeric(30,8) not null default 0 check (received_qty >= 0),
  source_location_id uuid,
  target_location_id uuid,
  status text not null default 'open' check (status in ('open', 'picked', 'in_transit', 'received', 'closed', 'cancelled')),
  unique (account_id, id),
  unique (account_id, transfer_id, line_no),
  foreign key (account_id, transfer_id) references public.wms_transfer_order(account_id, id) on delete cascade,
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete restrict,
  foreign key (account_id, source_location_id) references public.wms_location(account_id, id) on delete set null,
  foreign key (account_id, target_location_id) references public.wms_location(account_id, id) on delete set null
);

create table if not exists public.wms_adjustment (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  adjustment_no text not null,
  warehouse_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'posted', 'cancelled')),
  reason text not null,
  posted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, adjustment_no),
  foreign key (account_id, warehouse_id) references public.wms_warehouse(account_id, id) on delete restrict
);

create table if not exists public.wms_adjustment_line (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  adjustment_id uuid not null,
  line_no integer not null,
  item_id uuid not null,
  location_id uuid not null,
  lot_id uuid,
  serial_id uuid,
  lpn_id uuid,
  quantity_delta numeric(30,8) not null check (quantity_delta <> 0),
  reason text,
  unique (account_id, id),
  unique (account_id, adjustment_id, line_no),
  foreign key (account_id, adjustment_id) references public.wms_adjustment(account_id, id) on delete cascade,
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete restrict,
  foreign key (account_id, location_id) references public.wms_location(account_id, id) on delete restrict,
  foreign key (account_id, lot_id) references public.wms_lot(account_id, id) on delete restrict,
  foreign key (account_id, serial_id) references public.wms_serial(account_id, id) on delete restrict,
  foreign key (account_id, lpn_id) references public.wms_lpn(account_id, id) on delete restrict
);

create table if not exists public.wms_wave (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  wave_no text not null,
  warehouse_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'released', 'picking', 'completed', 'cancelled')),
  planned_at timestamptz,
  released_at timestamptz,
  completed_at timestamptz,
  strategy jsonb not null default '{}'::jsonb,
  unique (account_id, id),
  unique (account_id, wave_no),
  foreign key (account_id, warehouse_id) references public.wms_warehouse(account_id, id) on delete restrict
);

create table if not exists public.wms_wave_line (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  wave_id uuid not null,
  shipment_id uuid not null,
  priority integer not null default 0,
  status text not null default 'open' check (status in ('open', 'allocated', 'picking', 'completed', 'cancelled')),
  unique (account_id, id),
  unique (account_id, wave_id, shipment_id),
  foreign key (account_id, wave_id) references public.wms_wave(account_id, id) on delete cascade,
  foreign key (account_id, shipment_id) references public.wms_shipment(account_id, id) on delete cascade
);

create table if not exists public.wms_task (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  task_no text not null,
  warehouse_id uuid not null,
  task_type text not null check (task_type in ('receive', 'putaway', 'pick', 'replenish', 'transfer', 'count', 'pack', 'load', 'adjust')),
  status text not null default 'open' check (status in ('open', 'assigned', 'in_progress', 'completed', 'cancelled', 'failed')),
  priority integer not null default 0,
  assigned_to uuid references auth.users(id) on delete set null,
  source_type text,
  source_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (account_id, id),
  unique (account_id, task_no),
  foreign key (account_id, warehouse_id) references public.wms_warehouse(account_id, id) on delete restrict
);

create table if not exists public.wms_task_line (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  task_id uuid not null,
  line_no integer not null,
  item_id uuid not null,
  source_location_id uuid,
  target_location_id uuid,
  lot_id uuid,
  lpn_id uuid,
  requested_qty numeric(30,8) not null default 0 check (requested_qty >= 0),
  completed_qty numeric(30,8) not null default 0 check (completed_qty >= 0),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'short', 'cancelled')),
  unique (account_id, id),
  unique (account_id, task_id, line_no),
  foreign key (account_id, task_id) references public.wms_task(account_id, id) on delete cascade,
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete restrict,
  foreign key (account_id, source_location_id) references public.wms_location(account_id, id) on delete set null,
  foreign key (account_id, target_location_id) references public.wms_location(account_id, id) on delete set null,
  foreign key (account_id, lot_id) references public.wms_lot(account_id, id) on delete set null,
  foreign key (account_id, lpn_id) references public.wms_lpn(account_id, id) on delete set null
);

create table if not exists public.wms_count (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  count_no text not null,
  warehouse_id uuid not null,
  count_type text not null default 'cycle' check (count_type in ('cycle', 'full', 'spot', 'blind')),
  status text not null default 'draft' check (status in ('draft', 'released', 'counting', 'review', 'posted', 'cancelled')),
  scheduled_at timestamptz,
  posted_at timestamptz,
  unique (account_id, id),
  unique (account_id, count_no),
  foreign key (account_id, warehouse_id) references public.wms_warehouse(account_id, id) on delete restrict
);

create table if not exists public.wms_count_line (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  count_id uuid not null,
  line_no integer not null,
  item_id uuid not null,
  location_id uuid not null,
  lot_id uuid,
  lpn_id uuid,
  system_qty numeric(30,8) not null default 0,
  counted_qty numeric(30,8),
  variance_qty numeric(30,8) generated always as (coalesce(counted_qty, 0) - system_qty) stored,
  status text not null default 'open' check (status in ('open', 'counted', 'approved', 'posted', 'cancelled')),
  unique (account_id, id),
  unique (account_id, count_id, line_no),
  foreign key (account_id, count_id) references public.wms_count(account_id, id) on delete cascade,
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete restrict,
  foreign key (account_id, location_id) references public.wms_location(account_id, id) on delete restrict,
  foreign key (account_id, lot_id) references public.wms_lot(account_id, id) on delete set null,
  foreign key (account_id, lpn_id) references public.wms_lpn(account_id, id) on delete set null
);

create table if not exists public.wms_pack (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  pack_no text not null,
  shipment_id uuid not null,
  lpn_id uuid,
  status text not null default 'open' check (status in ('open', 'packed', 'sealed', 'shipped', 'cancelled')),
  weight numeric(30,8),
  volume numeric(30,8),
  sealed_at timestamptz,
  unique (account_id, id),
  unique (account_id, pack_no),
  foreign key (account_id, shipment_id) references public.wms_shipment(account_id, id) on delete cascade,
  foreign key (account_id, lpn_id) references public.wms_lpn(account_id, id) on delete set null
);

create table if not exists public.wms_pack_line (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  pack_id uuid not null,
  shipment_line_id uuid not null,
  item_id uuid not null,
  quantity numeric(30,8) not null check (quantity > 0),
  lot_id uuid,
  serial_id uuid,
  unique (account_id, id),
  foreign key (account_id, pack_id) references public.wms_pack(account_id, id) on delete cascade,
  foreign key (account_id, shipment_line_id) references public.wms_shipment_line(account_id, id) on delete restrict,
  foreign key (account_id, item_id) references public.wms_item(account_id, id) on delete restrict,
  foreign key (account_id, lot_id) references public.wms_lot(account_id, id) on delete set null,
  foreign key (account_id, serial_id) references public.wms_serial(account_id, id) on delete set null
);

create table if not exists public.wms_print_binding (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  document_type text not null,
  event_code text not null,
  template_id uuid,
  printer_code text,
  copies integer not null default 1 check (copies > 0),
  enabled boolean not null default true,
  unique (account_id, id),
  unique (account_id, document_type, event_code)
);

create table if not exists public.wms_print_job (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  job_no text not null,
  document_type text not null,
  document_id uuid not null,
  template_id uuid,
  printer_code text,
  status text not null default 'queued' check (status in ('queued', 'printing', 'printed', 'failed', 'cancelled')),
  copies integer not null default 1 check (copies > 0),
  requested_by uuid references auth.users(id) on delete set null,
  printed_at timestamptz,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, job_no)
);

create table if not exists public.wms_print_job_item (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  print_job_id uuid not null,
  item_no integer not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'printed', 'failed')),
  error_message text,
  unique (account_id, id),
  unique (account_id, print_job_id, item_no),
  foreign key (account_id, print_job_id) references public.wms_print_job(account_id, id) on delete cascade
);

create table if not exists public.wms_integration_message (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  message_key text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'ignored')),
  payload jsonb not null default '{}'::jsonb,
  retry_count integer not null default 0 check (retry_count >= 0),
  next_retry_at timestamptz,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, message_key)
);

-- Common audit timestamps for mutable business records.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'wms_warehouse', 'wms_zone', 'wms_location', 'wms_partner', 'wms_uom', 'wms_item',
    'wms_receipt', 'wms_shipment', 'wms_transfer_order', 'wms_adjustment', 'wms_print_job', 'wms_integration_message'
  ] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.wms_set_updated_at()', table_name, table_name);
  end loop;
end;
$$;

-- Operational indexes used by low-code grids, allocation, and audit queries.
create index if not exists idx_wms_zone_account_warehouse on public.wms_zone(account_id, warehouse_id, status);
create index if not exists idx_wms_location_account_warehouse on public.wms_location(account_id, warehouse_id, zone_id, status);
create index if not exists idx_wms_item_account_status on public.wms_item(account_id, status, code);
create index if not exists idx_wms_lot_account_item_status on public.wms_lot(account_id, item_id, status, expiry_date);
create index if not exists idx_wms_lpn_account_location on public.wms_lpn(account_id, current_location_id, status);
create index if not exists idx_wms_balance_available on public.wms_inventory_balance(account_id, warehouse_id, item_id, location_id, inventory_status);
create index if not exists idx_wms_ledger_source on public.wms_inventory_ledger(account_id, source_type, source_id, occurred_at desc);
create index if not exists idx_wms_receipt_status on public.wms_receipt(account_id, warehouse_id, status, expected_at);
create index if not exists idx_wms_shipment_status on public.wms_shipment(account_id, warehouse_id, status, required_at);
create index if not exists idx_wms_task_queue on public.wms_task(account_id, warehouse_id, status, priority desc);
create index if not exists idx_wms_count_status on public.wms_count(account_id, warehouse_id, status, scheduled_at);
create index if not exists idx_wms_print_job_status on public.wms_print_job(account_id, status, created_at);
create index if not exists idx_wms_integration_queue on public.wms_integration_message(account_id, status, next_retry_at);

-- Keep the same account-isolation contract as the existing planning tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'wms_warehouse', 'wms_zone', 'wms_location', 'wms_partner', 'wms_uom', 'wms_item',
    'wms_item_uom', 'wms_item_barcode', 'wms_lot', 'wms_serial', 'wms_lpn',
    'wms_inventory_balance', 'wms_inventory_reservation', 'wms_inventory_hold', 'wms_inventory_ledger',
    'wms_receipt', 'wms_receipt_line', 'wms_shipment', 'wms_shipment_line',
    'wms_transfer_order', 'wms_transfer_order_line', 'wms_adjustment', 'wms_adjustment_line',
    'wms_wave', 'wms_wave_line', 'wms_task', 'wms_task_line', 'wms_count', 'wms_count_line',
    'wms_pack', 'wms_pack_line', 'wms_print_binding', 'wms_print_job', 'wms_print_job_item',
    'wms_integration_message'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "WMS account viewers can read %1$s" on public.%1$I', table_name);
    execute format('create policy "WMS account viewers can read %1$s" on public.%1$I for select to authenticated using (public.has_account_permission(account_id, ''wms.view'') or public.has_account_permission(account_id, ''wms.manage''))', table_name);
    execute format('drop policy if exists "WMS account managers can insert %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "WMS account managers can update %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "WMS account managers can delete %1$s" on public.%1$I', table_name);
    execute format('create policy "WMS account managers can insert %1$s" on public.%1$I for insert to authenticated with check (public.has_account_permission(account_id, ''wms.manage''))', table_name);
    execute format('create policy "WMS account managers can update %1$s" on public.%1$I for update to authenticated using (public.has_account_permission(account_id, ''wms.manage'')) with check (public.has_account_permission(account_id, ''wms.manage''))', table_name);
    execute format('create policy "WMS account managers can delete %1$s" on public.%1$I for delete to authenticated using (public.has_account_permission(account_id, ''wms.manage''))', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end;
$$;

commit;
