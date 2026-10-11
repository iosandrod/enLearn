begin;

insert into public.lowcode_form_definitions
  (code, name, description, table_name, schema, enabled, user_id)
values
  (
    'print-designer.property.bi-chart',
    '打印设计器 - ECharts 图表属性',
    '打印设计器与 BI 模式共用的 ECharts 图表属性表单。',
    null,
    $schema$
    {
      "title": "ECharts 图表",
      "columns": 1,
      "fields": [
        {"field":"shapeId","label":"节点 ID","component":"vxe-input","props":{"disabled":true}},
        {"field":"shapeTypeLabel","label":"节点类型","component":"vxe-input","props":{"disabled":true}},
        {"field":"chartType","label":"图表类型","component":"vxe-select","options":[
          {"label":"柱状图","value":"bar"},
          {"label":"折线图","value":"line"},
          {"label":"面积图","value":"area"},
          {"label":"饼图","value":"pie"},
          {"label":"环形图","value":"doughnut"},
          {"label":"散点图","value":"scatter"},
          {"label":"雷达图","value":"radar"}
        ],"props":{"clearable":false}},
        {"field":"title","label":"图表标题","component":"vxe-input","props":{"maxlength":160}},
        {"field":"x","label":"X 坐标","component":"lc-number-input","props":{"step":1}},
        {"field":"y","label":"Y 坐标","component":"lc-number-input","props":{"step":1}},
        {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":80,"step":1}},
        {"field":"h","label":"高度","component":"lc-number-input","props":{"min":60,"step":1}},
        {"field":"chartColor","label":"图表颜色","component":"lc-color-picker"},
        {"field":"background","label":"背景颜色","component":"lc-color-picker"},
        {"field":"showLegend","label":"显示图例","component":"vxe-switch"},
        {"field":"showTooltip","label":"显示提示","component":"vxe-switch"},
        {"field":"dataJson","label":"图表数据（JSON）","component":"lc-json-editor","span":2,"props":{"jsonValueMode":"parsed","jsonRootType":"object","rows":12}},
        {"field":"optionJson","label":"高级配置（JSON）","component":"lc-json-editor","span":2,"props":{"jsonValueMode":"parsed","jsonRootType":"object","rows":12}},
        {"field":"borderRadius","label":"圆角","component":"lc-number-input","props":{"min":0,"max":256,"step":1}},
        {"field":"showBorder","label":"显示边框","component":"vxe-switch"},
        {"field":"rotation","label":"旋转角度","component":"lc-number-input","props":{"min":-360,"max":360,"step":1}},
        {"field":"opacity","label":"透明度 (%)","component":"lc-number-input","props":{"min":0,"max":100,"step":1}},
        {"field":"isLocked","label":"锁定节点","component":"vxe-switch"}
      ],
      "layout": [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          {"key":"basic","label":"基本属性","blocks":[
            {"kind":"field","field":"shapeId"},
            {"kind":"field","field":"shapeTypeLabel"},
            {"kind":"field","field":"chartType"},
            {"kind":"field","field":"title"},
            {"kind":"field","field":"x"},
            {"kind":"field","field":"y"},
            {"kind":"field","field":"w"},
            {"kind":"field","field":"h"}
          ]},
          {"key":"data","label":"数据配置","blocks":[
            {"kind":"field","field":"dataJson"},
            {"kind":"field","field":"optionJson"}
          ]},
          {"key":"style","label":"样式属性","blocks":[
            {"kind":"field","field":"chartColor"},
            {"kind":"field","field":"background"},
            {"kind":"field","field":"showLegend"},
            {"kind":"field","field":"showTooltip"},
            {"kind":"field","field":"borderRadius"},
            {"kind":"field","field":"showBorder"}
          ]},
          {"key":"advanced","label":"高级属性","blocks":[
            {"kind":"field","field":"rotation"},
            {"kind":"field","field":"opacity"},
            {"kind":"field","field":"isLocked"}
          ]}
        ]
      }],
      "actions": []
    }
    $schema$::jsonb,
    true,
    null
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  table_name = excluded.table_name,
  schema = excluded.schema,
  enabled = excluded.enabled,
  updated_at = timezone('utc', now());

select pg_notify('pgrst', 'reload schema');

commit;
