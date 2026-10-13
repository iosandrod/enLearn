-- 将空的旧版 WMS 收缩为六张核心表；只改数据库。
-- 执行前必须取得可恢复的完整数据库备份。任一旧表非空时中止，禁止丢弃业务数据。
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(hashtextextended('enlearn.wms.shrink.v1',0));
do $check$
declare names text[] := ARRAY['wms_adjustment','wms_adjustment_line','wms_count','wms_count_line','wms_integration_message','wms_inventory_balance','wms_inventory_hold','wms_inventory_ledger','wms_inventory_reservation','wms_item','wms_item_barcode','wms_item_uom','wms_location','wms_lot','wms_lpn','wms_pack','wms_pack_line','wms_partner','wms_print_binding','wms_print_job','wms_print_job_item','wms_receipt','wms_receipt_line','wms_serial','wms_shipment','wms_shipment_line','wms_task','wms_task_line','wms_transfer_order','wms_transfer_order_line','wms_uom','wms_warehouse','wms_wave','wms_wave_line','wms_zone']; actual text[]; t text; occupied boolean;
begin
 select array_agg(tablename order by tablename) into actual from pg_tables where schemaname='public' and left(tablename,4)='wms_';
 if actual is distinct from names then raise exception 'Unexpected WMS table set; inspect before replacing'; end if;
 foreach t in array names loop execute format('lock table public.%I in access exclusive mode',t); end loop;
 foreach t in array names loop execute format('select exists(select 1 from public.%I limit 1)',t) into occupied;
  if occupied then raise exception 'WMS table % contains business data; migration aborted',t; end if; end loop;
 if exists(select 1 from pg_constraint f join pg_class s on s.oid=f.conrelid join pg_class d on d.oid=f.confrelid join pg_namespace n on n.oid=d.relnamespace where f.contype='f' and n.nspname='public' and d.relname=any(names) and not s.relname=any(names)) then raise exception 'External WMS foreign keys exist'; end if;
end;
$check$;
create temporary table wms_removed_pages on commit drop as select id,code from public.lowcode_pages where left(code,4)='wms-' or regexp_replace(table_name,'^public\.','') in ('wms_adjustment','wms_adjustment_line','wms_count','wms_count_line','wms_integration_message','wms_inventory_balance','wms_inventory_hold','wms_inventory_ledger','wms_inventory_reservation','wms_item','wms_item_barcode','wms_item_uom','wms_location','wms_lot','wms_lpn','wms_pack','wms_pack_line','wms_partner','wms_print_binding','wms_print_job','wms_print_job_item','wms_receipt','wms_receipt_line','wms_serial','wms_shipment','wms_shipment_line','wms_task','wms_task_line','wms_transfer_order','wms_transfer_order_line','wms_uom','wms_warehouse','wms_wave','wms_wave_line','wms_zone');
delete from public.admin_routes where code<>'wms-root' and (left(code,4)='wms-' or page_code in(select code from wms_removed_pages));
delete from public.admin_entities where regexp_replace(table_name,'^public\.','') in ('wms_adjustment','wms_adjustment_line','wms_count','wms_count_line','wms_integration_message','wms_inventory_balance','wms_inventory_hold','wms_inventory_ledger','wms_inventory_reservation','wms_item','wms_item_barcode','wms_item_uom','wms_location','wms_lot','wms_lpn','wms_pack','wms_pack_line','wms_partner','wms_print_binding','wms_print_job','wms_print_job_item','wms_receipt','wms_receipt_line','wms_serial','wms_shipment','wms_shipment_line','wms_task','wms_task_line','wms_transfer_order','wms_transfer_order_line','wms_uom','wms_warehouse','wms_wave','wms_wave_line','wms_zone') or page_code in(select code from wms_removed_pages);
delete from public.lowcode_form_definitions where regexp_replace(table_name,'^public\.','') in ('wms_adjustment','wms_adjustment_line','wms_count','wms_count_line','wms_integration_message','wms_inventory_balance','wms_inventory_hold','wms_inventory_ledger','wms_inventory_reservation','wms_item','wms_item_barcode','wms_item_uom','wms_location','wms_lot','wms_lpn','wms_pack','wms_pack_line','wms_partner','wms_print_binding','wms_print_job','wms_print_job_item','wms_receipt','wms_receipt_line','wms_serial','wms_shipment','wms_shipment_line','wms_task','wms_task_line','wms_transfer_order','wms_transfer_order_line','wms_uom','wms_warehouse','wms_wave','wms_wave_line','wms_zone');
delete from public.lowcode_pages where id in(select id from wms_removed_pages);
delete from public.service_resource_metadata where regexp_replace(table_name,'^public\.','') in ('wms_adjustment','wms_adjustment_line','wms_count','wms_count_line','wms_integration_message','wms_inventory_balance','wms_inventory_hold','wms_inventory_ledger','wms_inventory_reservation','wms_item','wms_item_barcode','wms_item_uom','wms_location','wms_lot','wms_lpn','wms_pack','wms_pack_line','wms_partner','wms_print_binding','wms_print_job','wms_print_job_item','wms_receipt','wms_receipt_line','wms_serial','wms_shipment','wms_shipment_line','wms_task','wms_task_line','wms_transfer_order','wms_transfer_order_line','wms_uom','wms_warehouse','wms_wave','wms_wave_line','wms_zone');
delete from public.dynamic_crud_resource_registry where regexp_replace(table_name,'^public\.','') in ('wms_adjustment','wms_adjustment_line','wms_count','wms_count_line','wms_integration_message','wms_inventory_balance','wms_inventory_hold','wms_inventory_ledger','wms_inventory_reservation','wms_item','wms_item_barcode','wms_item_uom','wms_location','wms_lot','wms_lpn','wms_pack','wms_pack_line','wms_partner','wms_print_binding','wms_print_job','wms_print_job_item','wms_receipt','wms_receipt_line','wms_serial','wms_shipment','wms_shipment_line','wms_task','wms_task_line','wms_transfer_order','wms_transfer_order_line','wms_uom','wms_warehouse','wms_wave','wms_wave_line','wms_zone');
drop table public.wms_adjustment,
  public.wms_adjustment_line,
  public.wms_count,
  public.wms_count_line,
  public.wms_integration_message,
  public.wms_inventory_balance,
  public.wms_inventory_hold,
  public.wms_inventory_ledger,
  public.wms_inventory_reservation,
  public.wms_item,
  public.wms_item_barcode,
  public.wms_item_uom,
  public.wms_location,
  public.wms_lot,
  public.wms_lpn,
  public.wms_pack,
  public.wms_pack_line,
  public.wms_partner,
  public.wms_print_binding,
  public.wms_print_job,
  public.wms_print_job_item,
  public.wms_receipt,
  public.wms_receipt_line,
  public.wms_serial,
  public.wms_shipment,
  public.wms_shipment_line,
  public.wms_task,
  public.wms_task_line,
  public.wms_transfer_order,
  public.wms_transfer_order_line,
  public.wms_uom,
  public.wms_warehouse,
  public.wms_wave,
  public.wms_wave_line,
  public.wms_zone restrict;
drop function if exists public.wms_set_updated_at() restrict;
-- 精简 WMS：复用 planning_item；出入库、调拨、盘点和调整共用单据。
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
    references public.planning_item(account_id, id) on delete restrict,
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
    references public.planning_item(account_id, id) on delete restrict,
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

-- 核心表 JSON 注释；relation 按实际外键生成，兼容旧完整版和精简版。
-- 只更新已存在的核心表，不创建表、不变更外键或业务数据。
do $wms_table_comments$
declare
  table_metadata jsonb := '{
    "wms_warehouse":["仓库档案","维护账套内的仓库编码、名称、状态及基础信息。"],
    "wms_location":["库位档案","维护仓库内的存储库位；无需精细库位管理时使用默认库位。"],
    "wms_document":["库存单据","统一记录入库、出库、调拨、盘点和调整单据，以及草稿、已过账和已取消状态。"],
    "wms_document_line":["库存单据明细","记录库存单据的物料、来源库位、目标库位、批次及基本单位数量；盘点另保留账面快照。"],
    "wms_inventory_balance":["库存余额","记录各库存维度的当前数量；维度及物料关联以实际表结构和外键为准。"],
    "wms_inventory_ledger":["库存流水","记录库存变动及其业务来源，用于库存追溯和对账；关联方式以实际外键为准。"]
  }'::jsonb;
  table_record record;
  relations jsonb;
  existing_metadata jsonb;
