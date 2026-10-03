-- 通用商品交易表结构审核稿
-- 状态：仅供架构审核，不属于 supabase/migrations，禁止直接用于生产部署。
-- 已确认：不支持多门店；允许无库存商品；预约使用 sales_orders.order_type。

-- ============================================================
-- 0. 公共约定
-- ============================================================
-- 1. 所有业务数据使用 account_id 隔离。
-- 2. 金额字段以 _minor 结尾，类型 bigint，单位是货币最小单位（人民币为分）。
-- 3. 业务写命令使用 request/business key 幂等，状态流水不物理删除。
-- 4. catalog_skus.inventory_item_id 为空时表示无库存商品。
-- 5. sales_orders.order_type 支持 normal、reservation、recharge、service。
-- 6. 本稿省略 RLS policy、grant、触发器和低代码资源注册，正式迁移时逐表补齐。

-- ============================================================
-- 1. 商品目录服务 product-service
-- ============================================================

create table if not exists public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  parent_id uuid,
  code text not null,
  name text not null,
  description text,
  image_file_id uuid,
  sort_order integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, code),
  foreign key (account_id, parent_id)
    references public.catalog_categories(account_id, id) on delete restrict
);

create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  category_id uuid,
  code text not null,
  name text not null,
  subtitle text,
  description text,
  product_type text not null default 'physical'
    check (product_type in ('physical', 'service', 'digital', 'reservation')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'inactive', 'archived')),
  -- 可选物料映射。正式迁移时根据实际主数据策略决定是否同时保留两列。
  planning_item_id uuid,
  wms_item_id uuid,
  cover_file_id uuid,
  default_currency text not null default 'CNY'
    check (char_length(default_currency) = 3),
  tax_rate numeric(9, 6) not null default 0
    check (tax_rate >= 0 and tax_rate <= 100),
  attributes jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, code),
  foreign key (account_id, category_id)
    references public.catalog_categories(account_id, id) on delete restrict,
  foreign key (account_id, wms_item_id)
    references public.wms_item(account_id, id) on delete restrict
);

create table if not exists public.catalog_skus (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  product_id uuid not null,
  code text not null,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  uom_code text,
  barcode text,
  -- NULL 表示服务、预约、数字商品等无库存商品。
  inventory_item_id uuid,
  inventory_policy text not null default 'none'
    check (inventory_policy in ('none', 'track', 'reserve')),
  weight numeric(30, 8),
  volume numeric(30, 8),
  attributes jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, code),
  foreign key (account_id, product_id)
    references public.catalog_products(account_id, id) on delete cascade,
  foreign key (account_id, inventory_item_id)
    references public.wms_item(account_id, id) on delete restrict,
  check (
    (inventory_policy = 'none' and inventory_item_id is null)
    or (inventory_policy in ('track', 'reserve') and inventory_item_id is not null)
  )
);

create table if not exists public.catalog_prices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  sku_id uuid not null,
  price_type text not null default 'standard'
    check (price_type in ('standard', 'member', 'contract', 'promotion')),
  member_level_id uuid,
  currency_code text not null default 'CNY'
    check (char_length(currency_code) = 3),
  amount_minor bigint not null check (amount_minor >= 0),
  compare_at_amount_minor bigint check (compare_at_amount_minor is null or compare_at_amount_minor >= 0),
  minimum_qty numeric(24, 6) not null default 1 check (minimum_qty > 0),
  valid_from timestamptz,
  valid_to timestamptz,
  priority integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  foreign key (account_id, sku_id)
    references public.catalog_skus(account_id, id) on delete cascade,
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);

create table if not exists public.catalog_options (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  product_id uuid not null,
  code text not null,
  name text not null,
  option_type text not null default 'single'
    check (option_type in ('single', 'multiple', 'text')),
  required boolean not null default false,
  minimum_selected integer not null default 0 check (minimum_selected >= 0),
  maximum_selected integer check (maximum_selected is null or maximum_selected > 0),
  sort_order integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, product_id, code),
  foreign key (account_id, product_id)
    references public.catalog_products(account_id, id) on delete cascade,
  check (maximum_selected is null or maximum_selected >= minimum_selected)
);

