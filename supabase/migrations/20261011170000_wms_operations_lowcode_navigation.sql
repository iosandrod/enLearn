-- WMS 出入库管理导航及低代码列表页。
-- 仅登记菜单、权限、资源元数据和低代码页面，不创建业务表、不写入业务数据。
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

insert into public.admin_permissions
  (code, name, description, resource_type, resource_key, action_code, status, sort_order)
values
  ('wms.view', '查看出入库管理', '查看 WMS 入库、出库、调拨、盘点和调整单据。', 'action', 'wms', 'view', 'active', 230),
  ('wms.manage', '维护出入库管理', '维护 WMS 出入库单据及库存业务。', 'action', 'wms', 'manage', 'active', 231)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  resource_key = excluded.resource_key,
  action_code = excluded.action_code,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

-- BaseService 通过 service_resource_metadata 解析账套字段和列表权限。
do $wms_resources$
declare
  resource record;
  fields jsonb;
  config jsonb;
begin
  for resource in
    select * from (values
      ('wms_receipt', 'wms_receipt', array['receipt_no','receipt_type','warehouse_id','partner_id','status','expected_at','received_at','source_type','source_id','remark','metadata']),
      ('wms_receipt_line', 'wms_receipt_line', array['receipt_id','line_no','item_id','expected_qty','received_qty','rejected_qty','uom_id','lot_no','target_location_id','status','metadata']),
      ('wms_shipment', 'wms_shipment', array['shipment_no','shipment_type','warehouse_id','customer_id','status','required_at','shipped_at','carrier_name','tracking_no','source_type','source_id','remark','metadata']),
      ('wms_shipment_line', 'wms_shipment_line', array['shipment_id','line_no','item_id','ordered_qty','allocated_qty','picked_qty','shipped_qty','uom_id','lot_no','status','metadata']),
      ('wms_transfer_order', 'wms_transfer_order', array['transfer_no','source_warehouse_id','target_warehouse_id','status','requested_at','shipped_at','received_at','remark']),
      ('wms_transfer_order_line', 'wms_transfer_order_line', array['transfer_id','line_no','item_id','requested_qty','shipped_qty','received_qty','source_location_id','target_location_id','status']),
      ('wms_count', 'wms_count', array['count_no','warehouse_id','count_type','status','scheduled_at','posted_at']),
      ('wms_count_line', 'wms_count_line', array['count_id','line_no','item_id','location_id','lot_id','lpn_id','system_qty','counted_qty','variance_qty','status']),
      ('wms_adjustment', 'wms_adjustment', array['adjustment_no','warehouse_id','status','reason','posted_at']),
      ('wms_adjustment_line', 'wms_adjustment_line', array['adjustment_id','line_no','item_id','location_id','lot_id','serial_id','lpn_id','quantity_delta','reason'])
    ) as r(resource_name, table_name, allowed_fields)
  loop
    select jsonb_agg(to_jsonb(value)) into fields from unnest(resource.allowed_fields) as value;
    config := jsonb_build_object(
      'tableName', resource.table_name,
      'primaryKey', 'id',
      'accountField', 'account_id',
      'permissions', jsonb_build_object(
        'list', jsonb_build_array('wms.view', 'wms.manage'),
        'create', 'wms.manage', 'update', 'wms.manage', 'delete', 'wms.manage'
      ),
      'list', jsonb_build_object('defaultPageSize', 1000, 'maxPageSize', 1000),
      'create', jsonb_build_object('allowedFields', fields, 'userFields', jsonb_build_object('createdBy','created_by','updatedBy','updated_by')),
      'update', jsonb_build_object('allowedFields', fields, 'userFields', jsonb_build_object('updatedBy','updated_by')),
      'delete', jsonb_build_object('timestamp', false)
    );
    insert into public.service_resource_metadata
      (service_name, resource_name, table_name, version, config, enabled)
    values ('admin', resource.resource_name, resource.table_name, 1, config, true)
    on conflict (service_name, resource_name) do update set
      table_name = excluded.table_name,
      version = public.service_resource_metadata.version + 1,
      config = excluded.config,
      enabled = true,
      updated_at = timezone('utc'::text, now());
  end loop;
end;
$wms_resources$;

-- Upsert 一个与销售订单列表页同类的只读列表页，并展示选中单据的明细。
create or replace function pg_temp.wms_upsert_list_page(
  p_code text,
  p_route text,
  p_title text,
  p_description text,
  p_table text,
  p_source_key text,
  p_detail_table text,
  p_detail_source_key text,
  p_detail_fk text,
  p_sort_field text,
  p_columns jsonb,
  p_detail_columns jsonb
) returns void language plpgsql as $function$
declare
  v_schema jsonb;
  v_page public.lowcode_pages%rowtype;