begin
  for table_record in
    select c.oid as table_oid, c.relname as table_name,
      obj_description(c.oid, 'pg_class') as old_comment
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and table_metadata ? c.relname::text
    order by c.relname
  loop
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'table', rn.nspname || '.' || rc.relname,
        'type', direction.relation_type,
        'localColumns', (
          select jsonb_agg(a.attname order by k.ordinality)
          from unnest(direction.local_keys) with ordinality k(attnum, ordinality)
          join pg_attribute a on a.attrelid = table_record.table_oid and a.attnum = k.attnum
        ),
        'relatedColumns', (
          select jsonb_agg(a.attname order by k.ordinality)
          from unnest(direction.related_keys) with ordinality k(attnum, ordinality)
          join pg_attribute a on a.attrelid = direction.related_oid and a.attnum = k.attnum
        ),
        'constraint', fk.conname,
        'onDelete', case fk.confdeltype
          when 'c' then 'CASCADE' when 'r' then 'RESTRICT' when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT' else 'NO ACTION' end
      ) order by rn.nspname, rc.relname, direction.relation_type, fk.conname
    ), '[]'::jsonb) into relations
    from pg_constraint fk
    cross join lateral (
      select 'references'::text as relation_type, fk.confrelid as related_oid,
        fk.conkey as local_keys, fk.confkey as related_keys
      where fk.conrelid = table_record.table_oid
      union all
      select 'referenced_by'::text, fk.conrelid, fk.confkey, fk.conkey
      where fk.confrelid = table_record.table_oid
    ) direction
    join pg_class rc on rc.oid = direction.related_oid
    join pg_namespace rn on rn.oid = rc.relnamespace
    where fk.contype = 'f'
      and (fk.conrelid = table_record.table_oid or fk.confrelid = table_record.table_oid);

    existing_metadata := '{}'::jsonb;
    if table_record.old_comment is not null then
      begin
        existing_metadata := table_record.old_comment::jsonb;
        if jsonb_typeof(existing_metadata) <> 'object' then existing_metadata := '{}'::jsonb; end if;
      exception when invalid_text_representation then
        existing_metadata := '{}'::jsonb;
      end;
    end if;
    execute format('comment on table public.%I is %L',
      table_record.table_name,
      (existing_metadata || jsonb_build_object(
        'title', table_metadata -> table_record.table_name ->> 0,
        'description', table_metadata -> table_record.table_name ->> 1,
        'relation', relations
      ))::text
    );
  end loop;
end;
$wms_table_comments$;

-- WMS 核心字段 JSON 注释；兼容精简方案和目标库已有的四张同名表。
-- 缺失的核心表跳过；已有字段全部覆盖，未知字段则中止，避免不完整注释。
do $wms_comments$
declare
  common_metadata jsonb := '{
    "id":["ID","text","当前记录的唯一标识。"],
    "account_id":["账套ID","text","所属账套的唯一标识，用于多租户数据隔离。"],
    "code":["编码","text","业务编码。"],
    "name":["名称","text","面向业务用户显示的名称。"],
    "status":["状态","enum","记录的业务状态。"],
    "remark":["备注","text","记录业务备注。"],
    "created_by":["创建人","text","创建该记录的用户标识。"],
    "updated_by":["更新人","text","最后更新该记录的用户标识。"],
    "created_at":["创建时间","datetime","记录创建时间。"],
    "updated_at":["更新时间","datetime","记录最后更新时间。"],
    "warehouse_id":["仓库","text","所属仓库的唯一标识。"],
    "location_id":["库位","text","库存所在库位的唯一标识。"],
    "item_id":["物料","text","库存物料的唯一标识，具体主数据表见实际外键。"],
    "batch":["批次号","text","批次号；不管理批次时统一为空字符串，不含首尾空格。"],
    "metadata":["扩展信息","json","以 JSON 结构保存业务扩展信息。"],
    "lot_id":["批次","text","关联批次档案的唯一标识。"],
    "serial_id":["序列号","text","关联序列号档案的唯一标识。"],
    "lpn_id":["容器","text","关联托盘或容器档案的唯一标识。"],
    "inventory_status":["库存状态","enum","available 可用、quarantine 待检、blocked 冻结、damaged 损坏、in_transit 在途。"],
    "source_type":["来源类型","text","来源业务对象类型，与来源ID配合追踪业务来源。"],
    "source_id":["来源ID","text","来源业务记录的唯一标识；多态引用，由业务服务校验。"]
  }'::jsonb;
  specific_metadata jsonb := '{
    "wms_warehouse.code":["仓库编码","text","仓库在账套内的唯一业务编码。"],
    "wms_warehouse.name":["仓库名称","text","面向业务用户显示的仓库名称。"],
    "wms_warehouse.status":["仓库状态","enum","active 启用、inactive 停用。"],
    "wms_warehouse.warehouse_type":["仓库类型","enum","standard 标准仓库、3pl 第三方仓库、virtual 虚拟仓库、transit 中转仓库。"],
    "wms_warehouse.address":["地址","text","仓库地址。"],
    "wms_warehouse.timezone":["时区","text","仓库使用的时区名称，默认 Asia/Shanghai。"],
    "wms_warehouse.planning_location_id":["计划地点","text","关联排产模块地点的唯一标识。"],
    "wms_location.code":["库位编码","text","库位在账套和仓库内的唯一业务编码。"],
    "wms_location.name":["库位名称","text","面向业务用户显示的库位名称。"],
    "wms_location.status":["库位状态","enum","active 启用、inactive 停用；仅旧完整版结构允许 blocked 冻结。"],
    "wms_location.zone_id":["库区","text","所属库区的唯一标识。"],
    "wms_location.parent_id":["上级库位","text","上级库位的唯一标识，用于库位层级组织。"],
    "wms_location.location_type":["库位类型","enum","aisle 巷道、rack 货架、shelf 层板、bin 储位、floor 地堆、dock 月台、staging 暂存、virtual 虚拟库位。"],
    "wms_location.pick_sequence":["拣货顺序","number","库位的拣货排序值。"],
    "wms_location.capacity_qty":["数量容量","number","库位允许存放的数量容量。"],
    "wms_location.capacity_weight":["重量容量","number","库位允许承载的重量容量。"],
    "wms_location.capacity_volume":["体积容量","number","库位允许存放的体积容量。"],
    "wms_location.allow_mixed_item":["允许混放物料","boolean","是否允许同一库位存放多种物料。"],
    "wms_location.allow_mixed_lot":["允许混放批次","boolean","是否允许同一库位存放多个批次。"],
    "wms_document.code":["单据编码","text","库存单据在账套内的唯一业务编码。"],
    "wms_document.type":["单据类型","enum","receipt 入库、issue 出库、transfer 调拨、count 盘点、adjustment 调整。"],
    "wms_document.status":["单据状态","enum","draft 草稿、posted 已过账、cancelled 已取消；已过账和已取消的单据不可编辑。"],
    "wms_document.warehouse_id":["来源仓库","text","入出库、盘点和调整对应的仓库；调拨时为来源仓库。"],
    "wms_document.target_warehouse_id":["目标仓库","text","仅调拨使用；同仓移库时可与来源仓库相同。"],
    "wms_document.business_date":["业务日期","datetime","库存单据的业务日期，默认当前日期。"],
    "wms_document.posted_by":["过账人","text","执行库存过账的认证用户标识。"],
    "wms_document.posted_at":["过账时间","datetime","单据成功过账的时间；仅已过账单据有值。"],
    "wms_document_line.document_id":["库存单据","text","所属库存单据的唯一标识。"],
    "wms_document_line.line_no":["行号","number","单据内唯一的正整数行号。"],
    "wms_document_line.location_id":["来源库位","text","单据涉及的库位；调拨时为来源库位，必须属于单头来源仓库。"],
    "wms_document_line.target_location_id":["目标库位","text","仅调拨使用，必须属于目标仓库且不同于来源库位。"],
    "wms_document_line.quantity":["业务数量","number","物料基本单位数量：入库、出库和调拨为正数；盘点为非负实盘数量；调整为非零带符号差额。"],
    "wms_document_line.expected_quantity":["盘点账面数量","number","仅盘点使用的非负账面快照；过账时若当前库存已变化则拒绝，需重新盘点。"],
    "wms_inventory_balance.quantity":["库存数量","number","按账套、物料、库位和批次汇总的非负库存余额，仅由库存过账维护。"],
    "wms_inventory_balance.on_hand_qty":["在库数量","number","当前库存维度的实际在库数量，不允许为负数。"],
    "wms_inventory_balance.reserved_qty":["预留数量","number","当前库存维度已预留的数量，不允许为负数。"],
    "wms_inventory_balance.picked_qty":["已拣数量","number","当前库存维度已拣货的数量，不允许为负数。"],
    "wms_inventory_balance.available_qty":["可用数量","number","按现有表定义计算的可用库存数量。"],
    "wms_inventory_balance.last_movement_at":["最近变动时间","datetime","当前库存维度最近一次库存变动的时间。"],
    "wms_inventory_ledger.document_line_id":["单据明细","text","产生该库存流水的单据明细标识。"],
    "wms_inventory_ledger.balance_id":["库存余额","text","该库存流水对应的库存余额标识，可据此获取物料、库位和批次。"],
    "wms_inventory_ledger.quantity_change":["变动数量","number","本次库存变动的非零带符号差额，正数增加、负数减少。"],
    "wms_inventory_ledger.quantity_before":["变动前数量","number","本次库存变动前的非负库存数量。"],
    "wms_inventory_ledger.quantity_after":["变动后数量","number","本次库存变动后的非负库存数量，等于变动前数量加变动数量。"],
    "wms_inventory_ledger.movement_type":["库存动作","enum","receipt 收货、putaway 上架、pick 拣货、ship 发货、transfer_in 调入、transfer_out 调出、adjustment 调整、count 盘点、hold 冻结、release 解冻、return 退回。"],
    "wms_inventory_ledger.quantity":["变动数量","number","非零库存变动数量，方向按现有库存动作及业务规则解释。"],
    "wms_inventory_ledger.idempotency_key":["幂等键","text","账套内唯一的库存动作幂等键，防止重复处理；允许为空。"],
    "wms_inventory_ledger.occurred_at":["发生时间","datetime","库存动作发生的时间。"]
  }'::jsonb;
  column_record record;
  metadata jsonb;
  existing_metadata jsonb;
  description text;
  references_text text;
  comment_value jsonb;