create table if not exists public.catalog_option_values (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  option_id uuid not null,
  code text not null,
  name text not null,
  price_delta_minor bigint not null default 0,
  sort_order integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, option_id, code),
  foreign key (account_id, option_id)
    references public.catalog_options(account_id, id) on delete cascade
);

create table if not exists public.catalog_sku_option_values (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  sku_id uuid not null,
  option_value_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, sku_id, option_value_id),
  foreign key (account_id, sku_id)
    references public.catalog_skus(account_id, id) on delete cascade,
  foreign key (account_id, option_value_id)
    references public.catalog_option_values(account_id, id) on delete cascade
);

-- ============================================================
-- 2. 会员服务 member-service
-- 订单 member_id、会员价格和权益表依赖本节。可以在阶段 4 执行。
-- ============================================================

create table if not exists public.member_levels (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  code text not null,
  name text not null,
  rank integer not null default 0,
  qualification_rule jsonb not null default '{}'::jsonb,
  benefits jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, code),
  unique (account_id, rank)
);

-- catalog_prices 在会员阶段启用会员等级外键；第一阶段 member_level_id 保持为空。
alter table public.catalog_prices
  add constraint catalog_prices_member_level_fk
    foreign key (account_id, member_level_id)
    references public.member_levels(account_id, id) on delete restrict;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  level_id uuid,
  member_no text not null,
  nickname text,
  phone text,
  email text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'blocked', 'closed')),
  joined_at timestamptz not null default timezone('utc', now()),
  level_started_at timestamptz,
  level_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, member_no),
  unique (account_id, user_id),
  foreign key (account_id, level_id)
    references public.member_levels(account_id, id) on delete restrict
);

create table if not exists public.member_wallets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  member_id uuid not null,
  currency_code text not null default 'CNY'
    check (char_length(currency_code) = 3),
  cash_balance_minor bigint not null default 0 check (cash_balance_minor >= 0),
  bonus_balance_minor bigint not null default 0 check (bonus_balance_minor >= 0),
  frozen_cash_minor bigint not null default 0 check (frozen_cash_minor >= 0),
  frozen_bonus_minor bigint not null default 0 check (frozen_bonus_minor >= 0),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, member_id, currency_code),
  foreign key (account_id, member_id)
    references public.members(account_id, id) on delete restrict,
  check (frozen_cash_minor <= cash_balance_minor),
  check (frozen_bonus_minor <= bonus_balance_minor)
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  wallet_id uuid not null,
  member_id uuid not null,
  entry_type text not null
    check (entry_type in ('recharge', 'bonus', 'consume', 'refund', 'adjustment', 'freeze', 'unfreeze', 'reversal')),
  cash_delta_minor bigint not null default 0,
  bonus_delta_minor bigint not null default 0,
  cash_balance_after_minor bigint not null check (cash_balance_after_minor >= 0),
  bonus_balance_after_minor bigint not null check (bonus_balance_after_minor >= 0),
  business_type text not null,
  business_id uuid,
  business_key text not null,
  reversal_of_id uuid,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, business_key),
  foreign key (account_id, wallet_id)
    references public.member_wallets(account_id, id) on delete restrict,
  foreign key (account_id, member_id)
    references public.members(account_id, id) on delete restrict,
  foreign key (account_id, reversal_of_id)
    references public.wallet_ledger(account_id, id) on delete restrict,
  check (cash_delta_minor <> 0 or bonus_delta_minor <> 0)
);

create table if not exists public.points_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  member_id uuid not null,
  balance bigint not null default 0 check (balance >= 0),
  frozen_balance bigint not null default 0 check (frozen_balance >= 0),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, member_id),
  foreign key (account_id, member_id)
    references public.members(account_id, id) on delete restrict,
  check (frozen_balance <= balance)
);

