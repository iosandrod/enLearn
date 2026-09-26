<template>
  <section class="print-designer-page">
    <header class="print-template-toolbar">
      <div class="print-template-toolbar__actions">
        <button
          type="button"
          class="print-toolbar-button"
          :disabled="loadingTemplates || savingTemplate"
          @click="openTemplatePicker"
        >
          <i :class="loadingTemplates ? 'ri-loader-4-line print-spin' : 'ri-folder-open-line'" aria-hidden="true" />
          <span>加载模板</span>
        </button>

        <button
          type="button"
          class="print-toolbar-button"
          :disabled="savingTemplate || !editorReady"
          @click="createBlankTemplate"
        >
          <i class="ri-file-add-line" aria-hidden="true" />
          <span>新建模板</span>
        </button>

        <button
          type="button"
          class="print-toolbar-button print-toolbar-button--primary"
          :disabled="savingTemplate || !editorReady"
          @click="saveCurrentTemplate"
        >
          <i :class="savingTemplate ? 'ri-loader-4-line print-spin' : 'ri-save-3-line'" aria-hidden="true" />
          <span>保存模板</span>
        </button>

        <button
          type="button"
          class="print-toolbar-button"
          :disabled="savingTemplate || !editorReady"
          @click="saveTemplateAs"
        >
          <i class="ri-file-copy-2-line" aria-hidden="true" />
          <span>另存模板</span>
        </button>
      </div>

      <div v-if="!standaloneHeaderMode" class="print-template-current" :title="currentTemplateName">
        <span>当前模板</span>
        <strong>{{ currentTemplateName }}</strong>
        <small :class="{ 'is-dirty': templateDirty }">{{ currentTemplateStatus }}</small>
      </div>
    </header>

    <main class="print-canvas-shell">
      <TldrawVue
        ref="designerRef"
        :plugins="designerPlugins"
        show-mode-controls
        :show-template-controls="false"
        @content-change="markTemplateDirty"
        @ready="handleDesignerReady"
        @workspace-config-change="handleWorkspaceConfigChange"
      />
    </main>

    <p v-if="message" :class="messageClass" role="status">
      <i :class="messageIcon" aria-hidden="true" />
      <span>{{ message }}</span>
    </p>

    <GlobalDialogHost v-if="!embedded" />
  </section>
</template>

<script setup lang="ts">
import {
  confirmLowCodePage,
  getLowCodePage,
  GlobalDialogHost,
  type LowCodePageRecord
} from '@enlearn/lowcode-framework/runtime';
import { VxeUI } from 'vxe-pc-ui';
import TldrawVue, {
  defineVueEditorPlugin,
  type DesignerMode,
  type Editor,
  type TLContent,
  type VueEditorPlugin,
  type VueTemplateRecord,
  type VueTemplateWorkspaceConfig
} from 'tldraw-vue-phase-one';

type TldrawVueExpose = {
  getEditor(): Editor | null;
  getDesignerMode(): DesignerMode;
  getWorkspaceTemplateConfig(): VueTemplateWorkspaceConfig | undefined;
  applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig): void;
};

type PrintTemplateStatus = 'draft' | 'active' | 'archived';

type TemplatePageSnapshot = {
  id: string;
  name: string;
  content: TLContent;
};

type TemplateDocumentContent = Partial<TLContent> & {
  pages?: TemplatePageSnapshot[];
  currentPageId?: string;
  workspace?: VueTemplateWorkspaceConfig;
};