begin
  for column_record in
    select c.oid as table_oid, c.relname as table_name, a.attnum, a.attname as column_name,
      col_description(c.oid, a.attnum) as old_comment
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname in ('wms_warehouse', 'wms_location', 'wms_document',
        'wms_document_line', 'wms_inventory_balance', 'wms_inventory_ledger')
      and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum
  loop
    metadata := coalesce(
      specific_metadata -> (column_record.table_name || '.' || column_record.column_name),
      common_metadata -> column_record.column_name
    );
    if metadata is null then
      raise exception 'Missing WMS column metadata: %.%', column_record.table_name, column_record.column_name;
    end if;
    description := metadata ->> 2;
    -- 从实际外键获取关联说明，避免旧表仍关联 wms_item 时误注释为 planning_item。
    select string_agg(distinct format('%I.%I.%I', rn.nspname, rc.relname, ra.attname), '、')
      into references_text
    from pg_constraint fk
    cross join lateral unnest(fk.conkey, fk.confkey) as keys(local_num, referenced_num)
    join pg_class rc on rc.oid = fk.confrelid
    join pg_namespace rn on rn.oid = rc.relnamespace
    join pg_attribute ra on ra.attrelid = fk.confrelid and ra.attnum = keys.referenced_num
    where fk.contype = 'f' and fk.conrelid = column_record.table_oid
      and keys.local_num = column_record.attnum;
    if references_text is not null then
      description := description || '实际外键关联：' || references_text || '。';
    end if;
    existing_metadata := '{}'::jsonb;
    if column_record.old_comment is not null then
      begin
        existing_metadata := column_record.old_comment::jsonb;
        if jsonb_typeof(existing_metadata) <> 'object' then existing_metadata := '{}'::jsonb; end if;
      exception when invalid_text_representation then
        existing_metadata := '{}'::jsonb;
      end;
    end if;
    comment_value := existing_metadata || jsonb_build_object(
      'title', metadata ->> 0,
      'type', metadata ->> 1,
      'align', case when metadata ->> 1 = 'number' then 'right'
        when metadata ->> 1 in ('datetime', 'enum', 'boolean') then 'center' else 'left' end,
      'description', description
    );
    execute format('comment on column public.%I.%I is %L',
      column_record.table_name, column_record.column_name, comment_value::text);
  end loop;
end;
$wms_comments$;

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


-- 延续旧角色授权；不向无 WMS 权限的角色新增权限。
insert into public.admin_role_permissions(role_id,permission_id)
select rp.role_id,newp.id from public.admin_role_permissions rp join public.admin_permissions oldp on oldp.id=rp.permission_id join public.admin_permissions newp on newp.code=case oldp.code when 'wms.view' then 'wms.core.view' when 'wms.manage' then 'wms.core.manage' end where oldp.code in ('wms.view','wms.manage') on conflict do nothing;
update public.admin_routes set permission_code=case permission_code when 'wms.view' then 'wms.core.view' when 'wms.manage' then 'wms.core.manage' end where permission_code in ('wms.view','wms.manage');
delete from public.admin_role_permissions where permission_id in (select id from public.admin_permissions where code in ('wms.view','wms.manage'));
delete from public.admin_permissions where code in ('wms.view','wms.manage');
-- WMS 物料选择器只增加现有物料的只读权限，不能维护物料。
create policy wms_core_material_read on public.planning_item for select to authenticated using(public.has_account_permission(account_id,'wms.core.view') or public.has_account_permission(account_id,'wms.core.manage'));
create or replace function pg_temp.wms_field(
  p_field text,
  p_label text,
  p_component text default 'vxe-input',
  p_props jsonb default '{}'::jsonb,
  p_options jsonb default '[]'::jsonb,
  p_required boolean default false,
  p_span integer default 1
) returns jsonb language plpgsql immutable as $function$
begin
  return jsonb_strip_nulls(jsonb_build_object(
    'span', p_span,
    'field', p_field,
    'label', p_label,
    'props', p_props,
    'component', p_component,
    'options', case when jsonb_array_length(p_options) > 0 then p_options else null end,
    'rules', case when p_required then jsonb_build_array(jsonb_build_object(
      'required', true, 'message', '请输入' || p_label
    )) else null end
  ));
end;
$function$;

create or replace function pg_temp.wms_relation(
  p_resource text,
  p_table text,
  p_display_fields jsonb default '["code","name"]'::jsonb
) returns jsonb language sql immutable as $function$
  select jsonb_build_object(
    'serviceName', 'admin',
    'serviceMethod', 'listItems',
    'sourceType', 'entity',
    'resource', p_resource,
    'tableName', p_table,
    'valueField', 'id',
    'displayField', p_display_fields,
    'searchFields', p_display_fields,
    'fieldMappings', jsonb_build_array(jsonb_build_object('sourceField', 'id', 'targetField', '__FIELD__'))
  );
$function$;

