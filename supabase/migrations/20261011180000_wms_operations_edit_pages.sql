-- WMS 出入库管理编辑页。
-- 仅登记低代码页面及页面关联，不创建业务表、不写入业务单据。
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- 盘点表和五张明细表没有审计列，保存配置必须与实际表结构一致。
-- 明细事务由后端继承 account_id；实际账套值仍由服务端注入。
do $wms_save_metadata$
declare
  item record;
  action_name text;
  audit_mapping record;
  next_config jsonb;
begin
  for item in
    select * from public.service_resource_metadata
    where service_name='admin' and resource_name in (
      'wms_receipt','wms_receipt_line','wms_shipment','wms_shipment_line',
      'wms_transfer_order','wms_transfer_order_line','wms_count','wms_count_line',
      'wms_adjustment','wms_adjustment_line'
    )
  loop
    next_config := item.config;
    foreach action_name in array array['create','update'] loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name=item.table_name and column_name='updated_at'
      ) then
        next_config := jsonb_set(next_config,array[action_name,'timestamp'],'false'::jsonb);
      end if;
      for audit_mapping in select * from jsonb_each_text(coalesce(next_config->action_name->'userFields','{}'::jsonb)) loop
        if not exists (
          select 1 from information_schema.columns
          where table_schema='public' and table_name=item.table_name and column_name=audit_mapping.value
        ) then
          next_config := next_config #- array[action_name,'userFields',audit_mapping.key];
        end if;
      end loop;
      if item.resource_name like '%_line' and not coalesce(next_config->action_name->'allowedFields','[]'::jsonb) @> '["account_id"]'::jsonb then
        next_config := jsonb_set(next_config,array[action_name,'allowedFields'],
          coalesce(next_config->action_name->'allowedFields','[]'::jsonb) || '["account_id"]'::jsonb);
      end if;
    end loop;
    if next_config is distinct from item.config then
      update public.service_resource_metadata set config=next_config,version=version+1,
        updated_at=timezone('utc'::text,now()) where id=item.id;
    end if;
  end loop;
end;
$wms_save_metadata$;

-- 生成列只能展示，不能进入 generic CRUD 的 INSERT/UPDATE 字段集合。
do $wms_generated_columns$
declare
  item record;
  action_name text;
  generated_field text;
  next_config jsonb;
begin
  for item in
    select m.id,m.config,m.table_name
    from public.service_resource_metadata m
    where m.service_name='admin' and m.resource_name in (
      'wms_receipt','wms_receipt_line','wms_shipment','wms_shipment_line',
      'wms_transfer_order','wms_transfer_order_line','wms_count','wms_count_line',
      'wms_adjustment','wms_adjustment_line'
    )
  loop
    next_config := item.config;
    for generated_field in
      select c.column_name
      from information_schema.columns c
      where c.table_schema='public' and c.table_name=item.table_name and c.is_generated='ALWAYS'
    loop
      foreach action_name in array array['create','update'] loop
        next_config := jsonb_set(
          next_config,
          array[action_name,'allowedFields'],
          coalesce(next_config->action_name->'allowedFields','[]'::jsonb) - generated_field,
          true
        );
      end loop;
    end loop;
    if next_config is distinct from item.config then
      update public.service_resource_metadata set config=next_config,version=version+1,
        updated_at=timezone('utc'::text,now()) where id=item.id;
    end if;
  end loop;
