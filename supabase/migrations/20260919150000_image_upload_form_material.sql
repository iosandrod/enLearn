-- Register the image-upload visual material and its database-backed property form.
begin;

insert into public.system_option_items (
  source_code,
  label,
  value,
  status,
  sort_order,
  is_system,
  metadata
) values
  ('form_input_component_type', '图片上传', 'image',      'active', 85,  true, '{}'::jsonb),
  ('form_field_component_type', '图片上传', 'vxe-upload', 'active', 175, true, '{}'::jsonb)
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

update public.lowcode_materials
set aliases = case
      when coalesce(aliases, '{}'::text[]) @> array['image']::text[] then aliases
      else coalesce(aliases, '{}'::text[]) || array['image']::text[]
    end,
    updated_at = timezone('utc'::text, now())
where material_kind = 'form'
  and code = 'vxe-upload';

insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled
) values (
  'material-prop.image',
  '设计器属性 - 图片上传',
  '配置图片上传字段、文件限制、预览和存储行为。',
  $schema$
  {
    "componentKey": "image",
    "title": "图片上传属性",
    "fields": [
      {"field":"__block._vid","target":"block","path":"_vid","label":"组件 ID","component":"vxe-input","valueKind":"string","props":{"disabled":true,"clearable":false}},
      {"field":"name","target":"props","path":"name","label":"字段绑定","component":"vxe-select","valueKind":"string","defaultValue":"","optionsSourceKey":"__visualTableFields","props":{"clearable":true,"filterable":true,"allowCreate":true,"placeholder":"请选择或输入字段"}},
      {"field":"label","target":"props","path":"label","label":"标签","component":"vxe-input","valueKind":"string","defaultValue":"图片"},
      {"field":"required","target":"props","path":"required","label":"必填","component":"vxe-switch","valueKind":"boolean","defaultValue":false},
      {"field":"modelValue","target":"props","path":"modelValue","label":"默认文件 ID","component":"vxe-input","valueKind":"string","defaultValue":""},
      {"field":"fileTypes","target":"props","path":"fileTypes","label":"允许图片格式","component":"lc-json-editor","valueKind":"raw","defaultValue":["jpg","jpeg","png","gif","webp","bmp","svg"],"props":{"rows":4,"jsonRootType":"array","jsonValueMode":"parsed"}},
      {"field":"multiple","target":"props","path":"multiple","label":"允许多图","component":"vxe-switch","valueKind":"boolean","defaultValue":false},
      {"field":"limitSize","target":"props","path":"limitSize","label":"单图大小上限 (MB)","component":"lc-number-input","valueKind":"number","defaultValue":10,"props":{"min":1,"max":100}},
      {"field":"autoSubmit","target":"props","path":"autoSubmit","label":"选择后自动上传","component":"vxe-switch","valueKind":"boolean","defaultValue":true},
      {"field":"showList","target":"props","path":"showList","label":"显示图片列表","component":"vxe-switch","valueKind":"boolean","defaultValue":true},
      {"field":"showUploadButton","target":"props","path":"showUploadButton","label":"显示选择按钮","component":"vxe-switch","valueKind":"boolean","defaultValue":true},
      {"field":"showSubmitButton","target":"props","path":"showSubmitButton","label":"显示上传按钮","component":"vxe-switch","valueKind":"boolean","defaultValue":false},
      {"field":"showRemoveButton","target":"props","path":"showRemoveButton","label":"显示删除按钮","component":"vxe-switch","valueKind":"boolean","defaultValue":true},
      {"field":"showDownloadButton","target":"props","path":"showDownloadButton","label":"显示下载按钮","component":"vxe-switch","valueKind":"boolean","defaultValue":false},
      {"field":"showPreview","target":"props","path":"showPreview","label":"显示图片预览","component":"vxe-switch","valueKind":"boolean","defaultValue":true},
      {"field":"buttonText","target":"props","path":"buttonText","label":"按钮文字","component":"vxe-input","valueKind":"string","defaultValue":"选择图片"},
      {"field":"buttonIcon","target":"props","path":"buttonIcon","label":"按钮图标","component":"vxe-input","valueKind":"string","defaultValue":"ri-image-add-line"},
      {"field":"bucket","target":"props","path":"bucket","label":"存储桶","component":"vxe-input","valueKind":"string","defaultValue":""},
      {"field":"folderPath","target":"props","path":"folderPath","label":"文件夹路径","component":"vxe-input","valueKind":"string","defaultValue":"images"},
      {"field":"visibility","target":"props","path":"visibility","label":"可见性","component":"lc-option-select","valueKind":"raw","defaultValue":"private","options":[{"label":"私有","value":"private","rawValue":"private"},{"label":"公开","value":"public","rawValue":"public"}]},
      {"field":"metadataJson","target":"props","path":"metadataJson","label":"元数据 JSON","component":"lc-json-editor","valueKind":"raw","defaultValue":{},"props":{"rows":5,"jsonRootType":"object","jsonValueMode":"parsed"}},
      {"field":"__formSpan","target":"props","path":"__formSpan","label":"表单跨列","component":"lc-number-input","valueKind":"number","defaultValue":1,"props":{"min":1,"max":6}},
      {"field":"__formHelp","target":"props","path":"__formHelp","label":"帮助文本","component":"vxe-input","valueKind":"string","defaultValue":"支持 JPG、PNG、GIF、WebP、BMP 和 SVG 图片。"},
      {"field":"__styles.justifyContent","target":"styles","path":"justifyContent","label":"组件对齐","component":"lc-option-select","valueKind":"raw","defaultValue":"flex-start","options":[{"label":"左对齐","value":"flex-start","rawValue":"flex-start"},{"label":"居中","value":"center","rawValue":"center"},{"label":"右对齐","value":"flex-end","rawValue":"flex-end"}]},
      {"field":"__styles.tempPadding","target":"styles","path":"tempPadding","label":"统一内边距","component":"vxe-input","valueKind":"string","defaultValue":"0","syncTo":["paddingTop","paddingRight","paddingBottom","paddingLeft"]},
      {"field":"__styles.paddingTop","target":"styles","path":"paddingTop","label":"上内边距","component":"vxe-input","valueKind":"string","defaultValue":"0"},
      {"field":"__styles.paddingRight","target":"styles","path":"paddingRight","label":"右内边距","component":"vxe-input","valueKind":"string","defaultValue":"0"},
      {"field":"__styles.paddingBottom","target":"styles","path":"paddingBottom","label":"下内边距","component":"vxe-input","valueKind":"string","defaultValue":"0"},
      {"field":"__styles.paddingLeft","target":"styles","path":"paddingLeft","label":"左内边距","component":"vxe-input","valueKind":"string","defaultValue":"0"}
    ],
    "layout": [
      {
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          {"key":"basic","label":"基础","blocks":[{"kind":"field","field":"__block._vid"},{"kind":"field","field":"name"},{"kind":"field","field":"label"},{"kind":"field","field":"required"},{"kind":"field","field":"modelValue"},{"kind":"field","field":"__formSpan"},{"kind":"field","field":"__formHelp"}]},
          {"key":"upload","label":"上传","blocks":[{"kind":"field","field":"fileTypes"},{"kind":"field","field":"multiple"},{"kind":"field","field":"limitSize"},{"kind":"field","field":"autoSubmit"}]},
          {"key":"display","label":"显示","blocks":[{"kind":"field","field":"showList"},{"kind":"field","field":"showUploadButton"},{"kind":"field","field":"showSubmitButton"},{"kind":"field","field":"showRemoveButton"},{"kind":"field","field":"showDownloadButton"},{"kind":"field","field":"showPreview"},{"kind":"field","field":"buttonText"},{"kind":"field","field":"buttonIcon"}]},
          {"key":"storage","label":"存储","blocks":[{"kind":"field","field":"bucket"},{"kind":"field","field":"folderPath"},{"kind":"field","field":"visibility"},{"kind":"field","field":"metadataJson"}]},
          {"key":"style","label":"样式","blocks":[{"kind":"field","field":"__styles.justifyContent"},{"kind":"field","field":"__styles.tempPadding"},{"kind":"field","field":"__styles.paddingTop"},{"kind":"field","field":"__styles.paddingRight"},{"kind":"field","field":"__styles.paddingBottom"},{"kind":"field","field":"__styles.paddingLeft"}]}
        ]
      }
    ],
    "actions": []
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled,
  updated_at = timezone('utc'::text, now());

do $validation$
declare
  v_image_option_count integer;
  v_runtime_option_count integer;
  v_material_count integer;
  v_schema jsonb;
begin
  select count(*)::integer
  into v_image_option_count
  from public.system_option_items
  where source_code = 'form_input_component_type'
    and value = 'image'
    and status = 'active';

  select count(*)::integer
  into v_runtime_option_count
  from public.system_option_items
  where source_code = 'form_field_component_type'
    and value = 'vxe-upload'
    and status = 'active';

  select count(*)::integer
  into v_material_count
  from public.lowcode_materials
  where material_kind = 'form'
    and code = 'vxe-upload'
    and enabled = true
    and status = 'published'
    and aliases @> array['image']::text[];

  select schema
  into v_schema
  from public.lowcode_form_definitions
  where code = 'material-prop.image'
    and enabled = true;

  if v_image_option_count <> 1
    or v_runtime_option_count <> 1
    or v_material_count <> 1
    or v_schema->>'componentKey' <> 'image'
    or jsonb_array_length(v_schema->'fields') < 20
    or v_schema#>>'{layout,0,kind}' <> 'tabs'
  then
    raise exception 'Image upload material validation failed: visual option %, runtime option %, material %, schema %.',
      v_image_option_count, v_runtime_option_count, v_material_count, v_schema;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