create or replace function pg_temp.wms_column(
  p_field text,
  p_title text,
  p_renderer text default 'VxeInput',
  p_props jsonb default '{}'::jsonb,
  p_width integer default 140,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql immutable as $function$
begin
  return jsonb_strip_nulls(jsonb_build_object(
    'field', p_field,
    'title', p_title,
    'width', p_width,
    'visible', true,
    'sortable', false,
    'resizable', true,
    'editRender', jsonb_build_object('name', p_renderer, 'props', p_props) ||
      case when p_metadata ? 'options' then jsonb_build_object('options',p_metadata->'options') else '{}'::jsonb end,
    'params', case when p_metadata <> '{}'::jsonb
      then jsonb_build_object('lowcodeField', p_metadata) else null end
  ));
end;
$function$;

create or replace function pg_temp.wms_call_script(p_name text) returns text
language sql immutable as $function$
  select format('async function main() { return this.executeFunction({ name: "%s", args: {} }); }', p_name);
$function$;

create or replace function pg_temp.wms_add_script(p_grid_id text, p_row jsonb) returns text
language sql immutable as $function$
  select format($script$
async function main() {
  const gridId = "%s";
  const grid = this.grids[gridId] || {};
  const sourceRows = this.data[gridId];
  const rows = Array.isArray(grid.rows) ? grid.rows : Array.isArray(sourceRows) ? sourceRows :
    sourceRows && Array.isArray(sourceRows.rows) ? sourceRows.rows : [];
  const maxLineNo = rows.reduce((maximum, row) => {
    const lineNo = Number(row.line_no);
    return Number.isFinite(lineNo) ? Math.max(maximum, lineNo) : maximum;
  }, 0);
  return this.executeAction({ node: gridId, method: "addRow", data: {
    id: `new-${Date.now()}-${rows.length + 1}`, line_no: maxLineNo + 1, %s
  }});
}
$script$, p_grid_id, trim(both '{}' from (p_row - 'line_no' - 'id')::text));
$function$;

create or replace function pg_temp.wms_delete_script(p_grid_id text) returns text
language sql immutable as $function$
  select format($script$
async function main() {
  const deleted = await this.executeAction({ node: "%s", method: "deleteCurrentRow" });
  if (!deleted) {
    await this.$message.warning("请先选择要删除的明细");
    return null;
  }
  return deleted;
}
$script$, p_grid_id);
$function$;

create or replace function pg_temp.wms_upsert_edit_page(
  p_code text,
  p_route text,
  p_title text,
  p_description text,
  p_main_table text,
  p_main_source text,
  p_detail_table text,
  p_detail_source text,
  p_detail_fk text,
  p_main_fields jsonb,
  p_detail_columns jsonb,
  p_initial_values jsonb,
  p_detail_defaults jsonb,
  p_detail_new_row jsonb
) returns uuid language plpgsql as $function$
declare
  v_schema jsonb;
  v_page public.lowcode_pages%rowtype;
  v_form_id text := p_code || '-form';
  v_grid_id text := p_code || '-lines-grid';
  v_tabs_id text := p_code || '-lines-tabs';
  v_now timestamptz := timezone('utc'::text, now());
  v_edit_rules jsonb;
begin
  select coalesce(jsonb_object_agg(
    c.column_name,
    jsonb_build_array(jsonb_build_object('required',true,'message','请输入' || coalesce((
      select col->>'title' from jsonb_array_elements(p_detail_columns) col where col->>'field'=c.column_name
    ),c.column_name)))
  ),'{}'::jsonb)
  into v_edit_rules
  from information_schema.columns c
  join pg_class pc on pc.relname=c.table_name
  join pg_namespace pn on pn.oid=pc.relnamespace and pn.nspname=c.table_schema
  where c.table_schema='public' and c.table_name=p_detail_table and c.is_nullable='NO'
    and c.column_name not in ('id','account_id',p_detail_fk);

  v_schema := jsonb_build_object(
    'schemaVersion', 1,
    'code', p_code,
    'route', p_route,
    'title', p_title || '编辑',
    'pageType', 'edit',
    'description', p_description,
    'layout', 'dashboard',
    'status', 'published',
    'keepAlive', true,
    'dataSources', jsonb_build_object(
      v_form_id, jsonb_build_object(
        'key', v_form_id, 'label', p_title, 'autoLoad', true,
        'postData', jsonb_build_object(
          'limit', 1, 'filters', jsonb_build_object('id', '{{ route.query.id }}'),
          'tableName', p_main_table, 'requiredFilters', jsonb_build_array('id')
        ),
        'tableName', p_main_table, 'saveMethod', 'saveItem',
        'sourceType', 'table', 'serviceName', 'admin', 'serviceMethod', 'listItems',
        'saveServiceName', 'admin'
      ),
      v_grid_id, jsonb_build_object(
        'key', v_grid_id, 'label', p_title || '明细', 'autoLoad', true,
        'postData', jsonb_build_object(
          'limit', 1000,
          'sorts', jsonb_build_array(
            jsonb_build_object('field', 'line_no', 'direction', 'asc')
          ),
          'filters', jsonb_build_object(p_detail_fk, '{{ route.query.id }}'),
          'tableName', p_detail_table, 'requiredFilters', jsonb_build_array(p_detail_fk)
        ),
        'tableName', p_detail_table, 'sourceType', 'table',
        'serviceName', 'admin', 'serviceMethod', 'listItems'
      )
    ),
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'id', p_code || '-actions', 'kind', 'buttonGroup', 'title', '', 'align', 'left', 'gap', '8',
        'actions', jsonb_build_array(
          jsonb_build_object('code','modify','type','button','label','修改','prefixIcon','ri-edit-2-line','eventName','buttonGroup.modify','script',pg_temp.wms_call_script('modify'),'permissionCode','wms.core.manage'),
          jsonb_build_object('code','save','type','button','label','保存','status','primary','prefixIcon','ri-save-line','eventName','buttonGroup.save','script',pg_temp.wms_call_script('save'),'permissionCode','wms.core.manage'),
          jsonb_build_object('code','addDetail','type','button','label','添加明细','prefixIcon','ri-add-line','script',pg_temp.wms_add_script(v_grid_id,p_detail_new_row),'permissionCode','wms.core.manage'),
          jsonb_build_object('code','deleteDetail','type','button','label','删除明细','status','danger','prefixIcon','ri-delete-bin-line','script',pg_temp.wms_delete_script(v_grid_id),'permissionCode','wms.core.manage'),
          jsonb_build_object('code','create','type','button','label','新增','status','primary','prefixIcon','ri-add-line','eventName','buttonGroup.create','script',pg_temp.wms_call_script('create'),'permissionCode','wms.core.manage'),
          jsonb_build_object('code','refresh','type','button','label','刷新','prefixIcon','ri-refresh-line','eventName','buttonGroup.refresh','script',pg_temp.wms_call_script('refresh')),
          jsonb_build_object('code','exit','type','button','label','退出','prefixIcon','ri-arrow-left-line','eventName','buttonGroup.exit','script',pg_temp.wms_call_script('exit'))
        )
      ),
      jsonb_build_object(
        'id', v_form_id, 'kind', 'form', 'formType', 'edit', 'title', p_title,
        'initialValues', p_initial_values,
        'dataSource', jsonb_build_object(
          'key', v_form_id, 'label', p_title, 'autoLoad', true,
          'postData', jsonb_build_object('limit',1,'filters',jsonb_build_object('id','{{ route.query.id }}'),'tableName',p_main_table,'requiredFilters',jsonb_build_array('id')),
          'tableName',p_main_table,'saveMethod','saveItem','sourceType','table','serviceName','admin','serviceMethod','listItems','saveServiceName','admin'
        ),
        'schema', jsonb_build_object(
          'fields', p_main_fields,
          'columns', 3,
          'actions', jsonb_build_array(
            jsonb_build_object('code','submit','type','submit','label','保存','status','primary','eventName','form.submit'),
            jsonb_build_object('code','reset','type','reset','label','重置','eventName','form.reset')
          )
        )
      ),
      jsonb_build_object(
        'id', v_tabs_id, 'kind', 'tabs', 'title', '明细', 'defaultKey', 'lines',
        'tabs', jsonb_build_array(jsonb_build_object(
          'key','lines','label',p_title || '明细','blocks',jsonb_build_array(jsonb_build_object(
            'id', v_grid_id, 'kind','grid','tableType','detail','title',p_title || '明细','sourceKey',v_grid_id,
            'schema',jsonb_build_object(
              'grid',jsonb_build_object(
                'border',true,'stripe',true,'showOverflow','tooltip','height',360,
                'rowConfig',jsonb_build_object('keyField','id','isCurrent',true,'useKey',true),
                'editConfig',jsonb_build_object('mode','row','enabled',true,'trigger','click','showStatus',true),
                'editRules',v_edit_rules,
                'columns',p_detail_columns
              ),
              'rowActions',jsonb_build_object('edit',false,'delete',false,'actions',jsonb_build_array()),
              'detailConfig',jsonb_build_object(
                'enabled',true,'resource',p_detail_table,'parentKey','id','foreignKey',p_detail_fk,
                'updateMode','changes','inheritFields',jsonb_build_array('account_id'),
                'parentSourceKey',v_form_id,'defaults',p_detail_defaults,'stripCreatedKey',true
              )
            )
          ))
        ))
      )
    ),
    'scriptPolicy', jsonb_build_object('capabilities',jsonb_build_array('action.execute','http.execute','message.success','message.warning','router.push','source.refresh','source.set')),
    'config', jsonb_build_object('bgColor','','bgImage','','keepAlive',false),
    'overlays', jsonb_build_array()
  );

  insert into public.lowcode_pages
    (code,route,title,description,page_type,layout,status,keep_alive,table_name,schema,version,published_at,updated_at)
  values
    (p_code,p_route,p_title || '编辑',p_description,'edit','dashboard','published',true,p_main_table,v_schema,1,v_now,v_now)
  on conflict (code) do update set
    route=excluded.route,title=excluded.title,description=excluded.description,page_type='edit',layout='dashboard',
    status='published',keep_alive=true,table_name=excluded.table_name,schema=excluded.schema,
    version=public.lowcode_pages.version + 1,published_at=excluded.published_at,updated_at=v_now
  returning * into v_page;

  insert into public.lowcode_page_versions (page_id,version,schema,published_at,created_at)
  values (v_page.id,v_page.version,v_page.schema,v_now,v_now)
  on conflict (page_id,version) do update set schema=excluded.schema,published_at=excluded.published_at;
  return v_page.id;
end;
$function$;