end;
$wms_generated_columns$;

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
          jsonb_build_object('code','modify','type','button','label','修改','prefixIcon','ri-edit-2-line','eventName','buttonGroup.modify','script',pg_temp.wms_call_script('modify'),'permissionCode','wms.manage'),
          jsonb_build_object('code','save','type','button','label','保存','status','primary','prefixIcon','ri-save-line','eventName','buttonGroup.save','script',pg_temp.wms_call_script('save'),'permissionCode','wms.manage'),
          jsonb_build_object('code','addDetail','type','button','label','添加明细','prefixIcon','ri-add-line','script',pg_temp.wms_add_script(v_grid_id,p_detail_new_row),'permissionCode','wms.manage'),
          jsonb_build_object('code','deleteDetail','type','button','label','删除明细','status','danger','prefixIcon','ri-delete-bin-line','script',pg_temp.wms_delete_script(v_grid_id),'permissionCode','wms.manage'),
          jsonb_build_object('code','create','type','button','label','新增','status','primary','prefixIcon','ri-add-line','eventName','buttonGroup.create','script',pg_temp.wms_call_script('create'),'permissionCode','wms.manage'),
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

do $wms_pages$
declare
  v_edit_id uuid;
  v_relation jsonb;
begin
  v_relation := pg_temp.wms_relation('wms_warehouse','wms_warehouse','["code","name"]'::jsonb);
  v_relation := jsonb_set(v_relation,'{fieldMappings,0,targetField}','"warehouse_id"'::jsonb);
  v_edit_id := pg_temp.wms_upsert_edit_page(
    'wms-receipts-edit','/dashboard/wms/receipts/edit','入库单','维护入库单及入库明细。','wms_receipt','wmsReceiptEditForm','wms_receipt_line','wmsReceiptLines','receipt_id',
    jsonb_build_array(
      pg_temp.wms_field('receipt_no','入库单号','vxe-input','{"clearable":true,"placeholder":"请输入入库单号"}', '[]'::jsonb,true,1),
      pg_temp.wms_field('receipt_type','入库类型','vxe-select','{"clearable":false,"placeholder":"请选择入库类型"}', '[{"label":"采购","value":"purchase"},{"label":"退货","value":"return"},{"label":"调拨","value":"transfer"},{"label":"生产","value":"production"},{"label":"其他","value":"other"}]'::jsonb,true,1),
      pg_temp.wms_field('status','状态','vxe-select','{"clearable":false}', '[{"label":"草稿","value":"draft"},{"label":"待到货","value":"expected"},{"label":"收货中","value":"receiving"},{"label":"已收货","value":"received"},{"label":"已关闭","value":"closed"},{"label":"已取消","value":"cancelled"}]'::jsonb,true,1),
      pg_temp.wms_field('warehouse_id','仓库','base-info',jsonb_build_object('clearable',true,'relateInfoConfig',v_relation),'[]'::jsonb,true,1),
      pg_temp.wms_field('partner_id','供应商/伙伴','base-info',jsonb_build_object('clearable',true,'relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_partner','wms_partner','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"partner_id"'::jsonb)),'[]'::jsonb,false,1),
      pg_temp.wms_field('expected_at','预计到货','vxe-input','{"type":"datetime","clearable":true}', '[]'::jsonb,false,1),
      pg_temp.wms_field('received_at','实际收货','vxe-input','{"type":"datetime","clearable":true}', '[]'::jsonb,false,1),
      pg_temp.wms_field('source_type','来源类型','vxe-input','{"clearable":true}', '[]'::jsonb,false,1),
      pg_temp.wms_field('source_id','来源ID','vxe-input','{"clearable":true}', '[]'::jsonb,false,1),
      pg_temp.wms_field('remark','备注','vxe-textarea','{"autosize":{"minRows":2,"maxRows":4},"clearable":true}', '[]'::jsonb,false,3),
      pg_temp.wms_field('metadata','扩展信息','lc-json-editor','{}','[]'::jsonb,false,3)
    ),
    jsonb_build_array(
      pg_temp.wms_column('line_no','行号','VxeNumberInput','{"min":1,"digits":0}',80),
      pg_temp.wms_column('item_id','物料','VxeInput','{}',190,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_item','wms_item','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"item_id"'::jsonb)))),
      pg_temp.wms_column('expected_qty','预计数量','VxeNumberInput','{"min":0,"digits":6}',120),
      pg_temp.wms_column('received_qty','已收数量','VxeNumberInput','{"min":0,"digits":6}',120),
      pg_temp.wms_column('rejected_qty','拒收数量','VxeNumberInput','{"min":0,"digits":6}',120),
      pg_temp.wms_column('uom_id','单位','VxeInput','{}',130,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_uom','wms_uom','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"uom_id"'::jsonb)))),
      pg_temp.wms_column('lot_no','批次号','VxeInput','{"clearable":true}',140),
      pg_temp.wms_column('target_location_id','目标库位','VxeInput','{}',180,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_location','wms_location','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"target_location_id"'::jsonb)))),
      pg_temp.wms_column('status','状态','VxeSelect','{}',110,jsonb_build_object('component','vxe-select','options','[{"label":"打开","value":"open"},{"label":"收货中","value":"receiving"},{"label":"已收货","value":"received"},{"label":"已关闭","value":"closed"},{"label":"已取消","value":"cancelled"}]'::jsonb))
    ),
    '{"status":"draft","receipt_type":"purchase","metadata":{}}'::jsonb,
    '{"status":"open","metadata":{}}'::jsonb,
    '{"status":"open","expected_qty":0,"received_qty":0,"rejected_qty":0,"metadata":{}}'::jsonb
  );
  update public.lowcode_pages set edit_page_id=v_edit_id,updated_at=timezone('utc'::text,now()) where code='wms-receipts';

  v_relation := jsonb_set(pg_temp.wms_relation('wms_warehouse','wms_warehouse','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"warehouse_id"'::jsonb);
  v_edit_id := pg_temp.wms_upsert_edit_page(
    'wms-shipments-edit','/dashboard/wms/shipments/edit','出库单','维护出库单及出库明细。','wms_shipment','wmsShipmentEditForm','wms_shipment_line','wmsShipmentLines','shipment_id',
    jsonb_build_array(
      pg_temp.wms_field('shipment_no','出库单号','vxe-input','{"clearable":true,"placeholder":"请输入出库单号"}', '[]'::jsonb,true,1),
      pg_temp.wms_field('shipment_type','出库类型','vxe-select','{}','[{"label":"销售","value":"sales"},{"label":"退货","value":"return"},{"label":"调拨","value":"transfer"},{"label":"样品","value":"sample"},{"label":"其他","value":"other"}]'::jsonb,true,1),
      pg_temp.wms_field('status','状态','vxe-select','{}','[{"label":"草稿","value":"draft"},{"label":"已批准","value":"approved"},{"label":"已分配","value":"allocated"},{"label":"拣货中","value":"picking"},{"label":"已打包","value":"packed"},{"label":"已发货","value":"shipped"},{"label":"已关闭","value":"closed"},{"label":"已取消","value":"cancelled"}]'::jsonb,true,1),
      pg_temp.wms_field('warehouse_id','仓库','base-info',jsonb_build_object('relateInfoConfig',v_relation),'[]'::jsonb,true,1),
      pg_temp.wms_field('customer_id','客户','base-info',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_partner','wms_partner','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"customer_id"'::jsonb)),'[]'::jsonb,false,1),
      pg_temp.wms_field('required_at','要求发货','vxe-input','{"type":"datetime","clearable":true}','[]'::jsonb,false,1),
      pg_temp.wms_field('shipped_at','实际发货','vxe-input','{"type":"datetime","clearable":true}','[]'::jsonb,false,1),
      pg_temp.wms_field('carrier_name','承运商','vxe-input','{"clearable":true}','[]'::jsonb,false,1),
      pg_temp.wms_field('tracking_no','运单号','vxe-input','{"clearable":true}','[]'::jsonb,false,1),
      pg_temp.wms_field('source_type','来源类型','vxe-input','{"clearable":true}','[]'::jsonb,false,1),
      pg_temp.wms_field('source_id','来源ID','vxe-input','{"clearable":true}','[]'::jsonb,false,1),
      pg_temp.wms_field('remark','备注','vxe-textarea','{"autosize":{"minRows":2,"maxRows":4},"clearable":true}','[]'::jsonb,false,3),
      pg_temp.wms_field('metadata','扩展信息','lc-json-editor','{}','[]'::jsonb,false,3)
    ),
    jsonb_build_array(
      pg_temp.wms_column('line_no','行号','VxeNumberInput','{"min":1,"digits":0}',80),
      pg_temp.wms_column('item_id','物料','VxeInput','{}',190,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_item','wms_item','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"item_id"'::jsonb)))),
      pg_temp.wms_column('ordered_qty','订购数量','VxeNumberInput','{"min":0.000001,"digits":6}',120),
      pg_temp.wms_column('allocated_qty','分配数量','VxeNumberInput','{"min":0,"digits":6}',120),
      pg_temp.wms_column('picked_qty','拣货数量','VxeNumberInput','{"min":0,"digits":6}',120),
      pg_temp.wms_column('shipped_qty','发货数量','VxeNumberInput','{"min":0,"digits":6}',120),
      pg_temp.wms_column('uom_id','单位','VxeInput','{}',130,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_uom','wms_uom','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"uom_id"'::jsonb)))),
      pg_temp.wms_column('lot_no','批次号','VxeInput','{"clearable":true}',140),
      pg_temp.wms_column('status','状态','VxeSelect','{}',110,jsonb_build_object('component','vxe-select','options','[{"label":"打开","value":"open"},{"label":"已分配","value":"allocated"},{"label":"拣货中","value":"picking"},{"label":"已拣货","value":"picked"},{"label":"已发货","value":"shipped"},{"label":"已关闭","value":"closed"},{"label":"已取消","value":"cancelled"}]'::jsonb))
    ),
    '{"status":"draft","shipment_type":"sales","metadata":{}}'::jsonb,
    '{"status":"open","metadata":{}}'::jsonb,
    '{"status":"open","ordered_qty":1,"allocated_qty":0,"picked_qty":0,"shipped_qty":0,"metadata":{}}'::jsonb
  );
  update public.lowcode_pages set edit_page_id=v_edit_id,updated_at=timezone('utc'::text,now()) where code='wms-shipments';

  v_edit_id := pg_temp.wms_upsert_edit_page(
    'wms-transfers-edit','/dashboard/wms/transfers/edit','调拨单','维护仓库调拨单及调拨明细。','wms_transfer_order','wmsTransferEditForm','wms_transfer_order_line','wmsTransferLines','transfer_id',
    jsonb_build_array(
      pg_temp.wms_field('transfer_no','调拨单号','vxe-input','{"clearable":true,"placeholder":"请输入调拨单号"}','[]'::jsonb,true,1),
      pg_temp.wms_field('source_warehouse_id','调出仓库','base-info',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_warehouse','wms_warehouse','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"source_warehouse_id"'::jsonb)),'[]'::jsonb,true,1),
      pg_temp.wms_field('target_warehouse_id','调入仓库','base-info',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_warehouse','wms_warehouse','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"target_warehouse_id"'::jsonb)),'[]'::jsonb,true,1),
      pg_temp.wms_field('status','状态','vxe-select','{}','[{"label":"草稿","value":"draft"},{"label":"已批准","value":"approved"},{"label":"拣货中","value":"picking"},{"label":"运输中","value":"in_transit"},{"label":"已接收","value":"received"},{"label":"已关闭","value":"closed"},{"label":"已取消","value":"cancelled"}]'::jsonb,true,1),
      pg_temp.wms_field('requested_at','申请时间','vxe-input','{"type":"datetime","clearable":true}','[]'::jsonb,false,1),
      pg_temp.wms_field('shipped_at','发出时间','vxe-input','{"type":"datetime","clearable":true}','[]'::jsonb,false,1),
      pg_temp.wms_field('received_at','接收时间','vxe-input','{"type":"datetime","clearable":true}','[]'::jsonb,false,1),
      pg_temp.wms_field('remark','备注','vxe-textarea','{"autosize":{"minRows":2,"maxRows":4},"clearable":true}','[]'::jsonb,false,3)
    ),
    jsonb_build_array(
      pg_temp.wms_column('line_no','行号','VxeNumberInput','{"min":1,"digits":0}',80),
      pg_temp.wms_column('item_id','物料','VxeInput','{}',190,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_item','wms_item','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"item_id"'::jsonb)))),
      pg_temp.wms_column('requested_qty','申请数量','VxeNumberInput','{"min":0.000001,"digits":6}',120),
      pg_temp.wms_column('shipped_qty','发出数量','VxeNumberInput','{"min":0,"digits":6}',120),
      pg_temp.wms_column('received_qty','接收数量','VxeNumberInput','{"min":0,"digits":6}',120),
      pg_temp.wms_column('source_location_id','调出库位','VxeInput','{}',180,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_location','wms_location','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"source_location_id"'::jsonb)))),
      pg_temp.wms_column('target_location_id','调入库位','VxeInput','{}',180,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_location','wms_location','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"target_location_id"'::jsonb)))),
      pg_temp.wms_column('status','状态','VxeSelect','{}',110,jsonb_build_object('component','vxe-select','options','[{"label":"打开","value":"open"},{"label":"已拣货","value":"picked"},{"label":"运输中","value":"in_transit"},{"label":"已接收","value":"received"},{"label":"已关闭","value":"closed"},{"label":"已取消","value":"cancelled"}]'::jsonb))
    ),
    '{"status":"draft"}'::jsonb,
    '{"status":"open"}'::jsonb,
    '{"status":"open","requested_qty":1,"shipped_qty":0,"received_qty":0}'::jsonb
  );
  update public.lowcode_pages set edit_page_id=v_edit_id,updated_at=timezone('utc'::text,now()) where code='wms-transfers';

  v_edit_id := pg_temp.wms_upsert_edit_page(
    'wms-counts-edit','/dashboard/wms/counts/edit','盘点单','维护库存盘点单及盘点明细。','wms_count','wmsCountEditForm','wms_count_line','wmsCountLines','count_id',
    jsonb_build_array(
      pg_temp.wms_field('count_no','盘点单号','vxe-input','{"clearable":true,"placeholder":"请输入盘点单号"}','[]'::jsonb,true,1),
      pg_temp.wms_field('warehouse_id','仓库','base-info',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_warehouse','wms_warehouse','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"warehouse_id"'::jsonb)),'[]'::jsonb,true,1),
      pg_temp.wms_field('count_type','盘点类型','vxe-select','{}','[{"label":"循环盘点","value":"cycle"},{"label":"全面盘点","value":"full"},{"label":"抽盘","value":"spot"},{"label":"盲盘","value":"blind"}]'::jsonb,true,1),
      pg_temp.wms_field('status','状态','vxe-select','{}','[{"label":"草稿","value":"draft"},{"label":"已发布","value":"released"},{"label":"盘点中","value":"counting"},{"label":"待复核","value":"review"},{"label":"已过账","value":"posted"},{"label":"已取消","value":"cancelled"}]'::jsonb,true,1),
      pg_temp.wms_field('scheduled_at','计划时间','vxe-input','{"type":"datetime","clearable":true}','[]'::jsonb,false,1),
      pg_temp.wms_field('posted_at','过账时间','vxe-input','{"type":"datetime","clearable":true}','[]'::jsonb,false,1)
    ),
    jsonb_build_array(
      pg_temp.wms_column('line_no','行号','VxeNumberInput','{"min":1,"digits":0}',80),
      pg_temp.wms_column('item_id','物料','VxeInput','{}',190,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_item','wms_item','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"item_id"'::jsonb)))),
      pg_temp.wms_column('location_id','库位','VxeInput','{}',180,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_location','wms_location','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"location_id"'::jsonb)))),
      pg_temp.wms_column('lot_id','批次','VxeInput','{}',180,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_lot','wms_lot','["lot_no"]'::jsonb),'{fieldMappings,0,targetField}','"lot_id"'::jsonb)))),
      pg_temp.wms_column('lpn_id','容器','VxeInput','{}',180,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_lpn','wms_lpn','["lpn_no"]'::jsonb),'{fieldMappings,0,targetField}','"lpn_id"'::jsonb)))),
      pg_temp.wms_column('system_qty','系统数量','VxeNumberInput','{"min":0,"digits":6}',120),
      pg_temp.wms_column('counted_qty','盘点数量','VxeNumberInput','{"min":0,"digits":6}',120),
      jsonb_set(pg_temp.wms_column('variance_qty','差异数量','VxeNumberInput','{"digits":6}',120),'{editRender,props,readonly}','true'::jsonb),
      pg_temp.wms_column('status','状态','VxeSelect','{}',110,jsonb_build_object('component','vxe-select','options','[{"label":"打开","value":"open"},{"label":"已盘点","value":"counted"},{"label":"已复核","value":"approved"},{"label":"已过账","value":"posted"},{"label":"已取消","value":"cancelled"}]'::jsonb))
    ),
    '{"status":"draft","count_type":"cycle"}'::jsonb,
    '{"status":"open","system_qty":0}'::jsonb,
    '{"status":"open","system_qty":0}'::jsonb
  );
  update public.lowcode_pages set edit_page_id=v_edit_id,updated_at=timezone('utc'::text,now()) where code='wms-counts';

  v_edit_id := pg_temp.wms_upsert_edit_page(
    'wms-adjustments-edit','/dashboard/wms/adjustments/edit','库存调整单','维护库存调整单及调整明细。','wms_adjustment','wmsAdjustmentEditForm','wms_adjustment_line','wmsAdjustmentLines','adjustment_id',
    jsonb_build_array(
      pg_temp.wms_field('adjustment_no','调整单号','vxe-input','{"clearable":true,"placeholder":"请输入调整单号"}','[]'::jsonb,true,1),
      pg_temp.wms_field('warehouse_id','仓库','base-info',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_warehouse','wms_warehouse','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"warehouse_id"'::jsonb)),'[]'::jsonb,true,1),
      pg_temp.wms_field('status','状态','vxe-select','{}','[{"label":"草稿","value":"draft"},{"label":"待提交","value":"submitted"},{"label":"已批准","value":"approved"},{"label":"已过账","value":"posted"},{"label":"已取消","value":"cancelled"}]'::jsonb,true,1),
      pg_temp.wms_field('reason','调整原因','vxe-textarea','{"autosize":{"minRows":2,"maxRows":4},"clearable":true}','[]'::jsonb,true,3),
      pg_temp.wms_field('posted_at','过账时间','vxe-input','{"type":"datetime","clearable":true}','[]'::jsonb,false,1)
    ),
    jsonb_build_array(
      pg_temp.wms_column('line_no','行号','VxeNumberInput','{"min":1,"digits":0}',80),
      pg_temp.wms_column('item_id','物料','VxeInput','{}',190,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_item','wms_item','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"item_id"'::jsonb)))),
      pg_temp.wms_column('location_id','库位','VxeInput','{}',180,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_location','wms_location','["code","name"]'::jsonb),'{fieldMappings,0,targetField}','"location_id"'::jsonb)))),
      pg_temp.wms_column('lot_id','批次','VxeInput','{}',180,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_lot','wms_lot','["lot_no"]'::jsonb),'{fieldMappings,0,targetField}','"lot_id"'::jsonb)))),
      pg_temp.wms_column('serial_id','序列号','VxeInput','{}',180,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_serial','wms_serial','["serial_no"]'::jsonb),'{fieldMappings,0,targetField}','"serial_id"'::jsonb)))),
      pg_temp.wms_column('lpn_id','容器','VxeInput','{}',180,jsonb_build_object('component','base-info','props',jsonb_build_object('relateInfoConfig',jsonb_set(pg_temp.wms_relation('wms_lpn','wms_lpn','["lpn_no"]'::jsonb),'{fieldMappings,0,targetField}','"lpn_id"'::jsonb)))),
      pg_temp.wms_column('quantity_delta','调整数量','VxeNumberInput','{"digits":6}',130),
      pg_temp.wms_column('reason','调整原因','VxeInput','{"clearable":true}',220)
    ),
    '{"status":"draft"}'::jsonb,
    '{}'::jsonb,
    '{"quantity_delta":1}'::jsonb
  );
  update public.lowcode_pages set edit_page_id=v_edit_id,updated_at=timezone('utc'::text,now()) where code='wms-adjustments';
end;
$wms_pages$;

-- 列表页动作使用数据库内置页面函数，并保持迁移可重复执行。
do $wms_list_actions$
declare
  item record;
  v_schema jsonb;
  v_actions jsonb;
  v_page public.lowcode_pages%rowtype;
  v_now timestamptz;
begin
  for item in select * from (values
    ('wms-receipts','wmsReceiptRows'),('wms-shipments','wmsShipmentRows'),('wms-transfers','wmsTransferRows'),('wms-counts','wmsCountRows'),('wms-adjustments','wmsAdjustmentRows')
  ) as x(code,source_key)
  loop
    select schema into v_schema from public.lowcode_pages where code=item.code for update;
    select b->'actions' into v_actions
    from jsonb_array_elements(v_schema->'blocks') b
    where b->>'id'=item.source_key || '-actions';
    v_actions := coalesce(v_actions,'[]'::jsonb);
    if not exists (select 1 from jsonb_array_elements(v_actions) a where a->>'code'='create') then
      v_actions := v_actions || jsonb_build_array(jsonb_build_object('code','create','type','button','label','新增','status','primary','prefixIcon','ri-add-line','eventName','buttonGroup.create','script',pg_temp.wms_call_script('create'),'permissionCode','wms.manage'));
    end if;
    if not exists (select 1 from jsonb_array_elements(v_actions) a where a->>'code'='edit') then
      v_actions := v_actions || jsonb_build_array(jsonb_build_object('code','edit','type','button','label','编辑','prefixIcon','ri-edit-2-line','eventName','buttonGroup.edit','script',pg_temp.wms_call_script('edit'),'permissionCode','wms.manage'));
    end if;
    select jsonb_agg(case when a->>'code' in ('create','edit')
      then a || jsonb_build_object('permissionCode','wms.manage') else a end order by ord)
    into v_actions from jsonb_array_elements(v_actions) with ordinality as x(a,ord);
    v_now := timezone('utc'::text,now());
    update public.lowcode_pages p set
      schema = jsonb_set(p.schema,'{blocks}',(
        select jsonb_agg(case when b->>'id'=item.source_key || '-actions' then jsonb_set(b,'{actions}',v_actions) else b end order by ord)
        from jsonb_array_elements(p.schema->'blocks') with ordinality as x(b,ord)
      )),
      version=p.version+1,published_at=v_now,updated_at=v_now
    where p.code=item.code
    returning * into v_page;
    insert into public.lowcode_page_versions (page_id,version,schema,published_at,created_at)
    values (v_page.id,v_page.version,v_page.schema,v_now,v_now)
    on conflict (page_id,version) do update set schema=excluded.schema,published_at=excluded.published_at;
  end loop;
end;
$wms_list_actions$;

select pg_notify('pgrst', 'reload schema');
commit;
