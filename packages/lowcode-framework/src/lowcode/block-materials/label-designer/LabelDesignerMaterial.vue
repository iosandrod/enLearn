<template>
  <section class="label-designer-material" :aria-busy="busy">
    <slot name="header"></slot>
    <div v-if="message" class="label-designer-material__message" role="status">{{ message }}</div>
    <TldrawVue
      ref="designer"
      :show-template-controls="false"
      :template-items="templateItems"
      :active-template-id="templateId"
      :template-search="templateSearch"
      :template-status-filter="templateStatusFilter"
      :template-loading="templateLoading"
      :template-has-more="templateHasMore"
      :template-total="templateTotal"
      @ready="handleReady"
      @content-change="markDirty"
      @template-select="handleTemplateSelect"
      @template-search-change="handleTemplateSearchChange"
      @template-status-change="handleTemplateStatusChange"
      @template-refresh="refreshTemplateItems"
      @template-load-more="loadMoreTemplateItems"
    />
  </section>
</template>

<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, onMounted, ref, toRef } from 'vue';
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
const templateItems = ref<Array<{
  id: string;
  name: string;
  preview?: string | null;
  status?: string;
  version?: number;
}>>([]);
const templateSearch = ref('');
const templateStatusFilter = ref<'all' | 'active' | 'draft' | 'archived'>('all');
const templateLoading = ref(false);
const templateHasMore = ref(false);
const templateTotal = ref(0);
const templatePage = ref(1);
const templatePageSize = 24;
let templateRequestId = 0;
let templateSearchTimer: ReturnType<typeof setTimeout> | undefined;
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

async function getTemplateInfo(getPreview: unknown = false) {
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
  // The runtime source lives in the editor, outside the saved workspace settings.
  const printDataSource = designer.value?.getPrintDataSource?.();
  if (printDataSource !== undefined) currentWorkspace.printDataSource = clone(printDataSource);
  let obj:any= {
    content: { pages: clone(pages), currentPageId, workspace: currentWorkspace },
    pages: clone(pages),
    currentPageId,//
    workspace: currentWorkspace,
    templateId: templateId.value,
    templateName: templateName.value,//
    templateStatus: templateStatus.value,
    templateVersion: templateVersion.value,
  };
  
  const previewRequested = getPreview === true
    || (Array.isArray(getPreview) && getPreview[0] === true)
    || Boolean(
      getPreview
      && typeof getPreview === 'object'
      && (getPreview as Record<string, unknown>).getPreview === true,
    );

  if (previewRequested) {
    // debugger//
    const originalPageId = instance.getCurrentPageId();
    obj.preview = null;
    try {
      // Read shape ids after switching pages. This avoids relying on a page
      // snapshot whose shape index may not be up to date after template load.
      const editorPages = instance.getPages();
      const orderedPages = [
        editorPages.find((page) => page.id === originalPageId),
        ...editorPages.filter((page) => page.id !== originalPageId),
      ].filter((page): page is NonNullable<typeof page> => Boolean(page));
      let previewPage;
      let previewShapeIds: ReturnType<typeof instance.getCurrentPageShapeIdsSorted> = [];
      for (const page of orderedPages) {
        if (instance.getCurrentPageId() !== page.id) {
          instance.setCurrentPage(page.id);
          await nextTick();
        }
        const shapeIds = instance.getCurrentPageShapeIdsSorted();
        const pageShapeIds = shapeIds.length
          ? shapeIds
          : [...instance.getPageShapeIds(page.id)].sort();
        if (pageShapeIds.length) {
          previewPage = page;
          previewShapeIds = pageShapeIds;
          break;
        }
      }
      // if (previewPage) {
      if (1==1) {//
        // Always create a page-sized preview. Empty pages still need a
        // thumbnail so their configured background is preserved.
        obj.preview = await createTemplatePreviewDataUrl(
          instance,
          previewPage ? previewShapeIds : [],
          currentWorkspace,
        );
      }
    } finally {
      if (
        instance.getPage(originalPageId)
        && instance.getCurrentPageId() !== originalPageId
      ) {
        instance.setCurrentPage(originalPageId);
      }
    }
  }
  return obj;//
}

