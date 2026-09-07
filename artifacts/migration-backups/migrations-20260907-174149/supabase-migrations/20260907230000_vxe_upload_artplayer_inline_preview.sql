-- Add an inline ArtPlayer preview to the database-backed upload material.

begin;

update public.lowcode_materials
set source_text = $material$
<template>
  <div class="lc-upload-material">
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
      :preview-method="previewMethod"
      :remove-method="removeMethod"
      @update:model-value="handleModelUpdate"
    />

    <section
      v-if="showPreview && activePreviewId"
      class="lc-upload-preview"
      aria-label="视频预览"
    >
      <header class="lc-upload-preview__header">
        <span class="lc-upload-preview__title" :title="activePreviewName">
          {{ activePreviewName }}
        </span>
        <button
          class="lc-upload-preview__reload"
          type="button"
          title="重新加载视频"
          aria-label="重新加载视频"
          :disabled="previewLoading"
          @click="reloadPreview"
        >
          <i class="ri-refresh-line" aria-hidden="true"></i>
        </button>
      </header>
      <div class="lc-upload-preview__stage">
        <div ref="playerContainer" class="lc-upload-preview__player"></div>
        <div v-if="previewLoading" class="lc-upload-preview__state" role="status">
          正在加载视频...
        </div>
        <div v-else-if="previewError" class="lc-upload-preview__state lc-upload-preview__state--error" role="alert">
          <span>{{ previewError }}</span>
          <button type="button" @click="reloadPreview">重新加载</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { VxeUpload } from 'vxe-pc-ui';
import Artplayer from 'artplayer';
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
const playerContainer = ref<HTMLElement | null>(null);
const activePreviewId = ref('');
const activePreviewName = ref('');
const previewLoading = ref(false);
const previewError = ref('');
let player: any = null;
let previewRequest = 0;

watch(() => props.modelValue, (value) => {
  const ids = Array.isArray(value) ? value.filter(Boolean).map(String) : (value ? [String(value)] : []);
  const previous = new Map(items.value.map((item) => [String(item.fileId), item]));
  items.value = ids.map((id) => previous.get(id) ?? ({ fileId: id, name: id, url: '' }));
}, { immediate: true });

watch(
  [showPreview, () => items.value.map((item) => String(item.fileId || '')).filter(Boolean).join('|')],
  ([enabled]) => {
    if (!enabled || !items.value.length) {
      activePreviewId.value = '';
      activePreviewName.value = '';
      previewError.value = '';
      previewLoading.value = false;
      destroyPlayer();
      return;
    }
    const selected = items.value.find((item) => String(item.fileId) === activePreviewId.value) ?? items.value[0];
    void loadPreview(selected);
  },
  { immediate: true, flush: 'post' },
);

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

async function previewMethod({ option }: any) {
  await loadPreview(option);
}

async function reloadPreview() {
  const option = items.value.find((item) => String(item.fileId) === activePreviewId.value);
  if (option) await loadPreview(option);
}

async function loadPreview(option: any) {
  const id = String(option?.fileId || '');
  if (!id || !showPreview.value) return;
  const request = ++previewRequest;
  activePreviewId.value = id;
  activePreviewName.value = String(option?.name || id);
  previewLoading.value = true;
  previewError.value = '';
  destroyPlayer();

  try {
    const result = await host.getServiceApi().invoke<any>('files', 'runAction', {
      resource: 'file_objects', operation: 'getDownloadUrl', fileId: id,
      expiresInSeconds: Number(fieldProps.value.previewExpiresInSeconds || 7200),
    });
    if (request !== previewRequest) return;
    const signedUrl = String(result?.download?.signedUrl || '');
    if (!signedUrl) throw new Error('未获取到视频地址。');
    const file = result?.file ?? {};
    const fileName = String(file.originalName || option?.name || id);
    activePreviewName.value = fileName;
    option.name = fileName;
    option.type = fileExtension(fileName);
    option.mimeType = file.mimeType || option.mimeType || '';
    await nextTick();
    if (request !== previewRequest || !playerContainer.value) return;
    player = new Artplayer({
      container: playerContainer.value,
      url: signedUrl,
      title: fileName,
      autoplay: false,
      volume: 0.7,
      mutex: true,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      pip: true,
      theme: '#0f766e',
      lang: 'zh-cn',
      moreVideoAttr: {
        playsInline: true,
        preload: 'metadata',
      },
    });
    player.on('error', () => {
      if (request !== previewRequest) return;
      previewError.value = '视频无法播放，请检查文件格式或重新加载。';
    });
  } catch (error) {
    if (request !== previewRequest) return;
    previewError.value = error instanceof Error ? error.message : '视频加载失败。';
  } finally {
    if (request === previewRequest) previewLoading.value = false;
  }
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
  items.value = items.value.filter((item) => String(item.fileId) !== id);
  emitIds(items.value.map((item) => String(item.fileId)).filter(Boolean));
}

