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
          @click="openTemplateNameDialog('saveAs')"
        >
          <i class="ri-file-copy-2-line" aria-hidden="true" />
          <span>另存模板</span>
        </button>
      </div>

      <div class="print-template-current" :title="currentTemplateName">
        <span>当前模板</span>
        <strong>{{ currentTemplateName }}</strong>
        <small :class="{ 'is-dirty': templateDirty }">{{ currentTemplateStatus }}</small>
      </div>
    </header>

    <main class="print-canvas-shell">
      <TldrawVue
        ref="designerRef"
        :plugins="designerPlugins"
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

    <Teleport to="body">
      <div
        v-if="templateNameDialogOpen"
        class="print-dialog-layer"
        role="presentation"
        @pointerdown.self="closeTemplateNameDialog"
      >
        <form
          class="print-name-dialog"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="templateNameDialogTitleId"
          @submit.prevent="confirmTemplateNameDialog"
        >
          <header>
            <div>
              <strong :id="templateNameDialogTitleId">{{ templateNameDialogTitle }}</strong>
              <span>模板将保存到后台打印模板表</span>
            </div>
            <button
              type="button"
              class="print-icon-button"
              title="关闭"
              aria-label="关闭"
              :disabled="savingTemplate"
              @click="closeTemplateNameDialog"
            >
              <i class="ri-close-line" aria-hidden="true" />
            </button>
          </header>

          <label class="print-name-dialog__field">
            <span>模板名称</span>
            <input
              ref="templateNameInputRef"
              v-model="templateNameInput"
              maxlength="120"
              autocomplete="off"
              placeholder="请输入模板名称"
              @input="templateNameError = ''"
            />
            <small v-if="templateNameError" class="print-name-dialog__error">{{ templateNameError }}</small>
          </label>

          <footer>
            <button
              type="button"
              class="print-toolbar-button"
              :disabled="savingTemplate"
              @click="closeTemplateNameDialog"
            >
              取消
            </button>
            <button
              type="submit"
              class="print-toolbar-button print-toolbar-button--primary"
              :disabled="savingTemplate"
            >
              <i :class="savingTemplate ? 'ri-loader-4-line print-spin' : 'ri-save-3-line'" aria-hidden="true" />
              <span>{{ templateNameDialogMode === 'saveAs' ? '另存为' : '保存' }}</span>
            </button>
          </footer>
        </form>
      </div>
    </Teleport>

    <GlobalDialogHost />
  </section>
</template>

<script setup lang="ts">
import {
  confirmLowCodePage,
  GlobalDialogHost
} from '@enlearn/lowcode-framework/runtime';
import TldrawVue, {
  defineVueEditorPlugin,
  type Editor,
  type TLContent,
  type VueEditorPlugin,
  type VueTemplateRecord,
  type VueTemplateWorkspaceConfig
} from 'tldraw-vue-phase-one';

type TldrawVueExpose = {
  getEditor(): Editor | null;
  getWorkspaceTemplateConfig(): VueTemplateWorkspaceConfig | undefined;
  applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig): void;
};

type PrintTemplateStatus = 'draft' | 'active' | 'archived';

type PrintTemplateRow = {
  id: string;
  name: string;
  content: TLContent;
  workspace: VueTemplateWorkspaceConfig | null;
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

type TemplateNameDialogMode = 'save' | 'saveAs';

const PRINT_TEMPLATE_RESOURCE = 'print_templates';
const templateNameDialogTitleId = 'print-template-name-dialog-title';

const route = useRoute();
const router = useRouter();
const serviceApi = useServiceApi();
const designerRef = ref<TldrawVueExpose | null>(null);
const editorReady = ref(false);
const templateNameInputRef = ref<HTMLInputElement | null>(null);
const templates = ref<PrintTemplateRecord[]>([]);
const selectedTemplateId = ref('');
const loadingTemplates = ref(false);
const savingTemplate = ref(false);
const templateNameDialogOpen = ref(false);
const templateNameDialogMode = ref<TemplateNameDialogMode>('save');
const templateNameInput = ref('');
const templateNameError = ref('');
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
const templateNameDialogTitle = computed(() =>
  templateNameDialogMode.value === 'saveAs' ? '另存打印模板' : '保存打印模板'
);
const messageClass = computed(() => `print-message print-message--${messageType.value}`);
const messageIcon = computed(() => {
  if (messageType.value === 'success') return 'ri-checkbox-circle-line';
  if (messageType.value === 'error') return 'ri-error-warning-line';
  return 'ri-information-line';
});

watch(
  () => route.query.templateId,
  async () => {
    await refreshTemplates({ quiet: true });
    await loadRouteTemplate();
  }
);

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown);
});

onActivated(async () => {
  await refreshTemplates({ quiet: true });
  await loadRouteTemplate();
});

