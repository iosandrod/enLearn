<template>
  <section class="label-designer-material" :aria-busy="busy">
    <slot name="header"></slot>
    <div v-if="message" class="label-designer-material__message" role="status">{{ message }}</div>
    <TldrawVue ref="designer" :show-template-controls="false" @ready="handleReady" @content-change="markDirty" />
  </section>
</template>

<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref, toRef } from 'vue';
import { useLowCodeHost } from '../../../core/host';
import { registerLowCodeMaterialRuntimeController } from '../../../runtime/material-controller-registry';
const props = defineProps<{
  block: Record<string, any>;
  resolvedData: Record<string, any>;
  formModels?: Record<string, any>;
  searchFilters?: Record<string, any>;
}>();
const host = useLowCodeHost();
const designer = ref<any>();
const busy = ref(false);
const dirty = ref(false);
const message = ref('');
const templateConfig: any = inject('printTemplateConfig');

const templateName = toRef(templateConfig, 'templateName');
const templateId = toRef(templateConfig, 'templateId');
const templateVersion = toRef(templateConfig, 'templateVersion');
const templateStatus = toRef(templateConfig, 'templateStatus');
const templateDirty = toRef(templateConfig, 'templateDirty');
let suppressDirty = false;

function emitTemplateInfo() {
  if (typeof window === 'undefined') return;
  const info = {
    name: templateName.value,
    status: templateStatus.value,
    dirty: templateDirty.value,
  };
  (window as Window & { __ENLEARN_PRINT_TEMPLATE_INFO__?: typeof info }).__ENLEARN_PRINT_TEMPLATE_INFO__ = info;
  window.dispatchEvent(new CustomEvent('enlearn:print-template-info-change', { detail: info }));
}

let unregisterRuntimeController = () => undefined;
let readyPromiseResolve: (() => void) | undefined;
const readyPromise = new Promise<void>((resolve) => { readyPromiseResolve = resolve; });

function editor() {
  return designer.value?.getEditor?.() ?? null;
}

