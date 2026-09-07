-- Complete the database-driven training chapter edit page and enable uploads.
do $migration$
declare
  v_edit_page_id uuid;
begin
  insert into public.lowcode_pages (
    code, route, title, description, page_type, layout, status, keep_alive,
    schema, version, published_at
  ) values (
    'training-chapters-list-edit',
    '/dashboard/training/chapters/edit',
    '培训章节编辑',
    '维护章节信息并上传视频和培训课件。',
    'edit',
    'dashboard',
    'published',
    false,
    $json$
    {
      "schemaVersion": 1,
      "code": "training-chapters-list-edit",
      "route": "/dashboard/training/chapters/edit",
      "title": "培训章节编辑",
      "description": "维护章节信息并上传视频和培训课件。",
      "pageType": "edit",
      "layout": "dashboard",
      "status": "published",
      "keepAlive": false,
      "dataSources": {
        "training_chapters_editRows": {
          "key": "training_chapters_editRows",
          "label": "培训章节",
          "serviceName": "admin",
          "serviceMethod": "listItems",
          "saveMethod": "saveItem",
          "tableName": "training_chapters",
          "postData": {
            "tableName": "training_chapters",
            "filters": { "id": "{{ route.query.id }}" },
            "requiredFilters": ["id"],
            "limit": 1
          },
          "autoLoad": true
        },
        "training_courses_options": {
          "key": "training_courses_options",
          "label": "培训课程选项",
          "serviceName": "admin",
          "serviceMethod": "listItems",
          "tableName": "training_courses",
          "postData": {
            "tableName": "training_courses",
            "limit": 500,
            "orderBy": "sort_order",
            "orderDirection": "asc"
          },
          "autoLoad": true
        }
      },
      "blocks": [
        {
          "id": "training_chapters-edit-actions",
          "kind": "buttonGroup",
          "align": "left",
          "gap": 8,
          "actions": [
            {
              "code": "back",
              "label": "返回章节列表",
              "type": "button",
              "mode": "button",
              "icon": "ri-arrow-left-line",
              "route": "/dashboard/training/chapters"
            },
            {
              "code": "refresh",
              "label": "重新载入",
              "type": "button",
              "mode": "button",
              "icon": "ri-refresh-line",
              "directives": [
                {
                  "type": "refreshDataSource",
                  "sourceKeys": ["training_chapters_editRows", "training_courses_options"]
                }
              ]
            },
            {
              "code": "open-files",
              "label": "文件管理",
              "type": "button",
              "mode": "button",
              "icon": "ri-folder-upload-line",
              "route": "/dashboard/files"
            },
            {
              "code": "save",
              "label": "保存章节",
              "type": "button",
              "mode": "button",
              "status": "primary",
              "icon": "ri-save-3-line",
              "directives": [
                {
                  "type": "invokeService",
                  "sourceKey": "training_chapters_editRows",
                  "serviceMethod": "saveItem",
                  "postData": {
                    "tableName": "training_chapters",
                    "id": "{{ forms.training_chapters_edit_form.id }}",
                    "data": {
                      "course_id": "{{ forms.training_chapters_edit_form.course_id }}",
                      "title": "{{ forms.training_chapters_edit_form.title }}",
                      "description": "{{ forms.training_chapters_edit_form.description }}",
                      "sort_order": "{{ forms.training_chapters_edit_form.sort_order }}",
                      "video_file_id": "{{ forms.training_chapters_edit_form.video_file_id }}",
                      "ppt_file_id": "{{ forms.training_chapters_edit_form.ppt_file_id }}",
                      "duration_seconds": "{{ forms.training_chapters_edit_form.duration_seconds }}",
                      "status": "{{ forms.training_chapters_edit_form.status }}"
                    }
                  },
                  "assignTo": "training_chapters_saved"
                },
                {
                  "type": "navigate",
                  "route": "/dashboard/training/chapters"
                },
                {
                  "type": "showMessage",
                  "status": "success",
                  "message": "培训章节已保存。"
                }
              ]
            }
          ]
        },
        {
          "id": "training_chapters_edit_form",
          "kind": "form",
          "title": "章节信息",
          "sourceKey": "training_chapters_editRows",
          "submitSourceKey": "training_chapters_editRows",
          "initialValues": {
            "id": "",
            "course_id": "",
            "title": "",
            "description": "",
            "sort_order": 0,
            "video_file_id": null,
            "ppt_file_id": null,
            "duration_seconds": null,
            "status": "draft"
          },
          "schema": {
            "columns": 4,
            "fields": [
              {
                "field": "id",
                "label": "章节 ID",
                "component": "vxe-input",
                "span": 4,
                "props": { "disabled": true }
              },
              {
                "field": "course_id",
                "label": "所属课程",
                "component": "vxe-select",
                "span": 2,
                "props": {
                  "clearable": true,
                  "filterable": true,
                  "placeholder": "请选择培训课程"
                },
                "optionsSourceKey": "training_courses_options",
                "optionProps": { "label": "title", "value": "id" },
                "rules": [{ "required": true, "message": "请选择所属课程" }]
              },
              {
                "field": "title",
                "label": "章节名称",
                "component": "vxe-input",
                "span": 2,
                "props": { "clearable": true, "placeholder": "请输入章节名称" },
                "rules": [{ "required": true, "message": "请输入章节名称" }]
              },
              {
                "field": "description",
                "label": "章节说明",
                "component": "vxe-textarea",
                "span": 4,
                "props": { "rows": 4, "resize": "vertical", "placeholder": "请输入章节内容说明" }
              },
              {
                "field": "video_file_id",
                "label": "章节视频",
                "component": "vxe-upload",
                "span": 4,
                "props": {
                  "fileTypes": ["mp4", "webm", "mov", "m4v"],
                  "multiple": false,
                  "autoSubmit": true,
                  "limitSize": 50,
                  "showList": true,
                  "showUploadButton": true,
                  "showRemoveButton": true,
                  "showDownloadButton": true,
                  "showPreview": false,
                  "buttonText": "选择并上传视频",
                  "buttonIcon": "ri-video-upload-line",
                  "folderPath": "training/videos",
                  "visibility": "private",
                  "metadataJson": { "module": "training", "purpose": "chapter-video" }
                },
                "help": "支持 MP4、WebM、MOV、M4V，单个文件最大 50MB。"
              },
              {
                "field": "ppt_file_id",
                "label": "培训课件",
                "component": "vxe-upload",
                "span": 4,
                "props": {
                  "fileTypes": ["ppt", "pptx", "pdf"],
                  "multiple": false,
                  "autoSubmit": true,
                  "limitSize": 50,
                  "showList": true,
                  "showUploadButton": true,
                  "showRemoveButton": true,
                  "showDownloadButton": true,
                  "showPreview": false,
                  "buttonText": "选择并上传课件",
                  "buttonIcon": "ri-file-ppt-2-line",
                  "folderPath": "training/slides",
                  "visibility": "private",
                  "metadataJson": { "module": "training", "purpose": "chapter-slides" }
                },
                "help": "支持 PPT、PPTX 和 PDF，单个文件最大 50MB。"
              },
              {
                "field": "duration_seconds",
                "label": "视频时长（秒）",
                "component": "vxe-input",
                "span": 1,
                "props": { "type": "number", "min": 0, "placeholder": "0" }
              },
              {
                "field": "sort_order",
                "label": "章节排序",
                "component": "vxe-input",
                "span": 1,
                "props": { "type": "number", "min": 0, "placeholder": "0" }
              },
              {
                "field": "status",
                "label": "发布状态",
                "component": "vxe-select",
                "span": 2,
                "props": { "clearable": false, "placeholder": "请选择状态" },
                "options": [
                  { "label": "草稿", "value": "draft" },
                  { "label": "已发布", "value": "published" },
                  { "label": "已归档", "value": "archived" }
                ],
                "rules": [{ "required": true, "message": "请选择发布状态" }]
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
      description = '维护课程章节，并直接上传视频和培训课件。',
      schema = jsonb_set(
        jsonb_set(
          list_page.schema,
          '{blocks,1,schema,rowActions}',
          '{"edit":true,"editLabel":"编辑","delete":false}'::jsonb,
          true
        ),
        '{blocks,0,actions}',
        $actions$
        [
          {
            "code": "create",
            "label": "新增章节",
            "type": "button",
            "mode": "button",
            "status": "primary",
            "icon": "ri-add-line",
            "route": "/dashboard/training/chapters/edit"
          },
          {
            "code": "refresh",
            "label": "刷新",
            "type": "button",
            "mode": "button",
            "icon": "ri-refresh-line",
            "directives": [
              { "type": "refreshDataSource", "sourceKeys": ["training_chaptersRows"] }
            ]
          },
          {
            "code": "open-files",
            "label": "文件管理",
            "type": "button",
            "mode": "button",
            "icon": "ri-folder-upload-line",
            "route": "/dashboard/files"
          }
        ]
        $actions$::jsonb,
        true
      ),
      version = coalesce(list_page.version, 0) + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where list_page.code = 'training-chapters-list';

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  select id, version, schema, published_at
  from public.lowcode_pages
  where code = 'training-chapters-list'
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;

  insert into public.admin_routes (
    code, title, path, parent_id, route_type, icon, page_code, visible,
    keep_alive, layout, status, sort_order, metadata
  )
  select
    'training-chapters-list-edit', '培训章节编辑', '/dashboard/training/chapters/edit', root.id,
    'page', 'ri-video-upload-line', 'training-chapters-list-edit', false, false,
    'dashboard', 'active', 21,
    '{"group":"training","module":"training","entity":"training_chapters","navigation":"hidden"}'::jsonb
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

  perform pg_notify('pgrst', 'reload schema');
end;
$migration$;