begin
  v_schema := jsonb_build_object(
    'schemaVersion', 1,
    'code', p_code,
    'route', p_route,
    'title', p_title,
    'pageType', 'list',
    'description', p_description,
    'layout', 'dashboard',
    'status', 'published',
    'keepAlive', true,
    'dataSources', jsonb_build_object(
      p_source_key, jsonb_build_object(
        'key', p_source_key, 'label', p_title, 'sourceType', 'table',
        'serviceName', 'admin', 'serviceMethod', 'listItems', 'tableName', p_table,
        'autoLoad', true,
        'postData', jsonb_build_object(
          'limit', 1000,
          'sorts', jsonb_build_array(jsonb_build_object('field', p_sort_field, 'direction', 'desc')),
          'tableName', p_table
        )
      ),
      p_detail_source_key, jsonb_build_object(
        'key', p_detail_source_key, 'label', p_title || '明细', 'sourceType', 'table',
        'serviceName', 'admin', 'serviceMethod', 'listItems', 'tableName', p_detail_table,
        'autoLoad', false,
        'postData', jsonb_build_object(
          'limit', 1000,
          'sorts', jsonb_build_array(jsonb_build_object('field', 'line_no', 'direction', 'asc')),
          'filters', jsonb_build_object(p_detail_fk, '{{ data.' || p_source_key || 'Selected.id }}'),
          'requiredFilters', jsonb_build_array(p_detail_fk),
          'tableName', p_detail_table
        )
      )
    ),
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'id', p_source_key || '-actions', 'kind', 'buttonGroup', 'title', p_title || '操作',
        'align', 'left', 'gap', 8,
        'actions', jsonb_build_array(
          jsonb_build_object(
            'code', 'show-all', 'label', '全部', 'status', 'primary', 'icon', 'ri-list-check-2',
            'directives', jsonb_build_array(jsonb_build_object(
              'type', 'setSearchFilters', 'sourceKey', p_source_key, 'mode', 'replace', 'values', '{}'::jsonb
            ))
          ),
          jsonb_build_object(
            'code', 'show-draft', 'label', '草稿', 'icon', 'ri-draft-line',
            'directives', jsonb_build_array(jsonb_build_object(
              'type', 'setSearchFilters', 'sourceKey', p_source_key, 'mode', 'replace',
              'values', jsonb_build_object('status', 'draft')
            ))
          ),
          jsonb_build_object(
            'code', 'refresh', 'label', '刷新', 'icon', 'ri-refresh-line',
            'directives', jsonb_build_array(jsonb_build_object(
              'type', 'refreshDataSource', 'sourceKeys', jsonb_build_array(p_source_key)
            ))
          )
        )
      ),
      jsonb_build_object(
        'id', p_source_key || '-grid', 'kind', 'grid', 'tableType', 'main',
        'title', p_title, 'sourceKey', p_source_key,
        'schema', jsonb_build_object(
          'title', p_title, 'events', jsonb_build_object(
            'rowCurrentChange', jsonb_build_array(
              jsonb_build_object('type', 'setDataSource', 'sourceKey', p_source_key || 'Selected', 'value', '{{ event.row }}'),
              jsonb_build_object(
                'type', 'setSearchFilters', 'sourceKey', p_detail_source_key, 'mode', 'replace',
                'values', jsonb_build_object(p_detail_fk, '{{ event.row.id }}')
              )
            )
          ),
          'grid', jsonb_build_object(
            'border', true, 'stripe', true, 'showOverflow', true, 'height', 420,
            'rowConfig', jsonb_build_object('keyField', 'id', 'isCurrent', true),
            'columns', p_columns
          ),
          'rowActions', jsonb_build_object('edit', false, 'delete', false, 'actions', jsonb_build_array())
        )
      ),
      jsonb_build_object(
        'id', p_source_key || '-child-tabs', 'kind', 'tabs', 'title', '明细',
        'layout', jsonb_build_object('fillRemaining', true), 'defaultKey', 'lines',
        'tabs', jsonb_build_array(jsonb_build_object(
          'key', 'lines', 'label', p_title || '明细',
          'blocks', jsonb_build_array(jsonb_build_object(
            'id', p_detail_source_key || '-grid', 'kind', 'grid', 'tableType', 'detail',
            'title', p_title || '明细', 'sourceKey', p_detail_source_key,
            'schema', jsonb_build_object(
              'grid', jsonb_build_object(
                'border', true, 'stripe', true, 'showOverflow', true, 'height', 240,
                'rowConfig', jsonb_build_object('keyField', 'id', 'isCurrent', true),
                'columns', p_detail_columns
              ),
              'rowActions', jsonb_build_object('edit', false, 'delete', false, 'actions', jsonb_build_array()),
              'detailConfig', jsonb_build_object('enabled', false, 'foreignKey', p_detail_fk)
            )
          ))
        ))
      )
    ),
    'config', jsonb_build_object('bgColor', '', 'bgImage', '', 'keepAlive', false),
    'overlays', jsonb_build_array()
  );

  insert into public.lowcode_pages
    (code, route, title, description, page_type, layout, status, keep_alive, table_name,
     schema, version, published_at, updated_at)
  values
    (p_code, p_route, p_title, p_description, 'list', 'dashboard', 'published', true, p_table,
     v_schema, 1, timezone('utc'::text, now()), timezone('utc'::text, now()))
  on conflict (code) do update set
    route = excluded.route, title = excluded.title, description = excluded.description,
    page_type = excluded.page_type, layout = excluded.layout, status = excluded.status,
    keep_alive = excluded.keep_alive, table_name = excluded.table_name, schema = excluded.schema,
    version = public.lowcode_pages.version + 1,
    published_at = excluded.published_at, updated_at = timezone('utc'::text, now())
  returning * into v_page;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at, created_at)
  values (v_page.id, v_page.version, v_page.schema, timezone('utc'::text, now()), timezone('utc'::text, now()))
  on conflict (page_id, version) do update set schema = excluded.schema, published_at = excluded.published_at;