insert into public.service_resource_metadata(service_name,resource_name,table_name,version,config,enabled) values ('admin','wms_warehouse','wms_warehouse',1,'{"tableName":"wms_warehouse","primaryKey":"id","accountField":"account_id","clientMode":"user","permissions":{"list":["wms.core.view","wms.core.manage"],"create":"wms.core.manage","update":"wms.core.manage","delete":"wms.core.manage"},"list":{"defaultPageSize":1000,"maxPageSize":1000},"create":{"allowedFields":["code","name","status","remark"],"userFields":{"createdBy":"created_by","updatedBy":"updated_by"}},"update":{"allowedFields":["code","name","status","remark"],"userFields":{"updatedBy":"updated_by"}},"delete":{"timestamp":false}}'::jsonb,true);
insert into public.service_resource_metadata(service_name,resource_name,table_name,version,config,enabled) values ('admin','wms_location','wms_location',1,'{"tableName":"wms_location","primaryKey":"id","accountField":"account_id","clientMode":"user","permissions":{"list":["wms.core.view","wms.core.manage"],"create":"wms.core.manage","update":"wms.core.manage","delete":"wms.core.manage"},"list":{"defaultPageSize":1000,"maxPageSize":1000},"create":{"allowedFields":["warehouse_id","code","name","status","remark"],"userFields":{"createdBy":"created_by","updatedBy":"updated_by"}},"update":{"allowedFields":["warehouse_id","code","name","status","remark"],"userFields":{"updatedBy":"updated_by"}},"delete":{"timestamp":false}}'::jsonb,true);
insert into public.service_resource_metadata(service_name,resource_name,table_name,version,config,enabled) values ('admin','wms_document','wms_document',1,'{"tableName":"wms_document","primaryKey":"id","accountField":"account_id","clientMode":"user","permissions":{"list":["wms.core.view","wms.core.manage"],"create":"wms.core.manage","update":"wms.core.manage","delete":"wms.core.manage"},"list":{"defaultPageSize":1000,"maxPageSize":1000},"create":{"allowedFields":["code","type","status","warehouse_id","target_warehouse_id","business_date","source_type","source_id","remark"],"userFields":{"createdBy":"created_by","updatedBy":"updated_by"}},"update":{"allowedFields":["code","type","status","warehouse_id","target_warehouse_id","business_date","source_type","source_id","remark"],"userFields":{"updatedBy":"updated_by"}},"delete":{"timestamp":false}}'::jsonb,true);
insert into public.service_resource_metadata(service_name,resource_name,table_name,version,config,enabled) values ('admin','wms_document_line','wms_document_line',1,'{"tableName":"wms_document_line","primaryKey":"id","accountField":"account_id","clientMode":"user","permissions":{"list":["wms.core.view","wms.core.manage"],"create":"wms.core.manage","update":"wms.core.manage","delete":"wms.core.manage"},"list":{"defaultPageSize":1000,"maxPageSize":1000},"create":{"allowedFields":["account_id","document_id","line_no","item_id","location_id","target_location_id","batch","quantity","expected_quantity","remark"],"userFields":{"createdBy":"created_by","updatedBy":"updated_by"}},"update":{"allowedFields":["account_id","document_id","line_no","item_id","location_id","target_location_id","batch","quantity","expected_quantity","remark"],"userFields":{"updatedBy":"updated_by"}},"delete":{"timestamp":false}}'::jsonb,true);
insert into public.service_resource_metadata(service_name,resource_name,table_name,version,config,enabled) values ('admin','wms_inventory_balance','wms_inventory_balance',1,'{"tableName":"wms_inventory_balance","primaryKey":"id","accountField":"account_id","clientMode":"user","permissions":{"list":["wms.core.view","wms.core.manage"],"create":"wms.core.internal","update":"wms.core.internal","delete":"wms.core.internal"},"list":{"defaultPageSize":1000,"maxPageSize":1000},"create":{"allowedFields":[],"timestamp":false},"update":{"allowedFields":[],"timestamp":false},"delete":{"timestamp":false}}'::jsonb,true);
insert into public.service_resource_metadata(service_name,resource_name,table_name,version,config,enabled) values ('admin','wms_inventory_ledger','wms_inventory_ledger',1,'{"tableName":"wms_inventory_ledger","primaryKey":"id","accountField":"account_id","clientMode":"user","permissions":{"list":["wms.core.view","wms.core.manage"],"create":"wms.core.internal","update":"wms.core.internal","delete":"wms.core.internal"},"list":{"defaultPageSize":1000,"maxPageSize":1000},"create":{"allowedFields":[],"timestamp":false},"update":{"allowedFields":[],"timestamp":false},"delete":{"timestamp":false}}'::jsonb,true);
insert into public.service_resource_metadata(service_name,resource_name,table_name,version,config,enabled) values ('admin','wms_material','planning_item',1,'{"tableName":"planning_item","primaryKey":"id","accountField":"account_id","clientMode":"user","permissions":{"list":["wms.core.view","wms.core.manage"],"create":"wms.core.internal","update":"wms.core.internal","delete":"wms.core.internal"},"list":{"defaultPageSize":1000,"maxPageSize":1000},"create":{"allowedFields":[],"timestamp":false},"update":{"allowedFields":[],"timestamp":false},"delete":{"timestamp":false}}'::jsonb,true);
insert into public.lowcode_pages(code,route,title,description,page_type,layout,status,keep_alive,table_name,schema,version,published_at) values('wms-documents','/dashboard/wms/documents','出入库单据','统一出入库单据','list','dashboard','published',true,'wms_document','{"schemaVersion":1,"code":"wms-documents","route":"/dashboard/wms/documents","title":"出入库单据","pageType":"list","layout":"dashboard","status":"published","keepAlive":true,"dataSources":{"wms-documents-rows":{"key":"wms-documents-rows","label":"出入库单据","sourceType":"table","serviceName":"admin","serviceMethod":"listItems","tableName":"wms_document","autoLoad":true,"postData":{"tableName":"wms_document","limit":1000,"sorts":[{"field":"updated_at","direction":"desc"}]}},"wms-documents-lines":{"key":"wms-documents-lines","label":"单据明细","sourceType":"table","serviceName":"admin","serviceMethod":"listItems","tableName":"wms_document_line","autoLoad":false,"postData":{"tableName":"wms_document_line","limit":1000,"sorts":[{"field":"line_no","direction":"asc"}],"filters":{"document_id":"{{ data.wms-documents-rowsSelected.id }}"},"requiredFilters":["document_id"]}}},"blocks":[{"id":"wms-documents-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","type":"button","label":"新增","status":"primary","script":"async function main() { return this.executeFunction({name: \"create\", args: {}}); }","permissionCode":"wms.core.manage"},{"code":"edit","type":"button","label":"查看 / 编辑","script":"async function main() { return this.executeFunction({name: \"edit\", args: {}}); }"},{"code":"refresh","type":"button","label":"刷新","script":"async function main() { return this.executeFunction({name: \"refresh\", args: {}}); }"}]},{"id":"wms-documents-grid","kind":"grid","tableType":"main","title":"出入库单据","sourceKey":"wms-documents-rows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":true,"height":440,"rowConfig":{"keyField":"id","isCurrent":true},"columns":[{"field":"code","title":"单据编码","width":145,"align":"left"},{"field":"type","title":"业务类型","width":145,"align":"left"},{"field":"status","title":"状态","width":145,"align":"left"},{"field":"warehouse_id","title":"来源仓库","width":230,"align":"left","params":{"lowcodeField":{"field":"warehouse_id","label":"来源仓库","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_warehouse","tableName":"wms_warehouse","valueField":"id","displayField":["code","name"],"searchFields":["code","name"],"fieldMappings":[{"sourceField":"id","targetField":"warehouse_id"}]}}}}},{"field":"target_warehouse_id","title":"目标仓库","width":230,"align":"left","params":{"lowcodeField":{"field":"target_warehouse_id","label":"目标仓库","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_warehouse","tableName":"wms_warehouse","valueField":"id","displayField":["code","name"],"searchFields":["code","name"],"fieldMappings":[{"sourceField":"id","targetField":"target_warehouse_id"}]}}}}},{"field":"business_date","title":"业务日期","width":145,"align":"left"},{"field":"posted_at","title":"过账时间","width":145,"align":"left"},{"field":"remark","title":"备注","width":145,"align":"left"}]},"rowActions":{"edit":true,"delete":false,"actions":[]},"events":{"rowCurrentChange":[{"type":"setDataSource","sourceKey":"wms-documents-rowsSelected","value":"{{ event.row }}"},{"type":"setSearchFilters","sourceKey":"wms-documents-lines","mode":"replace","values":{"document_id":"{{ event.row.id }}"}}]}}},{"id":"wms-documents-lines-grid","kind":"grid","tableType":"detail","title":"单据明细","sourceKey":"wms-documents-lines","schema":{"grid":{"border":true,"stripe":true,"height":260,"rowConfig":{"keyField":"id"},"columns":[{"field":"line_no","title":"行号","width":145,"align":"right"},{"field":"item_id","title":"物料","width":230,"align":"left","params":{"lowcodeField":{"field":"item_id","label":"物料","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_material","tableName":"planning_item","valueField":"id","displayField":["name","display_name","uom"],"searchFields":["name","display_name"],"fieldMappings":[{"sourceField":"id","targetField":"item_id"}]}}}}},{"field":"location_id","title":"来源库位","width":230,"align":"left","params":{"lowcodeField":{"field":"location_id","label":"来源库位","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_location","tableName":"wms_location","valueField":"id","displayField":["code","name"],"searchFields":["code","name"],"fieldMappings":[{"sourceField":"id","targetField":"location_id"}]}}}}},{"field":"target_location_id","title":"目标库位","width":230,"align":"left","params":{"lowcodeField":{"field":"target_location_id","label":"目标库位","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_location","tableName":"wms_location","valueField":"id","displayField":["code","name"],"searchFields":["code","name"],"fieldMappings":[{"sourceField":"id","targetField":"target_location_id"}]}}}}},{"field":"batch","title":"批次","width":145,"align":"left"},{"field":"quantity","title":"数量","width":145,"align":"right"},{"field":"expected_quantity","title":"账面快照数量","width":145,"align":"right"},{"field":"remark","title":"备注","width":145,"align":"left"}]},"rowActions":{"edit":false,"delete":false,"actions":[]},"detailConfig":{"enabled":false,"foreignKey":"document_id"}}}],"scriptPolicy":{"capabilities":["action.execute","router.push","source.refresh","message.warning"]},"config":{"keepAlive":false},"overlays":[]}'::jsonb,1,now());
insert into public.lowcode_pages(code,route,title,description,page_type,layout,status,keep_alive,table_name,schema,version,published_at) values('wms-warehouses','/dashboard/wms/warehouses','仓库管理','仓库档案','list','dashboard','published',true,'wms_warehouse','{"schemaVersion":1,"code":"wms-warehouses","route":"/dashboard/wms/warehouses","title":"仓库管理","pageType":"list","layout":"dashboard","status":"published","keepAlive":true,"dataSources":{"wms-warehouses-rows":{"key":"wms-warehouses-rows","label":"仓库管理","sourceType":"table","serviceName":"admin","serviceMethod":"listItems","tableName":"wms_warehouse","autoLoad":true,"postData":{"tableName":"wms_warehouse","limit":1000,"sorts":[{"field":"updated_at","direction":"desc"}]}}},"blocks":[{"id":"wms-warehouses-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","type":"button","label":"新增","status":"primary","script":"async function main() { return this.executeFunction({name: \"create\", args: {}}); }","permissionCode":"wms.core.manage"},{"code":"edit","type":"button","label":"查看 / 编辑","script":"async function main() { return this.executeFunction({name: \"edit\", args: {}}); }"},{"code":"refresh","type":"button","label":"刷新","script":"async function main() { return this.executeFunction({name: \"refresh\", args: {}}); }"}]},{"id":"wms-warehouses-grid","kind":"grid","tableType":"main","title":"仓库管理","sourceKey":"wms-warehouses-rows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":true,"height":440,"rowConfig":{"keyField":"id","isCurrent":true},"columns":[{"field":"code","title":"仓库编码","width":145,"align":"left"},{"field":"name","title":"仓库名称","width":145,"align":"left"},{"field":"status","title":"状态","width":145,"align":"left"},{"field":"remark","title":"备注","width":145,"align":"left"}]},"rowActions":{"edit":true,"delete":false,"actions":[]}}}],"scriptPolicy":{"capabilities":["action.execute","router.push","source.refresh","message.warning"]},"config":{"keepAlive":false},"overlays":[]}'::jsonb,1,now());
insert into public.lowcode_pages(code,route,title,description,page_type,layout,status,keep_alive,table_name,schema,version,published_at) values('wms-locations','/dashboard/wms/locations','库位管理','库位档案','list','dashboard','published',true,'wms_location','{"schemaVersion":1,"code":"wms-locations","route":"/dashboard/wms/locations","title":"库位管理","pageType":"list","layout":"dashboard","status":"published","keepAlive":true,"dataSources":{"wms-locations-rows":{"key":"wms-locations-rows","label":"库位管理","sourceType":"table","serviceName":"admin","serviceMethod":"listItems","tableName":"wms_location","autoLoad":true,"postData":{"tableName":"wms_location","limit":1000,"sorts":[{"field":"updated_at","direction":"desc"}]}}},"blocks":[{"id":"wms-locations-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"create","type":"button","label":"新增","status":"primary","script":"async function main() { return this.executeFunction({name: \"create\", args: {}}); }","permissionCode":"wms.core.manage"},{"code":"edit","type":"button","label":"查看 / 编辑","script":"async function main() { return this.executeFunction({name: \"edit\", args: {}}); }"},{"code":"refresh","type":"button","label":"刷新","script":"async function main() { return this.executeFunction({name: \"refresh\", args: {}}); }"}]},{"id":"wms-locations-grid","kind":"grid","tableType":"main","title":"库位管理","sourceKey":"wms-locations-rows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":true,"height":440,"rowConfig":{"keyField":"id","isCurrent":true},"columns":[{"field":"code","title":"库位编码","width":145,"align":"left"},{"field":"name","title":"库位名称","width":145,"align":"left"},{"field":"warehouse_id","title":"所属仓库","width":230,"align":"left","params":{"lowcodeField":{"field":"warehouse_id","label":"所属仓库","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_warehouse","tableName":"wms_warehouse","valueField":"id","displayField":["code","name"],"searchFields":["code","name"],"fieldMappings":[{"sourceField":"id","targetField":"warehouse_id"}]}}}}},{"field":"status","title":"状态","width":145,"align":"left"},{"field":"remark","title":"备注","width":145,"align":"left"}]},"rowActions":{"edit":true,"delete":false,"actions":[]}}}],"scriptPolicy":{"capabilities":["action.execute","router.push","source.refresh","message.warning"]},"config":{"keepAlive":false},"overlays":[]}'::jsonb,1,now());
insert into public.lowcode_pages(code,route,title,description,page_type,layout,status,keep_alive,table_name,schema,version,published_at) values('wms-balances','/dashboard/wms/balances','库存余额','库存余额','list','dashboard','published',true,'wms_inventory_balance','{"schemaVersion":1,"code":"wms-balances","route":"/dashboard/wms/balances","title":"库存余额","pageType":"list","layout":"dashboard","status":"published","keepAlive":true,"dataSources":{"wms-balances-rows":{"key":"wms-balances-rows","label":"库存余额","sourceType":"table","serviceName":"admin","serviceMethod":"listItems","tableName":"wms_inventory_balance","autoLoad":true,"postData":{"tableName":"wms_inventory_balance","limit":1000,"sorts":[{"field":"updated_at","direction":"desc"}]}}},"blocks":[{"id":"wms-balances-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"refresh","type":"button","label":"刷新","script":"async function main() { return this.executeFunction({name: \"refresh\", args: {}}); }"}]},{"id":"wms-balances-grid","kind":"grid","tableType":"main","title":"库存余额","sourceKey":"wms-balances-rows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":true,"height":440,"rowConfig":{"keyField":"id","isCurrent":true},"columns":[{"field":"item_id","title":"物料","width":230,"align":"left","params":{"lowcodeField":{"field":"item_id","label":"物料","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_material","tableName":"planning_item","valueField":"id","displayField":["name","display_name","uom"],"searchFields":["name","display_name"],"fieldMappings":[{"sourceField":"id","targetField":"item_id"}]}}}}},{"field":"location_id","title":"库位","width":230,"align":"left","params":{"lowcodeField":{"field":"location_id","label":"库位","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_location","tableName":"wms_location","valueField":"id","displayField":["code","name"],"searchFields":["code","name"],"fieldMappings":[{"sourceField":"id","targetField":"location_id"}]}}}}},{"field":"batch","title":"批次","width":145,"align":"left"},{"field":"quantity","title":"现存数量","width":145,"align":"right"},{"field":"updated_at","title":"更新时间","width":145,"align":"left"}]},"rowActions":{"edit":false,"delete":false,"actions":[]}}}],"scriptPolicy":{"capabilities":["action.execute","router.push","source.refresh","message.warning"]},"config":{"keepAlive":false},"overlays":[]}'::jsonb,1,now());
insert into public.lowcode_pages(code,route,title,description,page_type,layout,status,keep_alive,table_name,schema,version,published_at) values('wms-ledger','/dashboard/wms/ledger','库存流水','库存流水','list','dashboard','published',true,'wms_inventory_ledger','{"schemaVersion":1,"code":"wms-ledger","route":"/dashboard/wms/ledger","title":"库存流水","pageType":"list","layout":"dashboard","status":"published","keepAlive":true,"dataSources":{"wms-ledger-rows":{"key":"wms-ledger-rows","label":"库存流水","sourceType":"table","serviceName":"admin","serviceMethod":"listItems","tableName":"wms_inventory_ledger","autoLoad":true,"postData":{"tableName":"wms_inventory_ledger","limit":1000,"sorts":[{"field":"created_at","direction":"desc"}]}}},"blocks":[{"id":"wms-ledger-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"refresh","type":"button","label":"刷新","script":"async function main() { return this.executeFunction({name: \"refresh\", args: {}}); }"}]},{"id":"wms-ledger-grid","kind":"grid","tableType":"main","title":"库存流水","sourceKey":"wms-ledger-rows","schema":{"grid":{"border":true,"stripe":true,"showOverflow":true,"height":440,"rowConfig":{"keyField":"id","isCurrent":true},"columns":[{"field":"document_line_id","title":"单据明细ID","width":145,"align":"left"},{"field":"balance_id","title":"库存余额ID","width":145,"align":"left"},{"field":"quantity_change","title":"增减数量","width":145,"align":"right"},{"field":"quantity_before","title":"变动前数量","width":145,"align":"right"},{"field":"quantity_after","title":"变动后数量","width":145,"align":"right"},{"field":"created_at","title":"发生时间","width":145,"align":"left"}]},"rowActions":{"edit":false,"delete":false,"actions":[]}}}],"scriptPolicy":{"capabilities":["action.execute","router.push","source.refresh","message.warning"]},"config":{"keepAlive":false},"overlays":[]}'::jsonb,1,now());
select pg_temp.wms_upsert_edit_page('wms-documents-edit','/dashboard/wms/documents/edit','出入库单据','入库、出库、调拨、盘点、调整共用头表和明细。','wms_document','wmsDocumentEditForm','wms_document_line','wmsDocumentLines','document_id','[{"field":"code","label":"单据编码","span":1,"component":"vxe-input","props":{"clearable":true},"rules":[{"required":true,"message":"请输入单据编码"}]},{"field":"type","label":"业务类型","span":1,"component":"vxe-select","props":{"clearable":false},"options":[{"label":"入库","value":"receipt"},{"label":"出库","value":"issue"},{"label":"调拨","value":"transfer"},{"label":"盘点","value":"count"},{"label":"调整 / 期初","value":"adjustment"}],"rules":[{"required":true,"message":"请输入业务类型"}]},{"field":"status","label":"状态","span":1,"component":"vxe-select","props":{"clearable":false},"options":[{"label":"草稿","value":"draft"},{"label":"已取消","value":"cancelled"}],"rules":[{"required":true,"message":"请输入状态"}]},{"field":"warehouse_id","label":"来源仓库","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_warehouse","tableName":"wms_warehouse","valueField":"id","displayField":["code","name"],"searchFields":["code","name"],"fieldMappings":[{"sourceField":"id","targetField":"warehouse_id"}]}},"rules":[{"required":true,"message":"请输入来源仓库"}]},{"field":"target_warehouse_id","label":"目标仓库（调拨必填）","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_warehouse","tableName":"wms_warehouse","valueField":"id","displayField":["code","name"],"searchFields":["code","name"],"fieldMappings":[{"sourceField":"id","targetField":"target_warehouse_id"}]}}},{"field":"business_date","label":"业务日期","span":1,"component":"vxe-input","props":{"type":"date"}},{"field":"source_type","label":"来源类型","span":1,"component":"vxe-input","props":{}},{"field":"source_id","label":"来源ID","span":1,"component":"vxe-input","props":{}},{"field":"remark","label":"备注","span":3,"component":"vxe-textarea","props":{"autosize":{"minRows":2,"maxRows":4}}}]'::jsonb,'[{"field":"line_no","title":"行号","width":145,"align":"right","visible":true,"sortable":false,"resizable":true,"editRender":{"name":"VxeNumberInput","props":{"digits":0,"min":1}}},{"field":"item_id","title":"物料","width":230,"align":"left","params":{"lowcodeField":{"field":"item_id","label":"物料","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_material","tableName":"planning_item","valueField":"id","displayField":["name","display_name","uom"],"searchFields":["name","display_name"],"fieldMappings":[{"sourceField":"id","targetField":"item_id"}]}}}},"visible":true,"sortable":false,"resizable":true,"editRender":{"name":"VxeInput","props":{"clearable":true}}},{"field":"location_id","title":"来源库位","width":230,"align":"left","params":{"lowcodeField":{"field":"location_id","label":"来源库位","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_location","tableName":"wms_location","valueField":"id","displayField":["code","name"],"searchFields":["code","name"],"fieldMappings":[{"sourceField":"id","targetField":"location_id"}]}}}},"visible":true,"sortable":false,"resizable":true,"editRender":{"name":"VxeInput","props":{"clearable":true}}},{"field":"target_location_id","title":"目标库位","width":230,"align":"left","params":{"lowcodeField":{"field":"target_location_id","label":"目标库位","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_location","tableName":"wms_location","valueField":"id","displayField":["code","name"],"searchFields":["code","name"],"fieldMappings":[{"sourceField":"id","targetField":"target_location_id"}]}}}},"visible":true,"sortable":false,"resizable":true,"editRender":{"name":"VxeInput","props":{"clearable":true}}},{"field":"batch","title":"批次","width":145,"align":"left","visible":true,"sortable":false,"resizable":true,"editRender":{"name":"VxeInput","props":{"clearable":true}}},{"field":"quantity","title":"数量","width":145,"align":"right","visible":true,"sortable":false,"resizable":true,"editRender":{"name":"VxeNumberInput","props":{"digits":8}}},{"field":"expected_quantity","title":"账面快照数量","width":145,"align":"right","visible":true,"sortable":false,"resizable":true,"editRender":{"name":"VxeNumberInput","props":{"digits":8}}},{"field":"remark","title":"备注","width":145,"align":"left","visible":true,"sortable":false,"resizable":true,"editRender":{"name":"VxeInput","props":{"clearable":true}}}]'::jsonb,'{"type":"receipt","status":"draft"}'::jsonb,'{"batch":""}'::jsonb,'{"batch":"","quantity":1}'::jsonb);
update public.lowcode_pages set edit_page_id=(select id from public.lowcode_pages where code='wms-documents-edit') where code='wms-documents';
insert into public.lowcode_pages(code,route,title,description,page_type,layout,status,keep_alive,table_name,schema,version,published_at) values('wms-warehouses-edit','/dashboard/wms/warehouses/edit','仓库管理编辑','仓库档案','edit','dashboard','published',true,'wms_warehouse','{"schemaVersion":1,"code":"wms-warehouses-edit","route":"/dashboard/wms/warehouses/edit","title":"仓库管理编辑","pageType":"edit","layout":"dashboard","status":"published","keepAlive":true,"dataSources":{"wms-warehouses-edit-form":{"key":"wms-warehouses-edit-form","label":"仓库管理","autoLoad":true,"sourceType":"table","serviceName":"admin","serviceMethod":"listItems","tableName":"wms_warehouse","saveMethod":"saveItem","saveServiceName":"admin","postData":{"limit":1,"tableName":"wms_warehouse","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"]}}},"blocks":[{"id":"wms-warehouses-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"modify","type":"button","label":"修改","script":"async function main() { return this.executeFunction({name: \"modify\", args: {}}); }","permissionCode":"wms.core.manage"},{"code":"save","type":"button","label":"保存","script":"async function main() { return this.executeFunction({name: \"save\", args: {}}); }","permissionCode":"wms.core.manage"},{"code":"create","type":"button","label":"新增","script":"async function main() { return this.executeFunction({name: \"create\", args: {}}); }","permissionCode":"wms.core.manage"},{"code":"refresh","type":"button","label":"刷新","script":"async function main() { return this.executeFunction({name: \"refresh\", args: {}}); }"},{"code":"exit","type":"button","label":"退出","script":"async function main() { return this.executeFunction({name: \"exit\", args: {}}); }"}]},{"id":"wms-warehouses-edit-form","kind":"form","formType":"edit","title":"仓库管理","initialValues":{"status":"active"},"dataSource":{"key":"wms-warehouses-edit-form","label":"仓库管理","autoLoad":true,"sourceType":"table","serviceName":"admin","serviceMethod":"listItems","tableName":"wms_warehouse","saveMethod":"saveItem","saveServiceName":"admin","postData":{"limit":1,"tableName":"wms_warehouse","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"]}},"schema":{"fields":[{"field":"code","label":"编码","span":1,"component":"vxe-input","props":{},"rules":[{"required":true,"message":"请输入编码"}]},{"field":"name","label":"名称","span":1,"component":"vxe-input","props":{},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"status","label":"状态","span":1,"component":"vxe-select","props":{},"options":[{"label":"启用","value":"active"},{"label":"停用","value":"inactive"}],"rules":[{"required":true,"message":"请输入状态"}]},{"field":"remark","label":"备注","span":3,"component":"vxe-textarea","props":{}}],"columns":3,"actions":[{"code":"submit","type":"submit","label":"保存","status":"primary","eventName":"form.submit"},{"code":"reset","type":"reset","label":"重置","eventName":"form.reset"}]}}],"scriptPolicy":{"capabilities":["action.execute","http.execute","message.success","message.warning","router.push","source.refresh","source.set"]},"config":{"keepAlive":false},"overlays":[]}'::jsonb,1,now());
insert into public.lowcode_pages(code,route,title,description,page_type,layout,status,keep_alive,table_name,schema,version,published_at) values('wms-locations-edit','/dashboard/wms/locations/edit','库位管理编辑','库位档案','edit','dashboard','published',true,'wms_location','{"schemaVersion":1,"code":"wms-locations-edit","route":"/dashboard/wms/locations/edit","title":"库位管理编辑","pageType":"edit","layout":"dashboard","status":"published","keepAlive":true,"dataSources":{"wms-locations-edit-form":{"key":"wms-locations-edit-form","label":"库位管理","autoLoad":true,"sourceType":"table","serviceName":"admin","serviceMethod":"listItems","tableName":"wms_location","saveMethod":"saveItem","saveServiceName":"admin","postData":{"limit":1,"tableName":"wms_location","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"]}}},"blocks":[{"id":"wms-locations-edit-actions","kind":"buttonGroup","align":"left","gap":8,"actions":[{"code":"modify","type":"button","label":"修改","script":"async function main() { return this.executeFunction({name: \"modify\", args: {}}); }","permissionCode":"wms.core.manage"},{"code":"save","type":"button","label":"保存","script":"async function main() { return this.executeFunction({name: \"save\", args: {}}); }","permissionCode":"wms.core.manage"},{"code":"create","type":"button","label":"新增","script":"async function main() { return this.executeFunction({name: \"create\", args: {}}); }","permissionCode":"wms.core.manage"},{"code":"refresh","type":"button","label":"刷新","script":"async function main() { return this.executeFunction({name: \"refresh\", args: {}}); }"},{"code":"exit","type":"button","label":"退出","script":"async function main() { return this.executeFunction({name: \"exit\", args: {}}); }"}]},{"id":"wms-locations-edit-form","kind":"form","formType":"edit","title":"库位管理","initialValues":{"status":"active"},"dataSource":{"key":"wms-locations-edit-form","label":"库位管理","autoLoad":true,"sourceType":"table","serviceName":"admin","serviceMethod":"listItems","tableName":"wms_location","saveMethod":"saveItem","saveServiceName":"admin","postData":{"limit":1,"tableName":"wms_location","filters":{"id":"{{ route.query.id }}"},"requiredFilters":["id"]}},"schema":{"fields":[{"field":"code","label":"编码","span":1,"component":"vxe-input","props":{},"rules":[{"required":true,"message":"请输入编码"}]},{"field":"name","label":"名称","span":1,"component":"vxe-input","props":{},"rules":[{"required":true,"message":"请输入名称"}]},{"field":"warehouse_id","label":"所属仓库","span":1,"component":"base-info","props":{"clearable":true,"relateInfoConfig":{"serviceName":"admin","serviceMethod":"listItems","sourceType":"entity","resource":"wms_warehouse","tableName":"wms_warehouse","valueField":"id","displayField":["code","name"],"searchFields":["code","name"],"fieldMappings":[{"sourceField":"id","targetField":"warehouse_id"}]}},"rules":[{"required":true,"message":"请输入所属仓库"}]},{"field":"status","label":"状态","span":1,"component":"vxe-select","props":{},"options":[{"label":"启用","value":"active"},{"label":"停用","value":"inactive"}],"rules":[{"required":true,"message":"请输入状态"}]},{"field":"remark","label":"备注","span":3,"component":"vxe-textarea","props":{}}],"columns":3,"actions":[{"code":"submit","type":"submit","label":"保存","status":"primary","eventName":"form.submit"},{"code":"reset","type":"reset","label":"重置","eventName":"form.reset"}]}}],"scriptPolicy":{"capabilities":["action.execute","http.execute","message.success","message.warning","router.push","source.refresh","source.set"]},"config":{"keepAlive":false},"overlays":[]}'::jsonb,1,now());
update public.lowcode_pages set edit_page_id=(select id from public.lowcode_pages where code='wms-warehouses-edit') where code='wms-warehouses';
update public.lowcode_pages set edit_page_id=(select id from public.lowcode_pages where code='wms-locations-edit') where code='wms-locations';
update public.admin_routes set permission_code='wms.core.view',metadata='{"module":"wms","navigation":"sidebar","category":"wms"}'::jsonb,updated_at=now() where code='wms-root';
insert into public.admin_entities(code,title,table_name,route_path,page_code,icon,description,primary_key,status,sort_order,schema) values('wms_document','出入库单据','public.wms_document','/dashboard/wms/documents','wms-documents','ri-inbox-archive-line','统一出入库单据','id','active',230,'{"service":"admin","accountScoped":true}'::jsonb);
insert into public.admin_routes(code,title,path,parent_id,route_type,icon,page_code,permission_code,visible,keep_alive,layout,status,sort_order,metadata) select 'wms-documents','出入库单据','/dashboard/wms/documents',id,'page','ri-inbox-archive-line','wms-documents','wms.core.view',true,true,'dashboard','active',10,'{"module":"wms","tableName":"wms_document"}'::jsonb from public.admin_routes where code='wms-root';
insert into public.admin_entities(code,title,table_name,route_path,page_code,icon,description,primary_key,status,sort_order,schema) values('wms_warehouse','仓库管理','public.wms_warehouse','/dashboard/wms/warehouses','wms-warehouses','ri-inbox-archive-line','仓库档案','id','active',231,'{"service":"admin","accountScoped":true}'::jsonb);
insert into public.admin_routes(code,title,path,parent_id,route_type,icon,page_code,permission_code,visible,keep_alive,layout,status,sort_order,metadata) select 'wms-warehouses','仓库管理','/dashboard/wms/warehouses',id,'page','ri-inbox-archive-line','wms-warehouses','wms.core.view',true,true,'dashboard','active',20,'{"module":"wms","tableName":"wms_warehouse"}'::jsonb from public.admin_routes where code='wms-root';
insert into public.admin_entities(code,title,table_name,route_path,page_code,icon,description,primary_key,status,sort_order,schema) values('wms_location','库位管理','public.wms_location','/dashboard/wms/locations','wms-locations','ri-inbox-archive-line','库位档案','id','active',232,'{"service":"admin","accountScoped":true}'::jsonb);
insert into public.admin_routes(code,title,path,parent_id,route_type,icon,page_code,permission_code,visible,keep_alive,layout,status,sort_order,metadata) select 'wms-locations','库位管理','/dashboard/wms/locations',id,'page','ri-inbox-archive-line','wms-locations','wms.core.view',true,true,'dashboard','active',30,'{"module":"wms","tableName":"wms_location"}'::jsonb from public.admin_routes where code='wms-root';
insert into public.admin_entities(code,title,table_name,route_path,page_code,icon,description,primary_key,status,sort_order,schema) values('wms_inventory_balance','库存余额','public.wms_inventory_balance','/dashboard/wms/balances','wms-balances','ri-inbox-archive-line','库存余额','id','active',233,'{"service":"admin","accountScoped":true}'::jsonb);
insert into public.admin_routes(code,title,path,parent_id,route_type,icon,page_code,permission_code,visible,keep_alive,layout,status,sort_order,metadata) select 'wms-balances','库存余额','/dashboard/wms/balances',id,'page','ri-inbox-archive-line','wms-balances','wms.core.view',true,true,'dashboard','active',40,'{"module":"wms","tableName":"wms_inventory_balance"}'::jsonb from public.admin_routes where code='wms-root';
insert into public.admin_entities(code,title,table_name,route_path,page_code,icon,description,primary_key,status,sort_order,schema) values('wms_inventory_ledger','库存流水','public.wms_inventory_ledger','/dashboard/wms/ledger','wms-ledger','ri-inbox-archive-line','库存流水','id','active',234,'{"service":"admin","accountScoped":true}'::jsonb);
insert into public.admin_routes(code,title,path,parent_id,route_type,icon,page_code,permission_code,visible,keep_alive,layout,status,sort_order,metadata) select 'wms-ledger','库存流水','/dashboard/wms/ledger',id,'page','ri-inbox-archive-line','wms-ledger','wms.core.view',true,true,'dashboard','active',50,'{"module":"wms","tableName":"wms_inventory_ledger"}'::jsonb from public.admin_routes where code='wms-root';
insert into public.lowcode_page_versions(page_id,version,schema,published_at) select id,version,schema,published_at from public.lowcode_pages where code in ('wms-documents','wms-warehouses','wms-locations','wms-balances','wms-ledger','wms-warehouses-edit','wms-locations-edit') on conflict(page_id,version) do update set schema=excluded.schema;
-- 刷新被复用物料表的真实外键关系，保留原有 JSON 注释。
do $wms_table_comments$
declare
  table_metadata jsonb := jsonb_build_object('planning_item', jsonb_build_array(
    obj_description('public.planning_item'::regclass,'pg_class')::jsonb->>'title',
    obj_description('public.planning_item'::regclass,'pg_class')::jsonb->>'description'));
  table_record record;
  relations jsonb;
  existing_metadata jsonb;
