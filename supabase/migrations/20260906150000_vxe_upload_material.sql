-- Database-backed VxeUpload material and its designer property schema.
begin;

insert into public.lowcode_materials (
  material_kind, code, label, description, category, renderer_type,
  source_path, source_text, source_hash, material_version, aliases,
  sort_order, manifest, dependencies, status, enabled, is_system
) values (
  'form', 'vxe-upload', '文件上传', '基于文件服务的安全文件/视频上传控件。',
  'form', 'vue-sfc', 'lowcode/form-materials/vxe-upload.vue',
  $material$
<template>
  <VxeUpload
    :model-value="items"
    :file-types="normalizedFileTypes"
    :multiple="multiple"
    :auto-submit="autoSubmit"
    :limit-size="limitSize"
    :show-list="showList"
    :show-upload-button="showUploadButton"
    :show-submit-button="showSubmitButton"
    :show-remove-button="showRemoveButton"
    :show-download-button="showDownloadButton"
    :show-preview="showPreview"
    :button-text="buttonText"
    :button-icon="buttonIcon"
    :disabled="Boolean(fieldProps.disabled)"
    :readonly="Boolean(fieldProps.readonly)"
    :upload-method="uploadMethod"
    :download-method="downloadMethod"
    :remove-method="removeMethod"
    @update:model-value="handleModelUpdate"
  />
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { VxeUpload } from 'vxe-pc-ui';
import { useLowCodeHost } from '/core/host';

const props = defineProps<{ field: any; modelValue: any }>();
const emit = defineEmits<{ 'update:modelValue': [value: any] }>();
const host = useLowCodeHost();
const fieldProps = computed(() => props.field?.props ?? {});
const multiple = computed(() => fieldProps.value.multiple === true);
const autoSubmit = computed(() => fieldProps.value.autoSubmit !== false);
const showList = computed(() => fieldProps.value.showList !== false);
const showUploadButton = computed(() => fieldProps.value.showUploadButton !== false);
const showSubmitButton = computed(() => fieldProps.value.showSubmitButton === true);
const showRemoveButton = computed(() => fieldProps.value.showRemoveButton !== false);
const showDownloadButton = computed(() => fieldProps.value.showDownloadButton === true);
const showPreview = computed(() => fieldProps.value.showPreview === true);
const buttonText = computed(() => fieldProps.value.buttonText || '选择视频');
const buttonIcon = computed(() => fieldProps.value.buttonIcon || 'ri-upload-cloud-2-line');
const limitSize = computed(() => fieldProps.value.limitSize || 2048);
const normalizedFileTypes = computed(() => {
  const value = fieldProps.value.fileTypes;
  if (Array.isArray(value)) return value.filter(Boolean).map((item: any) => String(item));
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return ['mp4', 'webm', 'mov', 'm4v'];
});
const items = ref<any[]>([]);
watch(() => props.modelValue, (value) => {
  const ids = Array.isArray(value) ? value.filter(Boolean).map(String) : (value ? [String(value)] : []);
  const previous = new Map(items.value.map((item) => [String(item.fileId), item]));
  items.value = ids.map((id) => previous.get(id) ?? ({ fileId: id, name: id, url: '' }));
}, { immediate: true });

function emitIds(ids: string[]) {
  emit('update:modelValue', multiple.value ? ids : (ids[0] ?? null));
}
function handleModelUpdate(value: any) {
  if (!Array.isArray(value) || value.length === 0) {
    items.value = [];
    emitIds([]);
  }
}
async function uploadMethod({ file, option, updateProgress }: any) {
  const api = host.getServiceApi();
  const intent = await api.invoke<any>('files', 'runAction', {
    resource: 'file_objects', operation: 'createUploadIntent',
    originalName: file.name, mimeType: file.type || null, sizeBytes: file.size,
    visibility: fieldProps.value.visibility || 'private',
    metadata: parseMetadata(fieldProps.value.metadataJson),
    bucket: fieldProps.value.bucket || undefined,
    folderPath: fieldProps.value.folderPath || undefined,
  });
  await putFile(file, intent.upload.signedUrl, updateProgress);
  const result = await api.invoke<any>('files', 'runAction', {
    resource: 'file_objects', operation: 'confirmUpload', fileId: intent.file.id, status: 'ready'
  });
  const saved = result?.file ?? intent.file;
  const item = { name: saved.originalName || file.name, fileId: saved.id, url: '' };
  items.value = multiple.value ? [...items.value, item] : [item];
  emitIds(items.value.map((entry) => String(entry.fileId)).filter(Boolean));
  return { ...option, ...item, response: saved };
}
async function putFile(file: File, url: string, updateProgress: (percent: number) => void) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) updateProgress(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`上传失败 (${xhr.status})`));
    xhr.onerror = () => reject(new Error('上传失败，请检查网络连接。'));
    xhr.open('PUT', url); xhr.setRequestHeader('x-upsert', 'false');
    const body = new FormData(); body.append('cacheControl', '3600'); body.append('', file); xhr.send(body);
  });
}
async function downloadMethod({ option }: any) {
  const id = option?.fileId;
  if (!id) return;
  const result = await host.getServiceApi().invoke<any>('files', 'runAction', {
    resource: 'file_objects', operation: 'getDownloadUrl', fileId: id, expiresInSeconds: 300
  });
  window.open(result.download.signedUrl, '_blank', 'noopener,noreferrer');
}
async function removeMethod({ option }: any) {
  const id = String(option?.fileId || '');
  items.value = items.value.filter((item) => item.fileId !== id);
  emitIds(items.value.map((item) => String(item.fileId)).filter(Boolean));
}
function parseMetadata(value: any) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}
</script>
    $material$,
  md5($material$<template><div>vxe-upload</div></template>$material$),
  '1.0.0', array['upload', 'file-upload'], 85,
  '{"implementationKey":"files-service-upload"}'::jsonb,
  '["/core/host","vxe-pc-ui"]'::jsonb, 'published', true, true
)
on conflict (material_kind, code) do update set
  label = excluded.label, description = excluded.description,
  source_path = excluded.source_path, source_text = excluded.source_text,
  source_hash = excluded.source_hash, material_version = excluded.material_version,
  aliases = excluded.aliases, sort_order = excluded.sort_order,
  manifest = excluded.manifest, dependencies = excluded.dependencies,
  status = 'published', enabled = true, updated_at = timezone('utc'::text, now());