async function createTemplatePreviewDataUrl(
  instance: any,
  shapeIds: unknown[],
  workspaceConfig: Record<string, any>,
) {
  const bounds = getPreviewBounds(workspaceConfig);
  const background = workspaceConfig?.background && typeof workspaceConfig.background === 'object'
    ? workspaceConfig.background
    : {};
  const backgroundColor = sanitizePreviewColor(background.color, '#ffffff');
  const backgroundOpacity = normalizePreviewOpacity(background.opacity);
  const backgroundImage = await resolvePreviewImageUrl(background.imageUrl);
  let shapeSvg;
  if (shapeIds.length) {
    try {
      shapeSvg = await instance.getSvgString(shapeIds, { background: false, padding: 0 });
    } catch (error) {
      console.warn('[label-designer] shape preview export failed, keeping background preview', error);
    }
  }
  const shapeImage = shapeSvg?.svg
    ? `<image href="${escapePreviewAttribute(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(shapeSvg.svg)}`)}" x="0" y="0" width="${bounds.w}" height="${bounds.h}" preserveAspectRatio="xMidYMid meet" />`
    : '';
  const backgroundImageElement = backgroundImage
    ? `<image href="${escapePreviewAttribute(backgroundImage)}" x="0" y="0" width="${bounds.w}" height="${bounds.h}" preserveAspectRatio="${getPreviewAspectRatio(background.imageSize, background.imagePosition)}" opacity="${backgroundOpacity}" />`
    : '';
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.w}" height="${bounds.h}" viewBox="0 0 ${bounds.w} ${bounds.h}">`,
    `<rect width="${bounds.w}" height="${bounds.h}" fill="${escapePreviewAttribute(backgroundColor)}" />`,
    backgroundImageElement,
    shapeImage,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getPreviewBounds(workspaceConfig: Record<string, any>) {
  const pageBounds = workspaceConfig?.pageBounds;
  if (isPreviewSize(pageBounds)) {
    return { w: Math.max(1, pageBounds.w), h: Math.max(1, pageBounds.h) };
  }
  const pageSizeMm = workspaceConfig?.pageSizeMm;
  const pxPerMm = Number.isFinite(workspaceConfig?.pxPerMm) && workspaceConfig.pxPerMm > 0
    ? workspaceConfig.pxPerMm
    : 96 / 25.4;
  return {
    w: Math.max(1, (isPreviewSize(pageSizeMm) ? pageSizeMm.w : 210) * pxPerMm),
    h: Math.max(1, (isPreviewSize(pageSizeMm) ? pageSizeMm.h : 297) * pxPerMm),
  };
}

function isPreviewSize(value: unknown): value is { w: number; h: number } {
  return Boolean(
    value
    && typeof value === 'object'
    && Number.isFinite((value as { w?: unknown }).w)
    && Number.isFinite((value as { h?: unknown }).h)
    && (value as { w: number }).w > 0
    && (value as { h: number }).h > 0,
  );
}

function sanitizePreviewColor(value: unknown, fallback: string) {
  const color = typeof value === 'string' ? value.trim() : '';
  return color && !/[<>"';{}]/.test(color) ? color : fallback;
}

function normalizePreviewOpacity(value: unknown) {
  const opacity = Number(value);
  return Number.isFinite(opacity) ? Math.min(100, Math.max(0, opacity)) / 100 : 1;
}

function getPreviewAspectRatio(size: unknown, position: unknown) {
  if (size === 'auto') return 'none';
  const value = typeof position === 'string' ? position.toLowerCase() : '';
  const x = value.includes('left') ? 'xMin' : value.includes('right') ? 'xMax' : 'xMid';
  const y = value.includes('top') ? 'YMin' : value.includes('bottom') ? 'YMax' : 'YMid';
  return `${x}${y} ${size === 'contain' ? 'meet' : 'slice'}`;
}

async function resolvePreviewImageUrl(value: unknown) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url || url.startsWith('data:') || typeof fetch !== 'function') return url;
  try {
    const response = await fetch(url);
    if (!response.ok) return url;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (typeof btoa !== 'function') return url;
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return `data:${response.headers.get('content-type') || 'application/octet-stream'};base64,${btoa(binary)}`;
  } catch {
    return url;
  }
}

function escapePreviewAttribute(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
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
  const record = readTemplateRows(rows)[0];
  if (!record) throw new Error(`未找到打印模板：${requestedId}`);//
  await setData(record);
  return getTemplateInfo();//
}

async function refreshTemplateItems() {
  return loadTemplatePage(false);
}