end;
$function$;

select pg_temp.wms_upsert_list_page(
  'wms-receipts', '/dashboard/wms/receipts', '入库单', '入库单及入库明细列表。',
  'wms_receipt', 'wmsReceiptRows', 'wms_receipt_line', 'wmsReceiptLineRows', 'receipt_id', 'updated_at',
  '[{"field":"receipt_no","title":"入库单号","align":"left","width":170},{"field":"receipt_type","title":"入库类型","align":"center","width":110},{"field":"status","title":"状态","align":"center","width":100},{"field":"warehouse_id","title":"仓库","align":"left","width":230},{"field":"partner_id","title":"供应商/伙伴","align":"left","width":230},{"field":"expected_at","title":"预计到货","align":"center","width":180},{"field":"received_at","title":"实际收货","align":"center","width":180},{"field":"source_type","title":"来源类型","align":"left","width":140},{"field":"source_id","title":"来源ID","align":"left","width":230},{"field":"remark","title":"备注","align":"left","minWidth":200}]'::jsonb,
  '[{"field":"line_no","title":"行号","align":"right","width":80},{"field":"item_id","title":"物料","align":"left","width":230},{"field":"expected_qty","title":"预计数量","align":"right","width":120},{"field":"received_qty","title":"已收数量","align":"right","width":120},{"field":"rejected_qty","title":"拒收数量","align":"right","width":120},{"field":"uom_id","title":"单位","align":"left","width":180},{"field":"lot_no","title":"批次号","align":"left","width":140},{"field":"target_location_id","title":"目标库位","align":"left","width":230},{"field":"status","title":"状态","align":"center","width":100}]'::jsonb
);
select pg_temp.wms_upsert_list_page(
  'wms-shipments', '/dashboard/wms/shipments', '出库单', '出库单及出库明细列表。',
  'wms_shipment', 'wmsShipmentRows', 'wms_shipment_line', 'wmsShipmentLineRows', 'shipment_id', 'updated_at',
  '[{"field":"shipment_no","title":"出库单号","align":"left","width":170},{"field":"shipment_type","title":"出库类型","align":"center","width":110},{"field":"status","title":"状态","align":"center","width":100},{"field":"warehouse_id","title":"仓库","align":"left","width":230},{"field":"customer_id","title":"客户","align":"left","width":230},{"field":"required_at","title":"要求发货","align":"center","width":180},{"field":"shipped_at","title":"实际发货","align":"center","width":180},{"field":"carrier_name","title":"承运商","align":"left","width":150},{"field":"tracking_no","title":"运单号","align":"left","width":160},{"field":"source_type","title":"来源类型","align":"left","width":140},{"field":"source_id","title":"来源ID","align":"left","width":230}]'::jsonb,
  '[{"field":"line_no","title":"行号","align":"right","width":80},{"field":"item_id","title":"物料","align":"left","width":230},{"field":"ordered_qty","title":"订购数量","align":"right","width":120},{"field":"allocated_qty","title":"分配数量","align":"right","width":120},{"field":"picked_qty","title":"拣货数量","align":"right","width":120},{"field":"shipped_qty","title":"发货数量","align":"right","width":120},{"field":"uom_id","title":"单位","align":"left","width":180},{"field":"lot_no","title":"批次号","align":"left","width":140},{"field":"status","title":"状态","align":"center","width":100}]'::jsonb
);
select pg_temp.wms_upsert_list_page(
  'wms-transfers', '/dashboard/wms/transfers', '调拨单', '仓库调拨单及调拨明细列表。',
  'wms_transfer_order', 'wmsTransferRows', 'wms_transfer_order_line', 'wmsTransferLineRows', 'transfer_id', 'updated_at',
  '[{"field":"transfer_no","title":"调拨单号","align":"left","width":170},{"field":"source_warehouse_id","title":"调出仓库","align":"left","width":230},{"field":"target_warehouse_id","title":"调入仓库","align":"left","width":230},{"field":"status","title":"状态","align":"center","width":110},{"field":"requested_at","title":"申请时间","align":"center","width":180},{"field":"shipped_at","title":"发出时间","align":"center","width":180},{"field":"received_at","title":"接收时间","align":"center","width":180},{"field":"remark","title":"备注","align":"left","minWidth":200}]'::jsonb,
  '[{"field":"line_no","title":"行号","align":"right","width":80},{"field":"item_id","title":"物料","align":"left","width":230},{"field":"requested_qty","title":"申请数量","align":"right","width":120},{"field":"shipped_qty","title":"发出数量","align":"right","width":120},{"field":"received_qty","title":"接收数量","align":"right","width":120},{"field":"source_location_id","title":"调出库位","align":"left","width":230},{"field":"target_location_id","title":"调入库位","align":"left","width":230},{"field":"status","title":"状态","align":"center","width":100}]'::jsonb
);
select pg_temp.wms_upsert_list_page(
  'wms-counts', '/dashboard/wms/counts', '盘点单', '库存盘点单及盘点明细列表。',
  'wms_count', 'wmsCountRows', 'wms_count_line', 'wmsCountLineRows', 'count_id', 'posted_at',
  '[{"field":"count_no","title":"盘点单号","align":"left","width":170},{"field":"warehouse_id","title":"仓库","align":"left","width":230},{"field":"count_type","title":"盘点类型","align":"center","width":110},{"field":"status","title":"状态","align":"center","width":110},{"field":"scheduled_at","title":"计划时间","align":"center","width":180},{"field":"posted_at","title":"过账时间","align":"center","width":180}]'::jsonb,
  '[{"field":"line_no","title":"行号","align":"right","width":80},{"field":"item_id","title":"物料","align":"left","width":230},{"field":"location_id","title":"库位","align":"left","width":230},{"field":"lot_id","title":"批次","align":"left","width":230},{"field":"system_qty","title":"系统数量","align":"right","width":120},{"field":"counted_qty","title":"盘点数量","align":"right","width":120},{"field":"variance_qty","title":"差异数量","align":"right","width":120},{"field":"status","title":"状态","align":"center","width":100}]'::jsonb
);
select pg_temp.wms_upsert_list_page(
  'wms-adjustments', '/dashboard/wms/adjustments', '库存调整单', '库存调整单及调整明细列表。',
  'wms_adjustment', 'wmsAdjustmentRows', 'wms_adjustment_line', 'wmsAdjustmentLineRows', 'adjustment_id', 'posted_at',
  '[{"field":"adjustment_no","title":"调整单号","align":"left","width":170},{"field":"warehouse_id","title":"仓库","align":"left","width":230},{"field":"status","title":"状态","align":"center","width":110},{"field":"reason","title":"调整原因","align":"left","minWidth":220},{"field":"posted_at","title":"过账时间","align":"center","width":180}]'::jsonb,
  '[{"field":"line_no","title":"行号","align":"right","width":80},{"field":"item_id","title":"物料","align":"left","width":230},{"field":"location_id","title":"库位","align":"left","width":230},{"field":"lot_id","title":"批次","align":"left","width":230},{"field":"serial_id","title":"序列号","align":"left","width":230},{"field":"lpn_id","title":"容器","align":"left","width":230},{"field":"quantity_delta","title":"调整数量","align":"right","width":130},{"field":"reason","title":"调整原因","align":"left","minWidth":220}]'::jsonb
);