type PrintTemplateRow = {
  id: string;
  name: string;
  content: TemplateDocumentContent;
  workspace?: VueTemplateWorkspaceConfig | null;
  status: PrintTemplateStatus;
  version: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type PrintTemplateRecord = VueTemplateRecord & {
  status: PrintTemplateStatus;
  version: number;
  metadata: Record<string, unknown>;
};

type TemplateSaveMode = 'save' | 'saveAs';

type TemplateSnapshot = {
  content: TemplateDocumentContent;
  workspace: VueTemplateWorkspaceConfig;
  pages: TemplatePageSnapshot[];
  currentPageId: string;
};

type TemplatePublicMetadata = Record<string, unknown> & {
  editor: 'tldraw-vue';
  schemaVersion: number;
  source: 'print-designer';
  designerMode: DesignerMode;
  templateName?: string;
  dataSourceType: string;
  dataSourceKey?: string;
  dataSourceFormCode?: string;
  dataSourceTableName?: string;
  pageSizeMm?: { w: number; h: number };
  pageBounds?: { x: number; y: number; w: number; h: number };
  pageCount?: number;
};

const props = withDefaults(defineProps<{
  embedded?: boolean;
}>(), {
  embedded: false
});

const embedded = computed(() => props.embedded);

const PRINT_TEMPLATE_RESOURCE = 'print_templates';
const PRINT_TEMPLATE_LIST_PAGE_CODE = 'print-templates';
const PRINT_TEMPLATE_EDIT_FORM_ID = 'print-templates-edit-form';

const route = useRoute();
const router = useRouter();
const serviceApi = useServiceApi();
const designerRef = ref<TldrawVueExpose | null>(null);
const editorReady = ref(false);
const templates = ref<PrintTemplateRecord[]>([]);
const selectedTemplateId = ref('');
const loadingTemplates = ref(false);
const savingTemplate = ref(false);
const templateDirty = ref(false);
const message = ref('');
const messageType = ref<'info' | 'success' | 'error'>('info');
let messageTimer: ReturnType<typeof setTimeout> | undefined;
let suppressDirtyTracking = false;
let designerInitialized = false;
let savedWorkspaceSignature = '';
let templateLoadRequestId = 0;

const designerPlugins: VueEditorPlugin[] = [
  defineVueEditorPlugin({
    id: 'enlearn-print-designer-shell',
    commands: [
      {
        id: 'print.preview',
        label: 'Print preview',
        run: () => true
      },
      {
        id: 'print.print',
        label: 'Print',
        run: () => true
      }
    ]
  })
];

const selectedTemplate = computed(
  () => templates.value.find((template) => template.id === selectedTemplateId.value) ?? null
);
const currentTemplateName = computed(() => selectedTemplate.value?.name ?? '新建模板');
const currentTemplateStatus = computed(() => {
  if (templateDirty.value) return '有未保存修改';
  if (selectedTemplate.value) return `数据库模板 · v${selectedTemplate.value.version}`;
  return '尚未保存';
});
const standaloneHeaderMode = computed(
  () => !embedded.value && route.path === '/print-designer'
);
const messageClass = computed(() => `print-message print-message--${messageType.value}`);
const messageIcon = computed(() => {
  if (messageType.value === 'success') return 'ri-checkbox-circle-line';
  if (messageType.value === 'error') return 'ri-error-warning-line';
  return 'ri-information-line';
});

watch(
  [currentTemplateName, currentTemplateStatus, templateDirty],
  ([name, status, dirty]) => {
    if (!standaloneHeaderMode.value || import.meta.server) return;
    window.dispatchEvent(new CustomEvent('enlearn:print-template-info-change', {
      detail: { name, status, dirty }
    }));
  },
  { immediate: true }
);

watch(
  () => embedded.value ? undefined : route.query.templateId,
  async () => {
    await refreshTemplates({ quiet: true });
    await loadRouteTemplate();
  }
);

onBeforeUnmount(() => {
  if (messageTimer) clearTimeout(messageTimer);
});

async function handleDesignerReady() {
  await refreshTemplates({ quiet: true });
  await loadRouteTemplate();
  savedWorkspaceSignature = getWorkspaceDirtySignature(
    designerRef.value?.getWorkspaceTemplateConfig() ?? {}
  );
  editorReady.value = true;
  designerInitialized = true;
}

function handleWorkspaceConfigChange(config: VueTemplateWorkspaceConfig) {
  if (!designerInitialized || suppressDirtyTracking) return;
  if (getWorkspaceDirtySignature(config) !== savedWorkspaceSignature) {
    templateDirty.value = true;
  }
}

function markTemplateDirty() {
  if (!suppressDirtyTracking) templateDirty.value = true;
}

async function refreshTemplates(options: { quiet?: boolean } = {}) {
  if (loadingTemplates.value) return templates.value;

  loadingTemplates.value = true;
  try {
    const result = await serviceApi.listItems<PrintTemplateRow[]>('admin', {
      resource: PRINT_TEMPLATE_RESOURCE,
      filters: { status: { op: 'ne', value: 'archived' } },
      sorts: [
        { field: 'updated_at', direction: 'desc' },
        { field: 'created_at', direction: 'desc' }
      ],
      limit: 500
    });

    templates.value = readRows<PrintTemplateRow>(result)
      .map(mapTemplateRow)
      .filter((template): template is PrintTemplateRecord => template !== null);

    if (selectedTemplateId.value && !selectedTemplate.value) {
      selectedTemplateId.value = '';
      templateDirty.value = true;
    }

    return templates.value;
  } catch (error) {
    if (!options.quiet) {
      showMessage(getErrorMessage(error, '模板列表加载失败'), 'error');
    }
    return templates.value;
  } finally {
    loadingTemplates.value = false;
  }
}

async function openTemplatePicker() {
  if (loadingTemplates.value || savingTemplate.value) return;

  loadingTemplates.value = true;
  try {
    const result = await confirmLowCodePage({
      pageCode: PRINT_TEMPLATE_LIST_PAGE_CODE,
      includeData: true,
      serviceApi: serviceApi as Parameters<typeof confirmLowCodePage>[0]['serviceApi'],
      router: router as Parameters<typeof confirmLowCodePage>[0]['router'],
      route: route as Parameters<typeof confirmLowCodePage>[0]['route'],
      locale: 'zh-CN',
      title: '加载打印模板',
      confirmLabel: '加载',
      requireSelection: true,
      dialog: {
        id: 'print-template-picker-dialog'
      }
    });

    if (result.action === 'cancel' || result.action === 'close') return;

    const selectedTemplate = readTemplateFromPickerPayload(result.payload);
    if (!selectedTemplate) {
      showMessage('请先选择要加载的模板', 'error');
      return;
    }

    // The low-code picker may return only its display columns (or an older
    // single-page content projection). Resolve the selected id against the
    // complete template list before applying anything to the editor.
    const template = await resolveTemplateForLoad(selectedTemplate);
    if (!template) {
      showMessage('未找到模板的完整页面数据', 'error');
      return;
    }

    upsertTemplate(template);
    await loadTemplate(template);
  } catch (error) {
    showMessage(getErrorMessage(error, '模板列表加载失败'), 'error');
  } finally {
    loadingTemplates.value = false;
  }
}

async function createBlankTemplate() {
  const editor = getEditor();
  if (!editor) return;

  const shapeIds = editor.getCurrentPageShapeIdsSorted();
  if (templateDirty.value) {
    const confirmResult = await VxeUI.modal.confirm({
      title: '新建模板',
      content: '新建模板会放弃当前未保存的修改，是否继续？'
    });
    if (confirmResult !== 'confirm') return;
  }

  suppressDirtyTracking = true;
  try {
    editor.store.mergeRemoteChanges(() => {
      editor.run(
        () => {
          if (shapeIds.length) editor.deleteShapes(shapeIds);
          editor.selectNone();
        },
        { history: 'ignore', ignoreShapeLock: true }
      );
    });
    editor.clearHistory();
  } finally {
    suppressDirtyTracking = false;
  }

  selectedTemplateId.value = '';
  savedWorkspaceSignature = getWorkspaceDirtySignature(
    designerRef.value?.getWorkspaceTemplateConfig() ?? {}
  );
  templateDirty.value = false;
  showMessage('已新建空白模板', 'success');
}

async function saveCurrentTemplate() {
  await openTemplateSaveDialog('save');
}

async function saveTemplateAs() {
  await openTemplateSaveDialog('saveAs');
}

async function openTemplateSaveDialog(mode: TemplateSaveMode) {
  if (savingTemplate.value || !editorReady.value) return;

  const snapshot = await getCurrentTemplateSnapshot();
  if (!snapshot) return;

  savingTemplate.value = true;
  try {
    await refreshTemplates({ quiet: true });
    const editPage = await getPrintTemplateEditPage();
    const initialValues = createSaveDialogValues(mode, snapshot);
    const result = await confirmLowCodePage({
      page: createTemplateSaveDialogPage(editPage),
      includeData: false,
      formInitialValues: {
        [PRINT_TEMPLATE_EDIT_FORM_ID]: initialValues
      },
      disableFormAutoLoad: true,
      // The edit page may contain node actions/data sources that load the
      // current record during renderer initialization. The save dialog must
      // use the snapshot from the canvas and its explicit initial values.
      disablePageAutoLoad: true,
      submitOnConfirm: true,
      serviceApi: serviceApi as Parameters<typeof confirmLowCodePage>[0]['serviceApi'],
      router: router as Parameters<typeof confirmLowCodePage>[0]['router'],
      route: route as Parameters<typeof confirmLowCodePage>[0]['route'],
      locale: 'zh-CN',
      title: mode === 'saveAs' ? '另存打印模板' : '保存打印模板',
      width: 'min(560px, calc(100vw - 32px))',
      confirmLabel: mode === 'saveAs' ? '另存' : '保存',
      cancelLabel: '取消',
      dialog: {
        id: 'print-template-save-dialog'
      }
    });

    if (result.action === 'cancel' || result.action === 'close') return;

    const savedRecord = result.payload?.savedRecord;
    if (!savedRecord) {
      throw new Error('模板编辑页未返回已保存的模板记录');
    }
    await finishTemplateSave(savedRecord as PrintTemplateRow, snapshot, initialValues);
  } catch (error) {
    showMessage(getErrorMessage(error, '模板保存页面加载失败'), 'error');
  } finally {
    savingTemplate.value = false;
  }
}

async function getPrintTemplateEditPage() {
  const listPage = await getLowCodePage(
    serviceApi as Parameters<typeof getLowCodePage>[0],
    { code: PRINT_TEMPLATE_LIST_PAGE_CODE, includeData: false }
  );
  if (!listPage.edit_page_id) {
    throw new Error('打印模板列表尚未关联编辑页面');
  }

  return getLowCodePage(
    serviceApi as Parameters<typeof getLowCodePage>[0],
    { id: listPage.edit_page_id, includeData: false }
  );
}

function createSaveDialogValues(mode: TemplateSaveMode, snapshot: TemplateSnapshot) {
  const template = mode === 'save' ? selectedTemplate.value : null;
  const name = mode === 'saveAs'
    ? createAvailableTemplateName(selectedTemplate.value?.name ?? '打印模板')
    : template?.name ?? createAvailableTemplateName('打印模板');
  const content = cloneJson(snapshot.content);
  return {
    id: template?.id ?? '',
    name,
    status: template?.status ?? 'active',
    version: template?.version ?? 1,
    // The content column is the complete template document. Keep page data,
    // the active page and workspace config together so a form save cannot
    // accidentally persist only the representative page.
    content,
    metadata: createTemplateMetadata(
      template?.metadata,
      content.workspace ?? {},
      name,
      snapshot.pages.length
    )
  };
}

function createTemplateSaveDialogPage(page: LowCodePageRecord): LowCodePageRecord {
  return {
    ...page,
    schema: {
      ...page.schema,
      blocks: page.schema.blocks
        .filter((block) => block.kind !== 'buttonGroup')
        .map((block) => block.kind === 'form' && block.id === PRINT_TEMPLATE_EDIT_FORM_ID
          ? { ...block, schema: { ...block.schema, actions: [] } }
          : block)
    }
  };
}

async function finishTemplateSave(
  row: PrintTemplateRow,
  snapshot: TemplateSnapshot,
  fallbackValues: ReturnType<typeof createSaveDialogValues>
) {
  const saved = mergeSavedTemplateRecord(row, snapshot, fallbackValues);
  upsertTemplate(saved);
  selectedTemplateId.value = saved.id;
  savedWorkspaceSignature = getWorkspaceDirtySignature(saved.content.workspace ?? snapshot.workspace);
  templateDirty.value = false;
  showMessage(`模板“${saved.name}”已保存`, 'success');
}

async function loadTemplate(template: PrintTemplateRecord, options: { confirmReplace?: boolean } = {}) {
  const editor = getEditor();
  if (!editor) return;

  if ((options.confirmReplace ?? true) && templateDirty.value) {
    const confirmResult = await VxeUI.modal.confirm({
      title: '加载模板',
      content: `加载“${template.name}”会放弃当前未保存的修改，是否继续？`
    });
    if (confirmResult !== 'confirm') return;
  }
  try {
    suppressDirtyTracking = true;
    try {
      // Do not wrap page creation/switching in mergeRemoteChanges. The editor
      // creates each page's camera and page-state records in its own store
      // transaction; delaying those hooks leaves setCurrentPage with an
      // undefined camera on the next page.
      const loadedPageCount = applyTemplateDocumentContent(editor, template.content);
      if (loadedPageCount < 1) {
        throw new Error('模板未包含可加载的页面数据');
      }

      const workspace = getTemplateWorkspace(template);
      if (workspace) {
        designerRef.value?.applyWorkspaceTemplateConfig(cloneJson(workspace));
      }
      editor.clearHistory();
    } finally {
      suppressDirtyTracking = false;
    }

    selectedTemplateId.value = template.id;
    savedWorkspaceSignature = getWorkspaceDirtySignature(
      designerRef.value?.getWorkspaceTemplateConfig() ?? getTemplateWorkspace(template) ?? {}
    );
    templateDirty.value = false;
    showMessage(`已加载模板“${template.name}”（${getTemplatePageCount(template.content)} 页）`, 'success');
  } catch (error) {
    showMessage(getErrorMessage(error, '模板加载失败'), 'error');
  }
}

async function resolveTemplateForLoad(candidate: PrintTemplateRecord) {
  const cached = templates.value.find((template) => template.id === candidate.id);
  const candidatePageCount = getTemplatePageCount(candidate.content);
  const cachedPageCount = cached ? getTemplatePageCount(cached.content) : 0;
  if (cached && cachedPageCount >= candidatePageCount && isUsableTemplateDocumentContent(cached.content)) {
    return cached;
  }

  if (isUsableTemplateDocumentContent(candidate.content)) {
    if (candidatePageCount > 1 || !cached) return candidate;
  }

  try {
    const result = await serviceApi.listItems<PrintTemplateRow[]>('admin', {
      resource: PRINT_TEMPLATE_RESOURCE,
      filters: { id: { op: 'eq', value: candidate.id } },
      limit: 1
    });
    const row = readRows<PrintTemplateRow>(result)[0];
    const fullTemplate = row ? mapTemplateRow(row) : null;
    if (fullTemplate && getTemplatePageCount(fullTemplate.content) >= Math.max(candidatePageCount, cachedPageCount)) {
      return fullTemplate;
    }
  } catch (error) {
    // Keep the picker record as a last resort and let the normal loader show
    // a useful error if its page content is invalid.
    console.warn('[print-designer] failed to reload selected template', error);
  }

  return isUsableTemplateDocumentContent(candidate.content) ? candidate : null;
}

async function loadRouteTemplate() {
  const templateId = getRouteTemplateId();
  if (!templateId || selectedTemplateId.value === templateId) return;
  if (!designerRef.value?.getEditor()) return;
  const requestId = ++templateLoadRequestId;

  let template = templates.value.find((item) => item.id === templateId);
  if (!template) {
    await refreshTemplates({ quiet: true });
    if (requestId !== templateLoadRequestId || getRouteTemplateId() !== templateId) return;
    template = templates.value.find((item) => item.id === templateId);
  }

  if (!template) {
    showMessage('未找到要编辑的打印模板', 'error');
    return;
  }

  if (requestId !== templateLoadRequestId || getRouteTemplateId() !== templateId) return;
  await loadTemplate(template, { confirmReplace: false });
}

async function getCurrentTemplateSnapshot() {
  const editor = getEditor();
  if (!editor) return null;

  const currentPageId = editor.getCurrentPageId();
  const pages: TemplatePageSnapshot[] = [];
  for (const page of editor.getPages()) {
    const shapeIds = [...editor.getPageShapeIds(page.id)].sort();
    const pageContent = editor.getContentFromCurrentPage(shapeIds, page.id);
    if (!pageContent) continue;
    const resolvedContent = await editor.resolveAssetsInContent(pageContent);
    if (!resolvedContent) continue;
    pages.push({
      id: page.id,
      name: page.name,
      content: cloneJson(resolvedContent)
    });
  }

  if (!pages.length) {
    showMessage('当前画布没有可保存内容', 'error');
    return null;
  }

  const workspace = cloneJson(designerRef.value?.getWorkspaceTemplateConfig() ?? {});
  return {
    content: {
      pages: cloneJson(pages),
      currentPageId,
      workspace
    },
    pages,
    currentPageId,
    workspace
  };
}

function applyTemplateDocumentContent(editor: Editor, content: TemplateDocumentContent) {
  const pages = normalizeTemplatePages(editor, content);
  if (!pages.length) return 0;
  const targetPageIds = new Set(pages.map((page) => page.id));

  // Page and camera records are created by the editor's own transactions.
  // Calling these APIs from a wrapping editor.run leaves a newly-created page
  // without its camera during setCurrentPage, which makes Vec.Cast(undefined)
  // throw before any shape is inserted.
  for (const page of pages) {
    if (!editor.getPage(page.id)) {
      editor.createPage({ id: page.id, name: page.name });
    } else if (editor.getPage(page.id)?.name !== page.name) {
      editor.renamePage(page.id, page.name);
    }
  }

  const firstPageId = pages[0].id;
  if (editor.getCurrentPageId() !== firstPageId) editor.setCurrentPage(firstPageId);
  for (const page of editor.getPages()) {
    if (!targetPageIds.has(page.id) && editor.getPages().length > 1) {
      editor.deletePage(page.id);
    }
  }

  for (const page of pages) {
    if (!editor.getPage(page.id)) continue;
    if (editor.getCurrentPageId() !== page.id) editor.setCurrentPage(page.id);
    const shapeIds = [...editor.getPageShapeIds(page.id)];
    if (shapeIds.length) editor.deleteShapes(shapeIds);
    editor.putContentOntoCurrentPage(cloneJson(page.content), {
      preservePosition: true,
      preserveIds: true,
      select: false
    });
  }

  const currentPageId = content.currentPageId && targetPageIds.has(content.currentPageId)
    ? content.currentPageId
    : firstPageId;
  if (editor.getCurrentPageId() !== currentPageId) editor.setCurrentPage(currentPageId);
  editor.selectNone();
  return pages.length;
}

function normalizeTemplatePages(editor: Editor, content: TemplateDocumentContent) {
  const candidatePages = Array.isArray(content.pages) && content.pages.length
    ? content.pages
    : [{ id: editor.getCurrentPageId(), name: editor.getCurrentPage().name, content }];
  return candidatePages
    .filter((page): page is TemplatePageSnapshot => Boolean(
      page && typeof page.id === 'string' && typeof page.name === 'string' && isUsableTemplateContent(page.content)
    ))
    .map((page) => ({
      ...page,
      content: normalizeTemplatePageContent(stripTemplateMetadata(page.content), page.id)
    }));
}

function stripTemplateMetadata(value: TLContent): TLContent {
  const { pages: _pages, currentPageId: _currentPageId, workspace: _workspace, ...content } = value as TemplateDocumentContent;
  return content as TLContent;
}

function normalizeTemplatePageContent(value: TLContent, pageId: string): TLContent {
  const content = cloneJson(value) as TLContent;
  const rawShapes = Array.isArray(content.shapes) ? content.shapes : [];
  const shapeIds = new Set(
    rawShapes
      .filter((shape): shape is Record<string, any> => isRecord(shape) && typeof shape.id === 'string')
      .map((shape) => shape.id)
  );
  const shapes = rawShapes
    .filter((shape): shape is Record<string, any> => (
      isRecord(shape)
      && typeof shape.id === 'string'
      && typeof shape.type === 'string'
      && typeof shape.typeName === 'string'
    ))
    .map((shape) => {
      const parentId = typeof shape.parentId === 'string' && shapeIds.has(shape.parentId)
        ? shape.parentId
        : pageId;
      return {
        ...shape,
        x: Number.isFinite(shape.x) ? shape.x : 0,
        y: Number.isFinite(shape.y) ? shape.y : 0,
        parentId,
      };
    });
  const normalizedShapeIds = new Set(shapes.map((shape) => shape.id));
  const rootShapeIds = [
    ...(Array.isArray(content.rootShapeIds) ? content.rootShapeIds : []),
    ...shapes.filter((shape) => shape.parentId === pageId).map((shape) => shape.id),
  ].filter((id, index, ids): id is string => (
    typeof id === 'string'
    && normalizedShapeIds.has(id)
    && ids.indexOf(id) === index
  ));
  const bindings = (Array.isArray(content.bindings) ? content.bindings : []).filter((binding) => (
    isRecord(binding)
    && typeof binding.id === 'string'
    && typeof binding.fromId === 'string'
    && typeof binding.toId === 'string'
    && normalizedShapeIds.has(binding.fromId)
    && normalizedShapeIds.has(binding.toId)
  ));

  return {
    ...content,
    shapes,
    rootShapeIds,
    bindings,
  };
}

function getEditor() {
  const editor = designerRef.value?.getEditor();
  if (!editor) {
    showMessage('设计器尚未就绪', 'error');
    return null;
  }
  return editor;
}

function mapTemplateRow(row: PrintTemplateRow): PrintTemplateRecord | null {
  if (
    !row ||
    typeof row.id !== 'string' ||
    typeof row.name !== 'string' ||
    !isUsableTemplateDocumentContent(row.content)
  ) {
    return null;
  }

  const createdAt = parseTemplateTimestamp(row.created_at);
  const updatedAt = parseTemplateTimestamp(row.updated_at);
  const metadata = isRecord(row.metadata) ? cloneJson(row.metadata) : {};
  const metadataWorkspace = getWorkspaceFromMetadata(metadata);
  const storedWorkspace = isRecord(row.workspace) ? cloneJson(row.workspace) : undefined;
  const content = cloneJson(row.content);
  if (!isRecord(content.workspace) && storedWorkspace) {
    content.workspace = cloneJson(storedWorkspace);
  }
  return {
    id: row.id,
    name: row.name,
    createdAt,
    updatedAt,
    content,
    workspace: storedWorkspace || metadataWorkspace
      ? { ...(metadataWorkspace ?? {}), ...(storedWorkspace ?? {}) }
      : undefined,
    status: isTemplateStatus(row.status) ? row.status : 'active',
    version: Number.isInteger(row.version) && row.version > 0 ? row.version : 1,
    metadata
  };
}

function readTemplateFromPickerPayload(payload: unknown) {
  if (!isRecord(payload)) return null;

  const row = [
    payload.row,
    payload.selectedRow,
    payload.currentRow,
    Array.isArray(payload.selectedRows) ? payload.selectedRows[0] : undefined,
    Array.isArray(payload.rows) ? payload.rows[0] : undefined
  ].find(isRecord);

  return row ? mapTemplateRow(row as PrintTemplateRow) : null;
}

function upsertTemplate(template: PrintTemplateRecord) {
  const nextTemplates = templates.value.filter((item) => item.id !== template.id);
  templates.value = [template, ...nextTemplates].sort((left, right) => right.updatedAt - left.updatedAt);
}

function createTemplateMetadata(
  existing: Record<string, unknown> = {},
  workspace: VueTemplateWorkspaceConfig = {},
  templateName?: string,
  pageCount?: number
): TemplatePublicMetadata {
  const {
    designerMode: _previousDesignerMode,
    templateName: _previousTemplateName,
    dataSourceType: _previousDataSourceType,
    dataSourceKey: _previousDataSourceKey,
    dataSourceFormCode: _previousDataSourceFormCode,
    dataSourceTableName: _previousDataSourceTableName,
    pageSizeMm: _previousPageSizeMm,
    pageBounds: _previousPageBounds,
    pageCount: _previousPageCount,
    ...otherMetadata
  } = existing;
  const dataSource = isRecord(workspace.printDataSource) ? workspace.printDataSource : undefined;
  const dataSourceType = typeof dataSource?.type === 'string' ? dataSource.type : 'none';
  const dataSourceFormCode = readString(dataSource?.formCode);
  const dataSourceTableName = readString(dataSource?.tableName);
  const dataSourceKey = readString(dataSource?.key) || dataSourceFormCode || dataSourceTableName;

  return {
    ...otherMetadata,
    editor: 'tldraw-vue',
    schemaVersion: 2,
    source: 'print-designer',
    designerMode: workspace.designerMode === 'presentation' ? 'presentation' : 'print',
    ...(templateName ? { templateName } : {}),
    dataSourceType,
    ...(dataSourceKey ? { dataSourceKey } : {}),
    ...(dataSourceFormCode ? { dataSourceFormCode } : {}),
    ...(dataSourceTableName ? { dataSourceTableName } : {}),
    ...(isSizeLike(workspace.pageSizeMm) ? { pageSizeMm: cloneJson(workspace.pageSizeMm) } : {}),
    ...(isBoundsLike(workspace.pageBounds) ? { pageBounds: cloneJson(workspace.pageBounds) } : {}),
    ...(Number.isFinite(pageCount) ? { pageCount } : {})
  };
}

function mergeSavedTemplateRecord(
  row: PrintTemplateRow,
  snapshot: TemplateSnapshot,
  fallbackValues: ReturnType<typeof createSaveDialogValues>
) {
  const fallbackContent = cloneJson(fallbackValues.content);
  const saved = mapTemplateRow({
    ...row,
    name: readString(row.name) || String(fallbackValues.name || '打印模板'),
    // Some save endpoints return only a partial row (or an empty content
    // shell). Never let that response replace the complete canvas snapshot.
    content: isUsableTemplateDocumentContent(row.content) ? row.content : fallbackContent,
    workspace: isRecord(row.workspace) ? row.workspace : undefined,
    metadata: isRecord(row.metadata) ? row.metadata : fallbackValues.metadata
  });
  if (!saved) throw new Error('后台未返回有效的模板记录');

  const name = saved.name || String(fallbackValues.name || '打印模板');
  const content = isUsableTemplateDocumentContent(saved.content)
    && isCompleteTemplateDocumentContent(saved.content, snapshot.pages.length)
    ? saved.content
    : fallbackContent;
  const workspace = isRecord(content.workspace)
    ? cloneJson(content.workspace)
    : saved.workspace && Object.keys(saved.workspace).length > 0
      ? cloneJson(saved.workspace)
      : cloneJson(snapshot.workspace);
  content.workspace = workspace;
  return {
    ...saved,
    name,
    content,
    workspace,
    metadata: createTemplateMetadata(
      saved.metadata,
      workspace,
      name,
      Array.isArray(content.pages)
        ? content.pages.length
        : Array.isArray(fallbackValues.content.pages)
          ? fallbackValues.content.pages.length
          : undefined
    )
  } satisfies PrintTemplateRecord;
}

function getTemplateWorkspace(template: PrintTemplateRecord) {
  return isRecord(template.content.workspace)
    ? template.content.workspace
    : template.workspace ?? getWorkspaceFromMetadata(template.metadata);
}

function getWorkspaceFromMetadata(metadata: Record<string, unknown>): VueTemplateWorkspaceConfig | undefined {
  const designerMode = metadata.designerMode === 'presentation' || metadata.designerMode === 'print'
    ? metadata.designerMode
    : undefined;
  const pageSizeMm = isSizeLike(metadata.pageSizeMm) ? cloneJson(metadata.pageSizeMm) : undefined;
  const pageBounds = isBoundsLike(metadata.pageBounds) ? cloneJson(metadata.pageBounds) : undefined;
  if (!designerMode && !pageSizeMm && !pageBounds) return undefined;
  return {
    ...(designerMode ? { designerMode } : {}),
    ...(pageSizeMm ? { pageSizeMm } : {}),
    ...(pageBounds ? { pageBounds } : {})
  };
}

function getWorkspaceDirtySignature(config: VueTemplateWorkspaceConfig) {
  const workspace = isRecord(config) ? config : {};
  return JSON.stringify({
    designerMode: workspace.designerMode ?? null,
    pageSizeMm: workspace.pageSizeMm ?? null,
    pageBounds: workspace.pageBounds ?? null,
    guides: workspace.guides ?? [],
    printDataSource: workspace.printDataSource ?? null,
    background: workspace.background ?? null,
    presentation: workspace.presentation ?? null
  });
}

function createAvailableTemplateName(baseName: string) {
  const normalizedBase = baseName.trim() || '打印模板';
  const firstCandidate = selectedTemplate.value ? `${normalizedBase} 副本` : normalizedBase;
  if (!hasTemplateName(firstCandidate)) return firstCandidate;

  let index = 2;
  while (hasTemplateName(`${firstCandidate} ${index}`)) index += 1;
  return `${firstCandidate} ${index}`;
}

function hasTemplateName(name: string, exceptId = '') {
  const normalizedName = name.trim().toLocaleLowerCase('zh-CN');
  return templates.value.some(
    (template) => template.id !== exceptId && template.name.trim().toLocaleLowerCase('zh-CN') === normalizedName
  );
}

function readRows<T>(value: unknown) {
  if (Array.isArray(value)) return value as T[];
  if (isRecord(value) && Array.isArray(value.rows)) return value.rows as T[];
  return [] as T[];
}

function parseTemplateTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function getRouteTemplateId() {
  if (embedded.value) return '';
  const value = route.query.templateId;
  return typeof value === 'string' ? value : '';
}

function showMessage(nextMessage: string, type: 'info' | 'success' | 'error' = 'info') {
  message.value = nextMessage;
  messageType.value = type;
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    message.value = '';
  }, type === 'error' ? 6000 : 3200);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (isRecord(error)) {
    const message = error.statusMessage ?? error.message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isTemplateStatus(value: unknown): value is PrintTemplateStatus {
  return value === 'draft' || value === 'active' || value === 'archived';
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isSizeLike(value: unknown): value is { w: number; h: number } {
  return isRecord(value) && Number.isFinite(value.w) && Number.isFinite(value.h);
}

function isBoundsLike(value: unknown): value is { x: number; y: number; w: number; h: number } {
  return isRecord(value)
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.w)
    && Number.isFinite(value.h);
}

function isUsableTemplateDocumentContent(value: unknown): value is TemplateDocumentContent {
  if (!isRecord(value)) return false;
  const pages = value.pages;
  if (Array.isArray(pages) && pages.length > 0) {
    return pages.every((page) => isRecord(page) && isUsableTemplateContent(page.content));
  }
  return isUsableTemplateContent(value);
}

function isCompleteTemplateDocumentContent(value: TemplateDocumentContent, expectedPageCount: number) {
  if (expectedPageCount <= 1) return true;
  return Array.isArray(value.pages)
    && value.pages.length === expectedPageCount
    && value.pages.every((page) => isRecord(page) && isUsableTemplateContent(page.content));
}

function getTemplatePageCount(value: unknown) {
  return isRecord(value) && Array.isArray(value.pages) && value.pages.length > 0
    ? value.pages.length
    : 1;
}

function isUsableTemplateContent(value: unknown): value is TLContent {
  return isRecord(value)
    && isRecord(value.schema)
    && Array.isArray(value.shapes)
    && Array.isArray(value.rootShapeIds)
    && Array.isArray(value.bindings)
    && Array.isArray(value.assets);
}
</script>

<style scoped>
.print-designer-page {
  position: relative;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
  padding: 8px;
  background: #f4f6f8;
}

.print-template-toolbar {
  position: relative;
  z-index: 30;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  border: 1px solid #d6dce5;
  border-radius: 6px;
  background: #ffffff;
  padding: 5px 10px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.print-template-toolbar__actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.print-toolbar-button,
.print-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 0 11px;
  white-space: nowrap;
}

.print-icon-button {
  width: 30px;
  height: 30px;
  padding: 0;
  font-size: 16px;
}

.print-toolbar-button:hover:not(:disabled),
.print-icon-button:hover:not(:disabled) {
  border-color: #8fb8e8;
  background: #edf6ff;
  color: #0969c7;
}

.print-toolbar-button:disabled,
.print-icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.print-toolbar-button--primary {
  border-color: #1476d4;
  background: #1476d4;
  color: #ffffff;
}

.print-toolbar-button--primary:hover:not(:disabled) {
  border-color: #0d63b6;
  background: #0d63b6;
  color: #ffffff;
}

.print-template-current {
  display: grid;
  grid-template-columns: auto minmax(0, auto);
  align-items: center;
  column-gap: 7px;
  min-width: 0;
  text-align: right;
}

.print-template-current > span,
.print-template-current > small {
  color: #718096;
  font-size: 11px;
}

.print-template-current > span {
  grid-row: 1;
  grid-column: 1;
}

.print-template-current > strong {
  grid-row: 1;
  grid-column: 2;
  max-width: min(360px, 32vw);
  overflow: hidden;
  color: #172033;
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.print-template-current > small {
  grid-row: 2;
  grid-column: 1 / -1;
  line-height: 14px;
}

.print-template-current > small.is-dirty {
  color: #b45309;
  font-weight: 700;
}

.print-canvas-shell {
  position: relative;
  z-index: 1;
  flex: 1 1 0;
  height: auto;
  min-height: 0;
  border: 1px solid #d6dce5;
  border-radius: 6px;
  background: #ffffff;
  overflow: hidden;
}

.print-canvas-shell :deep(.app-shell) {
  height: 100%;
}

.print-message {
  position: absolute;
  z-index: 60;
  right: 20px;
  bottom: 20px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(460px, calc(100% - 40px));
  min-height: 36px;
  margin: 0;
  border: 1px solid #cdd8e6;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  padding: 7px 12px;
  font-size: 13px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
}

.print-message--success {
  border-color: #a7dfc3;
  color: #08734d;
}

.print-message--error {
  border-color: #f2b8b8;
  color: #b42318;
}

.print-spin {
  animation: print-spin 0.8s linear infinite;
}

@keyframes print-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 820px) {
  .print-template-toolbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }

  .print-template-toolbar__actions {
    flex-wrap: wrap;
    width: 100%;
  }

  .print-template-current {
    align-self: flex-end;
  }

  .print-template-current > strong {
    max-width: 58vw;
  }
}
</style>

<style>
.print-designer-dialog .vxe-modal--body {
  min-height: 0;
  padding: 0;
  overflow: hidden;
  background: #f4f6f8;
}

.print-designer-dialog .lc-global-dialog__body,
.print-designer-dialog .print-designer-page {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.print-designer-dialog .lc-global-dialog__body {
  display: block;
  overflow: hidden;
}
</style>
