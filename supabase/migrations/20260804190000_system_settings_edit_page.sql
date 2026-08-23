-- Define the database-backed edit experience for per-user system settings.

insert into public.lowcode_pages (
  code,
  route,
  title,
  description,
  page_type,
  layout,
  status,
  keep_alive,
  schema,
  version,
  published_at
) values (
  'system-settings-edit',
  '/dashboard/system/settings/edit',
  U&'\7CFB\7EDF\8BBE\7F6E\7F16\8F91',
  U&'\6309\5F53\524D\7528\6237\7EF4\62A4\5916\89C2\3001\8868\683C\3001\672C\5730\5316\4E0E\6269\5C55\914D\7F6E\3002',
  'edit',
  'dashboard',
  'published',
  false,
  $json$
  {
    "schemaVersion": 1,
    "code": "system-settings-edit",
    "route": "/dashboard/system/settings/edit",
    "title": "系统设置编辑",
    "description": "按当前用户维护外观、表格、本地化与扩展配置。",
    "pageType": "edit",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": false,
    "dataSources": {
      "systemSettings": {
        "key": "systemSettings",
        "label": "当前用户系统设置",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "saveMethod": "saveItem",
        "entityCode": "system_config",
        "tableName": "system_config",
        "postData": {
          "resource": "system_config",
          "tableName": "system_config",
          "sorts": [
            {
              "field": "updated_at",
              "direction": "desc"
            }
          ],
          "limit": 1
        },
        "autoLoad": true
      }
    },
    "blocks": [
      {
        "id": "system-settings-edit-header",
        "kind": "container",
        "columns": 2,
        "gap": 8,
        "panel": false,
        "style": {
          "gridTemplateColumns": "minmax(0, 1fr) auto"
        },
        "blocks": [
          {
            "id": "system-settings-edit-intro",
            "kind": "text",
            "title": "系统设置",
            "content": "配置只对当前登录用户生效，各分区可独立保存。",
            "style": {
              "padding": "10px 14px"
            }
          },
          {
            "id": "system-settings-edit-actions",
            "kind": "buttonGroup",
            "align": "right",
            "gap": 8,
            "style": {
              "height": "100%",
              "padding": "10px"
            },
            "actions": [
              {
                "code": "back-to-settings",
                "label": "返回配置概览",
                "type": "button",
                "icon": "ri-arrow-left-line",
                "route": "/dashboard/system/settings"
              },
              {
                "code": "refresh",
                "label": "重新载入",
                "type": "button",
                "icon": "ri-refresh-line",
                "status": "info"
              }
            ]
          }
        ]
      },
      {
        "id": "system-settings-edit-scope",
        "kind": "text",
        "title": "配置范围",
        "content": "设置按当前登录用户独立保存；修改后请在当前分区点击保存，页面会重新读取数据库中的最新配置。",
        "tone": "muted",
        "style": {
          "padding": "10px 14px"
        }
      },
      {
        "id": "system-settings-edit-form",
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
          "theme_mode": "system",
          "primary_color": "#2563eb",
          "theme_config": {
            "colors": {
              "primary": "#2563eb",
              "success": "#16a34a",
              "warning": "#d97706",
              "danger": "#dc2626",
              "info": "#0891b2",
              "background": "#ffffff",
              "surface": "#f8fafc",
              "text": "#0f172a"
            },
            "radius": 6
          },
          "table_config": {
            "size": "medium",
            "stripe": true,
            "border": true,
            "showOverflow": "tooltip",
            "pageSize": 20,
            "pageSizes": [
              10,
              20,
              50,
              100
            ],
            "autoHeight": true
          },
          "language": "zh-CN",
          "locale_config": {
            "timezone": "UTC",
            "dateFormat": "YYYY-MM-DD",
            "timeFormat": "HH:mm:ss"
          },
          "id": "",
          "updated_at": "",
          "feature_flags": {},
          "metadata": {}
        },
        "schema": {
          "columns": 2,
          "fields": [
            {
              "field": "theme_mode",
              "label": "主题模式",
              "component": "vxe-radio-group",
              "props": {
                "type": "button"
              },
              "options": [
                {
                  "label": "跟随系统",
                  "value": "system"
                },
                {
                  "label": "浅色",
                  "value": "light"
                },
                {
                  "label": "深色",
                  "value": "dark"
                }
              ],
              "rules": [
                {
                  "required": true,
                  "message": "请选择主题模式"
                }
              ]
            },
            {
              "field": "primary_color",
              "label": "品牌主色",
              "component": "lc-color-picker",
              "help": "用于按钮、链接和选中状态等主要强调区域。",
              "props": {
                "clearable": false
              },
              "rules": [
                {
                  "required": true,
                  "message": "请选择品牌主色"
                }
              ]
            },
            {
              "field": "theme_config",
              "label": "主题细节",
              "component": "lc-sub-form",
              "span": 2,
              "props": {
                "schema": {
                  "columns": 2,
                  "fields": [
                    {
                      "field": "radius",
                      "label": "组件圆角（px）",
                      "component": "lc-number-input",
                      "props": {
                        "min": 0,
                        "max": 24,
                        "digits": 0
                      }
                    },
                    {
                      "field": "colors",
                      "label": "语义色板",
                      "component": "lc-sub-form",
                      "span": 2,
                      "props": {
                        "schema": {
                          "columns": 4,
                          "fields": [
                            {
                              "field": "primary",
                              "label": "主色",
                              "component": "lc-color-picker",
                              "props": {
                                "clearable": false
                              }
                            },
                            {
                              "field": "success",
                              "label": "成功",
                              "component": "lc-color-picker",
                              "props": {
                                "clearable": false
                              }
                            },
                            {
                              "field": "warning",
                              "label": "警告",
                              "component": "lc-color-picker",
                              "props": {
                                "clearable": false
                              }
                            },
                            {
                              "field": "danger",
                              "label": "危险",
                              "component": "lc-color-picker",
                              "props": {
                                "clearable": false
                              }
                            },
                            {
                              "field": "info",
                              "label": "信息",
                              "component": "lc-color-picker",
                              "props": {
                                "clearable": false
                              }
                            },
                            {
                              "field": "background",
                              "label": "页面背景",
                              "component": "lc-color-picker",
                              "props": {
                                "clearable": false
                              }
                            },
                            {
                              "field": "surface",
                              "label": "内容表面",
                              "component": "lc-color-picker",
                              "props": {
                                "clearable": false
                              }
                            },
                            {
                              "field": "text",
                              "label": "正文文字",
                              "component": "lc-color-picker",
                              "props": {
                                "clearable": false
                              }
                            }
                          ],
                          "actions": []
                        }
                      }
                    }
                  ],
                  "actions": []
                }
              }
            },
            {
              "field": "table_config",
              "label": "默认表格参数",
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
                        {
                          "label": "紧凑",
                          "value": "small"
                        },
                        {
                          "label": "标准",
                          "value": "medium"
                        },
                        {
                          "label": "宽松",
                          "value": "large"
                        }
                      ]
                    },
                    {
                      "field": "showOverflow",
                      "label": "内容溢出",
                      "component": "vxe-select",
                      "options": [
                        {
                          "label": "悬浮提示",
                          "value": "tooltip"
                        },
                        {
                          "label": "省略号",
                          "value": "ellipsis"
                        },
                        {
                          "label": "原生标题",
                          "value": "title"
                        }
                      ]
                    },
                    {
                      "field": "pageSize",
                      "label": "默认每页条数",
                      "component": "lc-number-input",
                      "props": {
                        "min": 5,
                        "max": 500,
                        "digits": 0
                      }
                    },
                    {
                      "field": "stripe",
                      "label": "斑马纹",
                      "component": "vxe-switch",
                      "props": {
                        "openLabel": "开启",
                        "closeLabel": "关闭"
                      }
                    },
                    {
                      "field": "border",
                      "label": "显示边框",
                      "component": "vxe-switch",
                      "props": {
                        "openLabel": "开启",
                        "closeLabel": "关闭"
                      }
                    },
                    {
                      "field": "autoHeight",
                      "label": "自动高度",
                      "component": "vxe-switch",
                      "props": {
                        "openLabel": "开启",
                        "closeLabel": "关闭"
                      }
                    },
                    {
                      "field": "pageSizes",
                      "label": "分页条数选项",
                      "component": "lc-json-editor",
                      "help": "请输入数字数组，例如 [10, 20, 50, 100]。",
                      "span": 3,
                      "props": {
                        "rows": 4,
                        "resize": "vertical"
                      }
                    }
                  ],
                  "actions": []
                }
              },
              "span": 2
            },
            {
              "field": "language",
              "label": "界面语言",
              "component": "vxe-select",
              "span": 2,
              "options": [
                {
                  "label": "简体中文",
                  "value": "zh-CN"
                },
                {
                  "label": "English",
                  "value": "en-US"
                }
              ],
              "rules": [
                {
                  "required": true,
                  "message": "请选择界面语言"
                }
              ]
            },
            {
              "field": "locale_config",
              "label": "区域格式",
              "component": "lc-sub-form",
              "span": 2,
              "props": {
                "schema": {
                  "columns": 3,
                  "fields": [
                    {
                      "field": "timezone",
                      "label": "时区",
                      "component": "vxe-select",
                      "options": [
                        {
                          "label": "协调世界时",
                          "value": "UTC"
                        },
                        {
                          "label": "中国标准时间",
                          "value": "Asia/Shanghai"
                        },
                        {
                          "label": "香港时间",
                          "value": "Asia/Hong_Kong"
                        },
                        {
                          "label": "日本标准时间",
                          "value": "Asia/Tokyo"
                        },
                        {
                          "label": "美国东部时间",
                          "value": "America/New_York"
                        },
                        {
                          "label": "英国时间",
                          "value": "Europe/London"
                        }
                      ]
                    },
                    {
                      "field": "dateFormat",
                      "label": "日期格式",
                      "component": "vxe-select",
                      "options": [
                        {
                          "label": "2026-08-04",
                          "value": "YYYY-MM-DD"
                        },
                        {
                          "label": "2026/08/04",
                          "value": "YYYY/MM/DD"
                        },
                        {
                          "label": "04/08/2026",
                          "value": "DD/MM/YYYY"
                        },
                        {
                          "label": "08/04/2026",
                          "value": "MM/DD/YYYY"
                        }
                      ]
                    },
                    {
                      "field": "timeFormat",
                      "label": "时间格式",
                      "component": "vxe-select",
                      "options": [
                        {
                          "label": "24 小时（含秒）",
                          "value": "HH:mm:ss"
                        },
                        {
                          "label": "24 小时",
                          "value": "HH:mm"
                        },
                        {
                          "label": "12 小时（含秒）",
                          "value": "hh:mm:ss A"
                        },
                        {
                          "label": "12 小时",
                          "value": "hh:mm A"
                        }
                      ]
                    }
                  ],
                  "actions": []
                }
              }
            },
            {
              "field": "id",
              "label": "配置 ID",
              "component": "vxe-input",
              "props": {
                "disabled": true
              }
            },
            {
              "field": "updated_at",
              "label": "最后更新时间",
              "component": "vxe-input",
              "props": {
                "disabled": true
              }
            },
            {
              "field": "feature_flags",
              "label": "功能开关 JSON",
              "component": "lc-json-editor",
              "help": "仅填写已接入系统的功能键；未知键会原样保存在数据库中。",
              "span": 2,
              "props": {
                "rows": 9,
                "resize": "vertical"
              }
            },
            {
              "field": "metadata",
              "label": "扩展元数据 JSON",
              "component": "lc-json-editor",
              "help": "用于保存扩展模块所需的附加配置。",
              "span": 2,
              "props": {
                "rows": 9,
                "resize": "vertical"
              }
            }
          ],
          "layout": [
            {
              "kind": "row",
              "columns": [
                {
                  "blocks": [
                    {
                      "kind": "tabs",
                      "defaultKey": "appearance",
                      "tabs": [
                        {
                          "key": "appearance",
                          "label": "外观主题",
                          "blocks": [
                            {
                              "kind": "field",
                              "field": "theme_mode"
                            },
                            {
                              "kind": "field",
                              "field": "primary_color"
                            },
                            {
                              "kind": "field",
                              "field": "theme_config"
                            }
                          ]
                        },
                        {
                          "key": "table",
                          "label": "表格体验",
                          "blocks": [
                            {
                              "kind": "field",
                              "field": "table_config"
                            }
                          ]
                        },
                        {
                          "key": "locale",
                          "label": "语言与地区",
                          "blocks": [
                            {
                              "kind": "field",
                              "field": "language"
                            },
                            {
                              "kind": "field",
                              "field": "locale_config"
                            }
                          ]
                        },
                        {
                          "key": "advanced",
                          "label": "功能与扩展",
                          "blocks": [
                            {
                              "kind": "field",
                              "field": "id"
                            },
                            {
                              "kind": "field",
                              "field": "updated_at"
                            },
                            {
                              "kind": "field",
                              "field": "feature_flags"
                            },
                            {
                              "kind": "field",
                              "field": "metadata"
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ],
          "actions": [
            {
              "code": "submit",
              "label": "保存系统设置",
              "type": "submit",
              "status": "primary"
            },
            {
              "code": "reset",
              "label": "恢复本次修改",
              "type": "reset"
            }
          ]
        }
      }
    ]
  }
  $json$::jsonb,
  1,
  timezone('utc'::text, now())
)
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = public.lowcode_pages.version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'system-settings-edit'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.lowcode_pages as list_page
set
  edit_page_id = edit_page.id,
  updated_at = timezone('utc'::text, now())
from public.lowcode_pages as edit_page
where list_page.code = 'system-settings'
  and edit_page.code = 'system-settings-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

select pg_notify('pgrst', 'reload schema');