onDeactivated(() => {
  templateNameDialogOpen.value = false;
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown);
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
      pageCode: 'print-templates',
      includeData: true,
      serviceApi,
      router,
      route,
      locale: 'zh-CN',
      title: '加载打印模板',
      confirmLabel: '加载',
      requireSelection: true,
      dialog: {
        id: 'print-template-picker-dialog'
      }
    });

    if (result.action === 'cancel' || result.action === 'close') return;

    const template = readTemplateFromPickerPayload(result.payload);
    if (!template) {
      showMessage('请先选择要加载的模板', 'error');
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
  if (templateDirty.value && !window.confirm('新建模板会放弃当前未保存的修改，是否继续？')) return;

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
  await syncRouteTemplateId('');
  showMessage('已新建空白模板', 'success');
}

async function saveCurrentTemplate() {
  if (selectedTemplate.value) {
    await persistExistingTemplate(selectedTemplate.value);
    return;
  }

  openTemplateNameDialog('save');
}

function openTemplateNameDialog(mode: TemplateNameDialogMode) {
  if (savingTemplate.value) return;

  templateNameDialogMode.value = mode;
  templateNameError.value = '';
  templateNameInput.value = mode === 'saveAs'
    ? createAvailableTemplateName(selectedTemplate.value?.name ?? '打印模板')
    : createAvailableTemplateName('打印模板');
  templateNameDialogOpen.value = true;

  void nextTick(() => {
    templateNameInputRef.value?.focus();
    templateNameInputRef.value?.select();
  });
}

function closeTemplateNameDialog() {
  if (savingTemplate.value) return;
  templateNameDialogOpen.value = false;
  templateNameError.value = '';
}

async function confirmTemplateNameDialog() {
  const name = templateNameInput.value.trim();
  if (!name) {
    templateNameError.value = '模板名称不能为空';
    return;
  }

  if (hasTemplateName(name)) {
    templateNameError.value = '模板名称已存在，请使用其他名称';
    return;
  }

  await persistNewTemplate(name);
}

async function persistExistingTemplate(template: PrintTemplateRecord) {
  const snapshot = await getCurrentTemplateSnapshot();
  if (!snapshot) return;

  savingTemplate.value = true;
  try {
    const row = await serviceApi.invoke<PrintTemplateRow>('admin', 'updateItem', {
      resource: PRINT_TEMPLATE_RESOURCE,
      id: template.id,
      data: {
        name: template.name,
        content: snapshot.content,
        workspace: snapshot.workspace,
        status: template.status === 'archived' ? 'active' : template.status,
        version: template.version + 1,
        metadata: createTemplateMetadata(template.metadata)
      }
    });

    const saved = requireTemplateRecord(row);
    upsertTemplate(saved);
    selectedTemplateId.value = saved.id;
    savedWorkspaceSignature = getWorkspaceDirtySignature(snapshot.workspace);
    templateDirty.value = false;
    await syncRouteTemplateId(saved.id);
    showMessage(`模板“${saved.name}”已保存`, 'success');
  } catch (error) {
    showMessage(getErrorMessage(error, '模板保存失败'), 'error');
  } finally {
    savingTemplate.value = false;
  }
}

async function persistNewTemplate(name: string) {
  const snapshot = await getCurrentTemplateSnapshot();
  if (!snapshot) return;

  savingTemplate.value = true;
  try {
    const row = await serviceApi.invoke<PrintTemplateRow>('admin', 'createItem', {
      resource: PRINT_TEMPLATE_RESOURCE,
      data: {
        name,
        content: snapshot.content,
        workspace: snapshot.workspace,
        status: 'active',
        version: 1,
        metadata: createTemplateMetadata()
      }
    });

    const saved = requireTemplateRecord(row);
    upsertTemplate(saved);
    selectedTemplateId.value = saved.id;
    savedWorkspaceSignature = getWorkspaceDirtySignature(snapshot.workspace);
    templateDirty.value = false;
    templateNameDialogOpen.value = false;
    templateNameError.value = '';
    await syncRouteTemplateId(saved.id);
    showMessage(`模板“${saved.name}”已保存`, 'success');
  } catch (error) {
    const errorMessage = getErrorMessage(error, '模板保存失败');
    if (templateNameDialogOpen.value) {
      templateNameError.value = errorMessage;
    } else {
      showMessage(errorMessage, 'error');
    }
  } finally {
    savingTemplate.value = false;
  }
}

