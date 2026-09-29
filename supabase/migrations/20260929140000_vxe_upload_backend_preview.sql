-- Route the database-backed upload material through the application API.
-- The browser no longer talks to Supabase Storage directly, while the form
-- value remains the durable file_objects.id used by existing forms.
begin;

do $update_material$
declare
  v_source text;
  v_upload_start integer;
  v_preview_start integer;
begin
  select source_text
    into v_source
    from public.lowcode_materials
   where material_kind = 'form'
     and code = 'vxe-upload'
   for update;

  if v_source is null then
    raise exception 'vxe-upload material is not installed.';
  end if;

  v_upload_start := position('async function uploadMethod({ file, option, updateProgress }: any) {' in v_source);
  v_preview_start := position('async function previewMethod({ option }: any) {' in v_source);

  if v_upload_start = 0 or v_preview_start = 0 or v_preview_start <= v_upload_start then
    raise exception 'vxe-upload upload implementation could not be located.';
  end if;

  v_source := substring(v_source from 1 for v_upload_start - 1) || $upload$
async function uploadMethod({ file, option, updateProgress }: any) {
  const result = await uploadThroughBackend(file, updateProgress);
  const saved = result?.file;
  if (!saved?.id) throw new Error('上传接口未返回文件记录。');
  const item = {
    name: saved.originalName || file.name,
    type: fileExtension(saved.originalName || file.name),
    mimeType: saved.mimeType || file.type || '',
    fileId: saved.id,
    url: '',
  };
  items.value = multiple.value ? [...items.value, item] : [item];
  emitIds(items.value.map((entry) => String(entry.fileId)).filter(Boolean));
  if (showPreview.value) void loadPreview(item);
  return { ...option, ...item, response: saved };
}

async function uploadThroughBackend(file: File, updateProgress: (percent: number) => void) {
  return await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('visibility', String(fieldProps.value.visibility || 'private'));
    form.append('metadata', JSON.stringify(parseMetadata(fieldProps.value.metadataJson)));
    if (fieldProps.value.bucket) form.append('bucket', String(fieldProps.value.bucket));
    if (fieldProps.value.folderPath) form.append('folderPath', String(fieldProps.value.folderPath));

    xhr.timeout = 180000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) updateProgress(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => {
      let payload: any = null;
      try { payload = JSON.parse(xhr.responseText); } catch { payload = null; }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.success && payload?.data?.file) {
        updateProgress(100);
        resolve(payload.data);
        return;
      }
      reject(new Error(payload?.message || xhr.responseText || `上传失败 (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('上传失败，请检查后端服务和网络连接。'));
    xhr.ontimeout = () => reject(new Error('上传超时，请稍后重试。'));
    xhr.open('POST', '/api/files/upload');
    const token = window.localStorage.getItem('enlearn_access_token');
    const accountId = window.localStorage.getItem('enlearn_active_account_id');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (accountId) xhr.setRequestHeader('X-Account-Id', accountId);
    xhr.setRequestHeader('X-Request-Id', `material-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    xhr.send(form);
  });
}

$upload$ || substring(v_source from v_preview_start);

  update public.lowcode_materials
     set source_text = v_source,
         source_hash = md5(v_source),
         material_version = '1.4.0',
         updated_at = timezone('utc'::text, now())
   where material_kind = 'form'
     and code = 'vxe-upload';
end;
$update_material$;

update public.lowcode_form_definitions
set schema = jsonb_set(
  schema,
  '{fields}',
  (
    select jsonb_agg(
      case
        when field.value ->> 'field' = 'imageUrl' then
          jsonb_set(
            field.value,
            '{props}',
            coalesce(field.value -> 'props', '{}'::jsonb) || jsonb_build_object(
              'showList', true,
              'showPreview', true,
              'previewType', 'image',
              'previewExpiresInSeconds', 86400
            ),
            true
          )
        else field.value
      end
      order by field.ordinality
    )
    from jsonb_array_elements(schema -> 'fields') with ordinality as field(value, ordinality)
  ),
  true
),
updated_at = timezone('utc', now())
where code = 'print-designer.background'
  and enabled
  and jsonb_typeof(schema -> 'fields') = 'array';

do $validation$
declare
  v_source text;
  v_props jsonb;
begin
  select source_text
    into v_source
    from public.lowcode_materials
   where material_kind = 'form'
     and code = 'vxe-upload';

  select field.value -> 'props'
    into v_props
    from public.lowcode_form_definitions definition
    cross join lateral jsonb_array_elements(definition.schema -> 'fields') field(value)
   where definition.code = 'print-designer.background'
     and definition.enabled
     and field.value ->> 'field' = 'imageUrl'
   limit 1;

  if position($marker$xhr.open('POST', '/api/files/upload')$marker$ in v_source) = 0
     or position($marker$operation: 'createUploadIntent'$marker$ in v_source) > 0 then
    raise exception 'vxe-upload backend upload migration did not install correctly.';
  end if;

  if coalesce((v_props ->> 'showPreview')::boolean, false) is not true then
    raise exception 'print-designer.background image preview is not enabled.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
