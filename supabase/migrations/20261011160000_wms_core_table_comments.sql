begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

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

select pg_notify('pgrst', 'reload schema');
commit;