update public.lowcode_materials
set source_hash = md5(source_text)
where material_kind = 'form' and code = 'vxe-upload';

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'material-prop.vxe-upload', '设计器属性 - 文件上传', '配置文件/视频上传控件的字段、限制和显示行为。',
  $schema${"componentKey":"vxe-upload","title":"文件上传属性","fields":[{"field":"__block._vid","target":"block","path":"_vid","label":"组件 ID","component":"vxe-input","valueKind":"string","props":{"disabled":true,"clearable":false}},{"field":"name","target":"props","path":"name","label":"字段绑定","component":"vxe-input","valueKind":"string","defaultValue":""},{"field":"label","target":"props","path":"label","label":"标签","component":"vxe-input","valueKind":"string","defaultValue":"视频文件"},{"field":"fileTypes","target":"props","path":"fileTypes","label":"允许扩展名","component":"lc-json-editor","valueKind":"raw","defaultValue":["mp4","webm","mov","m4v"],"props":{"rows":4,"jsonRootType":"array","jsonValueMode":"parsed"}},{"field":"multiple","target":"props","path":"multiple","label":"允许多文件","component":"vxe-switch","valueKind":"boolean","defaultValue":false},{"field":"limitSize","target":"props","path":"limitSize","label":"单文件大小上限 (MB)","component":"lc-number-input","valueKind":"number","defaultValue":2048,"props":{"min":1,"max":10240}},{"field":"showList","target":"props","path":"showList","label":"显示文件列表","component":"vxe-switch","valueKind":"boolean","defaultValue":true},{"field":"showUploadButton","target":"props","path":"showUploadButton","label":"显示上传按钮","component":"vxe-switch","valueKind":"boolean","defaultValue":true},{"field":"showRemoveButton","target":"props","path":"showRemoveButton","label":"显示删除按钮","component":"vxe-switch","valueKind":"boolean","defaultValue":true},{"field":"showDownloadButton","target":"props","path":"showDownloadButton","label":"显示下载按钮","component":"vxe-switch","valueKind":"boolean","defaultValue":false},{"field":"showPreview","target":"props","path":"showPreview","label":"显示预览","component":"vxe-switch","valueKind":"boolean","defaultValue":false},{"field":"buttonText","target":"props","path":"buttonText","label":"按钮文字","component":"vxe-input","valueKind":"string","defaultValue":"选择视频"},{"field":"buttonIcon","target":"props","path":"buttonIcon","label":"按钮图标","component":"vxe-input","valueKind":"string","defaultValue":"ri-upload-cloud-2-line"},{"field":"bucket","target":"props","path":"bucket","label":"存储桶","component":"vxe-input","valueKind":"string","defaultValue":""},{"field":"folderPath","target":"props","path":"folderPath","label":"文件夹路径","component":"vxe-input","valueKind":"string","defaultValue":"training"},{"field":"visibility","target":"props","path":"visibility","label":"可见性","component":"lc-option-select","valueKind":"raw","defaultValue":"private","options":[{"label":"私有","value":"private","rawValue":"private"},{"label":"公开","value":"public","rawValue":"public"}]},{"field":"metadataJson","target":"props","path":"metadataJson","label":"元数据 JSON","component":"lc-json-editor","valueKind":"raw","defaultValue":{},"props":{"rows":5,"jsonRootType":"object","jsonValueMode":"parsed"}},{"field":"__formSpan","target":"props","path":"__formSpan","label":"表单跨列","component":"lc-number-input","valueKind":"number","defaultValue":1,"props":{"min":1,"max":6}},{"field":"__formHelp","target":"props","path":"__formHelp","label":"帮助文本","component":"vxe-input","valueKind":"string","defaultValue":"支持 MP4、WebM、MOV、M4V 视频。"},{"field":"__styles.justifyContent","target":"styles","path":"justifyContent","label":"组件对齐","component":"lc-option-select","valueKind":"raw","defaultValue":"flex-start","options":[{"label":"左对齐","value":"flex-start","rawValue":"flex-start"},{"label":"居中","value":"center","rawValue":"center"},{"label":"右对齐","value":"flex-end","rawValue":"flex-end"}]},{"field":"__styles.tempPadding","target":"styles","path":"tempPadding","label":"统一内边距","component":"vxe-input","valueKind":"string","defaultValue":"0","syncTo":["paddingTop","paddingRight","paddingBottom","paddingLeft"]},{"field":"__styles.paddingTop","target":"styles","path":"paddingTop","label":"上内边距","component":"vxe-input","valueKind":"string","defaultValue":"0"},{"field":"__styles.paddingRight","target":"styles","path":"paddingRight","label":"右内边距","component":"vxe-input","valueKind":"string","defaultValue":"0"},{"field":"__styles.paddingBottom","target":"styles","path":"paddingBottom","label":"下内边距","component":"vxe-input","valueKind":"string","defaultValue":"0"},{"field":"__styles.paddingLeft","target":"styles","path":"paddingLeft","label":"左内边距","component":"vxe-input","valueKind":"string","defaultValue":"0"}],"layout":[{"kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础","blocks":[{"kind":"field","field":"__block._vid"},{"kind":"field","field":"name"},{"kind":"field","field":"label"},{"kind":"field","field":"fileTypes"},{"kind":"field","field":"multiple"},{"kind":"field","field":"limitSize"},{"kind":"field","field":"__formSpan"},{"kind":"field","field":"__formHelp"}]},{"key":"display","label":"显示","blocks":[{"kind":"field","field":"showList"},{"kind":"field","field":"showUploadButton"},{"kind":"field","field":"showRemoveButton"},{"kind":"field","field":"showDownloadButton"},{"kind":"field","field":"showPreview"},{"kind":"field","field":"buttonText"},{"kind":"field","field":"buttonIcon"}]},{"key":"storage","label":"存储","blocks":[{"kind":"field","field":"bucket"},{"kind":"field","field":"folderPath"},{"kind":"field","field":"visibility"},{"kind":"field","field":"metadataJson"}]},{"key":"style","label":"样式","blocks":[{"kind":"field","field":"__styles.justifyContent"},{"kind":"field","field":"__styles.tempPadding"},{"kind":"field","field":"__styles.paddingTop"},{"kind":"field","field":"__styles.paddingRight"},{"kind":"field","field":"__styles.paddingBottom"},{"kind":"field","field":"__styles.paddingLeft"}]}]}],"actions":[]}$schema$::jsonb, true
)
on conflict (code) do update set name = excluded.name, description = excluded.description, schema = excluded.schema, enabled = true, updated_at = timezone('utc'::text, now());

commit;
