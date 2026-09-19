-- Database-backed property forms for the print designer. The runtime loads
-- these definitions by code when the designer starts; no form schema is
-- embedded in the property tab.
with common_fields as (
  select '[
    {"field":"shapeId","label":"节点 ID","component":"vxe-input","props":{"disabled":true}},
    {"field":"shapeTypeLabel","label":"节点类型","component":"vxe-input","props":{"disabled":true}},
    {"field":"x","label":"X 坐标","component":"lc-number-input","props":{"step":1}},
    {"field":"y","label":"Y 坐标","component":"lc-number-input","props":{"step":1}},
    {"field":"rotation","label":"旋转角度","component":"lc-number-input","props":{"min":-360,"max":360,"step":1}},
    {"field":"opacity","label":"透明度 (%)","component":"lc-number-input","props":{"min":0,"max":100,"step":1}},
    {"field":"isLocked","label":"锁定节点","component":"vxe-switch"}
  ]'::jsonb as fields
),
definitions(code, name, description, title, include_common, fields, tabs) as (
  values
  (
    'print-designer.property.workspace',
    '打印设计器 - 画布属性',
    '打印设计器画布、视图和打印数据源属性。',
    '画布属性',
    false,
    '[
      {"field":"pageWidthMm","label":"页面宽度 (mm)","component":"lc-number-input","props":{"min":10,"max":1000,"step":0.1}},
      {"field":"pageHeightMm","label":"页面高度 (mm)","component":"lc-number-input","props":{"min":10,"max":1000,"step":0.1}},
      {"field":"pageWidthPx","label":"页面宽度 (px)","component":"lc-number-input","props":{"disabled":true}},
      {"field":"pageHeightPx","label":"页面高度 (px)","component":"lc-number-input","props":{"disabled":true}},
      {"field":"zoomPercent","label":"缩放 (%)","component":"lc-number-input","props":{"min":20,"max":400,"step":1}},
      {"field":"cameraX","label":"视图 X","component":"lc-number-input","props":{"step":1}},
      {"field":"cameraY","label":"视图 Y","component":"lc-number-input","props":{"step":1}},
      {"field":"pxPerMm","label":"像素 / mm","component":"lc-number-input","props":{"disabled":true}},
      {"field":"viewportW","label":"视口宽度","component":"lc-number-input","props":{"disabled":true}},
      {"field":"viewportH","label":"视口高度","component":"lc-number-input","props":{"disabled":true}},
      {"field":"dataSourceType","label":"打印数据源","component":"vxe-select","options":[{"label":"无","value":"none"},{"label":"内联 JSON","value":"inline"},{"label":"JSON 文本","value":"json"},{"label":"CSV 文本","value":"csv"},{"label":"HTTP 接口","value":"http"},{"label":"自定义协议","value":"custom"}],"props":{"clearable":false}},
      {"field":"dataSourceProtocol","label":"自定义协议","component":"vxe-input","props":{"visibleWhen":{"field":"dataSourceType","equals":"custom"}}},
      {"field":"dataSourceUrl","label":"接口地址","component":"vxe-input","props":{"visibleWhen":{"field":"dataSourceType","equals":"http"}}},
      {"field":"dataSourceMethod","label":"请求方法","component":"vxe-select","options":[{"label":"GET","value":"GET"},{"label":"POST","value":"POST"},{"label":"PUT","value":"PUT"},{"label":"PATCH","value":"PATCH"}],"props":{"clearable":false,"visibleWhen":{"field":"dataSourceType","equals":"http"}}},
      {"field":"dataSourceDataPath","label":"数据路径","component":"vxe-input","props":{"visibleWhen":{"field":"dataSourceType","includes":["json","http"]}}},
      {"field":"dataSourceText","label":"数据内容 / 配置","component":"vxe-textarea","props":{"auto-size":{"minRows":3,"maxRows":8},"visibleWhen":{"field":"dataSourceType","includes":["inline","json","csv","custom"]}}},
      {"field":"dataSourceHeaders","label":"请求头 JSON","component":"lc-json-editor","props":{"jsonValueMode":"string","jsonRootType":"object","visibleWhen":{"field":"dataSourceType","equals":"http"}}},
      {"field":"dataSourceBody","label":"请求体 JSON / 文本","component":"vxe-textarea","props":{"auto-size":{"minRows":3,"maxRows":8},"visibleWhen":{"field":"dataSourceType","equals":"http"}}}
    ]'::jsonb,
    '[
      {"key":"basic","label":"基本属性","fields":["pageWidthMm","pageHeightMm","zoomPercent"]},
      {"key":"data","label":"数据源","fields":["dataSourceType","dataSourceProtocol","dataSourceUrl","dataSourceMethod","dataSourceDataPath","dataSourceText","dataSourceHeaders","dataSourceBody"]},
      {"key":"advanced","label":"高级属性","fields":["pageWidthPx","pageHeightPx","cameraX","cameraY","pxPerMm","viewportW","viewportH"]}
    ]'::jsonb
  ),
  (
    'print-designer.property.vue-box', '打印设计器 - 几何节点属性', '几何节点属性表单。', '几何节点', true,
    '[
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"geo","label":"几何形状","component":"vxe-select","options":[{"label":"矩形","value":"rectangle"},{"label":"椭圆","value":"ellipse"},{"label":"三角形","value":"triangle"},{"label":"菱形","value":"diamond"},{"label":"六边形","value":"hexagon"},{"label":"胶囊","value":"oval"},{"label":"平行四边形","value":"rhombus"},{"label":"星形","value":"star"},{"label":"云形","value":"cloud"},{"label":"心形","value":"heart"},{"label":"叉框","value":"x-box"},{"label":"勾选框","value":"check-box"},{"label":"左箭头","value":"arrow-left"},{"label":"上箭头","value":"arrow-up"},{"label":"下箭头","value":"arrow-down"},{"label":"右箭头","value":"arrow-right"}],"props":{"clearable":false}},
      {"field":"color","label":"颜色","component":"vxe-select","options":[{"label":"黑色","value":"black"},{"label":"灰色","value":"grey"},{"label":"蓝色","value":"blue"},{"label":"浅蓝","value":"light-blue"},{"label":"绿色","value":"green"},{"label":"浅绿","value":"light-green"},{"label":"黄色","value":"yellow"},{"label":"橙色","value":"orange"},{"label":"红色","value":"red"},{"label":"浅红","value":"light-red"},{"label":"紫色","value":"violet"},{"label":"浅紫","value":"light-violet"},{"label":"白色","value":"white"}]},
      {"field":"fill","label":"填充","component":"vxe-select","options":[{"label":"无填充","value":"none"},{"label":"半透明","value":"semi"},{"label":"实心","value":"solid"},{"label":"图案","value":"pattern"},{"label":"填充","value":"fill"},{"label":"线性填充","value":"lined-fill"}]},
      {"field":"dash","label":"线条","component":"vxe-select","options":[{"label":"手绘","value":"draw"},{"label":"实线","value":"solid"},{"label":"虚线","value":"dashed"},{"label":"点线","value":"dotted"},{"label":"无","value":"none"}]},
      {"field":"size","label":"线条尺寸","component":"vxe-select","options":[{"label":"小","value":"s"},{"label":"中","value":"m"},{"label":"大","value":"l"},{"label":"超大","value":"xl"}]}
    ]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","x","y","w","h","geo"]},{"key":"style","label":"样式属性","fields":["color","fill","dash","size"]},{"key":"advanced","label":"高级属性","fields":["rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
    'print-designer.property.vue-text', '打印设计器 - 文字节点属性', '文字节点属性表单。', '文字节点', true,
    '[
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"text","label":"文本内容","component":"vxe-textarea","props":{"auto-size":{"minRows":3,"maxRows":8}}},
      {"field":"color","label":"文字颜色","component":"vxe-select","options":[{"label":"黑色","value":"black"},{"label":"灰色","value":"grey"},{"label":"蓝色","value":"blue"},{"label":"浅蓝","value":"light-blue"},{"label":"绿色","value":"green"},{"label":"浅绿","value":"light-green"},{"label":"黄色","value":"yellow"},{"label":"橙色","value":"orange"},{"label":"红色","value":"red"},{"label":"浅红","value":"light-red"},{"label":"紫色","value":"violet"},{"label":"浅紫","value":"light-violet"},{"label":"白色","value":"white"}]},
      {"field":"font","label":"字体","component":"vxe-select","options":[{"label":"手写","value":"draw"},{"label":"无衬线","value":"sans"},{"label":"衬线","value":"serif"},{"label":"等宽","value":"mono"}]},
      {"field":"size","label":"字号","component":"vxe-select","options":[{"label":"小","value":"s"},{"label":"中","value":"m"},{"label":"大","value":"l"},{"label":"超大","value":"xl"}]},
      {"field":"autoSize","label":"自动尺寸","component":"vxe-switch"},
      {"field":"showBorder","label":"显示边框","component":"vxe-switch"}
    ]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","text","x","y","w","h"]},{"key":"style","label":"样式属性","fields":["color","font","size","autoSize","showBorder"]},{"key":"advanced","label":"高级属性","fields":["rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
    'print-designer.property.vue-image', '打印设计器 - 图片节点属性', '图片节点属性表单。', '图片节点', true,
    '[
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"name","label":"图片名称","component":"vxe-input"},
      {"field":"src","label":"图片地址","component":"vxe-textarea","props":{"auto-size":{"minRows":3,"maxRows":8}}},
      {"field":"assetId","label":"资源 ID","component":"vxe-input","props":{"disabled":true}},
      {"field":"showBorder","label":"显示边框","component":"vxe-switch"}
    ]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","name","src","x","y","w","h"]},{"key":"advanced","label":"高级属性","fields":["assetId","showBorder","rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
    'print-designer.property.vue-line', '打印设计器 - 直线节点属性', '直线节点属性表单。', '直线节点', true,
    '[
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"startX","label":"起点 X","component":"lc-number-input","props":{"step":1}},
      {"field":"startY","label":"起点 Y","component":"lc-number-input","props":{"step":1}},
      {"field":"endX","label":"终点 X","component":"lc-number-input","props":{"step":1}},
      {"field":"endY","label":"终点 Y","component":"lc-number-input","props":{"step":1}},
      {"field":"color","label":"颜色","component":"vxe-select","options":[{"label":"黑色","value":"black"},{"label":"灰色","value":"grey"},{"label":"蓝色","value":"blue"},{"label":"绿色","value":"green"},{"label":"红色","value":"red"},{"label":"紫色","value":"violet"},{"label":"白色","value":"white"}]},
      {"field":"dash","label":"线条","component":"vxe-select","options":[{"label":"手绘","value":"draw"},{"label":"实线","value":"solid"},{"label":"虚线","value":"dashed"},{"label":"点线","value":"dotted"},{"label":"无","value":"none"}]},
      {"field":"size","label":"线条尺寸","component":"vxe-select","options":[{"label":"小","value":"s"},{"label":"中","value":"m"},{"label":"大","value":"l"},{"label":"超大","value":"xl"}]}
    ]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","x","y","w","h","startX","startY","endX","endY"]},{"key":"style","label":"样式属性","fields":["color","dash","size"]},{"key":"advanced","label":"高级属性","fields":["rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
    'print-designer.property.vue-arrow', '打印设计器 - 箭头节点属性', '箭头节点属性表单。', '箭头节点', true,
    '[
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"startX","label":"起点 X","component":"lc-number-input","props":{"step":1}},
      {"field":"startY","label":"起点 Y","component":"lc-number-input","props":{"step":1}},
      {"field":"endX","label":"终点 X","component":"lc-number-input","props":{"step":1}},
      {"field":"endY","label":"终点 Y","component":"lc-number-input","props":{"step":1}},
      {"field":"color","label":"颜色","component":"vxe-select","options":[{"label":"黑色","value":"black"},{"label":"灰色","value":"grey"},{"label":"蓝色","value":"blue"},{"label":"绿色","value":"green"},{"label":"红色","value":"red"},{"label":"紫色","value":"violet"},{"label":"白色","value":"white"}]},
      {"field":"fill","label":"填充","component":"vxe-select","options":[{"label":"无填充","value":"none"},{"label":"半透明","value":"semi"},{"label":"实心","value":"solid"},{"label":"图案","value":"pattern"},{"label":"填充","value":"fill"},{"label":"线性填充","value":"lined-fill"}]},
      {"field":"dash","label":"线条","component":"vxe-select","options":[{"label":"手绘","value":"draw"},{"label":"实线","value":"solid"},{"label":"虚线","value":"dashed"},{"label":"点线","value":"dotted"},{"label":"无","value":"none"}]},
      {"field":"size","label":"线条尺寸","component":"vxe-select","options":[{"label":"小","value":"s"},{"label":"中","value":"m"},{"label":"大","value":"l"},{"label":"超大","value":"xl"}]}
    ]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","x","y","w","h","startX","startY","endX","endY"]},{"key":"style","label":"样式属性","fields":["color","fill","dash","size"]},{"key":"advanced","label":"高级属性","fields":["rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
    'print-designer.property.vue-draw', '打印设计器 - 手绘节点属性', '手绘节点属性表单。', '手绘节点', true,
    '[
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"pointsCount","label":"点数量","component":"lc-number-input","props":{"disabled":true}},
      {"field":"color","label":"颜色","component":"vxe-select","options":[{"label":"黑色","value":"black"},{"label":"灰色","value":"grey"},{"label":"蓝色","value":"blue"},{"label":"绿色","value":"green"},{"label":"红色","value":"red"},{"label":"紫色","value":"violet"},{"label":"白色","value":"white"}]},
      {"field":"fill","label":"填充","component":"vxe-select","options":[{"label":"无填充","value":"none"},{"label":"半透明","value":"semi"},{"label":"实心","value":"solid"},{"label":"图案","value":"pattern"},{"label":"填充","value":"fill"},{"label":"线性填充","value":"lined-fill"}]},
      {"field":"dash","label":"线条","component":"vxe-select","options":[{"label":"手绘","value":"draw"},{"label":"实线","value":"solid"},{"label":"虚线","value":"dashed"},{"label":"点线","value":"dotted"},{"label":"无","value":"none"}]},
      {"field":"size","label":"线条尺寸","component":"vxe-select","options":[{"label":"小","value":"s"},{"label":"中","value":"m"},{"label":"大","value":"l"},{"label":"超大","value":"xl"}]}
    ]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","x","y","w","h","pointsCount"]},{"key":"style","label":"样式属性","fields":["color","fill","dash","size"]},{"key":"advanced","label":"高级属性","fields":["rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
    'print-designer.property.vue-qr', '打印设计器 - 二维码节点属性', '二维码节点属性表单。', '二维码节点', true,
    '[
      {"field":"qrSize","label":"二维码尺寸","component":"lc-number-input","props":{"min":24,"step":1}},
      {"field":"text","label":"二维码内容","component":"vxe-textarea","props":{"auto-size":{"minRows":3,"maxRows":8}}},
      {"field":"color","label":"前景色","component":"vxe-select","options":[{"label":"黑色","value":"black"},{"label":"灰色","value":"grey"},{"label":"蓝色","value":"blue"},{"label":"绿色","value":"green"},{"label":"红色","value":"red"},{"label":"紫色","value":"violet"},{"label":"白色","value":"white"}]},
      {"field":"background","label":"背景色","component":"lc-color-picker"},
      {"field":"errorCorrectionLevel","label":"容错级别","component":"vxe-select","options":[{"label":"L - 低","value":"L"},{"label":"M - 中","value":"M"},{"label":"Q - 较高","value":"Q"},{"label":"H - 高","value":"H"}]},
      {"field":"margin","label":"留白","component":"lc-number-input","props":{"min":0,"max":24,"step":1}},
      {"field":"showBorder","label":"显示边框","component":"vxe-switch"}
    ]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","text","qrSize","x","y"]},{"key":"style","label":"样式属性","fields":["color","background","errorCorrectionLevel","margin","showBorder"]},{"key":"advanced","label":"高级属性","fields":["rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
	'print-designer.property.vue-barcode', '打印设计器 - 条形码节点属性', '条形码节点属性表单。', '条形码节点', true,
	'[
	  {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":40,"step":1}},
	  {"field":"h","label":"高度","component":"lc-number-input","props":{"min":24,"step":1}},
	  {"field":"text","label":"条形码内容","component":"vxe-textarea","props":{"auto-size":{"minRows":2,"maxRows":5}}},
	  {"field":"format","label":"编码格式","component":"vxe-select","options":[{"label":"Code 128","value":"code128"},{"label":"Code 39","value":"code39"},{"label":"EAN-13","value":"ean13"},{"label":"EAN-8","value":"ean8"},{"label":"UPC-A","value":"upca"}],"props":{"clearable":false}},
	  {"field":"barColor","label":"条码颜色","component":"lc-color-picker"},
	  {"field":"background","label":"背景色","component":"lc-color-picker"},
	  {"field":"includeText","label":"显示文本","component":"vxe-switch"},
	  {"field":"padding","label":"留白","component":"lc-number-input","props":{"min":0,"max":48,"step":1}},
	  {"field":"showBorder","label":"显示边框","component":"vxe-switch"}
	]'::jsonb,
	'[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","text","format","x","y","w","h"]},{"key":"style","label":"样式属性","fields":["barColor","background","includeText","padding","showBorder"]},{"key":"advanced","label":"高级属性","fields":["rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
    'print-designer.property.vue-frame', '打印设计器 - 画框节点属性', '画框节点属性表单。', '画框节点', true,
    '[
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"name","label":"画框名称","component":"vxe-input"},
      {"field":"showBorder","label":"显示边框","component":"vxe-switch"}
    ]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","name","x","y","w","h"]},{"key":"advanced","label":"高级属性","fields":["showBorder","rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
    'print-designer.property.vue-table', '打印设计器 - 表格节点属性', '表格节点属性表单。', '表格节点', true,
    '[
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":160,"step":1}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":96,"step":1}},
      {"field":"rowHeight","label":"行高","component":"lc-number-input","props":{"min":22,"max":72,"step":1}},
      {"field":"showBorder","label":"显示边框","component":"vxe-switch"}
    ]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","x","y","w","h","rowHeight"]},{"key":"advanced","label":"高级属性","fields":["showBorder","rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
    'print-designer.property.vue-material', '打印设计器 - 物料节点属性', '物料节点属性表单。', '物料节点', true,
    '[
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":280,"step":1}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":272,"step":1}},
      {"field":"name","label":"物料名称","component":"vxe-input"}
    ]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","name","x","y","w","h"]},{"key":"advanced","label":"高级属性","fields":["rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
    'print-designer.property.vue-material-section', '打印设计器 - 物料分区属性', '物料分区属性表单。', '物料分区', true,
    '[
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"disabled":true}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":24,"step":1}},
      {"field":"zone","label":"分区","component":"vxe-select","options":[{"label":"页头","value":"pageHeader"},{"label":"表头","value":"tableHeader"},{"label":"表体","value":"tableBody"},{"label":"表尾","value":"tableFooter"},{"label":"页尾","value":"pageFooter"}]},
      {"field":"label","label":"名称","component":"vxe-input","props":{"disabled":true}}
    ]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","label","zone","h"]},{"key":"advanced","label":"高级属性","fields":["w","x","y","rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
    'print-designer.property.group', '打印设计器 - 分组节点属性', '分组节点属性表单。', '分组节点', true,
    '[]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","x","y"]},{"key":"advanced","label":"高级属性","fields":["rotation","opacity","isLocked"]}]'::jsonb
  ),
  (
    'print-designer.property.generic', '打印设计器 - 通用节点属性', '未注册节点类型的通用只读属性表单。', '通用节点', true,
    '[{"field":"propsJson","label":"节点属性 JSON","component":"lc-json-editor","props":{"readonly":true,"jsonValueMode":"string","jsonRootType":"object"}}]'::jsonb,
    '[{"key":"basic","label":"基本属性","fields":["shapeId","shapeTypeLabel","x","y"]},{"key":"advanced","label":"高级属性","fields":["rotation","opacity","isLocked","propsJson"]}]'::jsonb
  )
),
prepared as (
  select
    definition.code,
    definition.name,
    definition.description,
    jsonb_build_object(
      'title', definition.title,
      'columns', 1,
      'fields', case
        when definition.include_common then common.fields || definition.fields
        else definition.fields
      end,
      'layout', jsonb_build_array(
        jsonb_build_object(
          'kind', 'tabs',
          'defaultKey', coalesce(definition.tabs -> 0 ->> 'key', 'basic'),
          'tabs', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'key', tab.value ->> 'key',
                  'label', tab.value ->> 'label',
                  'blocks', (
                    select coalesce(
                      jsonb_agg(jsonb_build_object('kind', 'field', 'field', field.value) order by field.ordinality),
                      '[]'::jsonb
                    )
                    from jsonb_array_elements_text(tab.value -> 'fields') with ordinality as field(value, ordinality)
                  )
                )
                order by tab.ordinality
              ),
              '[]'::jsonb
            )
            from jsonb_array_elements(definition.tabs) with ordinality as tab(value, ordinality)
          )
        )
      ),
      'actions', '[]'::jsonb
    ) as schema
  from definitions definition
  cross join common_fields common
)
insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled,
  updated_at
)
select
  code,
  name,
  description,
  schema,
  true,
  timezone('utc', now())
from prepared
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = true,
  updated_at = timezone('utc', now());