async function loadTemplate(template: PrintTemplateRecord, options: { confirmReplace?: boolean } = {}) {
  const editor = getEditor();
  if (!editor) return;

  const shapeIds = editor.getCurrentPageShapeIdsSorted();
  if ((options.confirmReplace ?? true) && templateDirty.value) {
    const confirmed = window.confirm(`加载“${template.name}”会放弃当前未保存的修改，是否继续？`);
    if (!confirmed) return;
  }

  try {
    suppressDirtyTracking = true;
    try {
      editor.store.mergeRemoteChanges(() => {
        editor.run(
          () => {
            if (shapeIds.length) editor.deleteShapes(shapeIds);
            editor.selectNone();
            editor.putContentOntoCurrentPage(cloneJson(template.content), {
              preservePosition: true,
              select: true
            });
          },
          { history: 'ignore', ignoreShapeLock: true }
        );
      });

      if (template.workspace) {
        designerRef.value?.applyWorkspaceTemplateConfig(cloneJson(template.workspace));
      }
      editor.clearHistory();
    } finally {
      suppressDirtyTracking = false;
    }

    selectedTemplateId.value = template.id;
    savedWorkspaceSignature = getWorkspaceDirtySignature(
      designerRef.value?.getWorkspaceTemplateConfig() ?? template.workspace ?? {}
    );
    templateDirty.value = false;
    await syncRouteTemplateId(template.id);
    showMessage(`已加载模板“${template.name}”`, 'success');
  } catch (error) {
    showMessage(getErrorMessage(error, '模板加载失败'), 'error');
  }
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

  const shapeIds = editor.getCurrentPageShapeIdsSorted();
  if (!shapeIds.length) {
    showMessage('当前画布没有可保存内容', 'error');
    return null;
  }

  const content = editor.getContentFromCurrentPage(shapeIds);
  if (!content) {
    showMessage('当前画布内容读取失败', 'error');
    return null;
  }

  const resolvedContent = await editor.resolveAssetsInContent(content);
  if (!resolvedContent) {
    showMessage('当前画布资源读取失败', 'error');
    return null;
  }

  return {
    content: cloneJson(resolvedContent),
    workspace: cloneJson(designerRef.value?.getWorkspaceTemplateConfig() ?? {})
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
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string' || !isRecord(row.content)) {
    return null;
  }

  const createdAt = parseTemplateTimestamp(row.created_at);
  const updatedAt = parseTemplateTimestamp(row.updated_at);
  return {
    id: row.id,
    name: row.name,
    createdAt,
    updatedAt,
    content: cloneJson(row.content),
    workspace: isRecord(row.workspace) ? cloneJson(row.workspace) : undefined,
    status: isTemplateStatus(row.status) ? row.status : 'active',
    version: Number.isInteger(row.version) && row.version > 0 ? row.version : 1,
    metadata: isRecord(row.metadata) ? cloneJson(row.metadata) : {}
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

function requireTemplateRecord(row: PrintTemplateRow) {
  const record = mapTemplateRow(row);
  if (!record) throw new Error('后台未返回有效的模板记录');
  return record;
}

function upsertTemplate(template: PrintTemplateRecord) {
  const nextTemplates = templates.value.filter((item) => item.id !== template.id);
  templates.value = [template, ...nextTemplates].sort((left, right) => right.updatedAt - left.updatedAt);
}

function createTemplateMetadata(existing: Record<string, unknown> = {}) {
  return {
    ...existing,
    editor: 'tldraw-vue',
    schemaVersion: 1,
    source: 'print-designer'
  };
}

function getWorkspaceDirtySignature(config: VueTemplateWorkspaceConfig) {
  const workspace = isRecord(config) ? config : {};
  return JSON.stringify({
    pageSizeMm: workspace.pageSizeMm ?? null,
    guides: workspace.guides ?? [],
    printDataSource: workspace.printDataSource ?? null
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

function hasTemplateName(name: string) {
  const normalizedName = name.trim().toLocaleLowerCase('zh-CN');
  return templates.value.some(
    (template) => template.name.trim().toLocaleLowerCase('zh-CN') === normalizedName
  );
}

async function syncRouteTemplateId(templateId: string) {
  if (getRouteTemplateId() === templateId) return;
  templateLoadRequestId += 1;

  const query = { ...route.query };
  if (templateId) query.templateId = templateId;
  else delete query.templateId;
  await router.replace({ query });
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
  const value = route.query.templateId;
  return typeof value === 'string' ? value : '';
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (templateNameDialogOpen.value) closeTemplateNameDialog();
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

.print-dialog-layer {
  position: fixed;
  z-index: 4000;
  display: grid;
  place-items: center;
  inset: 0;
  background: rgba(15, 23, 42, 0.46);
  padding: 16px;
}

.print-name-dialog {
  width: min(420px, calc(100vw - 32px));
  border: 1px solid #cfd8e5;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
}

.print-name-dialog > header,
.print-name-dialog > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 14px;
}

.print-name-dialog > header {
  border-bottom: 1px solid #e5eaf1;
}

.print-name-dialog > header > div {
  display: grid;
  gap: 3px;
}

.print-name-dialog > header strong {
  color: #172033;
  font-size: 15px;
}

.print-name-dialog > header span {
  color: #718096;
  font-size: 11px;
}

.print-name-dialog__field {
  display: grid;
  gap: 7px;
  padding: 18px 16px 20px;
}

.print-name-dialog__field > span {
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.print-name-dialog__field input {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  border: 1px solid #bfcbd9;
  border-radius: 6px;
  outline: 0;
  color: #172033;
  font: inherit;
  font-size: 13px;
  padding: 0 10px;
}

.print-name-dialog__field input:focus {
  border-color: #438fdd;
  box-shadow: 0 0 0 2px rgba(20, 118, 212, 0.12);
}

.print-name-dialog__error {
  color: #b42318;
  font-size: 11px;
}

.print-name-dialog > footer {
  justify-content: flex-end;
  border-top: 1px solid #e5eaf1;
  background: #f8fafc;
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