function clone(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function workspace() {
  return clone(designer.value?.getWorkspaceTemplateConfig?.() ?? {});
}

function snapshot() {
  const instance = editor();
  if (!instance) throw new Error('标签设计器尚未就绪。');
  const shapeIds = instance.getCurrentPageShapeIdsSorted();
  const content = shapeIds.length ? instance.getContentFromCurrentPage(shapeIds) : null;
  return {
    content: clone(content ?? { shapes: [], bindings: [], assets: [], rootShapeIds: [], schema: {} }),
    workspace: workspace(),
  };
}

async function getTemplateInfo() {
  const instance = await waitForEditor();
  const currentPageId = instance.getCurrentPageId();
  const pages = [];
  for (const page of instance.getPages()) {
    const shapeIds = [...instance.getPageShapeIds(page.id)].sort();
    const pageContent = instance.getContentFromCurrentPage(shapeIds, page.id);
    const resolvedContent = await instance.resolveAssetsInContent(pageContent);
    if (resolvedContent) pages.push({ id: page.id, name: page.name, content: clone(resolvedContent) });
  }
  if (!pages.length) return null;
  const currentWorkspace = workspace();
  return {
    content: { pages: clone(pages), currentPageId, workspace: currentWorkspace },
    pages: clone(pages),
    currentPageId,
    workspace: currentWorkspace,
    templateId: templateId.value,
    templateName: templateName.value,
    templateStatus: templateStatus.value,
    templateVersion: templateVersion.value,
  };
}

async function waitForEditor() {
  if (!editor()) await readyPromise;
  const instance = editor();
  if (!instance) throw new Error('标签设计器尚未就绪。');
  return instance;
}

async function setData(value: unknown) {
  setTimeout(() => {// 
    if(designer.value&&designer.value.workspaceFitCanvas){//
      designer.value.workspaceFitCanvas();////
    }
   }, 10);
  if (!value || (typeof value !== 'object' && typeof value !== 'string')) {
    throw new Error('标签设计器 setData 的 value 必须是模板对象或 pages 数组。');
  }
  const parsedValue = typeof value === 'string' ? (() => {
    try { return JSON.parse(value); } catch { return value; }
  })() : value;
  const data = Array.isArray(parsedValue) ? { pages: parsedValue } : parsedValue as Record<string, any>;
  const instance = await waitForEditor();
  const parseObject = (input: any) => {
    if (typeof input !== 'string') return input;
    try { return JSON.parse(input); } catch { return input; }
  };
  const parsedContent = parseObject(data.content);
  const document = Array.isArray(parsedContent)
    ? { ...data, pages: parsedContent }
    : parsedContent && typeof parsedContent === 'object' ? parsedContent : data;
  const normalizePageContent = (input: any, pageId: string) => {
    const pageContent = parseObject(input);
    if (!pageContent || typeof pageContent !== 'object' || Array.isArray(pageContent)
      || !pageContent.schema || !Array.isArray(pageContent.shapes)
      || !Array.isArray(pageContent.rootShapeIds) || !Array.isArray(pageContent.assets)) return null;
    const rawShapes = pageContent.shapes.filter((shape: any) => shape && typeof shape === 'object'
      && typeof shape.id === 'string' && typeof shape.type === 'string' && typeof shape.typeName === 'string');
    const rawShapeIds = new Set(rawShapes.map((shape: any) => shape.id));
    const shapes = rawShapes.map((shape: any, index: number) => ({
      ...shape,
      x: Number.isFinite(shape.x) ? shape.x : 0,
      y: Number.isFinite(shape.y) ? shape.y : 0,
      rotation: Number.isFinite(shape.rotation) ? shape.rotation : 0,
      opacity: Number.isFinite(shape.opacity) ? shape.opacity : 1,
      index: typeof shape.index === 'string' && shape.index ? shape.index : `a${index + 1}`,
      meta: shape.meta && typeof shape.meta === 'object' ? shape.meta : {},
      parentId: typeof shape.parentId === 'string' && rawShapeIds.has(shape.parentId) ? shape.parentId : pageId,
    }));
    const shapeIds = new Set(shapes.map((shape: any) => shape.id));
    const rootShapeIds = [
      ...(Array.isArray(pageContent.rootShapeIds) ? pageContent.rootShapeIds : []),
      ...shapes.filter((shape: any) => shape.parentId === pageId).map((shape: any) => shape.id),
    ].filter((id: any, index: number, ids: any[]) => typeof id === 'string' && shapeIds.has(id) && ids.indexOf(id) === index);
    const bindings = (Array.isArray(pageContent.bindings) ? pageContent.bindings : []).filter((binding: any) => (
      binding && typeof binding === 'object' && typeof binding.id === 'string'
      && typeof binding.fromId === 'string' && typeof binding.toId === 'string'
      && shapeIds.has(binding.fromId) && shapeIds.has(binding.toId)
    ));
    return { schema: pageContent.schema, shapes, rootShapeIds, bindings, assets: pageContent.assets, users: Array.isArray(pageContent.users) ? pageContent.users : [] };
  };
  const parsedPages = parseObject(document.pages);
  const rawPages = Array.isArray(parsedPages) ? parsedPages : Array.isArray(data.pages) ? data.pages : [];
  const pages = rawPages.map((page: any) => {
    const parsedPage = parseObject(page);
    const parsedPageContent = parseObject(parsedPage?.content);
    const pageId = typeof parsedPage?.id === 'string' ? parsedPage.id.trim() : '';
    const content = pageId ? normalizePageContent(parsedPageContent?.content ?? parsedPageContent ?? parsedPage, pageId) : null;
    return content && pageId
      ? { id: pageId, name: typeof parsedPage.name === 'string' && parsedPage.name.trim() ? parsedPage.name : '页面', content }
      : null;
  }).filter(Boolean) as Array<{ id: string; name: string; content: Record<string, any> }>;

  const ensureStoreIsUsable = (instance.store as any).ensureStoreIsUsable;
  ensureStoreIsUsable?.call(instance.store);
  const loadedPageIds = new Map<string, any>();
  if (pages.length) {
    for (const page of pages) {
      if (!instance.getPage(page.id)) instance.createPage({ id: page.id, name: page.name });
      const pageRecord = instance.getPage(page.id);
      if (!pageRecord) continue;
      loadedPageIds.set(page.id, pageRecord.id);
      if (pageRecord.name !== page.name) instance.renamePage(pageRecord.id, page.name);
    }
    ensureStoreIsUsable?.call(instance.store);
    const firstPageId = loadedPageIds.get(pages[0].id);
    if (firstPageId && instance.getCurrentPageId() !== firstPageId) instance.setCurrentPage(firstPageId);
    const targetPageIds = new Set(loadedPageIds.values());
    for (const page of instance.getPages()) {
      if (!targetPageIds.has(page.id) && instance.getPages().length > 1) instance.deletePage(page.id);
    }
    ensureStoreIsUsable?.call(instance.store);
    for (const page of pages) {
      const pageId = loadedPageIds.get(page.id);
      if (!pageId) continue;
      ensureStoreIsUsable?.call(instance.store);
      if (instance.getCurrentPageId() !== pageId) instance.setCurrentPage(pageId);
      const oldIds = [...instance.getPageShapeIds(pageId)];
      if (oldIds.length) instance.deleteShapes(oldIds);
      instance.putContentOntoCurrentPage(clone(page.content), { preservePosition: true, preserveIds: false, select: false });
    }
    const requestedCurrent = document.currentPageId && loadedPageIds.get(document.currentPageId);
    const currentPageId = requestedCurrent || firstPageId;
    if (currentPageId && instance.getCurrentPageId() !== currentPageId) {
      ensureStoreIsUsable?.call(instance.store);
      instance.setCurrentPage(currentPageId);
    }
  } else {
    const oldIds = instance.getCurrentPageShapeIdsSorted();
    if (oldIds.length) instance.deleteShapes(oldIds);
    const singlePageContent = normalizePageContent(document, instance.getCurrentPageId());
    if (singlePageContent) instance.putContentOntoCurrentPage(clone(singlePageContent), { preservePosition: true, preserveIds: false, select: false });
  }
  instance.selectNone();

  const workspaceConfig = document.workspace && typeof document.workspace === 'object'
    ? document.workspace
    : data.workspace && typeof data.workspace === 'object' ? data.workspace : undefined;
  if (workspaceConfig) designer.value?.applyWorkspaceTemplateConfig?.(clone(workspaceConfig));
  if (typeof data.id === 'string' && data.id.trim()) templateId.value = data.id.trim();
  if (typeof data.name === 'string' && data.name.trim()) templateName.value = data.name.trim();
  if (data.status === 'draft' || data.status === 'active' || data.status === 'archived') templateStatus.value = data.status;
  if (Number.isInteger(data.version) && data.version > 0) templateVersion.value = data.version;
  dirty.value = false;
  emitTemplateInfo();
  return getTemplateInfo();
}

async function loadData(options: Record<string, any> = {}) {
  const requestedId = String(options?.templateId || '').trim();
  if (!requestedId) return getTemplateInfo();
  const api = host.getServiceApi();
  const rows = await api.invoke<any[]>('admin', 'listItems', {
    tableName: 'print_templates', filters: { id: requestedId }, page: 1, pageSize: 1, limit: 1,
  });
  const record = Array.isArray(rows) ? rows[0] : undefined;
  if (!record) throw new Error(`未找到打印模板：${requestedId}`);//
  await setData(record);
  return getTemplateInfo();//
}

async function save(options: Record<string, any> = {}) {
  if (options?.savedRecord && typeof options.savedRecord === 'object') {
    const result = options.savedRecord;
    templateId.value = String(result.id || templateId.value || '').trim();
    templateName.value = String(result.name || templateName.value || '新建模板');
    templateVersion.value = Number.isInteger(result.version) && result.version > 0 ? result.version : templateVersion.value;
    templateStatus.value = `数据库模板 · v${templateVersion.value}`;
    templateDirty.value = false;
    dirty.value = false;
    emitTemplateInfo();
    return result;
  }
  const info = options?.templateInfo && typeof options.templateInfo === 'object' ? options.templateInfo : await getTemplateInfo();
  if (!info?.content) throw new Error('模板内容尚未就绪，无法保存。');
  const api = host.getServiceApi();
  const id = String(templateId.value || props.block.templateId || host.getRoute().query?.templateId || '').trim();
  const payload = {
    name: String(templateName.value || props.block.templateName || '标签打印模板'),
    content: clone(info.content), workspace: clone(info.workspace || {}), status: 'active', version: templateVersion.value,
    metadata: { editor: 'tldraw-vue', source: 'lowcode-label-designer-static', schemaVersion: 1 },
  };
  const result = await api.invoke<any>('admin', 'saveItem', { resource: 'print_templates', ...(id ? { id } : {}), data: payload });
  templateId.value = String(result?.id || id || '').trim();
  templateName.value = String(result?.name || payload.name);
  templateVersion.value = Number.isInteger(result?.version) && result.version > 0 ? result.version : templateVersion.value;
  templateStatus.value = `数据库模板 · v${templateVersion.value}`;
  templateDirty.value = false;
  dirty.value = false;
  message.value = `模板“${templateName.value}”已保存`;
  emitTemplateInfo();
  return result;
}

async function resetData() {
  const instance = await waitForEditor();
  const shapeIds = instance.getCurrentPageShapeIdsSorted();
  suppressDirty = true;
  try {
    instance.store.mergeRemoteChanges(() => instance.run(() => {
      if (shapeIds.length) instance.deleteShapes(shapeIds);
      instance.selectNone();
    }, { history: 'ignore', ignoreShapeLock: true }));
  } finally {
    suppressDirty = false;
  }
  templateId.value = '';
  templateName.value = '新建模板';
  templateVersion.value = 1;
  templateStatus.value = '尚未保存';
  templateDirty.value = false;
  dirty.value = false;
  emitTemplateInfo();
  message.value = '已新建空白模板';
  return snapshot();
}

async function validate() {
  const data = snapshot();
  const valid = Boolean(data.content?.shapes?.length);
  message.value = valid ? '标签模板校验通过' : '请至少放置一个标签元素';
  return valid;
}

async function preview() {
  const instance = designer.value;
  if (typeof instance?.previewPrint === 'function') await instance.previewPrint();
  else window.dispatchEvent(new CustomEvent('lowcode:print.preview', { detail: snapshot() }));
  message.value = '已发起打印预览';
  return true;
}

function print() {
  window.print();
  return true;
}

function handleReady() {
  readyPromiseResolve?.();
  readyPromiseResolve = undefined;
  emitTemplateInfo();
  void loadData({ templateId: props.block.templateId }).catch((error) => {
    message.value = error instanceof Error ? error.message : '模板加载失败';
  });
}

function markDirty() {
  if (suppressDirty || templateDirty.value) return;
  templateDirty.value = true;
  dirty.value = true;
  emitTemplateInfo();
}

onMounted(() => {
  unregisterRuntimeController = registerLowCodeMaterialRuntimeController(String(props.block.id), {
    loadData,
    setData,
    getData: snapshot,
    getTemplateInfo,
    validate,
    resetData,
    save,
    preview,
    print,
    loadTemplate: () => loadData(),
  });
});

onBeforeUnmount(() => unregisterRuntimeController());
</script>

<style scoped>
.label-designer-material {
  position: relative;
  display: flex;
  height: 100%;
  min-height: 560px;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}

.label-designer-material__message {
  position: absolute;
  z-index: 10;
  top: 8px;
  right: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  background: #fff;
  padding: 5px 9px;
  color: #334155;
  font-size: 11px;
  box-shadow: 0 2px 8px rgb(15 23 42 / 10%);
}

.label-designer-material :deep(.app-shell) {
  height: 100%;
  min-height: 0;
}
</style>