async function loadTemplatePage(append: boolean) {
  const requestId = ++templateRequestId;
  const page = append ? templatePage.value + 1 : 1;
  templateLoading.value = true;
  try {
    const filters: Record<string, unknown> = {};
    if (templateStatusFilter.value === 'all') filters.status = ['active', 'draft'];
    else filters.status = templateStatusFilter.value;
    const search = templateSearch.value.trim();
    if (search) filters.name = { op: 'ilike', value: search };
    const response = await host.getServiceApi().invoke<any>('admin', 'listItems', {
      tableName: 'print_templates',
      filters,
      page,
      pageSize: templatePageSize,
      limit: templatePageSize,
      responseMode: 'page',
      withCount: true,
      sorts: [{ field: 'updated_at', direction: 'desc' }],
    });
    if (requestId !== templateRequestId) return;
    const list = readTemplateRows(response)
      .filter((row) => templateStatusFilter.value === 'archived' || row.status !== 'archived')
      .filter((row) => typeof row.id === 'string' && typeof row.name === 'string')
      .map((row) => ({
        id: row.id,
        name: row.name,
        preview: normalizeTemplatePreview(row),
        status: typeof row.status === 'string' ? row.status : undefined,
        version: Number.isInteger(row.version) ? row.version : undefined,
      }));
    const existing = append ? templateItems.value : [];
    const merged = [...existing, ...list];
    templateItems.value = merged.filter((item, index, items) => (
      items.findIndex((candidate) => candidate.id === item.id) === index
    ));
    templatePage.value = page;
    const total = Number(response && typeof response === 'object' && !Array.isArray(response)
      ? response.total
      : NaN);
    templateTotal.value = Number.isFinite(total) ? total : templateItems.value.length;
    templateHasMore.value = Number.isFinite(total)
      ? page * templatePageSize < total
      : list.length >= templatePageSize;
  } catch (error) {
    if (requestId === templateRequestId) {
      console.warn('[label-designer] failed to load template list', error);
      if (!append) {
        templateItems.value = [];
        templateTotal.value = 0;
      }
      templateHasMore.value = false;
    }
  } finally {
    if (requestId === templateRequestId) templateLoading.value = false;
  }
}

function handleTemplateSearchChange(value: string) {
  templateSearch.value = value;
  if (templateSearchTimer) clearTimeout(templateSearchTimer);
  templateSearchTimer = setTimeout(() => {
    templateSearchTimer = undefined;
    void refreshTemplateItems();
  }, 250);
}

function handleTemplateStatusChange(value: string) {
  if (templateSearchTimer) {
    clearTimeout(templateSearchTimer);
    templateSearchTimer = undefined;
  }
  templateStatusFilter.value = value === 'active' || value === 'draft' || value === 'archived'
    ? value
    : 'all';
  void refreshTemplateItems();
}

function loadMoreTemplateItems() {
  if (!templateLoading.value && templateHasMore.value) void loadTemplatePage(true);
}

async function handleTemplateSelect(selectedId: string) {
  const id = String(selectedId || '').trim();
  if (!id || id === String(templateId.value || '').trim()) return;
  // if (templateDirty.value && typeof window !== 'undefined' && !window.confirm('加载模板会放弃当前未保存的修改，是否继续？')) {
  //   return;
  // }
  busy.value = true;
  try {
    await loadData({ templateId: id });
  } catch (error) {
    message.value = error instanceof Error ? error.message : '模板加载失败';
  } finally {
    busy.value = false;
  }
}

function readTemplateRows(value: unknown): Array<Record<string, any>> {
  if (Array.isArray(value)) return value.filter((row): row is Record<string, any> => Boolean(row && typeof row === 'object'));
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, any>;
  if (Array.isArray(record.rows)) return readTemplateRows(record.rows);
  if (Array.isArray(record.items)) return readTemplateRows(record.items);
  if (Array.isArray(record.records)) return readTemplateRows(record.records);
  if (record.data) return readTemplateRows(record.data);
  return [];
}

/** Normalize preview values returned by different admin API/database versions. */
function normalizeTemplatePreview(row: Record<string, any>): string | null {
  const candidates = [
    row.preview,
    row.preview_data_url,
    row.previewDataUrl,
    row.preview_url,
    row.previewUrl,
    row.metadata,
    row.metadata?.preview,
    row.metadata?.preview_data_url,
    row.metadata?.previewDataUrl,
  ];
  for (const candidate of candidates) {
    const preview = normalizePreviewValue(candidate);
    if (preview) return preview;
  }
  return null;
}