-- 统一注册实体元数据，供低代码列表页的数据源和权限校验使用。
insert into public.admin_entities
  (code, title, table_name, route_path, page_code, icon, description, primary_key, status, sort_order, schema)
values
  ('wms_receipt', '入库单', 'public.wms_receipt', '/dashboard/wms/receipts', 'wms-receipts', 'ri-inbox-download-line', '入库单及入库明细。', 'id', 'active', 230, '{"service":"admin","accountScoped":true}'::jsonb),
  ('wms_shipment', '出库单', 'public.wms_shipment', '/dashboard/wms/shipments', 'wms-shipments', 'ri-inbox-upload-line', '出库单及出库明细。', 'id', 'active', 231, '{"service":"admin","accountScoped":true}'::jsonb),
  ('wms_transfer_order', '调拨单', 'public.wms_transfer_order', '/dashboard/wms/transfers', 'wms-transfers', 'ri-arrow-left-right-line', '仓库调拨单及调拨明细。', 'id', 'active', 232, '{"service":"admin","accountScoped":true}'::jsonb),
  ('wms_count', '盘点单', 'public.wms_count', '/dashboard/wms/counts', 'wms-counts', 'ri-file-list-3-line', '库存盘点单及盘点明细。', 'id', 'active', 233, '{"service":"admin","accountScoped":true}'::jsonb),
  ('wms_adjustment', '库存调整单', 'public.wms_adjustment', '/dashboard/wms/adjustments', 'wms-adjustments', 'ri-edit-2-line', '库存调整单及调整明细。', 'id', 'active', 234, '{"service":"admin","accountScoped":true}'::jsonb)
