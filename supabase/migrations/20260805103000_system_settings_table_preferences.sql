-- Expand the per-user default table preferences and organize them into focused tabs.

update public.lowcode_pages
set
  schema = jsonb_set(
    schema,
    '{blocks,2,tabs,1}',
    $table_tab$
    {
      "key": "table",
      "label": "表格体验",
      "blocks": [
        {
          "id": "system-settings-table-tabs",
          "kind": "tabs",
          "defaultKey": "table-basic",
          "tabs": [
            {
              "key": "table-basic",
              "label": "基础显示",
              "blocks": [
                {
                  "id": "system-settings-table-form",
                  "kind": "form",
                  "sourceKey": "systemSettings",
                  "submitSourceKey": "systemSettings",
                  "style": {
                    "border": "0",
                    "boxShadow": "none",
                    "background": "transparent",
                    "padding": "8px 2px 2px"
                  },
                  "initialValues": {
                    "table_config": {
                      "configVersion": 2,
                      "size": "medium",
                      "stripe": true,
                      "border": true,
                      "round": false,
                      "showHeader": true,
                      "showFooter": false,
                      "showOverflow": "tooltip",
                      "showHeaderOverflow": "tooltip",
                      "showFooterOverflow": "tooltip",
                      "autoHeight": true,
                      "height": 520,
                      "minHeight": 320,
                      "maxHeight": 900
                    }
                  },
                  "schema": {
                    "columns": 1,
                    "fields": [
                      {
                        "field": "table_config",
                        "label": "基础显示参数",
                        "component": "lc-sub-form",
                        "props": {
                          "schema": {
                            "columns": 3,
                            "fields": [
                              {
                                "field": "size",
                                "label": "表格密度",
                                "component": "vxe-select",
                                "options": [
                                  { "label": "紧凑", "value": "small" },
                                  { "label": "标准", "value": "medium" },
                                  { "label": "宽松", "value": "large" }
                                ]
                              },
                              {
                                "field": "showOverflow",
                                "label": "内容溢出",
                                "component": "vxe-select",
                                "options": [
                                  { "label": "悬浮提示", "value": "tooltip" },
                                  { "label": "省略号", "value": "ellipsis" },
                                  { "label": "原生标题", "value": "title" },
                                  { "label": "完整显示", "value": false }
                                ]
                              },
                              {
                                "field": "showHeaderOverflow",
                                "label": "表头溢出",
                                "component": "vxe-select",
                                "options": [
                                  { "label": "悬浮提示", "value": "tooltip" },
                                  { "label": "省略号", "value": "ellipsis" },
                                  { "label": "原生标题", "value": "title" },
                                  { "label": "完整显示", "value": false }
                                ]
                              },
                              {
                                "field": "showFooterOverflow",
                                "label": "表尾溢出",
                                "component": "vxe-select",
                                "options": [
                                  { "label": "悬浮提示", "value": "tooltip" },
                                  { "label": "省略号", "value": "ellipsis" },
                                  { "label": "原生标题", "value": "title" },
                                  { "label": "完整显示", "value": false }
                                ]
                              },
                              {
                                "field": "stripe",
                                "label": "斑马纹",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "border",
                                "label": "显示边框",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "round",
                                "label": "圆角表格",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "showHeader",
                                "label": "显示表头",
                                "component": "vxe-switch",
                                "props": { "openLabel": "显示", "closeLabel": "隐藏" }
                              },
                              {
                                "field": "showFooter",
                                "label": "显示表尾",
                                "component": "vxe-switch",
                                "props": { "openLabel": "显示", "closeLabel": "隐藏" }
                              },
                              {
                                "field": "autoHeight",
                                "label": "自动高度",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "height",
                                "label": "默认高度（px）",
                                "component": "lc-number-input",
                                "props": { "min": 160, "max": 2000, "digits": 0 }
                              },
                              {
                                "field": "minHeight",
                                "label": "最小高度（px）",
                                "component": "lc-number-input",
                                "props": { "min": 120, "max": 1600, "digits": 0 }
                              },
                              {
                                "field": "maxHeight",
                                "label": "最大高度（px）",
                                "component": "lc-number-input",
                                "props": { "min": 160, "max": 3000, "digits": 0 }
                              }
                            ],
                            "actions": []
                          }
                        }
                      }
                    ],
                    "actions": [
                      { "code": "submit", "label": "保存基础显示", "type": "submit", "status": "primary" },
                      { "code": "reset", "label": "恢复本次修改", "type": "reset" }
                    ]
                  }
                }
              ]
            },
            {
              "key": "table-row",
              "label": "行与表头",
              "blocks": [
                {
                  "id": "system-settings-table-row-form",
                  "kind": "form",
                  "sourceKey": "systemSettings",
                  "submitSourceKey": "systemSettings",
                  "style": {
                    "border": "0",
                    "boxShadow": "none",
                    "background": "transparent",
                    "padding": "8px 2px 2px"
                  },
                  "initialValues": {
                    "table_config": {
                      "rowHeight": 40,
                      "headerRowHeight": 42,
                      "footerRowHeight": 40,
                      "rowPadding": true,
                      "headerPadding": true,
                      "footerPadding": true,
                      "rowVerticalAlign": "middle",
                      "highlightHoverRow": true,
                      "highlightCurrentRow": true,
                      "rowResizable": false,
                      "rowDrag": false
                    }
                  },
                  "schema": {
                    "columns": 1,
                    "fields": [
                      {
                        "field": "table_config",
                        "label": "行与表头参数",
                        "component": "lc-sub-form",
                        "props": {
                          "schema": {
                            "columns": 3,
                            "fields": [
                              {
                                "field": "rowHeight",
                                "label": "数据行高（px）",
                                "component": "lc-number-input",
                                "props": { "min": 24, "max": 160, "digits": 0 }
                              },
                              {
                                "field": "headerRowHeight",
                                "label": "表头行高（px）",
                                "component": "lc-number-input",
                                "props": { "min": 24, "max": 160, "digits": 0 }
                              },
                              {
                                "field": "footerRowHeight",
                                "label": "表尾行高（px）",
                                "component": "lc-number-input",
                                "props": { "min": 24, "max": 160, "digits": 0 }
                              },
                              {
                                "field": "rowVerticalAlign",
                                "label": "内容垂直对齐",
                                "component": "vxe-select",
                                "options": [
                                  { "label": "顶部", "value": "top" },
                                  { "label": "居中", "value": "middle" },
                                  { "label": "底部", "value": "bottom" }
                                ]
                              },
                              {
                                "field": "rowPadding",
                                "label": "数据行内边距",
                                "component": "vxe-switch",
                                "props": { "openLabel": "保留", "closeLabel": "紧贴" }
                              },
                              {
                                "field": "headerPadding",
                                "label": "表头内边距",
                                "component": "vxe-switch",
                                "props": { "openLabel": "保留", "closeLabel": "紧贴" }
                              },
                              {
                                "field": "footerPadding",
                                "label": "表尾内边距",
                                "component": "vxe-switch",
                                "props": { "openLabel": "保留", "closeLabel": "紧贴" }
                              },
                              {
                                "field": "highlightHoverRow",
                                "label": "悬浮高亮行",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "highlightCurrentRow",
                                "label": "当前行高亮",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "rowResizable",
                                "label": "允许调整行高",
                                "component": "vxe-switch",
                                "props": { "openLabel": "允许", "closeLabel": "禁止" }
                              },
                              {
                                "field": "rowDrag",
                                "label": "允许拖拽行",
                                "component": "vxe-switch",
                                "props": { "openLabel": "允许", "closeLabel": "禁止" }
                              }
                            ],
                            "actions": []
                          }
                        }
                      }
                    ],
                    "actions": [
                      { "code": "submit", "label": "保存行与表头", "type": "submit", "status": "primary" },
                      { "code": "reset", "label": "恢复本次修改", "type": "reset" }
                    ]
                  }
                }
              ]
            },
            {
              "key": "table-column",
              "label": "列与交互",
              "blocks": [
                {
                  "id": "system-settings-table-column-form",
                  "kind": "form",
                  "sourceKey": "systemSettings",
                  "submitSourceKey": "systemSettings",
                  "style": {
                    "border": "0",
                    "boxShadow": "none",
                    "background": "transparent",
                    "padding": "8px 2px 2px"
                  },
                  "initialValues": {
                    "table_config": {
                      "columnResizable": true,
                      "highlightHoverColumn": false,
                      "highlightCurrentColumn": false,
                      "columnDrag": false,
                      "columnMinWidth": 100,
                      "maxFixedColumns": 4,
                      "multipleSort": false,
                      "chronologicalSort": false,
                      "allowClearSort": true,
                      "sortTrigger": "default",
                      "showSortIcon": true,
                      "multipleFilter": true,
                      "remoteFilter": false,
                      "showFilterIcon": true,
                      "filterTransfer": true,
                      "showFilterFooter": true,
                      "tooltipMode": "tooltip",
                      "tooltipShowAll": false,
                      "tooltipEnterable": true,
                      "tooltipEnterDelay": 300,
                      "tooltipLeaveDelay": 200,
                      "tooltipPlacement": "top"
                    }
                  },
                  "schema": {
                    "columns": 1,
                    "fields": [
                      {
                        "field": "table_config",
                        "label": "列、排序与筛选",
                        "component": "lc-sub-form",
                        "props": {
                          "schema": {
                            "columns": 3,
                            "fields": [
                              {
                                "field": "columnMinWidth",
                                "label": "默认列最小宽度（px）",
                                "component": "lc-number-input",
                                "props": { "min": 40, "max": 800, "digits": 0 }
                              },
                              {
                                "field": "maxFixedColumns",
                                "label": "最大固定列数",
                                "component": "lc-number-input",
                                "props": { "min": 0, "max": 20, "digits": 0 }
                              },
                              {
                                "field": "sortTrigger",
                                "label": "排序触发方式",
                                "component": "vxe-select",
                                "options": [
                                  { "label": "点击排序图标", "value": "default" },
                                  { "label": "点击整个表头", "value": "cell" }
                                ]
                              },
                              {
                                "field": "columnResizable",
                                "label": "允许调整列宽",
                                "component": "vxe-switch",
                                "props": { "openLabel": "允许", "closeLabel": "禁止" }
                              },
                              {
                                "field": "columnDrag",
                                "label": "允许拖拽列",
                                "component": "vxe-switch",
                                "props": { "openLabel": "允许", "closeLabel": "禁止" }
                              },
                              {
                                "field": "highlightHoverColumn",
                                "label": "悬浮高亮列",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "highlightCurrentColumn",
                                "label": "当前列高亮",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "multipleSort",
                                "label": "多列排序",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "chronologicalSort",
                                "label": "按触发顺序排序",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "allowClearSort",
                                "label": "允许取消排序",
                                "component": "vxe-switch",
                                "props": { "openLabel": "允许", "closeLabel": "禁止" }
                              },
                              {
                                "field": "showSortIcon",
                                "label": "显示排序图标",
                                "component": "vxe-switch",
                                "props": { "openLabel": "显示", "closeLabel": "隐藏" }
                              },
                              {
                                "field": "multipleFilter",
                                "label": "筛选多选",
                                "component": "vxe-switch",
                                "props": { "openLabel": "允许", "closeLabel": "单选" }
                              },
                              {
                                "field": "remoteFilter",
                                "label": "服务端筛选",
                                "component": "vxe-switch",
                                "props": { "openLabel": "启用", "closeLabel": "本地" }
                              },
                              {
                                "field": "showFilterIcon",
                                "label": "显示筛选图标",
                                "component": "vxe-switch",
                                "props": { "openLabel": "显示", "closeLabel": "隐藏" }
                              },
                              {
                                "field": "filterTransfer",
                                "label": "筛选面板挂载到页面",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "showFilterFooter",
                                "label": "显示筛选操作区",
                                "component": "vxe-switch",
                                "props": { "openLabel": "显示", "closeLabel": "隐藏" }
                              },
                              {
                                "field": "tooltipMode",
                                "label": "提示模式",
                                "component": "vxe-select",
                                "options": [
                                  { "label": "组件提示", "value": "tooltip" },
                                  { "label": "省略号", "value": "ellipsis" },
                                  { "label": "原生标题", "value": "title" }
                                ]
                              },
                              {
                                "field": "tooltipPlacement",
                                "label": "提示位置",
                                "component": "vxe-select",
                                "options": [
                                  { "label": "上方", "value": "top" },
                                  { "label": "下方", "value": "bottom" },
                                  { "label": "左侧", "value": "left" },
                                  { "label": "右侧", "value": "right" }
                                ]
                              },
                              {
                                "field": "tooltipShowAll",
                                "label": "所有单元格提示",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "仅溢出" }
                              },
                              {
                                "field": "tooltipEnterable",
                                "label": "鼠标可进入提示",
                                "component": "vxe-switch",
                                "props": { "openLabel": "允许", "closeLabel": "禁止" }
                              },
                              {
                                "field": "tooltipEnterDelay",
                                "label": "提示延迟（ms）",
                                "component": "lc-number-input",
                                "props": { "min": 0, "max": 5000, "digits": 0 }
                              },
                              {
                                "field": "tooltipLeaveDelay",
                                "label": "隐藏延迟（ms）",
                                "component": "lc-number-input",
                                "props": { "min": 0, "max": 5000, "digits": 0 }
                              }
                            ],
                            "actions": []
                          }
                        }
                      }
                    ],
                    "actions": [
                      { "code": "submit", "label": "保存列与交互", "type": "submit", "status": "primary" },
                      { "code": "reset", "label": "恢复本次修改", "type": "reset" }
                    ]
                  }
                }
              ]
            },
            {
              "key": "table-pager",
              "label": "分页与性能",
              "blocks": [
                {
                  "id": "system-settings-table-pager-form",
                  "kind": "form",
                  "sourceKey": "systemSettings",
                  "submitSourceKey": "systemSettings",
                  "style": {
                    "border": "0",
                    "boxShadow": "none",
                    "background": "transparent",
                    "padding": "8px 2px 2px"
                  },
                  "initialValues": {
                    "table_config": {
                      "pageSize": 20,
                      "pageSizes": [10, 20, 50, 100],
                      "pagerBackground": true,
                      "pagerAutoHidden": false,
                      "pagerCount": 7,
                      "showPageSize": true,
                      "showPageJump": true,
                      "showPageTotal": true,
                      "virtualXEnabled": true,
                      "virtualXThreshold": 20,
                      "virtualXOverscan": 2,
                      "virtualYEnabled": true,
                      "virtualYThreshold": 100,
                      "virtualYOverscan": 10,
                      "scrollToLeftOnChange": true,
                      "scrollToTopOnChange": true
                    }
                  },
                  "schema": {
                    "columns": 1,
                    "fields": [
                      {
                        "field": "table_config",
                        "label": "分页与虚拟滚动",
                        "component": "lc-sub-form",
                        "props": {
                          "schema": {
                            "columns": 3,
                            "fields": [
                              {
                                "field": "pageSize",
                                "label": "默认每页条数",
                                "component": "lc-number-input",
                                "props": { "min": 5, "max": 500, "digits": 0 }
                              },
                              {
                                "field": "pagerCount",
                                "label": "页码按钮数量",
                                "component": "lc-number-input",
                                "props": { "min": 3, "max": 21, "digits": 0 }
                              },
                              {
                                "field": "pagerBackground",
                                "label": "分页按钮背景",
                                "component": "vxe-switch",
                                "props": { "openLabel": "显示", "closeLabel": "透明" }
                              },
                              {
                                "field": "pagerAutoHidden",
                                "label": "单页自动隐藏",
                                "component": "vxe-switch",
                                "props": { "openLabel": "隐藏", "closeLabel": "显示" }
                              },
                              {
                                "field": "showPageSize",
                                "label": "显示每页条数",
                                "component": "vxe-switch",
                                "props": { "openLabel": "显示", "closeLabel": "隐藏" }
                              },
                              {
                                "field": "showPageJump",
                                "label": "显示页码跳转",
                                "component": "vxe-switch",
                                "props": { "openLabel": "显示", "closeLabel": "隐藏" }
                              },
                              {
                                "field": "showPageTotal",
                                "label": "显示总条数",
                                "component": "vxe-switch",
                                "props": { "openLabel": "显示", "closeLabel": "隐藏" }
                              },
                              {
                                "field": "virtualXEnabled",
                                "label": "横向虚拟滚动",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "virtualXThreshold",
                                "label": "横向启用阈值（列）",
                                "component": "lc-number-input",
                                "props": { "min": 0, "max": 500, "digits": 0 }
                              },
                              {
                                "field": "virtualXOverscan",
                                "label": "横向预渲染列数",
                                "component": "lc-number-input",
                                "props": { "min": 0, "max": 50, "digits": 0 }
                              },
                              {
                                "field": "virtualYEnabled",
                                "label": "纵向虚拟滚动",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "关闭" }
                              },
                              {
                                "field": "virtualYThreshold",
                                "label": "纵向启用阈值（行）",
                                "component": "lc-number-input",
                                "props": { "min": 0, "max": 10000, "digits": 0 }
                              },
                              {
                                "field": "virtualYOverscan",
                                "label": "纵向预渲染行数",
                                "component": "lc-number-input",
                                "props": { "min": 0, "max": 200, "digits": 0 }
                              },
                              {
                                "field": "scrollToLeftOnChange",
                                "label": "数据变化回到左侧",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "保持" }
                              },
                              {
                                "field": "scrollToTopOnChange",
                                "label": "数据变化回到顶部",
                                "component": "vxe-switch",
                                "props": { "openLabel": "开启", "closeLabel": "保持" }
                              },
                              {
                                "field": "pageSizes",
                                "label": "分页条数选项",
                                "component": "lc-json-editor",
                                "help": "请输入数字数组，例如 [10, 20, 50, 100]。",
                                "span": 3,
                                "props": { "rows": 4, "resize": "vertical" }
                              }
                            ],
                            "actions": []
                          }
                        }
                      }
                    ],
                    "actions": [
                      { "code": "submit", "label": "保存分页与性能", "type": "submit", "status": "primary" },
                      { "code": "reset", "label": "恢复本次修改", "type": "reset" }
                    ]
                  }
                }
              ]
            },
            {
              "key": "table-format",
              "label": "格式化",
              "blocks": [
                {
                  "id": "system-settings-table-format-form",
                  "kind": "form",
                  "sourceKey": "systemSettings",
                  "submitSourceKey": "systemSettings",
                  "style": {
                    "border": "0",
                    "boxShadow": "none",
                    "background": "transparent",
                    "padding": "8px 2px 2px"
                  },
                  "initialValues": {
                    "table_config": {
                      "emptyText": "--",
                      "numberDigits": 2,
                      "useGrouping": true,
                      "percentDigits": 2,
                      "dateFormat": "YYYY-MM-DD",
                      "dateTimeFormat": "YYYY-MM-DD HH:mm:ss",
                      "timeFormat": "HH:mm:ss",
                      "trueText": "是",
                      "falseText": "否",
                      "currency": "CNY"
                    }
                  },
                  "schema": {
                    "columns": 1,
                    "fields": [
                      {
                        "field": "table_config",
                        "label": "默认格式化规则",
                        "component": "lc-sub-form",
                        "props": {
                          "schema": {
                            "columns": 3,
                            "fields": [
                              { "field": "emptyText", "label": "空值显示", "component": "vxe-input", "props": { "placeholder": "例如 --" } },
                              {
                                "field": "numberDigits",
                                "label": "数字小数位",
                                "component": "lc-number-input",
                                "props": { "min": 0, "max": 12, "digits": 0 }
                              },
                              {
                                "field": "percentDigits",
                                "label": "百分比小数位",
                                "component": "lc-number-input",
                                "props": { "min": 0, "max": 8, "digits": 0 }
                              },
                              {
                                "field": "useGrouping",
                                "label": "数字千分位",
                                "component": "vxe-switch",
                                "props": { "openLabel": "启用", "closeLabel": "关闭" }
                              },
                              {
                                "field": "dateFormat",
                                "label": "日期格式",
                                "component": "vxe-select",
                                "options": [
                                  { "label": "2026-08-05", "value": "YYYY-MM-DD" },
                                  { "label": "2026/08/05", "value": "YYYY/MM/DD" },
                                  { "label": "05/08/2026", "value": "DD/MM/YYYY" },
                                  { "label": "08/05/2026", "value": "MM/DD/YYYY" }
                                ]
                              },
                              {
                                "field": "dateTimeFormat",
                                "label": "日期时间格式",
                                "component": "vxe-select",
                                "options": [
                                  { "label": "2026-08-05 14:30:00", "value": "YYYY-MM-DD HH:mm:ss" },
                                  { "label": "2026-08-05 14:30", "value": "YYYY-MM-DD HH:mm" },
                                  { "label": "2026/08/05 14:30:00", "value": "YYYY/MM/DD HH:mm:ss" },
                                  { "label": "05/08/2026 14:30", "value": "DD/MM/YYYY HH:mm" }
                                ]
                              },
                              {
                                "field": "timeFormat",
                                "label": "时间格式",
                                "component": "vxe-select",
                                "options": [
                                  { "label": "24 小时（含秒）", "value": "HH:mm:ss" },
                                  { "label": "24 小时", "value": "HH:mm" },
                                  { "label": "12 小时（含秒）", "value": "hh:mm:ss A" },
                                  { "label": "12 小时", "value": "hh:mm A" }
                                ]
                              },
                              {
                                "field": "currency",
                                "label": "默认币种",
                                "component": "vxe-select",
                                "options": [
                                  { "label": "人民币（CNY）", "value": "CNY" },
                                  { "label": "美元（USD）", "value": "USD" },
                                  { "label": "欧元（EUR）", "value": "EUR" },
                                  { "label": "日元（JPY）", "value": "JPY" },
                                  { "label": "港币（HKD）", "value": "HKD" }
                                ]
                              },
                              { "field": "trueText", "label": "布尔值：真", "component": "vxe-input" },
                              { "field": "falseText", "label": "布尔值：假", "component": "vxe-input" }
                            ],
                            "actions": []
                          }
                        }
                      }
                    ],
                    "actions": [
                      { "code": "submit", "label": "保存格式化规则", "type": "submit", "status": "primary" },
                      { "code": "reset", "label": "恢复本次修改", "type": "reset" }
                    ]
                  }
                }
              ]
            }
          ]
        }
      ]
    }
    $table_tab$::jsonb,
    false
  ),
  version = greatest(version, 1),
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now())
where code = 'system-settings-edit';

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'system-settings-edit'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