create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  points_account_id uuid not null,
  member_id uuid not null,
  entry_type text not null
    check (entry_type in ('grant', 'consume', 'refund', 'expire', 'adjustment', 'freeze', 'unfreeze', 'reversal')),
  points_delta bigint not null check (points_delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  business_type text not null,
  business_id uuid,
  business_key text not null,
  reversal_of_id uuid,
  expires_at timestamptz,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, business_key),
  foreign key (account_id, points_account_id)
    references public.points_accounts(account_id, id) on delete restrict,
  foreign key (account_id, member_id)
    references public.members(account_id, id) on delete restrict,
  foreign key (account_id, reversal_of_id)
    references public.points_ledger(account_id, id) on delete restrict
);

-- ============================================================
-- 3. 订单服务 order-service
-- 继续复用 sales_orders / sales_order_lines，新增交易字段。
-- ============================================================

alter table public.sales_orders
  add column if not exists order_type text not null default 'normal',
  add column if not exists order_channel text not null default 'admin',
  add column if not exists member_id uuid,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists fulfillment_status text not null default 'unfulfilled',
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at timestamptz,
  add column if not exists reservation_quantity integer,
  add column if not exists reservation_contact_name text,
  add column if not exists reservation_contact_phone text,
  add column if not exists subtotal_amount_minor bigint not null default 0,
  add column if not exists promotion_amount_minor bigint not null default 0,
  add column if not exists coupon_amount_minor bigint not null default 0,
  add column if not exists points_amount_minor bigint not null default 0,
  add column if not exists wallet_amount_minor bigint not null default 0,
  add column if not exists payable_amount_minor bigint not null default 0,
  add column if not exists paid_amount_minor bigint not null default 0,
  add column if not exists refunded_amount_minor bigint not null default 0,
  add column if not exists expires_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists version integer not null default 1;

-- 正式迁移需使用 NOT VALID + VALIDATE 或分批回填，避免在大表上长时间锁表。
alter table public.sales_orders
  add constraint sales_orders_order_type_check
    check (order_type in ('normal', 'reservation', 'recharge', 'service')),
  add constraint sales_orders_payment_status_check
    check (payment_status in ('unpaid', 'partial', 'paid', 'refunding', 'partial_refunded', 'refunded')),
  add constraint sales_orders_fulfillment_status_check
    check (fulfillment_status in ('unfulfilled', 'reserved', 'processing', 'fulfilled', 'returned', 'cancelled')),
  add constraint sales_orders_minor_amounts_check
    check (
      subtotal_amount_minor >= 0 and promotion_amount_minor >= 0
      and coupon_amount_minor >= 0 and points_amount_minor >= 0
      and wallet_amount_minor >= 0 and payable_amount_minor >= 0
      and paid_amount_minor >= 0 and refunded_amount_minor >= 0
      and refunded_amount_minor <= paid_amount_minor
    ),
  add constraint sales_orders_reservation_time_check
    check (
      order_type <> 'reservation'
      or (
        scheduled_start_at is not null
        and (scheduled_end_at is null or scheduled_end_at > scheduled_start_at)
      )
    ),
  add constraint sales_orders_version_check check (version > 0),
  add constraint sales_orders_member_fk
    foreign key (account_id, member_id)
    references public.members(account_id, id) on delete restrict;

alter table public.sales_order_lines
  add column if not exists product_id uuid,
  add column if not exists sku_id uuid,
  add column if not exists product_name_snapshot text,
  add column if not exists sku_name_snapshot text,
  add column if not exists options_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists inventory_policy text not null default 'none',
  add column if not exists unit_price_minor bigint not null default 0,
  add column if not exists compare_at_price_minor bigint,
  add column if not exists line_subtotal_minor bigint not null default 0,
  add column if not exists promotion_amount_minor bigint not null default 0,
  add column if not exists coupon_amount_minor bigint not null default 0,
  add column if not exists points_amount_minor bigint not null default 0,
  add column if not exists wallet_amount_minor bigint not null default 0,
  add column if not exists payable_amount_minor bigint not null default 0,
  add column if not exists refunded_amount_minor bigint not null default 0,
  add column if not exists fulfillment_status text not null default 'unfulfilled',
  add column if not exists version integer not null default 1;

alter table public.sales_order_lines
  add constraint sales_order_lines_account_id_id_key unique (account_id, id);

