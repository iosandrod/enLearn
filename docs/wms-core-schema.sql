-- 精简版建表稿，供新库/独立验证库使用，不自动迁移已有完整版 WMS。
-- 复用 public.item，要求 id/account_id 为 uuid 且 (account_id,id) 唯一。
-- 当前项目配置库中未发现 public.item，部署前必须核对目标物料表。
begin;

-- 精简 WMS：复用 item；出入库、调拨、盘点和调整共用单据。
-- 依赖现有账套、认证、权限及物料主数据，不创建第二套物料档案。
create table public.wms_warehouse (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  status text not null default 'active' check (status in ('active', 'inactive')),
  remark text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, id),
  unique (account_id, code)
);

create table public.wms_location (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,
  warehouse_id uuid not null,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  status text not null default 'active' check (status in ('active', 'inactive')),
  remark text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, id),
  unique (account_id, warehouse_id, code),
  foreign key (account_id, warehouse_id)
    references public.wms_warehouse(account_id, id) on delete restrict
);

create table public.wms_document (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,
  code text not null check (btrim(code) <> ''),
  type text not null check (type in ('receipt', 'issue', 'transfer', 'count', 'adjustment')),
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  warehouse_id uuid not null,
  target_warehouse_id uuid,
  business_date date not null default current_date,
  source_type text,
  source_id uuid,
  remark text,
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, id),
  unique (account_id, code),
  foreign key (account_id, warehouse_id)
    references public.wms_warehouse(account_id, id) on delete restrict,
  foreign key (account_id, target_warehouse_id)
    references public.wms_warehouse(account_id, id) on delete restrict,
  check ((type = 'transfer' and target_warehouse_id is not null)
      or (type <> 'transfer' and target_warehouse_id is null)),
  check ((status = 'posted' and posted_at is not null)
      or (status <> 'posted' and posted_at is null))
);

create table public.wms_document_line (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,
  document_id uuid not null,
  line_no integer not null check (line_no > 0),
  item_id uuid not null,
  location_id uuid not null,
  target_location_id uuid,
  batch text not null default '' check (batch = btrim(batch)),
  quantity numeric(30, 8) not null,
  expected_quantity numeric(30, 8) check (expected_quantity >= 0),
  remark text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, id),
  unique (account_id, document_id, line_no),
  unique (account_id, document_id, item_id, location_id, batch),
  foreign key (account_id, document_id)
    references public.wms_document(account_id, id) on delete cascade,
  foreign key (account_id, item_id)
    references public.item(account_id, id) on delete restrict,
  foreign key (account_id, location_id)
    references public.wms_location(account_id, id) on delete restrict,
  foreign key (account_id, target_location_id)
    references public.wms_location(account_id, id) on delete restrict,
  check (target_location_id is null or target_location_id <> location_id),
  check (quantity::text not in ('NaN', 'Infinity', '-Infinity')),
  check (expected_quantity is null or expected_quantity::text not in ('NaN', 'Infinity', '-Infinity'))
);

create table public.wms_inventory_balance (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,
  item_id uuid not null,
  location_id uuid not null,
  batch text not null default '' check (batch = btrim(batch)),
  quantity numeric(30, 8) not null default 0
    check (quantity >= 0 and quantity::text not in ('NaN', 'Infinity', '-Infinity')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, id),
  unique (account_id, item_id, location_id, batch),
  foreign key (account_id, item_id)
    references public.item(account_id, id) on delete restrict,
  foreign key (account_id, location_id)
    references public.wms_location(account_id, id) on delete restrict
);

create table public.wms_inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete restrict,
  document_line_id uuid not null,
  balance_id uuid not null,
  quantity_change numeric(30, 8) not null check (quantity_change <> 0),
  quantity_before numeric(30, 8) not null check (quantity_before >= 0),
  quantity_after numeric(30, 8) not null check (quantity_after >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, id),
  unique (account_id, document_line_id, balance_id),
  foreign key (account_id, document_line_id)
    references public.wms_document_line(account_id, id) on delete restrict,
  foreign key (account_id, balance_id)
    references public.wms_inventory_balance(account_id, id) on delete restrict,
  check (quantity_after = quantity_before + quantity_change),
  check (quantity_change::text not in ('NaN', 'Infinity', '-Infinity')),
  check (quantity_before::text not in ('NaN', 'Infinity', '-Infinity')),
  check (quantity_after::text not in ('NaN', 'Infinity', '-Infinity'))
);