function destroyPlayer() {
  if (player) {
    player.destroy(false);
    player = null;
  }
  playerContainer.value?.replaceChildren();
}

function fileExtension(name: string) {
  const index = name.lastIndexOf('.');
  return index > -1 ? name.slice(index + 1).toLowerCase() : '';
}

function parseMetadata(value: any) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

onBeforeUnmount(() => {
  previewRequest += 1;
  destroyPlayer();
});
</script>

<style scoped>
.lc-upload-material {
  width: 100%;
  min-width: 0;
}

.lc-upload-preview {
  width: min(100%, 960px);
  margin-top: 12px;
}

.lc-upload-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  gap: 8px;
}

.lc-upload-preview__title {
  min-width: 0;
  overflow: hidden;
  color: #334155;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-upload-preview__reload {
  display: inline-flex;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #334155;
  cursor: pointer;
}

.lc-upload-preview__reload:disabled {
  cursor: wait;
  opacity: 0.55;
}

.lc-upload-preview__stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: 220px;
  overflow: hidden;
  border-radius: 4px;
  background: #111827;
}

.lc-upload-preview__player {
  width: 100%;
  height: 100%;
}

.lc-upload-preview__state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  background: #111827;
  color: #e5e7eb;
  font-size: 14px;
  text-align: center;
}

.lc-upload-preview__state--error {
  flex-direction: column;
}

.lc-upload-preview__state--error button {
  border: 1px solid #5eead4;
  border-radius: 4px;
  padding: 6px 12px;
  background: transparent;
  color: #99f6e4;
  cursor: pointer;
}

@media (max-width: 640px) {
  .lc-upload-preview__stage {
    min-height: 180px;
  }
}
</style>
    $material$,
    source_hash = '',
    material_version = '1.1.0',
    manifest = coalesce(manifest, '{}'::jsonb) || '{"implementationKey":"files-service-upload","previewPlayer":"artplayer","previewMode":"inline"}'::jsonb,
    dependencies = '["/core/host", "artplayer", "vxe-pc-ui"]'::jsonb,
    updated_at = timezone('utc'::text, now())
where material_kind = 'form'
  and code = 'vxe-upload';

update public.lowcode_materials
set source_hash = md5(source_text)
where material_kind = 'form'
  and code = 'vxe-upload';

do $validation$
begin
  if not exists (
    select 1
    from public.lowcode_materials
    where material_kind = 'form'
      and code = 'vxe-upload'
      and material_version = '1.1.0'
      and dependencies @> '["artplayer"]'::jsonb
  ) then
    raise exception 'VxeUpload ArtPlayer material update failed.';
  end if;
end;
$validation$;

with changed_pages as (
  select
    pages.id,
    jsonb_set(
      pages.schema,
      '{blocks,1,schema,fields}',
      (
        select jsonb_agg(
          case
            when field.value->>'field' = 'video_file_id' then
              jsonb_set(field.value, '{props,showPreview}', 'true'::jsonb, true)
            else field.value
          end
          order by field.ordinality
        )
        from jsonb_array_elements(pages.schema #> '{blocks,1,schema,fields}')
          with ordinality as field(value, ordinality)
      ),
      false
    ) as next_schema
  from public.lowcode_pages pages
  where pages.code = 'training-chapters-list-edit'
), updated_pages as (
  update public.lowcode_pages pages
  set
    schema = changed_pages.next_schema,
    version = pages.version + 1,
    published_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  from changed_pages
  where pages.id = changed_pages.id
    and changed_pages.next_schema is distinct from pages.schema
  returning pages.id, pages.version, pages.schema, pages.published_at
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from updated_pages
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

select pg_notify('pgrst', 'reload schema');

commit;
