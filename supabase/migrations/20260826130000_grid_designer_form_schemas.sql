-- Store every form schema used by the data-grid designer in the database.

begin;

with definitions(code, name, description, schema) as (
  values
  (
    'grid-designer-columns',
    '数据表格设计 - 列设计',
    '维护数据表格的列、编辑器、宽度、固定位置和显示行为。',
    $schema$
    {
      "columns": 1,
      "fields": [
        {
          "field": "columns",
          "label": "列配置",
          "component": "lc-array-table",
          "props": {
            "toolbarButtons": [
              { "code": "add", "label": "新增列", "command": "add", "status": "primary", "prefixIcon": "ri-add-line" },
              { "code": "associate-entity", "label": "关联实体", "prefixIcon": "ri-database-2-line" },
              { "code": "associate-view", "label": "关联视图", "prefixIcon": "ri-eye-2-line" },
              { "code": "sync-table-comments", "label": "同步列注释", "prefixIcon": "ri-refresh-line" }
            ],
            "rowKey": "__id",
            "preserveRowKey": true,
            "rowDraggable": true,
            "movable": false,
            "copyable": true,
            "minRows": 1,
            "actionWidth": 108,
            "rowActions": [
              {
                "code": "advanced-column-design",
                "title": "高级列设计",
                "icon": "ri-settings-3-line",
                "status": "primary"
              }
            ],
            "height": 520,
            "toolbarAlign": "left",
            "columns": [
              { "field": "field", "title": "字段名", "minWidth": 150 },
              { "field": "title", "title": "列标题", "minWidth": 150 },
              { "field": "editType", "title": "编辑类型", "component": "vxe-select", "width": 180, "optionsCode": "grid_column_edit_type" },
              {
                "field": "type", "title": "列类型", "component": "vxe-select", "width": 132,
                "options": [
                  { "label": "默认", "value": "" },
                  { "label": "序号", "value": "seq" },
                  { "label": "单选", "value": "radio" },
                  { "label": "复选", "value": "checkbox" },
                  { "label": "展开", "value": "expand" },
                  { "label": "网页内容", "value": "html" }
                ]
              },
              { "field": "width", "title": "宽度", "width": 108, "props": { "placeholder": "自动" } },
              { "field": "minWidth", "title": "最小宽度", "width": 118 },
              {
                "field": "fixed", "title": "固定位置", "component": "vxe-select", "width": 116,
                "options": [
                  { "label": "不固定", "value": "" },
                  { "label": "固定在左侧", "value": "left" },
                  { "label": "固定在右侧", "value": "right" }
                ]
              },
              {
                "field": "align", "title": "对齐方式", "component": "vxe-select", "width": 124,
                "options": [
                  { "label": "默认", "value": "" },
                  { "label": "左对齐", "value": "left" },
                  { "label": "居中", "value": "center" },
                  { "label": "右对齐", "value": "right" }
                ]
              },
              { "field": "sortable", "title": "可排序", "component": "vxe-switch", "width": 96 },
              { "field": "visible", "title": "显示", "component": "vxe-switch", "width": 92 },
              {
                "field": "showOverflow", "title": "溢出处理", "component": "vxe-select", "width": 138,
                "options": [
                  { "label": "默认", "value": "" },
                  { "label": "启用", "value": "true", "rawValue": true },
                  { "label": "禁用", "value": "false", "rawValue": false },
                  { "label": "显示省略号", "value": "ellipsis" },
                  { "label": "标题提示", "value": "title" },
                  { "label": "浮层提示", "value": "tooltip" }
                ]
              },
              {
                "field": "formatter", "title": "格式化配置", "minWidth": 210,
                "props": {
                  "placeholder": "{\"type\":\"text\"} 或格式化器名",
                  "fields": [
                    {
                      "field": "type", "label": "格式化类型", "component": "vxe-select",
                      "options": [
                        { "label": "文本", "value": "text" },
                        { "label": "日期", "value": "date" },
                        { "label": "日期时间", "value": "datetime" },
                        { "label": "货币", "value": "currency" },
                        { "label": "数字", "value": "number" },
                        { "label": "枚举", "value": "enum" }
                      ]
                    },
                    { "field": "emptyText", "label": "空值文本", "component": "vxe-input" },
                    { "field": "locale", "label": "区域设置", "component": "vxe-input" },
                    {
                      "field": "options", "label": "格式选项", "component": "lc-sub-form",
                      "props": { "schema": { "columns": 1, "fields": [
                        { "field": "dateStyle", "label": "日期样式", "component": "vxe-input" },
                        { "field": "timeStyle", "label": "时间样式", "component": "vxe-input" },
                        { "field": "style", "label": "数字样式", "component": "vxe-input" },
                        { "field": "currency", "label": "货币代码", "component": "vxe-input" },
                        { "field": "minimumFractionDigits", "label": "最少小数位", "component": "lc-number-input" },
                        { "field": "maximumFractionDigits", "label": "最多小数位", "component": "lc-number-input" }
                      ], "layout": [], "actions": [] } }
                    },
                    {
                      "field": "map", "label": "枚举映射", "component": "lc-sub-form",
                      "props": { "schema": { "columns": 1, "fields": [], "layout": [], "actions": [] } }
                    }
                  ]
                }
              }
            ],
            "defaultRow": {
              "field": "field_{{ index }}", "title": "列 {{ index }}", "editType": "", "type": "",
              "width": "", "minWidth": 120, "maxWidth": "", "fixed": "", "align": "",
              "headerAlign": "", "footerAlign": "", "sortable": false, "resizable": true,
              "visible": true, "showOverflow": "", "showHeaderOverflow": "", "showFooterOverflow": "",
              "formatter": "", "filters": [], "cellRender": {}, "editRender": {}, "params": {}
            }
          }
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-business-info',
    '数据表格设计 - 业务信息',
    '维护表格区块、数据源、服务方法和请求参数。',
    $schema$
    {
      "columns": 4,
      "fields": [
        { "field": "blockId", "label": "区块标识", "component": "vxe-input" },
        { "field": "title", "label": "表格标题", "component": "vxe-input" },
        {
          "field": "tableType", "label": "表格类型", "component": "vxe-select",
          "options": [
            { "label": "main", "value": "main" },
            { "label": "detail", "value": "detail" },
            { "label": "default", "value": "default" }
          ]
        },
        {
          "field": "tableName", "label": "关联真实表", "component": "vxe-select", "optionsCode": "physical_table_name",
          "props": { "filterable": true, "clearable": true, "placeholder": "请选择真实表" }
        },
        {
          "field": "viewName", "label": "关联视图", "component": "vxe-select", "optionsCode": "database_view_name",
          "props": { "filterable": true, "clearable": true, "placeholder": "请选择视图" }
        },
        {
          "field": "categoryField", "label": "类别关联字段", "component": "vxe-input",
          "props": { "clearable": true, "placeholder": "如 category_id；留空不按类别过滤" }
        },
        { "field": "sourceKey", "label": "数据源标识", "component": "vxe-input" },
        { "field": "serviceName", "label": "服务名称", "component": "vxe-input" },
        { "field": "serviceMethod", "label": "查询方法", "component": "vxe-input" },
        { "field": "saveMethod", "label": "保存方法", "component": "vxe-input" },
        { "field": "deleteMethod", "label": "删除方法", "component": "vxe-input" },
        { "field": "showRowActions", "label": "显示行操作", "component": "vxe-switch" },
        { "field": "postDataJson", "label": "请求参数", "component": "lc-json-editor", "props": { "rows": 4 } }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-grid-options',
    '数据表格设计 - 表格参数',
    '维护表格尺寸、边框、溢出、虚拟滚动和显示参数。',
    $schema$
    {
      "columns": 4,
      "fields": [
        { "field": "id", "label": "表格标识", "component": "vxe-input" },
        {
          "field": "size", "label": "组件尺寸", "component": "vxe-select",
          "options": [
            { "label": "默认", "value": "" },
            { "label": "中等", "value": "medium" },
            { "label": "小型", "value": "small" },
            { "label": "迷你", "value": "mini" }
          ]
        },
        { "field": "height", "label": "表格高度", "component": "vxe-input", "props": { "placeholder": "auto / 480" } },
        {
          "field": "mobileDisplay", "label": "移动端显示方式", "component": "vxe-select",
          "options": [{ "label": "表格", "value": "table" }, { "label": "卡片", "value": "card" }]
        },
        { "field": "rowHeight", "label": "行高", "component": "vxe-number-input", "props": { "min": 34, "max": 120 } },
        { "field": "headerHeight", "label": "表头高度", "component": "vxe-number-input", "props": { "min": 34, "max": 100 } },
        { "field": "overscanRowCount", "label": "预渲染行数", "component": "vxe-number-input", "props": { "min": 1, "max": 50 } },
        { "field": "overscanColumnCount", "label": "预渲染列数", "component": "vxe-number-input", "props": { "min": 1, "max": 20 } },
        { "field": "maxHeight", "label": "最大高度", "component": "vxe-input" },
        {
          "field": "border", "label": "边框样式", "component": "vxe-select",
          "options": [
            { "label": "显示边框", "value": true },
            { "label": "隐藏边框", "value": false },
            { "label": "默认边框", "value": "default" },
            { "label": "完整边框", "value": "full" },
            { "label": "外边框", "value": "outer" },
            { "label": "内边框", "value": "inner" },
            { "label": "无边框", "value": "none" }
          ]
        },
        { "field": "stripe", "label": "显示斑马纹", "component": "vxe-switch" },
        { "field": "round", "label": "圆角边框", "component": "vxe-switch" },
        { "field": "showHeader", "label": "显示表头", "component": "vxe-switch" },
        { "field": "showFooter", "label": "显示表尾", "component": "vxe-switch" },
        {
          "field": "showOverflow", "label": "内容溢出处理", "component": "vxe-select",
          "options": [
            { "label": "默认", "value": "" }, { "label": "启用", "value": true }, { "label": "禁用", "value": false },
            { "label": "显示省略号", "value": "ellipsis" }, { "label": "标题提示", "value": "title" }, { "label": "浮层提示", "value": "tooltip" }
          ]
        },
        {
          "field": "showHeaderOverflow", "label": "表头溢出处理", "component": "vxe-select",
          "options": [
            { "label": "默认", "value": "" }, { "label": "启用", "value": true }, { "label": "禁用", "value": false },
            { "label": "显示省略号", "value": "ellipsis" }, { "label": "标题提示", "value": "title" }, { "label": "浮层提示", "value": "tooltip" }
          ]
        },
        {
          "field": "align", "label": "内容对齐", "component": "vxe-select",
          "options": [{ "label": "默认", "value": "" }, { "label": "左对齐", "value": "left" }, { "label": "居中", "value": "center" }, { "label": "右对齐", "value": "right" }]
        },
        {
          "field": "headerAlign", "label": "表头对齐", "component": "vxe-select",
          "options": [{ "label": "默认", "value": "" }, { "label": "左对齐", "value": "left" }, { "label": "居中", "value": "center" }, { "label": "右对齐", "value": "right" }]
        },
        { "field": "autoResize", "label": "自动调整尺寸", "component": "vxe-switch" },
        { "field": "keepSource", "label": "保留源数据", "component": "vxe-switch" }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-form-settings',
    '数据表格设计 - 表单设置',
    '维护表格选择列类型、宽度和固定位置。',
    $schema$
    {
      "columns": 4,
      "fields": [
        {
          "field": "selectionColumnType", "label": "选择列", "component": "vxe-select",
          "options": [{ "label": "关闭", "value": "" }, { "label": "复选", "value": "checkbox" }, { "label": "单选", "value": "radio" }]
        },
        {
          "field": "selectionColumnWidth", "label": "选择列宽度", "component": "vxe-number-input",
          "props": { "min": 36, "max": 120, "visibleWhen": { "field": "selectionColumnType", "includes": ["checkbox", "radio"] } }
        },
        {
          "field": "selectionColumnFixed", "label": "选择列位置", "component": "vxe-select",
          "options": [{ "label": "不固定", "value": "" }, { "label": "固定在左侧", "value": "left" }, { "label": "固定在右侧", "value": "right" }],
          "props": { "visibleWhen": { "field": "selectionColumnType", "includes": ["checkbox", "radio"] } }
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-row-config',
    '数据表格设计 - 行配置',
    '维护数据表格的行键、高亮、拖动和尺寸行为。',
    $schema$
    {
      "columns": 1,
      "fields": [
        {
          "field": "rowConfig", "label": "行配置", "component": "lc-sub-form",
          "props": { "schema": { "columns": 3, "fields": [
            { "field": "keyField", "label": "行键字段", "component": "vxe-input" },
            { "field": "useKey", "label": "启用行键", "component": "vxe-switch" },
            { "field": "isCurrent", "label": "高亮当前行", "component": "vxe-switch" },
            { "field": "isHover", "label": "高亮悬停行", "component": "vxe-switch" },
            { "field": "resizable", "label": "可调整行高", "component": "vxe-switch" },
            { "field": "drag", "label": "允许拖动行", "component": "vxe-switch" }
          ], "layout": [], "actions": [] } }
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-column-config',
    '数据表格设计 - 列配置',
    '维护数据表格的列键、高亮、拖动和最小列宽行为。',
    $schema$
    {
      "columns": 1,
      "fields": [
        {
          "field": "columnConfig", "label": "列配置", "component": "lc-sub-form",
          "props": { "schema": { "columns": 3, "fields": [
            { "field": "useKey", "label": "启用列键", "component": "vxe-switch" },
            { "field": "resizable", "label": "可调整列宽", "component": "vxe-switch" },
            { "field": "isCurrent", "label": "高亮当前列", "component": "vxe-switch" },
            { "field": "isHover", "label": "高亮悬停列", "component": "vxe-switch" },
            { "field": "drag", "label": "允许拖动列", "component": "vxe-switch" },
            { "field": "minWidth", "label": "最小列宽", "component": "vxe-input" }
          ], "layout": [], "actions": [] } }
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-events',
    '数据表格设计 - 事件属性',
    '维护 VXE 表格事件、运行事件名和低代码指令。',
    $schema$
    {
      "columns": 1,
      "fields": [
        {
          "field": "gridEvents", "label": "事件配置", "component": "lc-array-table",
          "props": {
            "showToolbar": false, "showActions": false, "rowKey": "key", "preserveRowKey": true, "height": 560,
            "columns": [
              { "field": "enabled", "title": "启用", "component": "vxe-switch", "width": 78 },
              { "field": "label", "title": "事件说明", "width": 130, "readonly": true },
              { "field": "vxeName", "title": "表格事件属性", "width": 170, "readonly": true },
              { "field": "nativeName", "title": "原生事件名", "width": 190, "readonly": true },
              { "field": "eventName", "title": "运行事件名", "minWidth": 220, "props": { "placeholder": "grid.rowDblclick" } },
              {
                "field": "directives", "title": "指令", "component": "lc-json-editor", "minWidth": 260,
                "props": {
                  "rows": 3,
                  "placeholder": "[\n  {\n    \"type\": \"setDataSource\",\n    \"sourceKey\": \"\",\n    \"targetKey\": \"\",\n    \"value\": \"\"\n  }\n]"
                }
              }
            ]
          }
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-extra-props',
    '数据表格设计 - 扩展属性',
    '维护未被标准表单覆盖的 VXE Grid 扩展属性。',
    $schema${ "columns": 1, "fields": [{ "field": "value", "label": "扩展属性", "component": "lc-json-editor", "props": { "rows": 12 } }], "layout": [], "actions": [] }$schema$::jsonb
  ),
  (
    'grid-designer-pager-config',
    '数据表格设计 - 分页配置',
    '维护分页开关、页码、每页条数和分页布局。',
    $schema$
    {
      "columns": 2,
      "fields": [
        { "field": "enabled", "label": "启用分页", "component": "vxe-switch" },
        { "field": "pageSize", "label": "每页条数", "component": "lc-number-input" },
        { "field": "currentPage", "label": "当前页", "component": "lc-number-input" },
        {
          "field": "pageSizes", "label": "每页条数选项", "component": "lc-array-table",
          "props": { "valueMode": "primitive", "valueField": "value", "valueTitle": "每页条数", "toolbarButtons": [{ "code": "add", "label": "新增", "command": "add", "status": "primary" }] }
        },
        {
          "field": "layouts", "label": "分页布局", "component": "lc-array-table",
          "props": { "valueMode": "primitive", "valueField": "value", "valueTitle": "布局项", "toolbarButtons": [{ "code": "add", "label": "新增", "command": "add", "status": "primary" }] }
        },
        { "field": "autoHidden", "label": "单页自动隐藏", "component": "vxe-switch" },
        { "field": "perfect", "label": "完整布局", "component": "vxe-switch" }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-toolbar-config',
    '数据表格设计 - 工具栏配置',
    '维护工具栏开关、内置工具和插槽。',
    $schema$
    {
      "columns": 2,
      "fields": [
        { "field": "enabled", "label": "启用工具栏", "component": "vxe-switch" },
        { "field": "refresh", "label": "显示刷新", "component": "vxe-switch" },
        { "field": "import", "label": "显示导入", "component": "vxe-switch" },
        { "field": "export", "label": "显示导出", "component": "vxe-switch" },
        { "field": "print", "label": "显示打印", "component": "vxe-switch" },
        { "field": "zoom", "label": "显示全屏", "component": "vxe-switch" },
        { "field": "custom", "label": "显示列设置", "component": "vxe-switch" },
        {
          "field": "slots", "label": "插槽", "component": "lc-sub-form",
          "props": { "schema": { "columns": 1, "fields": [
            { "field": "buttons", "label": "按钮插槽", "component": "vxe-input" },
            { "field": "tools", "label": "工具插槽", "component": "vxe-input" }
          ], "layout": [], "actions": [] } }
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-proxy-config',
    '数据表格设计 - 数据代理配置',
    '维护数据代理行为、响应字段映射和请求方法。',
    $schema$
    {
      "columns": 2,
      "fields": [
        { "field": "enabled", "label": "启用数据代理", "component": "vxe-switch" },
        { "field": "autoLoad", "label": "自动加载", "component": "vxe-switch" },
        { "field": "seq", "label": "序号代理", "component": "vxe-switch" },
        { "field": "sort", "label": "排序代理", "component": "vxe-switch" },
        { "field": "filter", "label": "筛选代理", "component": "vxe-switch" },
        { "field": "form", "label": "表单代理", "component": "vxe-switch" },
        {
          "field": "props", "label": "响应字段映射", "component": "lc-sub-form",
          "props": { "schema": { "columns": 1, "fields": [
            { "field": "result", "label": "数据字段", "component": "vxe-input", "props": { "placeholder": "result" } },
            { "field": "total", "label": "总数字段", "component": "vxe-input", "props": { "placeholder": "total" } },
            { "field": "message", "label": "消息字段", "component": "vxe-input", "props": { "placeholder": "message" } }
          ], "layout": [], "actions": [] } }
        },
        {
          "field": "ajax", "label": "请求方法", "component": "lc-sub-form",
          "props": { "schema": { "columns": 1, "fields": [
            { "field": "query", "label": "查询方法", "component": "vxe-input" },
            { "field": "queryAll", "label": "全量查询方法", "component": "vxe-input" },
            { "field": "save", "label": "保存方法", "component": "vxe-input" },
            { "field": "delete", "label": "删除方法", "component": "vxe-input" }
          ], "layout": [], "actions": [] } }
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-edit-config',
    '数据表格设计 - 编辑配置',
    '维护编辑模式、触发方式和编辑状态。',
    $schema$
    {
      "columns": 2,
      "fields": [
        { "field": "enabled", "label": "启用编辑", "component": "vxe-switch" },
        {
          "field": "mode", "label": "编辑模式", "component": "vxe-select",
          "options": [{ "label": "默认", "value": "" }, { "label": "整行编辑", "value": "row" }, { "label": "单元格编辑", "value": "cell" }]
        },
        {
          "field": "trigger", "label": "触发方式", "component": "vxe-select",
          "options": [{ "label": "默认", "value": "" }, { "label": "手动", "value": "manual" }, { "label": "单击", "value": "click" }, { "label": "双击", "value": "dblclick" }]
        },
        { "field": "showStatus", "label": "显示编辑状态", "component": "vxe-switch" },
        { "field": "showIcon", "label": "显示状态图标", "component": "vxe-switch" },
        { "field": "autoClear", "label": "自动清除状态", "component": "vxe-switch" },
        { "field": "showUpdateStatus", "label": "显示更新状态", "component": "vxe-switch" },
        { "field": "showInsertStatus", "label": "显示新增状态", "component": "vxe-switch" },
        { "field": "activeMethod", "label": "激活校验方法", "component": "vxe-input" },
        { "field": "beforeEditMethod", "label": "编辑前置方法", "component": "vxe-input" }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-checkbox-config',
    '数据表格设计 - 复选配置',
    '维护复选字段、触发方式、保留状态和严格模式。',
    $schema$
    {
      "columns": 2,
      "fields": [
        { "field": "checkField", "label": "选中状态字段", "component": "vxe-input" },
        { "field": "labelField", "label": "标签字段", "component": "vxe-input" },
        {
          "field": "trigger", "label": "触发方式", "component": "vxe-select",
          "options": [{ "label": "默认", "value": "" }, { "label": "手动", "value": "manual" }, { "label": "单击", "value": "click" }, { "label": "双击", "value": "dblclick" }]
        },
        { "field": "showHeader", "label": "显示表头复选框", "component": "vxe-switch" },
        { "field": "reserve", "label": "保留选中状态", "component": "vxe-switch" },
        { "field": "range", "label": "启用范围选择", "component": "vxe-switch" },
        { "field": "highlight", "label": "高亮选中行", "component": "vxe-switch" },
        { "field": "strict", "label": "严格模式", "component": "vxe-switch" },
        { "field": "checkStrictly", "label": "严格勾选模式", "component": "vxe-switch" }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-radio-config',
    '数据表格设计 - 单选配置',
    '维护单选行键、触发方式、保留状态和严格模式。',
    $schema$
    {
      "columns": 2,
      "fields": [
        { "field": "checkRowKey", "label": "选中行键值", "component": "vxe-input" },
        { "field": "labelField", "label": "标签字段", "component": "vxe-input" },
        {
          "field": "trigger", "label": "触发方式", "component": "vxe-select",
          "options": [{ "label": "默认", "value": "" }, { "label": "手动", "value": "manual" }, { "label": "单击", "value": "click" }, { "label": "双击", "value": "dblclick" }]
        },
        { "field": "reserve", "label": "保留选中状态", "component": "vxe-switch" },
        { "field": "highlight", "label": "高亮选中行", "component": "vxe-switch" },
        { "field": "strict", "label": "严格模式", "component": "vxe-switch" }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-sort-config',
    '数据表格设计 - 排序配置',
    '维护远程排序、多列排序、排序方向和默认排序。',
    $schema$
    {
      "columns": 2,
      "fields": [
        { "field": "remote", "label": "远程排序", "component": "vxe-switch" },
        {
          "field": "trigger", "label": "触发方式", "component": "vxe-select",
          "options": [{ "label": "默认", "value": "" }, { "label": "手动", "value": "manual" }, { "label": "单击", "value": "click" }, { "label": "双击", "value": "dblclick" }]
        },
        { "field": "multiple", "label": "多列排序", "component": "vxe-switch" },
        { "field": "chronological", "label": "按点击顺序排序", "component": "vxe-switch" },
        {
          "field": "orders", "label": "排序方向选项", "component": "lc-array-table",
          "props": { "valueMode": "primitive", "valueField": "value", "valueTitle": "排序方向", "toolbarButtons": [{ "code": "add", "label": "新增", "command": "add", "status": "primary" }] }
        },
        {
          "field": "defaultSort", "label": "默认排序", "component": "lc-sub-form",
          "props": { "schema": { "columns": 1, "fields": [
            { "field": "field", "label": "排序字段", "component": "vxe-input" },
            { "field": "order", "label": "排序方向", "component": "vxe-select", "options": [{ "label": "升序", "value": "asc" }, { "label": "降序", "value": "desc" }] }
          ], "layout": [], "actions": [] } }
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-filter-config',
    '数据表格设计 - 筛选配置',
    '维护远程筛选、筛选图标、筛选底栏和筛选方法。',
    $schema${ "columns": 2, "fields": [
      { "field": "remote", "label": "远程筛选", "component": "vxe-switch" },
      { "field": "showIcon", "label": "显示筛选图标", "component": "vxe-switch" },
      { "field": "showFilterFooter", "label": "显示筛选底栏", "component": "vxe-switch" },
      { "field": "filterMethod", "label": "筛选方法", "component": "vxe-input" }
    ], "layout": [], "actions": [] }$schema$::jsonb
  ),
  (
    'grid-designer-tree-config',
    '数据表格设计 - 树形配置',
    '维护树形数据字段、图标、展开和懒加载行为。',
    $schema$
    {
      "columns": 2,
      "fields": [
        { "field": "transform", "label": "自动转换树结构", "component": "vxe-switch" },
        { "field": "rowField", "label": "行标识字段", "component": "vxe-input", "props": { "placeholder": "id" } },
        { "field": "parentField", "label": "父级字段", "component": "vxe-input", "props": { "placeholder": "parentId" } },
        { "field": "childrenField", "label": "子级字段", "component": "vxe-input", "props": { "placeholder": "children" } },
        { "field": "hasChild", "label": "子节点标识字段", "component": "vxe-input" },
        { "field": "indent", "label": "层级缩进", "component": "lc-number-input" },
        { "field": "showIcon", "label": "显示树图标", "component": "vxe-switch" },
        { "field": "expandAll", "label": "默认展开全部", "component": "vxe-switch" },
        { "field": "lazy", "label": "懒加载", "component": "vxe-switch" },
        { "field": "accordion", "label": "手风琴展开", "component": "vxe-switch" },
        {
          "field": "trigger", "label": "触发方式", "component": "vxe-select",
          "options": [{ "label": "默认", "value": "" }, { "label": "手动", "value": "manual" }, { "label": "单击", "value": "click" }, { "label": "双击", "value": "dblclick" }]
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-expand-config',
    '数据表格设计 - 展开配置',
    '维护展开行的触发方式、标签和图标。',
    $schema$
    {
      "columns": 2,
      "fields": [
        { "field": "expandAll", "label": "默认展开全部", "component": "vxe-switch" },
        { "field": "accordion", "label": "手风琴展开", "component": "vxe-switch" },
        { "field": "lazy", "label": "懒加载", "component": "vxe-switch" },
        {
          "field": "trigger", "label": "触发方式", "component": "vxe-select",
          "options": [{ "label": "默认", "value": "" }, { "label": "手动", "value": "manual" }, { "label": "单击", "value": "click" }, { "label": "双击", "value": "dblclick" }]
        },
        { "field": "labelField", "label": "标签字段", "component": "vxe-input" },
        { "field": "iconOpen", "label": "展开图标", "component": "vxe-input" },
        { "field": "iconClose", "label": "收起图标", "component": "vxe-input" },
        { "field": "visibleMethod", "label": "展开校验方法", "component": "vxe-input" }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-column-size-align',
    '数据表格设计 - 列尺寸与对齐',
    '维护单列最大宽度、表头对齐和表尾对齐。',
    $schema$
    {
      "columns": 1,
      "fields": [
        { "field": "maxWidth", "label": "最大宽度", "component": "vxe-input", "props": { "placeholder": "maxWidth" } },
        {
          "field": "headerAlign", "label": "表头对齐", "component": "vxe-select",
          "options": [{ "label": "默认", "value": "" }, { "label": "左对齐", "value": "left" }, { "label": "居中", "value": "center" }, { "label": "右对齐", "value": "right" }]
        },
        {
          "field": "footerAlign", "label": "表尾对齐", "component": "vxe-select",
          "options": [{ "label": "默认", "value": "" }, { "label": "左对齐", "value": "left" }, { "label": "居中", "value": "center" }, { "label": "右对齐", "value": "right" }]
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-column-display',
    '数据表格设计 - 列显示行为',
    '维护单列宽度调整和表头、表尾溢出行为。',
    $schema$
    {
      "columns": 1,
      "fields": [
        { "field": "resizable", "label": "可调整宽度", "component": "vxe-switch" },
        {
          "field": "showHeaderOverflow", "label": "表头溢出处理", "component": "vxe-select",
          "options": [
            { "label": "默认", "value": "" }, { "label": "启用", "value": true }, { "label": "禁用", "value": false },
            { "label": "显示省略号", "value": "ellipsis" }, { "label": "标题提示", "value": "title" }, { "label": "浮层提示", "value": "tooltip" }
          ]
        },
        {
          "field": "showFooterOverflow", "label": "表尾溢出处理", "component": "vxe-select",
          "options": [
            { "label": "默认", "value": "" }, { "label": "启用", "value": true }, { "label": "禁用", "value": false },
            { "label": "显示省略号", "value": "ellipsis" }, { "label": "标题提示", "value": "title" }, { "label": "浮层提示", "value": "tooltip" }
          ]
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-column-filters',
    '数据表格设计 - 列筛选项',
    '维护单列筛选项的标签、值和默认选中状态。',
    $schema$
    {
      "columns": 1,
      "fields": [
        {
          "field": "filters", "label": "筛选项", "component": "lc-array-table",
          "props": {
            "toolbarButtons": [{ "code": "add", "label": "新增筛选", "command": "add", "status": "primary" }],
            "rowKey": "__rowKey",
            "defaultRow": { "label": "筛选项", "value": "", "checked": false },
            "columns": [
              { "field": "label", "title": "标签", "minWidth": 110 },
              { "field": "value", "title": "值", "minWidth": 110 },
              { "field": "checked", "title": "默认选中", "component": "vxe-switch", "width": 86 }
            ]
          }
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  ),
  (
    'grid-designer-column-renderers',
    '数据表格设计 - 列渲染配置',
    '维护单元格渲染器、编辑渲染器和列参数。',
    $schema$
    {
      "columns": 1,
      "fields": [
        {
          "field": "cellRender", "label": "单元格渲染", "component": "lc-sub-form",
          "props": { "schema": { "columns": 1, "fields": [
            { "field": "name", "label": "渲染器名称", "component": "vxe-input", "props": { "placeholder": "VxeInput" } },
            {
              "field": "props", "label": "组件属性", "component": "lc-sub-form",
              "props": { "schema": { "columns": 1, "fields": [
                { "field": "placeholder", "label": "占位提示", "component": "vxe-input" },
                { "field": "clearable", "label": "可清空", "component": "vxe-switch" },
                { "field": "disabled", "label": "禁用", "component": "vxe-switch" },
                { "field": "readonly", "label": "只读", "component": "vxe-switch" }
              ], "layout": [], "actions": [] } }
            },
            {
              "field": "attrs", "label": "附加属性", "component": "lc-sub-form",
              "props": { "schema": { "columns": 1, "fields": [
                { "field": "placeholder", "label": "占位提示", "component": "vxe-input" },
                { "field": "clearable", "label": "可清空", "component": "vxe-switch" },
                { "field": "disabled", "label": "禁用", "component": "vxe-switch" },
                { "field": "readonly", "label": "只读", "component": "vxe-switch" }
              ], "layout": [], "actions": [] } }
            }
          ], "layout": [], "actions": [] } }
        },
        {
          "field": "editRender", "label": "编辑渲染", "component": "lc-sub-form",
          "props": { "schema": { "columns": 1, "fields": [
            { "field": "name", "label": "渲染器名称", "component": "vxe-input", "props": { "placeholder": "VxeInput" } },
            {
              "field": "props", "label": "组件属性", "component": "lc-sub-form",
              "props": { "schema": { "columns": 1, "fields": [
                { "field": "placeholder", "label": "占位提示", "component": "vxe-input" },
                { "field": "clearable", "label": "可清空", "component": "vxe-switch" },
                { "field": "disabled", "label": "禁用", "component": "vxe-switch" },
                { "field": "readonly", "label": "只读", "component": "vxe-switch" }
              ], "layout": [], "actions": [] } }
            },
            {
              "field": "attrs", "label": "附加属性", "component": "lc-sub-form",
              "props": { "schema": { "columns": 1, "fields": [
                { "field": "placeholder", "label": "占位提示", "component": "vxe-input" },
                { "field": "clearable", "label": "可清空", "component": "vxe-switch" },
                { "field": "disabled", "label": "禁用", "component": "vxe-switch" },
                { "field": "readonly", "label": "只读", "component": "vxe-switch" }
              ], "layout": [], "actions": [] } }
            }
          ], "layout": [], "actions": [] } }
        },
        {
          "field": "params", "label": "参数", "component": "lc-sub-form",
          "props": { "schema": { "columns": 1, "fields": [
            {
              "field": "type", "label": "格式化类型", "component": "vxe-select",
              "options": [
                { "label": "文本", "value": "text" }, { "label": "日期", "value": "date" },
                { "label": "日期时间", "value": "datetime" }, { "label": "货币", "value": "currency" },
                { "label": "数字", "value": "number" }, { "label": "枚举", "value": "enum" }
              ]
            },
            { "field": "emptyText", "label": "空值文本", "component": "vxe-input" },
            { "field": "locale", "label": "区域设置", "component": "vxe-input" },
            {
              "field": "options", "label": "格式选项", "component": "lc-sub-form",
              "props": { "schema": { "columns": 1, "fields": [
                { "field": "dateStyle", "label": "日期样式", "component": "vxe-input" },
                { "field": "timeStyle", "label": "时间样式", "component": "vxe-input" },
                { "field": "style", "label": "数字样式", "component": "vxe-input" },
                { "field": "currency", "label": "货币代码", "component": "vxe-input" },
                { "field": "minimumFractionDigits", "label": "最少小数位", "component": "lc-number-input" },
                { "field": "maximumFractionDigits", "label": "最多小数位", "component": "lc-number-input" }
              ], "layout": [], "actions": [] } }
            },
            {
              "field": "map", "label": "枚举映射", "component": "lc-sub-form",
              "props": { "schema": { "columns": 1, "fields": [], "layout": [], "actions": [] } }
            }
          ], "layout": [], "actions": [] } }
        }
      ],
      "layout": [],
      "actions": []
    }
    $schema$::jsonb
  )
),
master_schema as (
  select jsonb_build_object(
    'columns', 1,
    'fields', jsonb_agg(
      jsonb_build_object(
        'field', code,
        'label', replace(name, '数据表格设计 - ', ''),
        'component', 'lc-sub-form',
        'showTitle', false,
        'props', jsonb_build_object('schema', schema)
      )
      order by array_position(array[
        'grid-designer-columns',
        'grid-designer-column-size-align',
        'grid-designer-column-display',
        'grid-designer-column-filters',
        'grid-designer-column-renderers',
        'grid-designer-business-info',
        'grid-designer-grid-options',
        'grid-designer-form-settings',
        'grid-designer-row-config',
        'grid-designer-column-config',
        'grid-designer-pager-config',
        'grid-designer-toolbar-config',
        'grid-designer-proxy-config',
        'grid-designer-edit-config',
        'grid-designer-checkbox-config',
        'grid-designer-radio-config',
        'grid-designer-sort-config',
        'grid-designer-filter-config',
        'grid-designer-tree-config',
        'grid-designer-expand-config',
        'grid-designer-extra-props',
        'grid-designer-events'
      ]::text[], code)
    ),
    'layout', $layout$
    [
      {
        "kind": "tabs",
        "fillRemaining": true,
        "defaultKey": "columns",
        "tabs": [
          {
            "key": "columns",
            "label": "列设计",
            "blocks": [
              {
                "kind": "tabs",
                "defaultKey": "column-list",
                "tabs": [
                  { "key": "column-list", "label": "列配置", "blocks": [{ "kind": "field", "field": "grid-designer-columns" }] },
                  { "key": "column-size-align", "label": "尺寸与对齐", "blocks": [{ "kind": "field", "field": "grid-designer-column-size-align" }] },
                  { "key": "column-display", "label": "显示行为", "blocks": [{ "kind": "field", "field": "grid-designer-column-display" }] },
                  { "key": "column-filters", "label": "筛选项", "blocks": [{ "kind": "field", "field": "grid-designer-column-filters" }] },
                  { "key": "column-renderers", "label": "渲染配置", "blocks": [{ "kind": "field", "field": "grid-designer-column-renderers" }] }
                ]
              }
            ]
          },
          {
            "key": "info",
            "label": "表格信息设计",
            "blocks": [
              {
                "kind": "tabs",
                "defaultKey": "business",
                "tabs": [
                  { "key": "business", "label": "基础信息", "blocks": [{ "kind": "field", "field": "grid-designer-business-info" }] },
                  { "key": "options", "label": "表格参数", "blocks": [{ "kind": "field", "field": "grid-designer-grid-options" }] },
                  { "key": "form-settings", "label": "表单设置", "blocks": [{ "kind": "field", "field": "grid-designer-form-settings" }] },
                  { "key": "row-config", "label": "行配置", "blocks": [{ "kind": "field", "field": "grid-designer-row-config" }] },
                  { "key": "column-config", "label": "列配置", "blocks": [{ "kind": "field", "field": "grid-designer-column-config" }] },
                  { "key": "pager", "label": "分页", "blocks": [{ "kind": "field", "field": "grid-designer-pager-config" }] },
                  { "key": "toolbar", "label": "工具栏", "blocks": [{ "kind": "field", "field": "grid-designer-toolbar-config" }] },
                  { "key": "proxy", "label": "数据代理", "blocks": [{ "kind": "field", "field": "grid-designer-proxy-config" }] },
                  { "key": "edit", "label": "编辑", "blocks": [{ "kind": "field", "field": "grid-designer-edit-config" }] },
                  { "key": "checkbox", "label": "复选", "blocks": [{ "kind": "field", "field": "grid-designer-checkbox-config" }] },
                  { "key": "radio", "label": "单选", "blocks": [{ "kind": "field", "field": "grid-designer-radio-config" }] },
                  { "key": "sort", "label": "排序", "blocks": [{ "kind": "field", "field": "grid-designer-sort-config" }] },
                  { "key": "filter", "label": "筛选", "blocks": [{ "kind": "field", "field": "grid-designer-filter-config" }] },
                  { "key": "tree", "label": "树形", "blocks": [{ "kind": "field", "field": "grid-designer-tree-config" }] },
                  { "key": "expand", "label": "展开", "blocks": [{ "kind": "field", "field": "grid-designer-expand-config" }] },
                  { "key": "extra", "label": "扩展属性", "blocks": [{ "kind": "field", "field": "grid-designer-extra-props" }] }
                ]
              }
            ]
          },
          {
            "key": "events",
            "label": "事件属性",
            "blocks": [{ "kind": "field", "field": "grid-designer-events" }]
          }
        ]
      }
    ]
    $layout$::jsonb,
    'actions', '[]'::jsonb
  ) as schema
  from definitions
),
removed_legacy as (
  delete from public.lowcode_form_definitions target
  using definitions
  where target.code = definitions.code
  returning target.code
)
insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
select
  'grid-designer',
  '数据表格设计',
  '数据表格列、表格信息和事件属性的统一低代码表单。',
  schema,
  true
from master_schema
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

commit;