create index if not exists idx_wms_document_status
  on public.wms_document(account_id, status, business_date desc);
create index if not exists idx_wms_document_source
  on public.wms_document(account_id, source_type, source_id) where source_id is not null;
create index if not exists idx_wms_balance_location
  on public.wms_inventory_balance(account_id, location_id, item_id);
create index if not exists idx_wms_ledger_balance
  on public.wms_inventory_ledger(account_id, balance_id, created_at);
create index if not exists idx_wms_line_item
  on public.wms_document_line(account_id, item_id);

comment on table public.wms_warehouse is 'WMS 仓库档案。';
comment on table public.wms_location is 'WMS 库位；无需库位管理的仓库也使用一个默认库位。';
comment on table public.wms_document is 'WMS 统一库存单据：入库、出库、调拨、盘点、调整。';
comment on table public.wms_document_line is 'WMS 单据明细；item_id 复用 item，数量均为物料基本单位。';
comment on column public.wms_document_line.quantity is '入库/出库/调拨为正数；盘点为实盘数量；调整为带符号差额。';
comment on column public.wms_document_line.expected_quantity is '仅盘点使用：盘点时账面数量；过账时若库存变化则拒绝，需重新盘点。';
comment on column public.wms_document_line.batch is '批次号；不管理批次时统一为空字符串。';
comment on table public.wms_inventory_balance is 'WMS 库存余额：账套+物料+库位+批次唯一；仅过账命令维护。';
comment on table public.wms_inventory_ledger is 'WMS 不可变库存流水；通过 balance_id 获取物料、库位、批次，通过明细获取来源单据。';