begin
  for table_record in
    select c.oid as table_oid, c.relname as table_name,
      obj_description(c.oid, 'pg_class') as old_comment
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and table_metadata ? c.relname::text
    order by c.relname
  loop
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'table', rn.nspname || '.' || rc.relname,
        'type', direction.relation_type,
        'localColumns', (
          select jsonb_agg(a.attname order by k.ordinality)
          from unnest(direction.local_keys) with ordinality k(attnum, ordinality)
          join pg_attribute a on a.attrelid = table_record.table_oid and a.attnum = k.attnum
        ),
        'relatedColumns', (
          select jsonb_agg(a.attname order by k.ordinality)
          from unnest(direction.related_keys) with ordinality k(attnum, ordinality)
          join pg_attribute a on a.attrelid = direction.related_oid and a.attnum = k.attnum
        ),
        'constraint', fk.conname,
        'onDelete', case fk.confdeltype
          when 'c' then 'CASCADE' when 'r' then 'RESTRICT' when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT' else 'NO ACTION' end
      ) order by rn.nspname, rc.relname, direction.relation_type, fk.conname
    ), '[]'::jsonb) into relations
    from pg_constraint fk
    cross join lateral (
      select 'references'::text as relation_type, fk.confrelid as related_oid,
        fk.conkey as local_keys, fk.confkey as related_keys
      where fk.conrelid = table_record.table_oid
      union all
      select 'referenced_by'::text, fk.conrelid, fk.confkey, fk.conkey
      where fk.confrelid = table_record.table_oid
    ) direction
    join pg_class rc on rc.oid = direction.related_oid
    join pg_namespace rn on rn.oid = rc.relnamespace
    where fk.contype = 'f'
      and (fk.conrelid = table_record.table_oid or fk.confrelid = table_record.table_oid);

    existing_metadata := '{}'::jsonb;
    if table_record.old_comment is not null then
      begin
        existing_metadata := table_record.old_comment::jsonb;
        if jsonb_typeof(existing_metadata) <> 'object' then existing_metadata := '{}'::jsonb; end if;
      exception when invalid_text_representation then
        existing_metadata := '{}'::jsonb;
      end;
    end if;
    execute format('comment on table public.%I is %L',
      table_record.table_name,
      (existing_metadata || jsonb_build_object(
        'title', table_metadata -> table_record.table_name ->> 0,
        'description', table_metadata -> table_record.table_name ->> 1,
        'relation', relations
      ))::text
    );
  end loop;
end;
$wms_table_comments$;
-- 精简后不允许出现旧表引用的页面或资源。
do $verify$
begin
 if (select count(*) from pg_tables where schemaname='public' and left(tablename,4)='wms_') <> 6 then raise exception 'Expected six WMS tables'; end if;
 if exists(select 1 from public.lowcode_pages p where left(p.code,4)='wms-' and to_regclass('public.'||p.table_name) is null) then raise exception 'Dangling WMS page table'; end if;
 if exists(select 1 from public.service_resource_metadata m where left(m.resource_name,4)='wms_' and to_regclass('public.'||m.table_name) is null) then raise exception 'Dangling WMS resource table'; end if;
end;
$verify$;
select pg_notify('pgrst','reload schema');
commit;