alter table public.sales_order_lines
  add constraint sales_order_lines_product_fk
    foreign key (account_id, product_id)
    references public.catalog_products(account_id, id) on delete restrict,
  add constraint sales_order_lines_sku_fk
    foreign key (account_id, sku_id)
    references public.catalog_skus(account_id, id) on delete restrict,
  add constraint sales_order_lines_inventory_policy_check
    check (inventory_policy in ('none', 'track', 'reserve')),
  add constraint sales_order_lines_fulfillment_status_check
    check (fulfillment_status in ('unfulfilled', 'reserved', 'processing', 'fulfilled', 'returned', 'cancelled')),
  add constraint sales_order_lines_minor_amounts_check
    check (
      unit_price_minor >= 0
      and (compare_at_price_minor is null or compare_at_price_minor >= 0)
      and line_subtotal_minor >= 0 and promotion_amount_minor >= 0
      and coupon_amount_minor >= 0 and points_amount_minor >= 0
      and wallet_amount_minor >= 0 and payable_amount_minor >= 0
      and refunded_amount_minor >= 0 and refunded_amount_minor <= payable_amount_minor
    ),
  add constraint sales_order_lines_version_check check (version > 0);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  order_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text,
  from_payment_status text,
  to_payment_status text,
  from_fulfillment_status text,
  to_fulfillment_status text,
  business_key text not null,
  reason text,
  actor_type text not null default 'user'
    check (actor_type in ('user', 'system', 'provider', 'workflow')),
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, business_key),
  foreign key (order_id, account_id)
    references public.sales_orders(id, account_id) on delete cascade
);

create table if not exists public.order_adjustments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  order_id uuid not null,
  order_line_id uuid,
  adjustment_type text not null
    check (adjustment_type in ('promotion', 'coupon', 'points', 'wallet', 'manual', 'tax', 'shipping', 'refund')),
  source_type text,
  source_id uuid,
  description text,
  amount_minor bigint not null check (amount_minor <> 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  foreign key (order_id, account_id)
    references public.sales_orders(id, account_id) on delete cascade,
  foreign key (account_id, order_line_id)
    references public.sales_order_lines(account_id, id) on delete cascade
);

create table if not exists public.order_fulfillments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  order_id uuid not null,
  fulfillment_no text not null,
  fulfillment_type text not null default 'delivery'
    check (fulfillment_type in ('delivery', 'pickup', 'onsite', 'service', 'digital')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'fulfilled', 'cancelled', 'returned')),
  wms_shipment_id uuid,
  scheduled_at timestamptz,
  fulfilled_at timestamptz,
  contact_name text,
  contact_phone text,
  address_snapshot jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, fulfillment_no),
  foreign key (order_id, account_id)
    references public.sales_orders(id, account_id) on delete cascade,
  foreign key (account_id, wms_shipment_id)
    references public.wms_shipment(account_id, id) on delete restrict
);

-- ============================================================
-- 4. 库存服务 inventory-service
-- 复用 WMS 表，仅补充订单预占所需字段。
-- ============================================================

alter table public.wms_inventory_reservation
  add column if not exists reservation_key text,
  add column if not exists source_line_id uuid,
  add column if not exists consumed_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists version integer not null default 1;

create unique index if not exists uq_wms_inventory_reservation_business_key
  on public.wms_inventory_reservation(account_id, reservation_key)
  where reservation_key is not null;

-- 无库存商品处理规则：
-- catalog_skus.inventory_policy = 'none' 时不创建 wms_inventory_reservation，
-- 订单行直接进入 unfulfilled/fulfilled，由订单类型决定后续履约。

-- ============================================================
-- 5. 支付服务 payment-service
-- ============================================================

