with material_property_forms (
  code,
  name,
  description,
  component_key,
  layout
) as (
  values
    (
      'material-prop.form',
      '设计器属性 - 普通表单',
      '普通表单组件的属性面板 Tab 布局。',
      'form',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "blockId" },
            { "kind": "field", "field": "title" }
          ] },
          { "key": "data", "label": "数据", "blocks": [
            { "kind": "field", "field": "sourceKey" },
            { "kind": "field", "field": "submitSourceKey" },
            { "kind": "field", "field": "serviceName" },
            { "kind": "field", "field": "serviceMethod" },
            { "kind": "field", "field": "saveMethod" },
            { "kind": "field", "field": "postDataJson" },
            { "kind": "field", "field": "initialValuesJson" }
          ] },
          { "key": "structure", "label": "结构", "blocks": [
            { "kind": "field", "field": "fields" },
            { "kind": "field", "field": "slots.default.children" }
          ] },
          { "key": "actions", "label": "按钮", "blocks": [
            { "kind": "field", "field": "formActions" }
          ] },
          { "key": "behavior", "label": "行为", "blocks": [
            { "kind": "field", "field": "colon" },
            { "kind": "field", "field": "disabled" },
            { "kind": "field", "field": "readonly" },
            { "kind": "field", "field": "inputAlign" },
            { "kind": "field", "field": "labelAlign" },
            { "kind": "field", "field": "labelWidth" },
            { "kind": "field", "field": "errorMessageAlign" },
            { "kind": "field", "field": "scrollToError" },
            { "kind": "field", "field": "showError" },
            { "kind": "field", "field": "showErrorMessage" },
            { "kind": "field", "field": "submitOnEnter" },
            { "kind": "field", "field": "validateFirst" },
            { "kind": "field", "field": "validateTrigger" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.lowcode-edit-form',
      '设计器属性 - 编辑表单',
      '编辑表单组件的属性面板 Tab 布局。',
      'lowcode-edit-form',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "blockId" },
            { "kind": "field", "field": "title" }
          ] },
          { "key": "data", "label": "数据", "blocks": [
            { "kind": "field", "field": "sourceKey" },
            { "kind": "field", "field": "submitSourceKey" },
            { "kind": "field", "field": "serviceName" },
            { "kind": "field", "field": "serviceMethod" },
            { "kind": "field", "field": "saveMethod" },
            { "kind": "field", "field": "postDataJson" },
            { "kind": "field", "field": "initialValuesJson" }
          ] },
          { "key": "structure", "label": "字段", "blocks": [
            { "kind": "field", "field": "fields" }
          ] },
          { "key": "actions", "label": "按钮", "blocks": [
            { "kind": "field", "field": "formActions" },
            { "kind": "field", "field": "submitText" },
            { "kind": "field", "field": "resetText" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.lowcode-search-form',
      '设计器属性 - 查询表单',
      '查询表单组件的属性面板 Tab 布局。',
      'lowcode-search-form',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "blockId" },
            { "kind": "field", "field": "title" }
          ] },
          { "key": "data", "label": "数据", "blocks": [
            { "kind": "field", "field": "sourceKey" }
          ] },
          { "key": "structure", "label": "字段", "blocks": [
            { "kind": "field", "field": "fields" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.lowcode-grid',
      '设计器属性 - 数据表格',
      '数据表格组件的属性面板 Tab 布局。',
      'lowcode-grid',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "blockId" },
            { "kind": "field", "field": "title" }
          ] },
          { "key": "data", "label": "数据", "blocks": [
            { "kind": "field", "field": "sourceKey" },
            { "kind": "field", "field": "serviceName" },
            { "kind": "field", "field": "serviceMethod" },
            { "kind": "field", "field": "saveMethod" },
            { "kind": "field", "field": "deleteMethod" },
            { "kind": "field", "field": "postDataJson" },
            { "kind": "field", "field": "data" }
          ] },
          { "key": "columns", "label": "列", "blocks": [
            { "kind": "field", "field": "columns" }
          ] },
          { "key": "display", "label": "显示", "blocks": [
            { "kind": "field", "field": "showRowActions" },
            { "kind": "field", "field": "border" },
            { "kind": "field", "field": "stripe" },
            { "kind": "field", "field": "showOverflow" },
            { "kind": "field", "field": "height" },
            { "kind": "field", "field": "size" },
            { "kind": "field", "field": "rowConfig.keyField" },
            { "kind": "field", "field": "columnConfig.resizable" }
          ] },
          { "key": "interaction", "label": "交互", "blocks": [
            { "kind": "field", "field": "rowActions" },
            { "kind": "field", "field": "gridEvents" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.array-table',
      '设计器属性 - 表格输入',
      '表格输入组件的属性面板 Tab 布局。',
      'array-table',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "name" },
            { "kind": "field", "field": "label" },
            { "kind": "field", "field": "modelValue" },
            { "kind": "field", "field": "__formSpan" },
            { "kind": "field", "field": "__formHelp" }
          ] },
          { "key": "structure", "label": "结构", "blocks": [
            { "kind": "field", "field": "rowConfig.keyField" },
            { "kind": "field", "field": "columns" },
            { "kind": "field", "field": "data" }
          ] },
          { "key": "display", "label": "显示", "blocks": [
            { "kind": "field", "field": "border" },
            { "kind": "field", "field": "stripe" },
            { "kind": "field", "field": "showOverflow" },
            { "kind": "field", "field": "height" },
            { "kind": "field", "field": "size" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.input',
      '设计器属性 - 输入框',
      '输入框组件的属性面板 Tab 布局。',
      'input',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "name" },
            { "kind": "field", "field": "label" },
            { "kind": "field", "field": "modelValue" },
            { "kind": "field", "field": "type" },
            { "kind": "field", "field": "placeholder" },
            { "kind": "field", "field": "__formSpan" },
            { "kind": "field", "field": "__formHelp" }
          ] },
          { "key": "validation", "label": "校验", "blocks": [
            { "kind": "field", "field": "required" },
            { "kind": "field", "field": "disabled" },
            { "kind": "field", "field": "readonly" },
            { "kind": "field", "field": "error" },
            { "kind": "field", "field": "error-message" },
            { "kind": "field", "field": "error-message-align" },
            { "kind": "field", "field": "rules" }
          ] },
          { "key": "display", "label": "显示", "blocks": [
            { "kind": "field", "field": "colon" },
            { "kind": "field", "field": "border" },
            { "kind": "field", "field": "center" },
            { "kind": "field", "field": "input-align" },
            { "kind": "field", "field": "label-align" },
            { "kind": "field", "field": "label-width" },
            { "kind": "field", "field": "autosize" },
            { "kind": "field", "field": "maxlength" },
            { "kind": "field", "field": "show-word-limit" }
          ] },
          { "key": "icons", "label": "图标", "blocks": [
            { "kind": "field", "field": "left-icon" },
            { "kind": "field", "field": "right-icon" },
            { "kind": "field", "field": "arrow-direction" },
            { "kind": "field", "field": "icon-prefix" },
            { "kind": "field", "field": "clear-icon" }
          ] },
          { "key": "advanced", "label": "高级", "blocks": [
            { "kind": "field", "field": "clear-trigger" },
            { "kind": "field", "field": "clearable" },
            { "kind": "field", "field": "clickable" },
            { "kind": "field", "field": "format-trigger" },
            { "kind": "field", "field": "formatter" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.picker',
      '设计器属性 - 选择器',
      '选择器组件的属性面板 Tab 布局。',
      'picker',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "name" },
            { "kind": "field", "field": "label" },
            { "kind": "field", "field": "modelValue" },
            { "kind": "field", "field": "placeholder" }
          ] },
          { "key": "options", "label": "选项", "blocks": [
            { "kind": "field", "field": "columns" }
          ] },
          { "key": "validation", "label": "校验", "blocks": [
            { "kind": "field", "field": "required" },
            { "kind": "field", "field": "readonly" },
            { "kind": "field", "field": "error-message" },
            { "kind": "field", "field": "error-message-align" },
            { "kind": "field", "field": "rules" }
          ] },
          { "key": "display", "label": "显示", "blocks": [
            { "kind": "field", "field": "colon" },
            { "kind": "field", "field": "border" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.datetimepicker',
      '设计器属性 - 日期时间选择',
      '日期时间选择组件的属性面板 Tab 布局。',
      'datetimePicker',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "name" },
            { "kind": "field", "field": "label" },
            { "kind": "field", "field": "modelValue" },
            { "kind": "field", "field": "placeholder" },
            { "kind": "field", "field": "title" },
            { "kind": "field", "field": "type" },
            { "kind": "field", "field": "format" }
          ] },
          { "key": "options", "label": "选项", "blocks": [
            { "kind": "field", "field": "columnsOrder" },
            { "kind": "field", "field": "filter" },
            { "kind": "field", "field": "formatter" },
            { "kind": "field", "field": "itemHeight" },
            { "kind": "field", "field": "visibleItemCount" },
            { "kind": "field", "field": "swipeDuration" }
          ] },
          { "key": "display", "label": "显示", "blocks": [
            { "kind": "field", "field": "showToolbar" },
            { "kind": "field", "field": "loading" },
            { "kind": "field", "field": "confirmButtonText" },
            { "kind": "field", "field": "cancelButtonText" },
            { "kind": "field", "field": "colon" },
            { "kind": "field", "field": "border" }
          ] },
          { "key": "validation", "label": "校验", "blocks": [
            { "kind": "field", "field": "required" },
            { "kind": "field", "field": "readonly" },
            { "kind": "field", "field": "error-message" },
            { "kind": "field", "field": "error-message-align" },
            { "kind": "field", "field": "rules" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.stepper',
      '设计器属性 - 步进器',
      '步进器组件的属性面板 Tab 布局。',
      'stepper',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "name" },
            { "kind": "field", "field": "label" },
            { "kind": "field", "field": "modelValue" },
            { "kind": "field", "field": "min" },
            { "kind": "field", "field": "max" },
            { "kind": "field", "field": "step" },
            { "kind": "field", "field": "defaultValue" },
            { "kind": "field", "field": "placeholder" }
          ] },
          { "key": "controls", "label": "控制", "blocks": [
            { "kind": "field", "field": "allowEmpty" },
            { "kind": "field", "field": "decimalLength" },
            { "kind": "field", "field": "integer" },
            { "kind": "field", "field": "longPress" },
            { "kind": "field", "field": "disableInput" },
            { "kind": "field", "field": "disableMinus" },
            { "kind": "field", "field": "disablePlus" },
            { "kind": "field", "field": "showInput" },
            { "kind": "field", "field": "showMinus" },
            { "kind": "field", "field": "showPlus" }
          ] },
          { "key": "display", "label": "显示", "blocks": [
            { "kind": "field", "field": "buttonSize" },
            { "kind": "field", "field": "inputWidth" },
            { "kind": "field", "field": "theme" },
            { "kind": "field", "field": "colon" },
            { "kind": "field", "field": "border" }
          ] },
          { "key": "validation", "label": "校验", "blocks": [
            { "kind": "field", "field": "required" },
            { "kind": "field", "field": "disabled" },
            { "kind": "field", "field": "readonly" },
            { "kind": "field", "field": "error-message" },
            { "kind": "field", "field": "error-message-align" },
            { "kind": "field", "field": "rules" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.switch',
      '设计器属性 - 开关',
      '开关组件的属性面板 Tab 布局。',
      'switch',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "name" },
            { "kind": "field", "field": "label" },
            { "kind": "field", "field": "modelValue" },
            { "kind": "field", "field": "activeValue" },
            { "kind": "field", "field": "inactiveValue" }
          ] },
          { "key": "display", "label": "显示", "blocks": [
            { "kind": "field", "field": "activeColor" },
            { "kind": "field", "field": "inactiveColor" },
            { "kind": "field", "field": "size" },
            { "kind": "field", "field": "colon" },
            { "kind": "field", "field": "border" }
          ] },
          { "key": "validation", "label": "校验", "blocks": [
            { "kind": "field", "field": "required" },
            { "kind": "field", "field": "disabled" },
            { "kind": "field", "field": "readonly" },
            { "kind": "field", "field": "loading" },
            { "kind": "field", "field": "error-message" },
            { "kind": "field", "field": "error-message-align" },
            { "kind": "field", "field": "rules" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.radio',
      '设计器属性 - 单选框',
      '单选框组件的属性面板 Tab 布局。',
      'radio',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "name" },
            { "kind": "field", "field": "label" },
            { "kind": "field", "field": "modelValue" }
          ] },
          { "key": "options", "label": "选项", "blocks": [
            { "kind": "field", "field": "options" },
            { "kind": "field", "field": "direction" }
          ] },
          { "key": "validation", "label": "校验", "blocks": [
            { "kind": "field", "field": "required" },
            { "kind": "field", "field": "readonly" },
            { "kind": "field", "field": "error-message" },
            { "kind": "field", "field": "error-message-align" },
            { "kind": "field", "field": "rules" }
          ] },
          { "key": "display", "label": "显示", "blocks": [
            { "kind": "field", "field": "colon" },
            { "kind": "field", "field": "border" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.checkbox',
      '设计器属性 - 复选框',
      '复选框组件的属性面板 Tab 布局。',
      'checkbox',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "name" },
            { "kind": "field", "field": "label" },
            { "kind": "field", "field": "modelValue" }
          ] },
          { "key": "options", "label": "选项", "blocks": [
            { "kind": "field", "field": "options" },
            { "kind": "field", "field": "direction" }
          ] },
          { "key": "validation", "label": "校验", "blocks": [
            { "kind": "field", "field": "required" },
            { "kind": "field", "field": "readonly" },
            { "kind": "field", "field": "error-message" },
            { "kind": "field", "field": "error-message-align" },
            { "kind": "field", "field": "rules" }
          ] },
          { "key": "display", "label": "显示", "blocks": [
            { "kind": "field", "field": "colon" },
            { "kind": "field", "field": "border" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.rate',
      '设计器属性 - 评分',
      '评分组件的属性面板 Tab 布局。',
      'rate',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "name" },
            { "kind": "field", "field": "label" },
            { "kind": "field", "field": "modelValue" }
          ] },
          { "key": "display", "label": "显示", "blocks": [
            { "kind": "field", "field": "count" },
            { "kind": "field", "field": "size" },
            { "kind": "field", "field": "allow-half" },
            { "kind": "field", "field": "colon" },
            { "kind": "field", "field": "border" }
          ] },
          { "key": "validation", "label": "校验", "blocks": [
            { "kind": "field", "field": "required" },
            { "kind": "field", "field": "readonly" },
            { "kind": "field", "field": "error-message" },
            { "kind": "field", "field": "error-message-align" },
            { "kind": "field", "field": "rules" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.slider',
      '设计器属性 - 滑块',
      '滑块组件的属性面板 Tab 布局。',
      'slider',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "name" },
            { "kind": "field", "field": "label" },
            { "kind": "field", "field": "modelValue" },
            { "kind": "field", "field": "min" },
            { "kind": "field", "field": "max" },
            { "kind": "field", "field": "range" }
          ] },
          { "key": "display", "label": "显示", "blocks": [
            { "kind": "field", "field": "size" },
            { "kind": "field", "field": "colon" },
            { "kind": "field", "field": "border" }
          ] },
          { "key": "validation", "label": "校验", "blocks": [
            { "kind": "field", "field": "required" },
            { "kind": "field", "field": "readonly" },
            { "kind": "field", "field": "error-message" },
            { "kind": "field", "field": "error-message-align" },
            { "kind": "field", "field": "rules" }
          ] }
        ]
      }]
      $layout$::jsonb
    ),
    (
      'material-prop.sub-form',
      '设计器属性 - 子表单',
      '子表单组件的属性面板 Tab 布局。',
      'sub-form',
      $layout$
      [{
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          { "key": "basic", "label": "基础", "blocks": [
            { "kind": "field", "field": "__block._vid" },
            { "kind": "field", "field": "name" },
            { "kind": "field", "field": "label" },
            { "kind": "field", "field": "__formSpan" },
            { "kind": "field", "field": "__formHelp" }
          ] },
          { "key": "model", "label": "数据", "blocks": [
            { "kind": "field", "field": "modelValue" }
          ] },
          { "key": "schema", "label": "结构", "blocks": [
            { "kind": "field", "field": "schema" }
          ] }
        ]
      }]
      $layout$::jsonb
    )
)
insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled
)
select
  code,
  name,
  description,
  jsonb_build_object(
    'componentKey', component_key,
    'extendsVisualProps', true,
    'mergeBuiltinFields', true,
    'separateArrayTableTabs', true,
    'fields', '[]'::jsonb,
    'layout', layout,
    'actions', '[]'::jsonb
  ),
  true
from material_property_forms
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

notify pgrst, 'reload schema';
