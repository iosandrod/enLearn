begin;

-- The factory template uses the same inline source contract as the designer.
-- Keeping the detail columns in the form definition makes them editable from
-- the left data-source panel and keeps the persisted template/workspace pair
-- independent from the low-code form catalog.
insert into public.lowcode_form_definitions (code, name, description, table_name, schema, enabled)
values (
  'print-designer.datasource.factory-manufacturing',
  '工厂制造业出库单',
  '工厂制造业打印模板的主表与物料明细数据源。',
  'factory_material_outbound_orders',
  jsonb_build_object(
    'title', '工厂制造业出库单',
    'columns', 2,
    'fields', jsonb_build_array(
      jsonb_build_object('field', 'billNo', 'label', '单据编号', 'component', 'vxe-input', 'defaultValue', 'MO-20260929-001', 'props', jsonb_build_object('placeholder', '请输入单据编号', 'clearable', true)),
      jsonb_build_object('field', 'businessDate', 'label', '业务日期', 'component', 'vxe-input', 'defaultValue', '2026-09-29', 'props', jsonb_build_object('type', 'date', 'placeholder', '请选择业务日期', 'clearable', true)),
      jsonb_build_object('field', 'customerName', 'label', '客户名称', 'component', 'vxe-input', 'defaultValue', '华东自动化设备有限公司', 'props', jsonb_build_object('placeholder', '请输入客户名称', 'clearable', true)),
      jsonb_build_object('field', 'customerCode', 'label', '客户编码', 'component', 'vxe-input', 'defaultValue', 'CUS-1008', 'props', jsonb_build_object('placeholder', '请输入客户编码', 'clearable', true)),
      jsonb_build_object('field', 'warehouseName', 'label', '仓库名称', 'component', 'vxe-input', 'defaultValue', '成品仓-A区', 'props', jsonb_build_object('placeholder', '请输入仓库名称', 'clearable', true)),
      jsonb_build_object('field', 'maker', 'label', '制单人', 'component', 'vxe-input', 'defaultValue', '张工', 'props', jsonb_build_object('placeholder', '请输入制单人', 'clearable', true)),
      jsonb_build_object('field', 'contact', 'label', '联系人', 'component', 'vxe-input', 'defaultValue', '李经理', 'props', jsonb_build_object('placeholder', '请输入联系人', 'clearable', true)),
      jsonb_build_object('field', 'phone', 'label', '联系电话', 'component', 'vxe-input', 'defaultValue', '13800001234', 'props', jsonb_build_object('placeholder', '请输入联系电话', 'clearable', true)),
      jsonb_build_object('field', 'remark', 'label', '备注', 'component', 'vxe-textarea', 'defaultValue', '出库前请核对序列号与包装完整性。', 'props', jsonb_build_object('placeholder', '请输入备注', 'rows', 3))
    ),
    'printDetail', jsonb_build_array(
      jsonb_build_object(
        'id', 'materials',
        'field', 'materials',
        'label', '物料明细',
        'columns', jsonb_build_array(
          jsonb_build_object('field', 'materialCode', 'title', '物料编码', 'width', 110, 'component', 'vxe-input', 'props', jsonb_build_object('placeholder', '请输入物料编码')),
          jsonb_build_object('field', 'materialName', 'title', '物料名称', 'width', 160, 'component', 'vxe-input', 'props', jsonb_build_object('placeholder', '请输入物料名称')),
          jsonb_build_object('field', 'specification', 'title', '规格型号', 'width', 150, 'component', 'vxe-input', 'props', jsonb_build_object('placeholder', '请输入规格型号')),
          jsonb_build_object('field', 'unit', 'title', '单位', 'width', 58, 'component', 'vxe-input', 'props', jsonb_build_object('placeholder', '如：台、件、根')),
          jsonb_build_object('field', 'quantity', 'title', '数量', 'width', 72, 'component', 'lc-number-input', 'props', jsonb_build_object('min', 0, 'step', 1)),
          jsonb_build_object('field', 'taxUnitPrice', 'title', '含税单价', 'width', 92, 'component', 'lc-number-input', 'props', jsonb_build_object('min', 0, 'step', 0.01)),
          jsonb_build_object('field', 'taxAmount', 'title', '含税金额', 'width', 104, 'component', 'lc-number-input', 'props', jsonb_build_object('min', 0, 'step', 0.01))
        )
      )
    ),
    'actions', jsonb_build_array()
  ),
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  table_name = excluded.table_name,
  schema = excluded.schema,
  enabled = excluded.enabled,
  updated_at = timezone('utc', now());

update public.lowcode_form_definitions
set schema = jsonb_set(
  schema,
  '{fields}',
  (schema -> 'fields') || jsonb_build_array(
    jsonb_build_object('field', 'showPageHeader', 'label', '显示页头', 'component', 'vxe-switch', 'defaultValue', true),
    jsonb_build_object('field', 'showTableHeader', 'label', '显示表头', 'component', 'vxe-switch', 'defaultValue', true),
    jsonb_build_object('field', 'showTableFooter', 'label', '显示表尾', 'component', 'vxe-switch', 'defaultValue', true),
    jsonb_build_object('field', 'showPageFooter', 'label', '显示页尾', 'component', 'vxe-switch', 'defaultValue', true)
  ),
  true
),
updated_at = timezone('utc', now())
where code = 'print-designer.property.vue-material'
  and jsonb_typeof(schema -> 'fields') = 'array'
  and not exists (
    select 1
    from jsonb_array_elements(schema -> 'fields') field
    where field ->> 'field' = 'showPageHeader'
  );

-- Keep the new switches visible when an older definition uses the two-tab
-- property layout instead of the default field rendering.
update public.lowcode_form_definitions definition
set schema = jsonb_set(
  definition.schema,
  '{layout}',
  (
    select jsonb_agg(
      case when item.value ->> 'kind' = 'tabs' then
        jsonb_set(
          item.value,
          '{tabs}',
          (
            select jsonb_agg(
              case when tab.value ->> 'label' = '高级属性' then
                jsonb_set(
                  tab.value,
                  '{blocks}',
                  coalesce(tab.value -> 'blocks', '[]'::jsonb) ||
                    jsonb_build_array(
                      jsonb_build_object('kind', 'field', 'field', 'showPageHeader'),
                      jsonb_build_object('kind', 'field', 'field', 'showTableHeader'),
                      jsonb_build_object('kind', 'field', 'field', 'showTableFooter'),
                      jsonb_build_object('kind', 'field', 'field', 'showPageFooter')
                    ),
                  true
                )
              else tab.value end
              order by tab.ordinality
            )
            from jsonb_array_elements(item.value -> 'tabs') with ordinality tab(value, ordinality)
          ),
          true
        )
      else item.value end
      order by item.ordinality
    )
    from jsonb_array_elements(definition.schema -> 'layout') with ordinality item(value, ordinality)
  ),
  true
), updated_at = timezone('utc', now())
where definition.code = 'print-designer.property.vue-material'
  and jsonb_typeof(definition.schema -> 'layout') = 'array'
  and jsonb_path_exists(definition.schema, '$.layout[*].tabs[*] ? (@.label == "高级属性")')
  and not jsonb_path_exists(
    definition.schema,
    '$.layout[*].tabs[*].blocks[*] ? (@.field == "showPageHeader")'
  );

do $factory_template$
declare
  template_id public.print_templates.id%type;
  template_content jsonb := jsonb_build_object(
    'pages', jsonb_build_array(jsonb_build_object(
      'id', 'page:factory-manufacturing',
      'name', '工厂制造业',
      'content', jsonb_build_object(
        'schema', jsonb_build_object(
          'schemaVersion', 2,
          'sequences', jsonb_build_object(
            'com.tldraw.page', 1,
            'com.tldraw.user', 1,
            'com.tldraw.asset', 1,
            'com.tldraw.shape', 4,
            'com.tldraw.store', 5,
            'com.tldraw.camera', 1,
            'com.tldraw.pointer', 1,
            'com.tldraw.document', 2,
            'com.tldraw.instance', 26,
            'com.tldraw.asset.image', 6,
            'com.tldraw.asset.video', 5,
            'com.tldraw.shape.group', 0,
            'com.tldraw.shape.vue-qr', 0,
            'com.tldraw.binding.arrow', 0,
            'com.tldraw.shape.vue-box', 0,
            'com.tldraw.asset.bookmark', 2,
            'com.tldraw.shape.vue-draw', 0,
            'com.tldraw.shape.vue-line', 0,
            'com.tldraw.shape.vue-text', 0,
            'com.tldraw.shape.vue-arrow', 0,
            'com.tldraw.shape.vue-frame', 0,
            'com.tldraw.shape.vue-image', 0,
            'com.tldraw.shape.vue-table', 0,
            'com.tldraw.shape.vue-resume', 0,
            'com.tldraw.instance_presence', 6,
            'com.tldraw.shape.vue-barcode', 0,
            'com.tldraw.shape.vue-material', 0,
            'com.tldraw.instance_page_state', 5,
            'com.tldraw.shape.vue-resume-section', 0,
            'com.tldraw.shape.vue-material-section', 0
          )
        ),
        'shapes', jsonb_build_array(
          jsonb_build_object(
            'id', 'shape:factory-material', 'typeName', 'shape', 'type', 'vue-material', 'x', 60, 'y', 96,
            'rotation', 0, 'index', 'a1', 'parentId', 'page:factory-manufacturing',
            'opacity', 1, 'isLocked', false,
            'meta', jsonb_build_object('showPageHeader', true, 'showTableHeader', true, 'showTableFooter', true, 'showPageFooter', true),
            'props', jsonb_build_object('w', 720, 'h', 500, 'name', '物料明细表')
          ),
          jsonb_build_object(
            'id', 'shape:factory-page-header', 'typeName', 'shape', 'type', 'vue-material-section', 'x', 0, 'y', 0,
            'rotation', 0, 'index', 'a2', 'parentId', 'shape:factory-material',
            'opacity', 1, 'isLocked', false,
            'props', jsonb_build_object('w', 720, 'h', 60, 'zone', 'pageHeader', 'label', '页头')
          ),
          jsonb_build_object(
            'id', 'shape:factory-table-header', 'typeName', 'shape', 'type', 'vue-material-section', 'x', 0, 'y', 60,
            'rotation', 0, 'index', 'a3', 'parentId', 'shape:factory-material',
            'opacity', 1, 'isLocked', false,
            'props', jsonb_build_object('w', 720, 'h', 66, 'zone', 'tableHeader', 'label', '表头')
          ),
          jsonb_build_object(
            'id', 'shape:factory-table-body', 'typeName', 'shape', 'type', 'vue-material-section', 'x', 0, 'y', 126,
            'rotation', 0, 'index', 'a4', 'parentId', 'shape:factory-material',
            'opacity', 1, 'isLocked', false,
            'props', jsonb_build_object('w', 720, 'h', 242, 'zone', 'tableBody', 'label', '表体')
          ),
          jsonb_build_object(
            'id', 'shape:factory-table-footer', 'typeName', 'shape', 'type', 'vue-material-section', 'x', 0, 'y', 368,
            'rotation', 0, 'index', 'a5', 'parentId', 'shape:factory-material',
            'opacity', 1, 'isLocked', false,
            'props', jsonb_build_object('w', 720, 'h', 66, 'zone', 'tableFooter', 'label', '表尾')
          ),
          jsonb_build_object(
            'id', 'shape:factory-page-footer', 'typeName', 'shape', 'type', 'vue-material-section', 'x', 0, 'y', 434,
            'rotation', 0, 'index', 'a6', 'parentId', 'shape:factory-material',
            'opacity', 1, 'isLocked', false,
            'props', jsonb_build_object('w', 720, 'h', 66, 'zone', 'pageFooter', 'label', '页尾')
          ),
          jsonb_build_object(
            'id', 'shape:factory-title', 'typeName', 'shape', 'type', 'vue-text', 'x', 190, 'y', 10,
            'rotation', 0, 'index', 'a7', 'parentId', 'shape:factory-page-header',
            'opacity', 1, 'isLocked', false,
            'props', jsonb_build_object('w', 340, 'h', 40, 'text', '工厂制造业物料出库单', 'color', 'black', 'font', 'sans', 'size', 'l', 'autoSize', false)
          ),
          jsonb_build_object(
            'id', 'shape:factory-header-info', 'typeName', 'shape', 'type', 'vue-text', 'x', 16, 'y', 16,
            'rotation', 0, 'index', 'a8', 'parentId', 'shape:factory-table-header',
            'opacity', 1, 'isLocked', false,
            'props', jsonb_build_object('w', 680, 'h', 34, 'text', '单据编号：{{billNo}}    业务日期：{{businessDate}}    客户：{{customerName}}', 'color', 'black', 'font', 'sans', 'size', 's', 'autoSize', false)
          ),
          jsonb_build_object(
            'id', 'shape:factory-footer-info', 'typeName', 'shape', 'type', 'vue-text', 'x', 16, 'y', 16,
            'rotation', 0, 'index', 'a9', 'parentId', 'shape:factory-table-footer',
            'opacity', 1, 'isLocked', false,
            'props', jsonb_build_object('w', 680, 'h', 34, 'text', '制单人：{{maker}}    联系人：{{contact}}    联系电话：{{phone}}', 'color', 'black', 'font', 'sans', 'size', 's', 'autoSize', false)
          ),
          jsonb_build_object(
            'id', 'shape:factory-remark', 'typeName', 'shape', 'type', 'vue-text', 'x', 16, 'y', 16,
            'rotation', 0, 'index', 'aA', 'parentId', 'shape:factory-page-footer',
            'opacity', 1, 'isLocked', false,
            'props', jsonb_build_object('w', 680, 'h', 34, 'text', '备注：{{remark}}', 'color', 'black', 'font', 'sans', 'size', 's', 'autoSize', false)
          )
        ),
        'rootShapeIds', jsonb_build_array('shape:factory-material'),
        'bindings', jsonb_build_array(),
        'assets', jsonb_build_array()
      )
    )),
    'currentPageId', 'page:factory-manufacturing',
    'workspace', jsonb_build_object(
      'designerMode', 'print',
      'pageSizeMm', jsonb_build_object('w', 80, 'h', 80),
      'pageBounds', jsonb_build_object('x', 0, 'y', 0, 'w', 800, 'h', 800),
      'pxPerMm', 10,
      'printDataSource', jsonb_build_object(
        'type', 'inline',
        'formCode', 'print-designer.datasource.factory-manufacturing',
        'tableName', 'factory_material_outbound_orders',
        'detailField', 'materials',
        'detailColumns', jsonb_build_array(
          jsonb_build_object('field', 'materialCode', 'title', '物料编码', 'width', 110, 'component', 'vxe-input'),
          jsonb_build_object('field', 'materialName', 'title', '物料名称', 'width', 160, 'component', 'vxe-input'),
          jsonb_build_object('field', 'specification', 'title', '规格型号', 'width', 150, 'component', 'vxe-input'),
          jsonb_build_object('field', 'unit', 'title', '单位', 'width', 58, 'component', 'vxe-input'),
          jsonb_build_object('field', 'quantity', 'title', '数量', 'width', 72, 'component', 'lc-number-input'),
          jsonb_build_object('field', 'taxUnitPrice', 'title', '含税单价', 'width', 92, 'component', 'lc-number-input'),
          jsonb_build_object('field', 'taxAmount', 'title', '含税金额', 'width', 104, 'component', 'lc-number-input')
        ),
        'rows', jsonb_build_array(jsonb_build_object(
          'billNo', 'MO-20260929-001', 'businessDate', '2026-09-29',
          'customerName', '华东自动化设备有限公司', 'customerCode', 'CUS-1008',
          'warehouseName', '成品仓-A区', 'maker', '张工', 'contact', '李经理',
          'phone', '13800001234', 'remark', '出库前请核对序列号与包装完整性。',
          'materials', jsonb_build_array(
            jsonb_build_object('materialCode', 'MAT-伺服-001', 'materialName', '伺服电机', 'specification', '1.5kW 220V', 'unit', '台', 'quantity', 2, 'taxUnitPrice', '2860.00', 'taxAmount', '5720.00'),
            jsonb_build_object('materialCode', 'MAT-减速-002', 'materialName', '精密减速机', 'specification', 'PG120-10', 'unit', '台', 'quantity', 2, 'taxUnitPrice', '1980.00', 'taxAmount', '3960.00'),
            jsonb_build_object('materialCode', 'MAT-联轴-003', 'materialName', '弹性联轴器', 'specification', 'LZ-45 铝合金', 'unit', '件', 'quantity', 4, 'taxUnitPrice', '126.00', 'taxAmount', '504.00'),
            jsonb_build_object('materialCode', 'MAT-编码-004', 'materialName', '编码器线缆', 'specification', '5m 屏蔽线', 'unit', '根', 'quantity', 6, 'taxUnitPrice', '78.00', 'taxAmount', '468.00')
          )
        ))
      )
    )
  );
begin
  template_content := jsonb_set(
    template_content,
    '{pages,0,content,shapes}',
    (
      select coalesce(jsonb_agg(shape.value || jsonb_build_object('meta', coalesce(shape.value -> 'meta', '{}'::jsonb))), '[]'::jsonb)
      from jsonb_array_elements(template_content #> '{pages,0,content,shapes}') shape(value)
    ),
    true
  );
  select id into template_id from public.print_templates where name = '工厂制造业' order by updated_at desc limit 1;
  if template_id is null then
    insert into public.print_templates (name, content, workspace, status, version, metadata)
    values (
      '工厂制造业', template_content, template_content -> 'workspace', 'active', 1,
      jsonb_build_object('editor', 'tldraw-vue', 'schemaVersion', 2, 'source', 'print-designer', 'templateName', '工厂制造业', 'dataSourceType', 'inline', 'dataSourceFormCode', 'print-designer.datasource.factory-manufacturing')
    );
  else
    update public.print_templates
    set content = template_content,
        workspace = template_content -> 'workspace',
        status = 'active',
        metadata = jsonb_build_object('editor', 'tldraw-vue', 'schemaVersion', 2, 'source', 'print-designer', 'templateName', '工厂制造业', 'dataSourceType', 'inline', 'dataSourceFormCode', 'print-designer.datasource.factory-manufacturing'),
        updated_at = timezone('utc', now())
    where id = template_id;
  end if;
end $factory_template$;

commit;