create table if not exists public.payment_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  provider text not null
    check (provider in ('stripe', 'wechat', 'wallet', 'manual', 'mock')),
  provider_account_ref text not null,
  display_name text not null,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  -- 这里只保存密钥服务引用，不保存微信 API 私钥、Stripe Secret 等明文。
  secret_reference text,
  public_config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (provider, provider_account_ref),
  unique (account_id, provider, display_name)
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  payment_no text not null,
  business_type text not null
    check (business_type in ('order', 'recharge')),
  business_id uuid not null,
  order_id uuid,
  member_id uuid,
  provider_account_id uuid,
  provider text not null
    check (provider in ('stripe', 'wechat', 'wallet', 'manual', 'mock')),
  payment_method text,
  status text not null default 'created'
    check (status in ('created', 'pending', 'succeeded', 'failed', 'closed', 'partial_refunded', 'refunded')),
  currency_code text not null default 'CNY'
    check (char_length(currency_code) = 3),
  amount_minor bigint not null check (amount_minor > 0),
  refunded_amount_minor bigint not null default 0
    check (refunded_amount_minor >= 0),
  provider_transaction_id text,
  provider_customer_id text,
  provider_metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  paid_at timestamptz,
  closed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, payment_no),
  unique (provider, provider_transaction_id),
  foreign key (order_id, account_id)
    references public.sales_orders(id, account_id) on delete restrict,
  foreign key (account_id, member_id)
    references public.members(account_id, id) on delete restrict,
  foreign key (account_id, provider_account_id)
    references public.payment_provider_accounts(account_id, id) on delete restrict,
  check (refunded_amount_minor <= amount_minor)
);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  payment_transaction_id uuid not null,
  attempt_no integer not null check (attempt_no > 0),
  request_id text not null,
  status text not null default 'started'
    check (status in ('started', 'pending', 'succeeded', 'failed')),
  provider_request jsonb not null default '{}'::jsonb,
  provider_response jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  unique (account_id, id),
  unique (account_id, payment_transaction_id, attempt_no),
  unique (account_id, request_id),
  foreign key (account_id, payment_transaction_id)
    references public.payment_transactions(account_id, id) on delete cascade
);

create table if not exists public.payment_callbacks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  provider text not null,
  provider_account_ref text not null,
  provider_event_id text not null,
  payment_transaction_id uuid,
  callback_type text not null,
  headers jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  signature_verified boolean not null default false,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'verified', 'processed', 'ignored', 'failed')),
  error_message text,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  unique (account_id, id),
  unique (provider, provider_account_ref, provider_event_id),
  foreign key (account_id, payment_transaction_id)
    references public.payment_transactions(account_id, id) on delete restrict
);

create table if not exists public.refund_records (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  refund_no text not null,
  payment_transaction_id uuid not null,
  order_id uuid,
  status text not null default 'created'
    check (status in ('created', 'pending', 'succeeded', 'failed', 'closed')),
  amount_minor bigint not null check (amount_minor > 0),
  reason text,
  provider_refund_id text,
  provider_metadata jsonb not null default '{}'::jsonb,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default timezone('utc', now()),
  refunded_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (account_id, id),
  unique (account_id, refund_no),
  unique (payment_transaction_id, provider_refund_id),
  foreign key (account_id, payment_transaction_id)
    references public.payment_transactions(account_id, id) on delete restrict,
  foreign key (order_id, account_id)
    references public.sales_orders(id, account_id) on delete restrict
);

create table if not exists public.reconciliation_batches (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  provider text not null,
  statement_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  source_file_id uuid,
  total_count integer not null default 0 check (total_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  difference_count integer not null default 0 check (difference_count >= 0),
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, provider, statement_date)
);

create table if not exists public.reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  batch_id uuid not null,
  payment_transaction_id uuid,
  provider_transaction_id text,
  result text not null
    check (result in ('matched', 'amount_mismatch', 'missing_local', 'missing_provider', 'status_mismatch')),
  local_amount_minor bigint,
  provider_amount_minor bigint,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  foreign key (account_id, batch_id)
    references public.reconciliation_batches(account_id, id) on delete cascade,
  foreign key (account_id, payment_transaction_id)
    references public.payment_transactions(account_id, id) on delete restrict
);