alter table public.system_config
  alter column table_config set default '{
    "configVersion": 2,
    "size": "medium",
    "stripe": true,
    "border": true,
    "round": false,
    "showHeader": true,
    "showFooter": false,
    "showOverflow": "tooltip",
    "showHeaderOverflow": "tooltip",
    "showFooterOverflow": "tooltip",
    "height": 520,
    "minHeight": 320,
    "maxHeight": 900,
    "pageSize": 20,
    "pageSizes": [10, 20, 50, 100],
    "autoHeight": true,
    "rowHeight": 40,
    "headerRowHeight": 42,
    "footerRowHeight": 40,
    "rowPadding": true,
    "headerPadding": true,
    "footerPadding": true,
    "rowVerticalAlign": "middle",
    "highlightHoverRow": true,
    "highlightCurrentRow": true,
    "rowResizable": false,
    "rowDrag": false,
    "columnResizable": true,
    "highlightHoverColumn": false,
    "highlightCurrentColumn": false,
    "columnDrag": false,
    "columnMinWidth": 100,
    "maxFixedColumns": 4,
    "multipleSort": false,
    "chronologicalSort": false,
    "allowClearSort": true,
    "sortTrigger": "default",
    "showSortIcon": true,
    "multipleFilter": true,
    "remoteFilter": false,
    "showFilterIcon": true,
    "filterTransfer": true,
    "showFilterFooter": true,
    "tooltipMode": "tooltip",
    "tooltipShowAll": false,
    "tooltipEnterable": true,
    "tooltipEnterDelay": 300,
    "tooltipLeaveDelay": 200,
    "tooltipPlacement": "top",
    "pagerBackground": true,
    "pagerAutoHidden": false,
    "pagerCount": 7,
    "showPageSize": true,
    "showPageJump": true,
    "showPageTotal": true,
    "virtualXEnabled": true,
    "virtualXThreshold": 20,
    "virtualXOverscan": 2,
    "virtualYEnabled": true,
    "virtualYThreshold": 100,
    "virtualYOverscan": 10,
    "scrollToLeftOnChange": true,
    "scrollToTopOnChange": true,
    "emptyText": "--",
    "numberDigits": 2,
    "useGrouping": true,
    "percentDigits": 2,
    "dateFormat": "YYYY-MM-DD",
    "dateTimeFormat": "YYYY-MM-DD HH:mm:ss",
    "timeFormat": "HH:mm:ss",
    "trueText": "是",
    "falseText": "否",
    "currency": "CNY"
  }'::jsonb;

