-- Adjust the user role page layout: hide block captions and keep one child-table tab.

update public.lowcode_pages
set
  schema = jsonb_set(
    jsonb_set(
      schema #- '{blocks,0,title}' #- '{blocks,1,title}' #- '{blocks,2,title}',
      '{blocks,2,defaultKey}',
      '"plan"'::jsonb,
      true
    ),
    '{blocks,2,tabs}',
    $json$
[
  {
    "key": "plan",
    "label": "Plan",
    "blocks": [
      {
        "id": "user-role-plan-grid",
        "kind": "grid",
        "sourceKey": "selectedRoleRows",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "height": 240,
            "rowConfig": {
              "keyField": "id",
              "isCurrent": true
            },
            "columns": [
              {
                "field": "id",
                "title": "角色ID",
                "minWidth": 260,
                "fixed": "left",
                "showOverflow": "tooltip"
              },
              {
                "field": "code",
                "title": "角色编码",
                "minWidth": 150
              },
              {
                "field": "name",
                "title": "角色名称",
                "minWidth": 150
              },
              {
                "field": "status",
                "title": "状态",
                "width": 96,
                "align": "center",
                "formatter": {
                  "type": "enum",
                  "map": {
                    "active": "启用",
                    "inactive": "停用"
                  },
                  "emptyText": "-"
                }
              },
              {
                "field": "is_system",
                "title": "系统角色",
                "width": 100,
                "align": "center",
                "formatter": {
                  "type": "enum",
                  "map": {
                    "true": "是",
                    "false": "否"
                  },
                  "emptyText": "否"
                }
              },
              {
                "field": "sort_order",
                "title": "排序",
                "width": 88,
                "align": "right",
                "formatter": {
                  "type": "number",
                  "emptyText": "0"
                }
              },
              {
                "field": "permission_count",
                "title": "权限数",
                "width": 96,
                "align": "right",
                "formatter": {
                  "type": "number",
                  "emptyText": "0"
                }
              },
              {
                "field": "permission_names",
                "title": "权限名称",
                "minWidth": 360,
                "showOverflow": "tooltip"
              },
              {
                "field": "description",
                "title": "描述",
                "minWidth": 220,
                "showOverflow": "tooltip"
              },
              {
                "field": "created_at",
                "title": "创建时间",
                "width": 180,
                "formatter": {
                  "type": "datetime",
                  "locale": "zh-CN",
                  "emptyText": "-"
                }
              },
              {
                "field": "updated_at",
                "title": "更新时间",
                "width": 180,
                "formatter": {
                  "type": "datetime",
                  "locale": "zh-CN",
                  "emptyText": "-"
                }
              }
            ]
          },
          "rowActions": {
            "edit": false,
            "delete": false
          }
        }
      }
    ]
  }
]
$json$::jsonb,
    true
  ),
  version = version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now())
where code = 'admin-system-users';

with published_page as (
  select id, version, schema
  from public.lowcode_pages
  where code = 'admin-system-users'
)
insert into public.lowcode_page_versions (
  page_id,
  version,
  schema,
  published_at
)
select
  id,
  version,
  schema,
  timezone('utc'::text, now())
from published_page
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;