create table if not exists public.recharge_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  recharge_no text not null,
  member_id uuid not null,
  payment_transaction_id uuid,
  status text not null default 'created'
    check (status in ('created', 'pending', 'paid', 'credited', 'failed', 'closed', 'refunded')),
  currency_code text not null default 'CNY'
    check (char_length(currency_code) = 3),
  recharge_amount_minor bigint not null check (recharge_amount_minor > 0),
  bonus_amount_minor bigint not null default 0 check (bonus_amount_minor >= 0),
  payable_amount_minor bigint not null check (payable_amount_minor > 0),
  business_key text not null,
  paid_at timestamptz,
  credited_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, recharge_no),
  unique (account_id, business_key),
  foreign key (account_id, member_id)
    references public.members(account_id, id) on delete restrict,
  foreign key (account_id, payment_transaction_id)
    references public.payment_transactions(account_id, id) on delete restrict
);

-- ============================================================
-- 6. 权益服务 promotion-service
-- ============================================================

create table if not exists public.coupon_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  code text not null,
  name text not null,
  coupon_type text not null
    check (coupon_type in ('fixed_amount', 'percentage', 'free_shipping', 'exchange')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'inactive', 'expired')),
  currency_code text not null default 'CNY'
    check (char_length(currency_code) = 3),
  discount_amount_minor bigint check (discount_amount_minor is null or discount_amount_minor > 0),
  discount_rate numeric(9, 6) check (discount_rate is null or discount_rate > 0 and discount_rate <= 100),
  maximum_discount_minor bigint check (maximum_discount_minor is null or maximum_discount_minor > 0),
  minimum_order_amount_minor bigint not null default 0 check (minimum_order_amount_minor >= 0),
  total_quantity integer check (total_quantity is null or total_quantity > 0),
  per_member_limit integer check (per_member_limit is null or per_member_limit > 0),
  valid_from timestamptz,
  valid_to timestamptz,
  valid_days_after_claim integer check (valid_days_after_claim is null or valid_days_after_claim > 0),
  applicability jsonb not null default '{}'::jsonb,
  refund_policy text not null default 'return_if_unused'
    check (refund_policy in ('never_return', 'return_if_unused', 'always_return')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, code),
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);

create table if not exists public.member_coupons (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  template_id uuid not null,
  member_id uuid not null,
  coupon_no text not null,
  status text not null default 'available'
    check (status in ('available', 'locked', 'used', 'expired', 'void')),
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  issued_reason text,
  issued_at timestamptz not null default timezone('utc', now()),
  used_at timestamptz,
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (account_id, id),
  unique (account_id, coupon_no),
  foreign key (account_id, template_id)
    references public.coupon_templates(account_id, id) on delete restrict,
  foreign key (account_id, member_id)
    references public.members(account_id, id) on delete restrict,
  check (valid_to > valid_from)
);

create table if not exists public.coupon_locks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  member_coupon_id uuid not null,
  order_id uuid not null,
  business_key text not null,
  status text not null default 'active'
    check (status in ('active', 'consumed', 'released', 'expired')),
  locked_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  released_at timestamptz,
  unique (account_id, id),
  unique (account_id, business_key),
  foreign key (account_id, member_coupon_id)
    references public.member_coupons(account_id, id) on delete restrict,
  foreign key (order_id, account_id)
    references public.sales_orders(id, account_id) on delete cascade
);

create unique index if not exists uq_coupon_active_lock
  on public.coupon_locks(account_id, member_coupon_id)
  where status = 'active';

create table if not exists public.coupon_usages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  member_coupon_id uuid not null,
  order_id uuid not null,
  order_line_id uuid,
  usage_type text not null default 'consume'
    check (usage_type in ('consume', 'reversal')),
  discount_amount_minor bigint not null check (discount_amount_minor >= 0),
  business_key text not null,
  reversal_of_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, business_key),
  foreign key (account_id, member_coupon_id)
    references public.member_coupons(account_id, id) on delete restrict,
  foreign key (order_id, account_id)
    references public.sales_orders(id, account_id) on delete restrict,
  foreign key (account_id, order_line_id)
    references public.sales_order_lines(account_id, id) on delete restrict,
  foreign key (account_id, reversal_of_id)
    references public.coupon_usages(account_id, id) on delete restrict
);

