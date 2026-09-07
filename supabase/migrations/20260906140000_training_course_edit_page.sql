-- Database-only training course edit page.  The list page links to this
-- runtime page through lowcode_pages.edit_page_id; no frontend component is
-- required.
begin;

do $migration$
declare
  v_edit_page_id uuid;
begin
  insert into public.lowcode_pages (
    code, route, title, description, page_type, layout, status, keep_alive,
    schema, version, published_at
  ) values (
    'training-courses-list-edit',
    '/dashboard/training/courses/edit',
    '编辑培训课程',
    '维护课程编码、名称、简介、发布状态和排序。',
    'edit',
    'dashboard',
    'published',
    false,
    $json$
    {
      "schemaVersion": 1,
      "code": "training-courses-list-edit",
      "route": "/dashboard/training/courses/edit",
      "title": "编辑培训课程",
      "description": "维护课程编码、名称、简介、发布状态和排序。",
      "pageType": "edit",
      "layout": "dashboard",
      "status": "published",
      "keepAlive": false,
      "dataSources": {
        "training_courses_editRows": {
          "key": "training_courses_editRows",
          "label": "培训课程",
          "serviceName": "admin",
          "serviceMethod": "listItems",
          "saveMethod": "saveItem",
          "tableName": "training_courses",
          "postData": {
            "tableName": "training_courses",
            "filters": { "id": "{{ route.query.id }}" },
            "requiredFilters": ["id"],
            "limit": 1
          },
          "autoLoad": true
        }
      },
      "blocks": [
        {
          "id": "training_courses-edit-actions",
          "kind": "buttonGroup",
          "align": "left",
          "gap": 8,
          "actions": [
            {
              "code": "back",
              "label": "返回课程列表",
              "type": "button",
              "mode": "button",
              "icon": "ri-arrow-left-line",
              "route": "/dashboard/training/courses"
            },
            {
              "code": "refresh",
              "label": "重新载入",
              "type": "button",
              "mode": "button",
              "icon": "ri-refresh-line",
              "directives": [
                { "type": "refreshDataSource", "sourceKeys": ["training_courses_editRows"] }
              ]
            },
            {
              "code": "save",
              "label": "保存课程",
              "type": "button",
              "mode": "button",
              "status": "primary",
              "icon": "ri-save-3-line",
              "directives": [
                {
                  "type": "invokeService",
                  "sourceKey": "training_courses_editRows",
                  "serviceMethod": "saveItem",
                  "postData": {
                    "tableName": "training_courses",
                    "id": "{{ forms.training_courses_edit_form.id }}",
                    "data": {
                      "code": "{{ forms.training_courses_edit_form.code }}",
                      "title": "{{ forms.training_courses_edit_form.title }}",
                      "description": "{{ forms.training_courses_edit_form.description }}",
                      "status": "{{ forms.training_courses_edit_form.status }}",
                      "sort_order": "{{ forms.training_courses_edit_form.sort_order }}"
                    }
                  },
                  "assignTo": "training_courses_saved"
                },
                {
                  "type": "navigate",
                  "route": "/dashboard/training/courses"
                },
                {
                  "type": "showMessage",
                  "status": "success",
                  "message": "培训课程已保存。"
                }
              ]
            }
          ]
        },
        {
          "id": "training_courses_edit_form",
          "kind": "form",
          "title": "培训课程信息",
          "sourceKey": "training_courses_editRows",
          "submitSourceKey": "training_courses_editRows",
          "initialValues": {
            "id": "",
            "code": "",
            "title": "",
            "description": "",
            "status": "draft",
            "sort_order": 0
          },
          "schema": {
            "columns": 4,
            "fields": [
              {
                "field": "id",
                "label": "课程 ID",
                "component": "vxe-input",
                "span": 4,
                "props": { "disabled": true }
              },
              {
                "field": "code",
                "label": "课程编码",
                "component": "vxe-input",
                "span": 2,
                "props": { "clearable": true, "placeholder": "例如 product-development" },
                "rules": [{ "required": true, "message": "请输入课程编码" }]
              },
              {
                "field": "title",
                "label": "课程名称",
                "component": "vxe-input",
                "span": 2,
                "props": { "clearable": true, "placeholder": "例如 某产品开发培训" },
                "rules": [{ "required": true, "message": "请输入课程名称" }]
              },
              {
                "field": "description",
                "label": "课程简介",
                "component": "vxe-textarea",
                "span": 4,
                "props": { "rows": 5, "resize": "vertical", "placeholder": "请输入课程简介" }
              },
              {
                "field": "status",
                "label": "发布状态",
                "component": "vxe-select",
                "span": 2,
                "options": [
                  { "label": "草稿", "value": "draft" },
                  { "label": "已发布", "value": "published" },
                  { "label": "已归档", "value": "archived" }
                ],
                "rules": [{ "required": true, "message": "请选择发布状态" }]
              },
              {
                "field": "sort_order",
                "label": "排序",
                "component": "vxe-input",
                "span": 2,
                "props": { "type": "number", "min": 0 }
              }
            ],
            "actions": []
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
    updated_at = timezone('utc'::text, now())
  returning id into v_edit_page_id;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  select id, version, schema, published_at
  from public.lowcode_pages
  where id = v_edit_page_id
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;

  update public.lowcode_pages list_page
  set edit_page_id = v_edit_page_id,
      schema = jsonb_set(
        jsonb_set(
          list_page.schema,
          '{blocks,1,schema,rowActions}',
          '{"edit":true,"editLabel":"编辑","delete":false}'::jsonb,
          true
        ),
        '{blocks,0,actions}',
        coalesce(
          (
            select jsonb_agg(
              case
                when action_item.value->>'code' = 'create'
                  then action_item.value || '{"label":"新增课程"}'::jsonb
                else action_item.value
              end
              order by action_item.ordinality
            )
            from jsonb_array_elements(list_page.schema #> '{blocks,0,actions}')
              with ordinality as action_item(value, ordinality)
            where coalesce(action_item.value->>'route', '') <> '/dashboard/training/courses/edit'
          ),
          '[]'::jsonb
        ),
        true
      ),
      version = coalesce(list_page.version, 0) + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where list_page.code = 'training-courses-list';

  insert into public.admin_routes (
    code, title, path, parent_id, route_type, icon, page_code, visible,
    keep_alive, layout, status, sort_order, metadata
  )
  select
    'training-courses-list-edit', '编辑培训课程', '/dashboard/training/courses/edit', root.id,
    'page', 'ri-edit-2-line', 'training-courses-list-edit', false, false,
    'dashboard', 'active', 11,
    '{"group":"training","module":"training","entity":"training_courses","navigation":"hidden"}'::jsonb
  from public.admin_routes root
  where root.code = 'training-root'
  on conflict (code) do update set
    title = excluded.title,
    path = excluded.path,
    parent_id = excluded.parent_id,
    route_type = excluded.route_type,
    icon = excluded.icon,
    page_code = excluded.page_code,
    visible = false,
    keep_alive = false,
    layout = excluded.layout,
    status = 'active',
    sort_order = excluded.sort_order,
    metadata = excluded.metadata,
    updated_at = timezone('utc'::text, now());
end;
$migration$;

select pg_notify('pgrst', 'reload schema');
commit;