create or replace function public.wms_guard_record()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  document_status text;
begin
  if tg_table_name = 'wms_inventory_ledger' then
    raise exception 'WMS ledger records are immutable';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.account_id is distinct from old.account_id then
      raise exception 'WMS record identity cannot change';
    end if;
    new.updated_at := now();
    if tg_table_name = 'wms_location' then
      if new.warehouse_id is distinct from old.warehouse_id then
        raise exception 'WMS location cannot move to another warehouse';
      end if;
    end if;
    if tg_table_name = 'wms_inventory_balance' then
      if new.item_id is distinct from old.item_id or new.location_id is distinct from old.location_id
          or new.batch is distinct from old.batch then
        raise exception 'WMS balance dimensions cannot change';
      end if;
    end if;
  end if;
  if tg_table_name = 'wms_document' and tg_op in ('UPDATE', 'DELETE') then
    if old.status <> 'draft' then
      raise exception 'Only draft WMS documents can change';
    end if;
  end if;
  if tg_table_name = 'wms_document_line' then
    if tg_op = 'UPDATE' and new.document_id is distinct from old.document_id then
      raise exception 'WMS lines cannot move to another document';
    end if;
    select status into document_status from public.wms_document
    where account_id = case when tg_op = 'DELETE' then old.account_id else new.account_id end
      and id = case when tg_op = 'DELETE' then old.document_id else new.document_id end
    for update;
    -- 删除草稿单头时，级联删除的明细可以看不到已删除的父记录。
    if document_status is not null and document_status <> 'draft' then
      raise exception 'Only draft WMS document lines can change';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['wms_warehouse', 'wms_location', 'wms_document',
    'wms_document_line', 'wms_inventory_balance'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_guard', table_name);
    execute format('create trigger %I before update or delete on public.%I
      for each row execute function public.wms_guard_record()', table_name || '_guard', table_name);
  end loop;
end;
$$;
drop trigger if exists wms_document_line_insert_guard on public.wms_document_line;
create trigger wms_document_line_insert_guard before insert on public.wms_document_line
  for each row execute function public.wms_guard_record();
drop trigger if exists wms_inventory_ledger_guard on public.wms_inventory_ledger;
create trigger wms_inventory_ledger_guard before update or delete on public.wms_inventory_ledger
  for each row execute function public.wms_guard_record();

-- 统一过账：锁定单据和库存、检查数量、写流水并更新状态，全程单事务。
create or replace function public.wms_post_document(p_account_id uuid, p_document_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  doc public.wms_document%rowtype;
  line record;
  movement record;
  stock public.wms_inventory_balance%rowtype;
  delta numeric(30, 8);
begin
  if auth.uid() is null or not public.is_active_account_member(p_account_id)
      or not public.has_account_permission(p_account_id, 'wms.core.manage') then
    raise exception 'WMS posting permission required' using errcode = '42501';
  end if;
  select * into doc from public.wms_document
    where account_id = p_account_id and id = p_document_id for update;
  if not found then raise exception 'WMS document not found'; end if;
  if doc.status = 'posted' then return doc.id; end if;
  if doc.status <> 'draft' then raise exception 'WMS document is not draft'; end if;
  if not exists (select 1 from public.wms_document_line
      where account_id = p_account_id and document_id = doc.id) then
    raise exception 'WMS document requires at least one line';
  end if;
  if exists (select 1 from public.wms_warehouse
      where account_id = p_account_id and id in (doc.warehouse_id, doc.target_warehouse_id)
        and status <> 'active') then
    raise exception 'WMS warehouse is inactive';
  end if;
  for line in
    select l.*, loc.warehouse_id as location_warehouse_id, loc.status as location_status,
      target.warehouse_id as target_location_warehouse_id, target.status as target_location_status
    from public.wms_document_line l
    join public.wms_location loc on loc.account_id = l.account_id and loc.id = l.location_id
    left join public.wms_location target on target.account_id = l.account_id and target.id = l.target_location_id
    where l.account_id = p_account_id and l.document_id = doc.id
  loop
    if line.location_warehouse_id <> doc.warehouse_id or line.location_status <> 'active' then
      raise exception 'WMS source location must be active and belong to the document warehouse';
    end if;
    if doc.type = 'transfer' then
      if line.target_location_id is null or line.target_location_warehouse_id <> doc.target_warehouse_id
          or line.target_location_status <> 'active' then
        raise exception 'WMS transfer requires an active target location in the target warehouse';
      end if;
    elsif line.target_location_id is not null then
      raise exception 'Target location is only supported for WMS transfers';
    end if;
    if doc.type in ('receipt', 'issue', 'transfer') and line.quantity <= 0 then
      raise exception 'WMS movement quantity must be positive';
    elsif doc.type = 'count' and (line.quantity < 0 or line.expected_quantity is null) then
      raise exception 'WMS count requires non-negative actual and expected quantities';
    elsif doc.type = 'adjustment' and line.quantity = 0 then
      raise exception 'WMS adjustment quantity cannot be zero';
    end if;
    if doc.type <> 'count' and line.expected_quantity is not null then
      raise exception 'Expected quantity is only supported for WMS counts';
    end if;
  end loop;

  -- 所有涉及的维度均按固定顺序建行、加锁；避免相反方向调拨产生锁顺序死锁。
  insert into public.wms_inventory_balance(account_id, item_id, location_id, batch, created_by)
  select p_account_id, dimensions.item_id, dimensions.location_id, dimensions.batch, auth.uid()
  from (
    select item_id, location_id, batch from public.wms_document_line
      where account_id = p_account_id and document_id = doc.id
    union
    select item_id, target_location_id, batch from public.wms_document_line
      where account_id = p_account_id and document_id = doc.id and target_location_id is not null
  ) dimensions
  order by dimensions.item_id, dimensions.location_id, dimensions.batch
  on conflict (account_id, item_id, location_id, batch) do nothing;

  perform b.id from public.wms_inventory_balance b
  where b.account_id = p_account_id and exists (
    select 1 from public.wms_document_line l
    where l.account_id = p_account_id and l.document_id = doc.id
      and l.item_id = b.item_id and l.batch = b.batch
      and (l.location_id = b.location_id or l.target_location_id = b.location_id)
  ) order by b.item_id, b.location_id, b.batch for update;

  for line in select * from public.wms_document_line
    where account_id = p_account_id and document_id = doc.id order by line_no
  loop
    for movement in
      select line.location_id as location_id, false as is_target
      union all
      select line.target_location_id, true where doc.type = 'transfer'
    loop
      select * into strict stock from public.wms_inventory_balance
      where account_id = p_account_id and item_id = line.item_id
        and location_id = movement.location_id and batch = line.batch;
      if doc.type = 'count' then
        if stock.quantity <> line.expected_quantity then
          raise exception 'WMS count is stale; recount before posting';
        end if;
        delta := line.quantity - stock.quantity;
      elsif doc.type = 'issue' or (doc.type = 'transfer' and not movement.is_target) then
        delta := -line.quantity;
      else delta := line.quantity;
      end if;
      if stock.quantity + delta < 0 then
        raise exception 'Insufficient WMS stock for line %', line.line_no;
      end if;
      if delta <> 0 then
        update public.wms_inventory_balance set quantity = stock.quantity + delta, updated_by = auth.uid()
          where account_id = p_account_id and id = stock.id;
        insert into public.wms_inventory_ledger(account_id, document_line_id, balance_id,
          quantity_change, quantity_before, quantity_after, created_by)
        values (p_account_id, line.id, stock.id, delta, stock.quantity, stock.quantity + delta, auth.uid());
      end if;
    end loop;
  end loop;
  update public.wms_document set status = 'posted', posted_at = now(), posted_by = auth.uid(), updated_by = auth.uid()
    where account_id = p_account_id and id = doc.id;
  return doc.id;
end;
$$;
revoke all on function public.wms_post_document(uuid, uuid) from public, anon;
grant execute on function public.wms_post_document(uuid, uuid) to authenticated, service_role;

insert into public.admin_permissions
  (code, name, description, resource_type, resource_key, action_code, status, sort_order)
values
  ('wms.core.view', '查看仓储数据', '查看仓库、库位、单据、库存和流水。', 'action', 'wms', 'view', 'active', 330),
  ('wms.core.manage', '维护仓储数据', '维护仓库、库位和草稿单据，执行库存过账。', 'action', 'wms', 'manage', 'active', 331)
on conflict (code) do nothing;

do $$
declare table_name text;
begin
  foreach table_name in array array['wms_warehouse', 'wms_location', 'wms_document',
    'wms_document_line', 'wms_inventory_balance', 'wms_inventory_ledger'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_read', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (
      public.is_active_account_member(account_id) and (
        public.has_account_permission(account_id, ''wms.core.view'') or
        public.has_account_permission(account_id, ''wms.core.manage'')))', table_name || '_read', table_name);
  end loop;
  foreach table_name in array array['wms_warehouse', 'wms_location'] loop
    execute format('grant insert, update, delete on public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_manage', table_name);
    execute format('create policy %I on public.%I for all to authenticated
      using (public.is_active_account_member(account_id) and public.has_account_permission(account_id, ''wms.core.manage''))
      with check (public.is_active_account_member(account_id) and public.has_account_permission(account_id, ''wms.core.manage''))',
      table_name || '_manage', table_name);
  end loop;
end;
$$;

-- 普通用户只能维护草稿，不能直接修改余额、写流水或把状态改为 posted。
grant insert, update, delete on public.wms_document, public.wms_document_line to authenticated;
drop policy if exists wms_document_insert on public.wms_document;
create policy wms_document_insert on public.wms_document for insert to authenticated
  with check (status = 'draft' and posted_at is null and posted_by is null
    and public.is_active_account_member(account_id) and public.has_account_permission(account_id, 'wms.core.manage'));
drop policy if exists wms_document_update on public.wms_document;
create policy wms_document_update on public.wms_document for update to authenticated
  using (status = 'draft' and public.is_active_account_member(account_id) and public.has_account_permission(account_id, 'wms.core.manage'))
  with check (status in ('draft', 'cancelled') and posted_at is null and posted_by is null
    and public.is_active_account_member(account_id) and public.has_account_permission(account_id, 'wms.core.manage'));
drop policy if exists wms_document_delete on public.wms_document;
create policy wms_document_delete on public.wms_document for delete to authenticated
  using (status = 'draft' and public.is_active_account_member(account_id) and public.has_account_permission(account_id, 'wms.core.manage'));
drop policy if exists wms_document_line_manage on public.wms_document_line;
create policy wms_document_line_manage on public.wms_document_line for all to authenticated
  using (public.is_active_account_member(account_id) and public.has_account_permission(account_id, 'wms.core.manage')
    and exists (select 1 from public.wms_document d
      where d.account_id = wms_document_line.account_id and d.id = wms_document_line.document_id and d.status = 'draft'))
  with check (public.is_active_account_member(account_id) and public.has_account_permission(account_id, 'wms.core.manage')
    and exists (select 1 from public.wms_document d
      where d.account_id = wms_document_line.account_id and d.id = wms_document_line.document_id and d.status = 'draft'));

select pg_notify('pgrst', 'reload schema');
commit;
