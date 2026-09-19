-- Render image-only upload fields as images instead of creating a video player.
begin;

do $update_material$
declare
  v_source text;
begin
  select source_text into v_source
  from public.lowcode_materials
  where material_kind = 'form' and code = 'vxe-upload'
  for update;

  v_source := replace(v_source,
    E'class="lc-upload-preview"\n      aria-label="视频预览"',
    E'class="lc-upload-preview"\n      :aria-label="isImagePreview ? ''图片预览'' : ''视频预览''"');
  v_source := replace(v_source,
    E'title="重新加载视频"\n          aria-label="重新加载视频"',
    E':title="isImagePreview ? ''重新加载图片'' : ''重新加载视频''"\n          :aria-label="isImagePreview ? ''重新加载图片'' : ''重新加载视频''"');
  v_source := replace(v_source,
    E'<div class="lc-upload-preview__stage">\n        <div ref="playerContainer" class="lc-upload-preview__player"></div>',
    E'<div class="lc-upload-preview__stage" :class="{ ''lc-upload-preview__stage--image'': isImagePreview }">\n        <img\n          v-if="isImagePreview && activePreviewUrl"\n          class="lc-upload-preview__image"\n          :src="activePreviewUrl"\n          :alt="activePreviewName"\n        />\n        <div v-else ref="playerContainer" class="lc-upload-preview__player"></div>');
  v_source := replace(v_source,
    '正在加载视频...',
    '{{ isImagePreview ? ''正在加载图片...'' : ''正在加载视频...'' }}');
  v_source := replace(v_source,
    'const showPreview = computed(() => fieldProps.value.showPreview === true);',
    E'const showPreview = computed(() => fieldProps.value.showPreview === true);\nconst imageFileTypes = new Set([''jpg'', ''jpeg'', ''png'', ''gif'', ''webp'', ''bmp'', ''svg'', ''avif'']);');
  v_source := replace(v_source,
    E'const normalizedFileTypes = computed(() => {\n  const value = fieldProps.value.fileTypes;\n  if (Array.isArray(value)) return value.filter(Boolean).map((item: any) => String(item));\n  if (typeof value === ''string'') return value.split('','').map((item) => item.trim()).filter(Boolean);\n  return [''mp4'', ''webm'', ''mov'', ''m4v''];\n});',
    E'const normalizedFileTypes = computed(() => {\n  const value = fieldProps.value.fileTypes;\n  if (Array.isArray(value)) return value.filter(Boolean).map((item: any) => String(item).toLowerCase());\n  if (typeof value === ''string'') return value.split('','').map((item) => item.trim().toLowerCase()).filter(Boolean);\n  return [''mp4'', ''webm'', ''mov'', ''m4v''];\n});\nconst previewType = computed(() => {\n  const configured = String(fieldProps.value.previewType || '''').toLowerCase();\n  if (configured === ''image'' || configured === ''video'') return configured;\n  const fileTypes = normalizedFileTypes.value;\n  return fileTypes.length > 0 && fileTypes.every((type) => imageFileTypes.has(type)) ? ''image'' : ''video'';\n});\nconst isImagePreview = computed(() => previewType.value === ''image'');');
  v_source := replace(v_source,
    E'const activePreviewName = ref('''');\nconst previewLoading',
    E'const activePreviewName = ref('''');\nconst activePreviewUrl = ref('''');\nconst previewLoading');
  v_source := replace(v_source,
    E'activePreviewName.value = '''';\n      previewError.value',
    E'activePreviewName.value = '''';\n      activePreviewUrl.value = '''';\n      previewError.value');
  v_source := replace(v_source,
    E'activePreviewName.value = String(option?.name || id);\n  previewLoading.value',
    E'activePreviewName.value = String(option?.name || id);\n  activePreviewUrl.value = '''';\n  previewLoading.value');
  v_source := replace(v_source,
    'if (!signedUrl) throw new Error(''未获取到视频地址。'');',
    'if (!signedUrl) throw new Error(isImagePreview.value ? ''未获取到图片地址。'' : ''未获取到视频地址。'');');
  v_source := replace(v_source,
    E'option.mimeType = file.mimeType || option.mimeType || '''';\n    await nextTick();',
    E'option.mimeType = file.mimeType || option.mimeType || '''';\n    activePreviewUrl.value = signedUrl;\n    if (isImagePreview.value) return;\n    await nextTick();');
  v_source := replace(v_source,
    'previewError.value = error instanceof Error ? error.message : ''视频加载失败。'';',
    'previewError.value = error instanceof Error ? error.message : (isImagePreview.value ? ''图片加载失败。'' : ''视频加载失败。'');');
  v_source := replace(v_source,
    E'.lc-upload-preview__player {\n  width: 100%;\n  height: 100%;\n}',
    E'.lc-upload-preview__player {\n  width: 100%;\n  height: 100%;\n}\n\n.lc-upload-preview__stage--image {\n  background: #f8fafc;\n}\n\n.lc-upload-preview__image {\n  display: block;\n  width: 100%;\n  height: 100%;\n  object-fit: contain;\n}');

  update public.lowcode_materials
  set source_text = v_source,
      source_hash = '',
      material_version = '1.2.0',
      manifest = coalesce(manifest, '{}'::jsonb) || '{"imagePreview":"native-image"}'::jsonb,
      updated_at = timezone('utc'::text, now())
  where material_kind = 'form' and code = 'vxe-upload';
end;
$update_material$;

update public.lowcode_materials
set source_hash = md5(source_text)
where material_kind = 'form'
  and code = 'vxe-upload';

update public.lowcode_form_definitions
set schema = jsonb_set(
      schema,
      '{fields}',
      (
        select jsonb_agg(
          case
            when field.value->>'field' = 'showPreview' then
              field.value || '{"description":"图片使用普通图片预览，不显示视频播放控件。"}'::jsonb
            else field.value
          end
          order by field.ordinality
        )
        from jsonb_array_elements(schema->'fields') with ordinality as field(value, ordinality)
      ),
      false
    ),
    updated_at = timezone('utc'::text, now())
where code = 'material-prop.image'
  and enabled = true;

do $validation$
declare
  v_source text;
begin
  select source_text
  into v_source
  from public.lowcode_materials
  where material_kind = 'form'
    and code = 'vxe-upload';

  if v_source is null
    or position('v-if="isImagePreview && activePreviewUrl"' in v_source) = 0
    or position('const isImagePreview = computed' in v_source) = 0
    or position('if (isImagePreview.value) return;' in v_source) = 0
    or position('lc-upload-preview__image' in v_source) = 0
  then
    raise exception 'VxeUpload image preview update failed.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
