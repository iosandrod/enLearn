-- Sales order header and line tables, modeled after common UFIDA U9 sales order fields.
-- Business ownership is isolated by basejump account membership through account_id.

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,

  -- U9 / external system mapping
  external_source text not null default 'manual',
  external_id text,
  external_doc_id text,
  external_doc_no text,

  -- Document header
  doc_no text not null,
  doc_type_code text,
  doc_type_name text,
  doc_date date not null default current_date,
  business_date date,
  status text not null default 'draft',
  approval_status text not null default 'draft',
  close_status text not null default 'open',
  hold_status boolean not null default false,

  -- Organization and responsibility fields from U9-style documents
  org_code text,
  org_name text,
  sales_org_code text,
  sales_org_name text,
  sales_department_code text,
  sales_department_name text,
  salesperson_code text,
  salesperson_name text,
  operator_code text,
  operator_name text,

  -- Customer and partner fields
  customer_id text,
  customer_code text,
  customer_name text,
  invoice_customer_code text,
  invoice_customer_name text,
  payer_customer_code text,
  payer_customer_name text,
  ship_to_customer_code text,
  ship_to_customer_name text,
  contact_name text,
  contact_phone text,
  delivery_address text,

  -- Commercial terms
  currency_code text not null default 'CNY',
  currency_name text,
  exchange_rate numeric(24, 8) not null default 1,
  price_includes_tax boolean not null default true,
  payment_terms_code text,
  payment_terms_name text,
  settlement_method_code text,
  settlement_method_name text,
  trade_terms_code text,
  trade_terms_name text,
  delivery_terms_code text,
  delivery_terms_name text,
  price_list_code text,
  price_list_name text,

  -- Amount summary
  total_qty numeric(24, 6) not null default 0,
  total_amount numeric(24, 6) not null default 0,
  discount_amount numeric(24, 6) not null default 0,
  tax_exclusive_amount numeric(24, 6) not null default 0,
  tax_amount numeric(24, 6) not null default 0,
  tax_inclusive_amount numeric(24, 6) not null default 0,
  local_currency_amount numeric(24, 6) not null default 0,

  -- Source and extension fields
  source_doc_type text,
  source_doc_id text,
  source_doc_no text,
  remark text,
  metadata jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),

  unique (account_id, doc_no),
  unique (id, account_id),
  unique (account_id, external_source, external_id),
  check (exchange_rate > 0),
  check (total_qty >= 0),
  check (total_amount >= 0),
  check (discount_amount >= 0),
  check (tax_exclusive_amount >= 0),
  check (tax_amount >= 0),
  check (tax_inclusive_amount >= 0),
  check (local_currency_amount >= 0)
);

create table if not exists public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,
  order_id uuid not null,

  -- U9 / external system mapping
  external_source text not null default 'manual',
  external_id text,
  external_line_id text,

  -- Document line identity
  line_no integer not null,
  row_no text,
  status text not null default 'open',
  close_status text not null default 'open',

  -- Item information
  item_id text,
  item_code text not null,
  item_name text not null,
  item_spec text,
  item_model text,
  item_category_code text,
  item_category_name text,
  customer_item_code text,
  customer_item_name text,

  -- Quantity and units
  uom_code text,
  uom_name text,
  pricing_uom_code text,
  pricing_uom_name text,
  ordered_qty numeric(24, 6) not null default 0,
  delivered_qty numeric(24, 6) not null default 0,
  shipped_qty numeric(24, 6) not null default 0,
  invoiced_qty numeric(24, 6) not null default 0,
  returned_qty numeric(24, 6) not null default 0,
  open_qty numeric(24, 6) not null default 0,

  -- Price, discount, tax and amount
  unit_price numeric(24, 8) not null default 0,
  tax_inclusive_unit_price numeric(24, 8) not null default 0,
  discount_rate numeric(12, 6) not null default 0,
  discount_amount numeric(24, 6) not null default 0,
  tax_rate numeric(12, 6) not null default 0,
  tax_exclusive_amount numeric(24, 6) not null default 0,
  tax_amount numeric(24, 6) not null default 0,
  tax_inclusive_amount numeric(24, 6) not null default 0,
  local_currency_amount numeric(24, 6) not null default 0,

  -- Delivery and fulfillment
  need_date date,
  promise_date date,
  delivery_date date,
  warehouse_code text,
  warehouse_name text,
  storage_location_code text,
  storage_location_name text,
  lot_no text,

  -- Project, source and extension fields
  project_code text,
  project_name text,
  source_doc_type text,
  source_doc_id text,
  source_doc_no text,
  source_line_id text,
  source_line_no text,
  is_free_gift boolean not null default false,
  remark text,
  metadata jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),

  foreign key (order_id, account_id)
    references public.sales_orders(id, account_id)
    on delete cascade,
  unique (account_id, order_id, line_no),
  unique (account_id, external_source, external_id),
  check (line_no > 0),
  check (ordered_qty >= 0),
  check (delivered_qty >= 0),
  check (shipped_qty >= 0),
  check (invoiced_qty >= 0),
  check (returned_qty >= 0),
  check (open_qty >= 0),
  check (unit_price >= 0),
  check (tax_inclusive_unit_price >= 0),
  check (discount_rate >= 0 and discount_rate <= 100),
  check (discount_amount >= 0),
  check (tax_rate >= 0 and tax_rate <= 100),
  check (tax_exclusive_amount >= 0),
  check (tax_amount >= 0),
  check (tax_inclusive_amount >= 0),
  check (local_currency_amount >= 0)
);

