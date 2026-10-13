-- 补齐 public 普通表和分区表缺失的 JSON 表注释；已有注释保持原样。
-- title/description 为业务用途，relation 仅来自实际外键，不将逻辑标识误作外键。
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $public_table_comments$
declare
  table_metadata jsonb := '{
  "documents": [
    "文档向量索引",
    "保存文档内容、扩展元数据和向量嵌入，用于文档检索。"
  ],
  "n8n_chat_histories": [
    "n8n 聊天历史",
    "按会话标识保存聊天消息，供 n8n 会话历史读取与追踪。"
  ],
  "notebooks": [
    "笔记本",
    "管理用户的笔记本名称、说明、展示属性、生成状态、音频概览及示例问题。"
  ],
  "notes": [
    "笔记",
    "保存笔记本内的笔记标题、内容、来源类型及提取文本。"
  ],
  "print_expressions": [
    "打印表达式",
    "维护打印表达式源码、用途、模板关联、启用状态、所属用户和访问等级。"
  ],
  "profiles": [
    "用户资料",
    "保存用户邮箱、姓名、头像及资料维护时间，关联认证用户。"
  ],
  "sources": [
    "笔记本资料来源",
    "记录笔记本引用的文件或链接、内容、摘要、处理状态和扩展元数据。"
  ],
  "wf_task_registry": [
    "工作流任务注册表",
    "登记前端命令、后端命令和存储过程任务，保存执行源码、输入输出结构、配置、版本及超时时间。"
  ],
  "wms_adjustment": [
    "库存调整单",
    "记录仓库库存调整单号、状态、调整原因及过账时间。"
  ],
  "wms_adjustment_line": [
    "库存调整明细",
    "记录调整单中各物料、库位、批次、序列号和容器的数量差额及原因。"
  ],
  "wms_count": [
    "库存盘点单",
    "记录仓库盘点单号、盘点类型、业务状态、计划时间及过账时间。"
  ],
  "wms_count_line": [
    "库存盘点明细",
    "记录盘点单中各物料和库存维度的系统数量、实盘数量、差异及状态。"
  ],
  "wms_integration_message": [
    "仓储接口消息",
    "记录仓储接口消息标识、方向、类型、载荷、处理状态、重试次数及错误信息。"
  ],
  "wms_inventory_hold": [
    "库存冻结记录",
    "记录库存余额的冻结数量、原因、状态和解除信息。"
  ],
  "wms_inventory_reservation": [
    "库存预留记录",
    "记录库存余额针对来源业务的预留数量、状态及到期时间。"
  ],
  "wms_item": [
    "仓储物料档案",
    "维护仓储物料编码、名称、类型、基本单位、追踪方式、批次规则、保质期及计划物料标识。"
  ],
  "wms_item_barcode": [
    "仓储物料条码",
    "维护物料及其单位对应的条码、条码类型和状态。"
  ],
  "wms_item_uom": [
    "仓储物料单位",
    "维护物料的计量单位、单位换算率、默认单位标识及条码。"
  ],
  "wms_lot": [
    "仓储批次档案",
    "记录物料批次号、生产日期、到期日期、供应商、状态及扩展属性。"
  ],
  "wms_lpn": [
    "仓储容器档案",
    "管理托盘或容器编号、类型、状态、当前库位、父容器及重量和体积。"
  ],
  "wms_pack": [
    "仓储装箱单",
    "记录出库单对应的装箱编号、容器、状态、重量、体积及封箱时间。"
  ],
  "wms_pack_line": [
    "仓储装箱明细",
    "记录装箱单中出库明细对应的物料、数量、批次及序列号。"
  ],
  "wms_partner": [
    "仓储业务伙伴",
    "维护仓储业务伙伴编码、名称、类型、状态及联系信息。"
  ],
  "wms_print_binding": [
    "仓储打印绑定",
    "配置仓储单据类型及事件对应的打印模板、打印机、份数和启用状态。"
  ],
  "wms_print_job": [
    "仓储打印任务",
    "记录仓储单据打印任务、模板和打印机标识、份数、申请人、状态及错误信息。"
  ],
  "wms_print_job_item": [
    "仓储打印任务明细",
    "保存打印任务内各打印项的序号、载荷、状态和错误信息。"
  ],
  "wms_receipt": [
    "仓储入库单",
    "记录仓储入库单号、类型、仓库、业务伙伴、收货状态、预计与实际收货时间及业务来源。"
  ],
  "wms_receipt_line": [
    "仓储入库明细",
    "记录入库单物料的预计、已收和拒收数量，以及单位、批次、目标库位和状态。"
  ],
  "wms_serial": [
    "仓储序列号档案",
    "记录物料序列号、所属批次、状态及收货和发货时间。"
  ],
  "wms_shipment": [
    "仓储出库单",
    "记录仓储出库单号、类型、仓库、客户、发货状态、承运商、运单及业务来源。"
  ],
  "wms_shipment_line": [
    "仓储出库明细",
    "记录出库单物料的订购、分配、拣货和发货数量，以及单位、批次和状态。"
  ],
  "wms_task": [
    "仓储作业任务",
    "记录仓储作业任务编号、类型、仓库、状态、优先级、指派人及开始和完成时间。"
  ],
  "wms_task_line": [
    "仓储作业明细",
    "记录仓储作业任务中物料、来源与目标库位、批次、容器、要求数量及完成数量。"
  ],
  "wms_transfer_order": [
    "仓储调拨单",
    "记录仓库间调拨单号、调出与调入仓库、状态及申请、发出和接收时间。"
  ],
  "wms_transfer_order_line": [
    "仓储调拨明细",
    "记录调拨单物料的申请、发出与接收数量，以及来源和目标库位。"
  ],
  "wms_uom": [
    "仓储计量单位",
    "维护仓储计量单位编码、名称、数量精度及状态。"
  ],
  "wms_wave": [
    "仓储波次",
    "记录仓库波次编号、业务状态、计划、释放和完成时间及作业策略。"
  ],
  "wms_wave_line": [
    "仓储波次明细",
    "记录波次包含的出库单、处理优先级及状态。"
  ],
  "wms_zone": [
    "仓储库区",
    "维护仓库内的库区编码、名称、类型、状态、排序及扩展信息。"
  ]
}'::jsonb;
  table_record record;
  relations jsonb;
begin
  for table_record in
    select c.oid as table_oid, c.relname as table_name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and nullif(btrim(obj_description(c.oid, 'pg_class')), '') is null
    order by c.relname
  loop
    if not (table_metadata ? table_record.table_name::text) then
      raise exception 'Missing business description for public.%', table_record.table_name;
    end if;
    -- 与表结构变更互斥；取得锁后重新检查，避免覆盖并发补充的注释。
    execute format('lock table public.%I in share update exclusive mode', table_record.table_name);
    if nullif(btrim(obj_description(table_record.table_oid, 'pg_class')), '') is not null then
      continue;
    end if;

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

    execute format('comment on table public.%I is %L', table_record.table_name,
      jsonb_build_object(
        'title', table_metadata -> table_record.table_name ->> 0,
        'description', table_metadata -> table_record.table_name ->> 1,
        'relation', relations
      )::text);
  end loop;
end;
$public_table_comments$;

select pg_notify('pgrst', 'reload schema');
commit;

