begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

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

select pg_notify('pgrst', 'reload schema');
commit;