function normalizePreviewValue(value: unknown, depth = 0): string | null {
  if (depth > 3 || value === null || value === undefined) return null;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['dataUrl', 'dataURL', 'url', 'src', 'preview', 'value', 'data']) {
      const preview = normalizePreviewValue(record[key], depth + 1);
      if (preview) return preview;
    }
    return null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return normalizePreviewValue(JSON.parse(text), depth + 1);
    } catch {
      return null;
    }
  }
  if (/^<svg[\s>]/i.test(text)) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  }
  if (/^data:image\//i.test(text) || /^(?:https?:|blob:|\/)/i.test(text)) return text;
  // Older rows may contain only the base64 payload. PNG is the format used by
  // the original thumbnail writer, so restore its missing data URL prefix.
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(text) && text.length > 64) {
    return `data:image/png;base64,${text}`;
  }
  return null;
}

setTimeout(() => {
  loadData({ templateId: 'c3b869ea-e35f-48cd-90db-00892fe8ed8d' }).catch((error) => {
  });
},500)
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
    void refreshTemplateItems();
    return result;
  }
  const info = options?.templateInfo && typeof options.templateInfo === 'object' ? options.templateInfo : await getTemplateInfo();
  if (!info?.content) throw new Error('模板内容尚未就绪，无法保存。');
  const existingPreview = normalizePreviewValue(info.preview);
  const templateInfo = existingPreview
    ? { ...info, preview: existingPreview }
    : await getTemplateInfo(true);
  if (!templateInfo?.content) throw new Error('模板内容尚未就绪，无法保存。');
  const api = host.getServiceApi();
  const id = String(templateId.value || '').trim();
  const payload = {
    name: String(templateName.value || props.block.templateName || '标签打印模板'),
    content: clone(templateInfo.content), workspace: clone(templateInfo.workspace || {}),
    preview: normalizePreviewValue(templateInfo.preview),
    status: 'active', version: templateVersion.value,
    metadata: { editor: 'tldraw-vue', source: 'lowcode-label-designer-static', schemaVersion: 1 },
  };
  const result = await api.invoke<any>('admin', 'saveItem', { resource: 'print_templates', ...(id ? { id } : {}), data: payload });
  templateId.value = String(result?.id || id || '').trim();
  templateName.value = String(result?.name || payload.name);
  templateVersion.value = Number.isInteger(result?.version) && result.version > 0 ? result.version : templateVersion.value;
  templateStatus.value = result.status;//
  templateDirty.value = false;
  dirty.value = false;
  message.value = `模板“${templateName.value}”已保存`;
  emitTemplateInfo();
  void refreshTemplateItems();
  return result;
}
async function copyData() {
  // Capture every page and workspace setting before resetData clears them.
  const source = await getTemplateInfo();
  if (!source?.content) throw new Error('模板内容尚未就绪，无法复制。');
  await resetData();
  // Only restore document content, leaving the new template identity intact.
  await setData({ content: source.content, workspace: source.workspace });
  templateName.value = `${source.templateName || '新建模板'}（副本）`;
  templateDirty.value = true;
  dirty.value = true;
  emitTemplateInfo();
  message.value = '已复制为新模板，请保存';
  return getTemplateInfo();
}
async function resetData() {
  const instance = await waitForEditor();
  const pages = instance.getPages();
  const primaryPage = pages[0];
  suppressDirty = true;
  try {
    instance.store.mergeRemoteChanges(() => instance.run(() => {
      if (primaryPage && instance.getCurrentPageId() !== primaryPage.id) {
        instance.setCurrentPage(primaryPage.id);
      }
      for (const page of pages) {
        const shapeIds = [...instance.getPageShapeIds(page.id)];
        if (shapeIds.length) instance.deleteShapes(shapeIds);
      }
      for (const page of pages.slice(1)) {
        if (instance.getPage(page.id)) instance.deletePage(page.id);
      }
      if (primaryPage && instance.getPage(primaryPage.id)) {
        instance.renamePage(primaryPage.id, '页面 1');
      }
      instance.selectNone();
    }, { history: 'ignore', ignoreShapeLock: true }));
  } finally {
    suppressDirty = false;
  }
  // A new template must start from a clean workspace as well as an empty
  // page. This clears background image/color, page size, guides, presentation
  // settings and other workspace-level properties retained by the editor.
  designer.value?.resetWorkspaceTemplateConfig?.();
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
  void refreshTemplateItems();
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
    copyData,
    save,
    preview,
    print,
    loadTemplate: () => loadData(),
  });
});

onBeforeUnmount(() => unregisterRuntimeController());
onBeforeUnmount(() => {
  if (templateSearchTimer) clearTimeout(templateSearchTimer);
  templateRequestId += 1;
});
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