update public.system_config
set table_config = '{
  "configVersion": 2,
  "size": "medium",
  "stripe": true,
  "border": true,
  "round": false,
  "showHeader": true,
  "showFooter": false,
  "showOverflow": "tooltip",
  "showHeaderOverflow": "tooltip",
  "showFooterOverflow": "tooltip",
  "height": 520,
  "minHeight": 320,
  "maxHeight": 900,
  "pageSize": 20,
  "pageSizes": [10, 20, 50, 100],
  "autoHeight": true,
  "rowHeight": 40,
  "headerRowHeight": 42,
  "footerRowHeight": 40,
  "rowPadding": true,
  "headerPadding": true,
  "footerPadding": true,
  "rowVerticalAlign": "middle",
  "highlightHoverRow": true,
  "highlightCurrentRow": true,
  "rowResizable": false,
  "rowDrag": false,
  "columnResizable": true,
  "highlightHoverColumn": false,
  "highlightCurrentColumn": false,
  "columnDrag": false,
  "columnMinWidth": 100,
  "maxFixedColumns": 4,
  "multipleSort": false,
  "chronologicalSort": false,
  "allowClearSort": true,
  "sortTrigger": "default",
  "showSortIcon": true,
  "multipleFilter": true,
  "remoteFilter": false,
  "showFilterIcon": true,
  "filterTransfer": true,
  "showFilterFooter": true,
  "tooltipMode": "tooltip",
  "tooltipShowAll": false,
  "tooltipEnterable": true,
  "tooltipEnterDelay": 300,
  "tooltipLeaveDelay": 200,
  "tooltipPlacement": "top",
  "pagerBackground": true,
  "pagerAutoHidden": false,
  "pagerCount": 7,
  "showPageSize": true,
  "showPageJump": true,
  "showPageTotal": true,
  "virtualXEnabled": true,
  "virtualXThreshold": 20,
  "virtualXOverscan": 2,
  "virtualYEnabled": true,
  "virtualYThreshold": 100,
  "virtualYOverscan": 10,
  "scrollToLeftOnChange": true,
  "scrollToTopOnChange": true,
  "emptyText": "--",
  "numberDigits": 2,
  "useGrouping": true,
  "percentDigits": 2,
  "dateFormat": "YYYY-MM-DD",
  "dateTimeFormat": "YYYY-MM-DD HH:mm:ss",
  "timeFormat": "HH:mm:ss",
  "trueText": "是",
  "falseText": "否",
  "currency": "CNY"
}'::jsonb || table_config;

select pg_notify('pgrst', 'reload schema');