create table if not exists public.voucher_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  usage_limit integer not null default 1 check (usage_limit > 0),
  validity_rule jsonb not null default '{}'::jsonb,
  applicability jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'inactive', 'expired')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, code)
);

create table if not exists public.member_vouchers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  template_id uuid not null,
  member_id uuid not null,
  voucher_no text not null,
  status text not null default 'available'
    check (status in ('available', 'partially_used', 'used', 'expired', 'void')),
  remaining_uses integer not null check (remaining_uses >= 0),
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, voucher_no),
  foreign key (account_id, template_id)
    references public.voucher_templates(account_id, id) on delete restrict,
  foreign key (account_id, member_id)
    references public.members(account_id, id) on delete restrict,
  check (valid_to > valid_from)
);

create table if not exists public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  member_voucher_id uuid not null,
  order_id uuid,
  redemption_type text not null default 'redeem'
    check (redemption_type in ('redeem', 'reversal')),
  quantity integer not null default 1 check (quantity > 0),
  business_key text not null,
  reversal_of_id uuid,
  redeemed_by uuid references auth.users(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, business_key),
  foreign key (account_id, member_voucher_id)
    references public.member_vouchers(account_id, id) on delete restrict,
  foreign key (order_id, account_id)
    references public.sales_orders(id, account_id) on delete restrict,
  foreign key (account_id, reversal_of_id)
    references public.voucher_redemptions(account_id, id) on delete restrict
);

-- ============================================================
-- 7. 跨服务可靠事件
-- ============================================================

create table if not exists public.commerce_outbox_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  service_name text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  event_version integer not null default 1 check (event_version > 0),
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'published', 'failed', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  locked_by text,
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (account_id, id),
  unique (account_id, aggregate_type, aggregate_id, event_type, event_version)
);

create table if not exists public.commerce_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  consumer_name text not null,
  message_id uuid not null,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  result jsonb,
  error_message text,
  received_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  unique (account_id, id),
  unique (account_id, consumer_name, message_id)
);

-- ============================================================
-- 8. 建议索引（正式迁移按查询计划补充）
-- ============================================================

create index if not exists idx_catalog_products_status
  on public.catalog_products(account_id, status, category_id, updated_at desc);
create index if not exists idx_catalog_skus_product
  on public.catalog_skus(account_id, product_id, status);
create index if not exists idx_catalog_prices_lookup
  on public.catalog_prices(account_id, sku_id, status, price_type, valid_from, valid_to);
create index if not exists idx_sales_orders_trade_status
  on public.sales_orders(account_id, order_type, status, payment_status, created_at desc);
create index if not exists idx_sales_orders_member
  on public.sales_orders(account_id, member_id, created_at desc);
create index if not exists idx_order_status_history_order
  on public.order_status_history(account_id, order_id, occurred_at);
create index if not exists idx_payment_transactions_business
  on public.payment_transactions(account_id, business_type, business_id, status);
create index if not exists idx_payment_provider_account_lookup
  on public.payment_provider_accounts(provider, provider_account_ref, status);
create index if not exists idx_payment_callbacks_processing
  on public.payment_callbacks(processing_status, received_at);
create index if not exists idx_wallet_ledger_member
  on public.wallet_ledger(account_id, member_id, occurred_at desc);
create index if not exists idx_points_ledger_member
  on public.points_ledger(account_id, member_id, occurred_at desc);
create index if not exists idx_member_coupons_available
  on public.member_coupons(account_id, member_id, status, valid_to);
create index if not exists idx_outbox_dispatch
  on public.commerce_outbox_events(status, available_at, created_at);

-- ============================================================
-- 9. 表数量摘要
-- ============================================================
-- 直接复用：sales_orders、sales_order_lines、7 个核心 WMS 表、用户/账套/文件表。
-- 新建商品目录表：7 张。
-- 新建订单辅助表：3 张。
-- 库存：不新建业务表，仅扩展 wms_inventory_reservation。
-- 新建支付与充值表：8 张。
-- 新建会员账户表：6 张。
-- 新建权益表：7 张。
-- 新建可靠事件表：2 张。
-- 合计新建：33 张；扩展现有表：3 张。