on conflict (code) do update set
  title = excluded.title, table_name = excluded.table_name, route_path = excluded.route_path,
  page_code = excluded.page_code, icon = excluded.icon, description = excluded.description,
  primary_key = excluded.primary_key, status = excluded.status, sort_order = excluded.sort_order,
  schema = excluded.schema, updated_at = timezone('utc'::text, now());

-- 左侧导航：一个模块，五个核心库存业务列表。
insert into public.admin_routes
  (code, title, path, route_type, icon, page_code, permission_code, visible, keep_alive, layout, status, sort_order, metadata)
values
  ('wms-root', '出入库管理', '/dashboard/wms/_group', 'group', 'ri-inbox-archive-line', null, 'wms.view', true, true, 'dashboard', 'active', 45, '{"module":"wms","navigation":"sidebar","category":"wms"}'::jsonb)
on conflict (code) do update set
  title = excluded.title, path = excluded.path, route_type = excluded.route_type, icon = excluded.icon,
  permission_code = excluded.permission_code, visible = excluded.visible, keep_alive = excluded.keep_alive,
  layout = excluded.layout, status = excluded.status, sort_order = excluded.sort_order, metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

insert into public.admin_routes
  (code, title, path, parent_id, route_type, icon, page_code, permission_code, visible, keep_alive, layout, status, sort_order, metadata)
select route.code, route.title, route.path, root.id, 'page', route.icon, route.page_code, 'wms.view',
  true, true, 'dashboard', 'active', route.sort_order, jsonb_build_object('module','wms','group','出入库管理','tableName',route.table_name)
from (values
  ('wms-receipts','入库单','/dashboard/wms/receipts','ri-inbox-download-line','wms-receipts','wms_receipt',10),
  ('wms-shipments','出库单','/dashboard/wms/shipments','ri-inbox-upload-line','wms-shipments','wms_shipment',20),
  ('wms-transfers','调拨单','/dashboard/wms/transfers','ri-arrow-left-right-line','wms-transfers','wms_transfer_order',30),
  ('wms-counts','盘点单','/dashboard/wms/counts','ri-file-list-3-line','wms-counts','wms_count',40),
  ('wms-adjustments','库存调整单','/dashboard/wms/adjustments','ri-edit-2-line','wms-adjustments','wms_adjustment',50)
) as route(code,title,path,icon,page_code,table_name,sort_order)
cross join public.admin_routes root
where root.code = 'wms-root'
on conflict (code) do update set
  title = excluded.title, path = excluded.path, parent_id = excluded.parent_id, route_type = excluded.route_type,
  icon = excluded.icon, page_code = excluded.page_code, permission_code = excluded.permission_code,
  visible = excluded.visible, keep_alive = excluded.keep_alive, layout = excluded.layout, status = excluded.status,
  sort_order = excluded.sort_order, metadata = excluded.metadata, updated_at = timezone('utc'::text, now());

select pg_notify('pgrst', 'reload schema');
commit;