drop trigger if exists set_sales_orders_updated_at on public.sales_orders;
create trigger set_sales_orders_updated_at
before update on public.sales_orders
for each row
execute function public.set_updated_at();

drop trigger if exists set_sales_order_lines_updated_at on public.sales_order_lines;
create trigger set_sales_order_lines_updated_at
before update on public.sales_order_lines
for each row
execute function public.set_updated_at();

create index if not exists idx_sales_orders_account_doc_date
  on public.sales_orders (account_id, doc_date desc, doc_no desc);

create index if not exists idx_sales_orders_customer
  on public.sales_orders (account_id, customer_code, doc_date desc);

create index if not exists idx_sales_orders_status
  on public.sales_orders (account_id, status, approval_status, close_status);

create index if not exists idx_sales_orders_external_doc
  on public.sales_orders (account_id, external_source, external_doc_no);

create index if not exists idx_sales_order_lines_order
  on public.sales_order_lines (account_id, order_id, line_no);

create index if not exists idx_sales_order_lines_item
  on public.sales_order_lines (account_id, item_code, delivery_date);

create index if not exists idx_sales_order_lines_source
  on public.sales_order_lines (account_id, source_doc_type, source_doc_no, source_line_no);

alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;

drop policy if exists "Account members can read sales orders" on public.sales_orders;
create policy "Account members can read sales orders"
on public.sales_orders
for select
using (
  public.has_app_permission('sales.orders.manage')
  or exists (
    select 1
    from basejump.account_user account_members
    where account_members.account_id = sales_orders.account_id
      and account_members.user_id = auth.uid()
  )
);

drop policy if exists "Account owners can manage sales orders" on public.sales_orders;
create policy "Account owners can manage sales orders"
on public.sales_orders
for all
using (
  public.has_app_permission('sales.orders.manage')
  or exists (
    select 1
    from basejump.account_user account_members
    where account_members.account_id = sales_orders.account_id
      and account_members.user_id = auth.uid()
      and account_members.account_role = 'owner'
  )
)
with check (
  public.has_app_permission('sales.orders.manage')
  or exists (
    select 1
    from basejump.account_user account_members
    where account_members.account_id = sales_orders.account_id
      and account_members.user_id = auth.uid()
      and account_members.account_role = 'owner'
  )
);

drop policy if exists "Account members can read sales order lines" on public.sales_order_lines;
create policy "Account members can read sales order lines"
on public.sales_order_lines
for select
using (
  public.has_app_permission('sales.orders.manage')
  or exists (
    select 1
    from basejump.account_user account_members
    where account_members.account_id = sales_order_lines.account_id
      and account_members.user_id = auth.uid()
  )
);

drop policy if exists "Account owners can manage sales order lines" on public.sales_order_lines;
create policy "Account owners can manage sales order lines"
on public.sales_order_lines
for all
using (
  public.has_app_permission('sales.orders.manage')
  or exists (
    select 1
    from basejump.account_user account_members
    where account_members.account_id = sales_order_lines.account_id
      and account_members.user_id = auth.uid()
      and account_members.account_role = 'owner'
  )
)
with check (
  public.has_app_permission('sales.orders.manage')
  or exists (
    select 1
    from basejump.account_user account_members
    where account_members.account_id = sales_order_lines.account_id
      and account_members.user_id = auth.uid()
      and account_members.account_role = 'owner'
  )
);

insert into public.admin_permissions (
  code,
  name,
  description,
  resource_type,
  resource_key,
  action_code,
  status,
  sort_order
) values (
  'sales.orders.manage',
  'Manage Sales Orders',
  'Create, maintain, and synchronize U9-style sales orders and sales order lines.',
  'entity',
  'sales_orders',
  'manage',
  'active',
  210
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  resource_key = excluded.resource_key,
  action_code = excluded.action_code,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

select pg_notify('pgrst', 'reload schema');
