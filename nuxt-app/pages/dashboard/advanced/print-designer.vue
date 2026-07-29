<template>
  <section class="print-designer-page">
    <aside class="print-template-panel">
      <header class="print-template-panel__header">
        <div>
          <h2>打印设计器</h2>
          <span>{{ templates.length }} 个模板</span>
        </div>
        <button type="button" class="print-icon-button" title="刷新模板" aria-label="刷新模板" @click="refreshTemplates">
          <i class="ri-refresh-line" />
        </button>
      </header>

      <div class="print-template-actions">
        <button type="button" class="print-button print-button--primary" @click="saveCurrentTemplate">
          <i class="ri-save-3-line" />
          <span>保存</span>
        </button>
        <button type="button" class="print-button" @click="createBlankTemplate">
          <i class="ri-file-add-line" />
          <span>新建</span>
        </button>
      </div>

      <p v-if="message" :class="messageClass">{{ message }}</p>

      <div class="print-template-list">
        <button
          v-for="template in templates"
          :key="template.id"
          type="button"
          class="print-template-row"
          :class="{ 'is-active': template.id === selectedTemplateId }"
          @click="loadTemplate(template)"
        >
          <span class="print-template-row__name">{{ template.name }}</span>
          <span class="print-template-row__meta">{{ formatTemplateDate(template.updatedAt) }}</span>
        </button>
      </div>

      <div class="print-template-footer">
        <button type="button" class="print-button" :disabled="!selectedTemplate" @click="duplicateSelectedTemplate">
          <i class="ri-file-copy-line" />
          <span>复制</span>
        </button>
        <button type="button" class="print-button print-button--danger" :disabled="!selectedTemplate" @click="deleteSelectedTemplate">
          <i class="ri-delete-bin-line" />
          <span>删除</span>
        </button>
      </div>
    </aside>

    <main class="print-canvas-shell">
      <ClientOnly>
        <TldrawVue
          ref="designerRef"
          :plugins="designerPlugins"
          :load-templates="loadTemplateRecords"
          :save-templates="saveTemplateRecords"
          @ready="handleDesignerReady"
        />
      </ClientOnly>
    </main>
  </section>
</template>

<script setup lang="ts">
import TldrawVue, {
  defineVueEditorPlugin,
  type Editor,
  type TLContent,
  type VueEditorPlugin,
  type VueTemplateRecord,
  type VueTemplateWorkspaceConfig
} from 'tldraw-vue-phase-one';

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
});

type TldrawVueExpose = {
  getEditor(): Editor | null;
  getWorkspaceTemplateConfig(): VueTemplateWorkspaceConfig | undefined;
  applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig): void;
};

const TEMPLATE_STORAGE_KEY = 'enlearn.print-designer.templates.v1';

const route = useRoute();
const designerRef = ref<TldrawVueExpose | null>(null);
const templates = ref<VueTemplateRecord[]>([]);
const selectedTemplateId = ref('');
const message = ref('');
const messageType = ref<'info' | 'success' | 'error'>('info');

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
const messageClass = computed(() => `print-message print-message--${messageType.value}`);

onMounted(async () => {
  await refreshTemplates();
  await loadRouteTemplate();
});

watch(
  () => route.query.templateId,
  async () => {
    await refreshTemplates();
    await loadRouteTemplate();
  }
);

async function handleDesignerReady() {
  await refreshTemplates();
  await loadRouteTemplate();
}

async function refreshTemplates() {
  templates.value = await loadTemplateRecords();
  if (selectedTemplateId.value && !selectedTemplate.value) {
    selectedTemplateId.value = '';
  }
}

async function loadTemplateRecords() {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
  if (!raw) return [];

  try {
    const value = JSON.parse(raw) as unknown;
    return normalizeTemplateRecords(value);
  } catch {
    window.localStorage.removeItem(TEMPLATE_STORAGE_KEY);
    return [];
  }
}

async function saveTemplateRecords(nextTemplates: readonly VueTemplateRecord[]) {
  const normalizedTemplates = normalizeTemplateRecords(nextTemplates);
  templates.value = normalizedTemplates;

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(normalizedTemplates));
  }
}

async function createBlankTemplate() {
  const editor = getEditor();
  if (!editor) return;

  const shapeIds = editor.getCurrentPageShapeIdsSorted();
  if (shapeIds.length && !window.confirm('清空当前画布并新建模板？')) return;

  editor.markHistoryStoppingPoint('new print template');
  editor.run(
    () => {
      if (shapeIds.length) editor.deleteShapes(shapeIds);
      editor.selectNone();
    },
    { ignoreShapeLock: true }
  );

  selectedTemplateId.value = '';
  showMessage('已新建空白模板', 'success');
}

async function saveCurrentTemplate() {
  const editor = getEditor();
  if (!editor) return;

  const content = await getCurrentTemplateContent(editor);
  if (!content) {
    showMessage('当前画布没有可保存内容', 'error');
    return;
  }

  const currentName = selectedTemplate.value?.name;
  const nextName = window.prompt('模板名称', currentName ?? `打印模板 ${templates.value.length + 1}`);
  if (nextName === null) return;

  const name = nextName.trim();
  if (!name) {
    showMessage('模板名称不能为空', 'error');
    return;
  }

  const workspace = designerRef.value?.getWorkspaceTemplateConfig();
  const nextTemplates = templates.value.slice();
  const existingIndex = selectedTemplateId.value
    ? nextTemplates.findIndex((template) => template.id === selectedTemplateId.value)
    : nextTemplates.findIndex((template) => template.name === name);

  if (existingIndex >= 0) {
    const existing = nextTemplates[existingIndex];
    nextTemplates[existingIndex] = {
      ...existing,
      name,
      content: cloneJson(content),
      workspace: cloneWorkspace(workspace),
      updatedAt: Date.now()
    };
    selectedTemplateId.value = existing.id;
  } else {
    const record = createTemplateRecord(name, content, workspace);
    nextTemplates.unshift(record);
    selectedTemplateId.value = record.id;
  }

  await saveTemplateRecords(nextTemplates);
  showMessage('模板已保存', 'success');
}

async function loadTemplate(template: VueTemplateRecord, options: { confirmReplace?: boolean } = {}) {
  const editor = getEditor();
  if (!editor) return;

  const shouldConfirmReplace = options.confirmReplace ?? true;
  const shapeIds = editor.getCurrentPageShapeIdsSorted();
  if (shouldConfirmReplace && shapeIds.length && selectedTemplateId.value !== template.id) {
    const confirmed = window.confirm(`加载"${template.name}"会替换当前画布，是否继续？`);
    if (!confirmed) return;
  }

  editor.markHistoryStoppingPoint('load print template');
  editor.run(
    () => {
      if (shapeIds.length) editor.deleteShapes(shapeIds);
      editor.selectNone();
    },
    { ignoreShapeLock: true }
  );

  if (template.workspace) {
    designerRef.value?.applyWorkspaceTemplateConfig(cloneWorkspace(template.workspace));
  }

  editor.putContentOntoCurrentPage(cloneJson(template.content), {
    preservePosition: true,
    select: true
  });

  selectedTemplateId.value = template.id;
  showMessage(`已加载 ${template.name}`, 'success');
}

async function loadRouteTemplate() {
  const templateId = getRouteTemplateId();
  if (!templateId || selectedTemplateId.value === templateId) return;

  const editor = designerRef.value?.getEditor();
  if (!editor) return;

  const template = templates.value.find((item) => item.id === templateId);
  if (!template) {
    showMessage('未找到要编辑的模板', 'error');
    return;
  }

  await loadTemplate(template, { confirmReplace: false });
}

async function duplicateSelectedTemplate() {
  const template = selectedTemplate.value;
  if (!template) return;

  const name = window.prompt('模板名称', `${template.name} 副本`);
  if (name === null) return;

  const trimmedName = name.trim();
  if (!trimmedName) {
    showMessage('模板名称不能为空', 'error');
    return;
  }

  const nextTemplate = createTemplateRecord(
    trimmedName,
    cloneJson(template.content),
    cloneWorkspace(template.workspace)
  );
  await saveTemplateRecords([nextTemplate, ...templates.value]);
  selectedTemplateId.value = nextTemplate.id;
  showMessage('模板已复制', 'success');
}

async function deleteSelectedTemplate() {
  const template = selectedTemplate.value;
  if (!template) return;
  if (!window.confirm(`删除"${template.name}"？`)) return;

  await saveTemplateRecords(templates.value.filter((item) => item.id !== template.id));
  selectedTemplateId.value = '';
  showMessage('模板已删除', 'success');
}

async function getCurrentTemplateContent(editor: Editor) {
  const shapeIds = editor.getCurrentPageShapeIdsSorted();
  if (!shapeIds.length) return null;

  const content = editor.getContentFromCurrentPage(shapeIds);
  return editor.resolveAssetsInContent(content);
}

function getEditor() {
  const editor = designerRef.value?.getEditor();
  if (!editor) {
    showMessage('设计器尚未就绪', 'error');
    return null;
  }
  return editor;
}

function createTemplateRecord(
  name: string,
  content: TLContent,
  workspace?: VueTemplateWorkspaceConfig
): VueTemplateRecord {
  const now = Date.now();
  return {
    id: createTemplateId(),
    name,
    createdAt: now,
    updatedAt: now,
    content: cloneJson(content),
    workspace: cloneWorkspace(workspace)
  };
}

function normalizeTemplateRecords(value: unknown): VueTemplateRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isTemplateRecord).map((template) => ({
    ...template,
    content: cloneJson(template.content),
    workspace: cloneWorkspace(template.workspace)
  }));
}

function isTemplateRecord(value: unknown): value is VueTemplateRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    isRecord(value.content)
  );
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneWorkspace(workspace: VueTemplateWorkspaceConfig | undefined) {
  return workspace ? cloneJson(workspace) : undefined;
}

function createTemplateId() {
  if (globalThis.crypto?.randomUUID) return `print-template:${globalThis.crypto.randomUUID()}`;
  return `print-template:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatTemplateDate(timestamp: number) {
  if (!Number.isFinite(timestamp)) return '';

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function getRouteTemplateId() {
  const value = route.query.templateId;
  return typeof value === 'string' ? value : '';
}

function showMessage(nextMessage: string, type: 'info' | 'success' | 'error' = 'info') {
  message.value = nextMessage;
  messageType.value = type;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
</script>

<style scoped>
.print-designer-page {
  display: grid;
  grid-template-columns: 286px minmax(0, 1fr);
  gap: 8px;
  height: calc(100vh - 60px);
  min-height: 0;
  padding: 8px;
  background: #f4f6f8;
}

.print-template-panel,
.print-canvas-shell {
  min-height: 0;
  border: 1px solid #d6dce5;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}

.print-template-panel {
  display: flex;
  flex-direction: column;
  color: #111827;
}

.print-template-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 62px;
  border-bottom: 1px solid #e5eaf1;
  padding: 12px;
}

.print-template-panel__header h2 {
  margin: 0;
  font-size: 17px;
  line-height: 22px;
}

.print-template-panel__header span,
.print-template-row__meta,
.print-message {
  color: #64748b;
  font-size: 12px;
}

.print-template-actions,
.print-template-footer {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 12px;
}

.print-template-footer {
  border-top: 1px solid #e5eaf1;
}

.print-button,
.print-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  height: 32px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
}

.print-icon-button {
  width: 32px;
  padding: 0;
  font-size: 16px;
}

.print-button:hover:not(:disabled),
.print-icon-button:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}

.print-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.print-button--primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #ffffff;
}

.print-button--primary:hover:not(:disabled) {
  border-color: #0b605a;
  background: #0b605a;
}

.print-button--danger {
  color: #b91c1c;
}

.print-message {
  margin: 0 12px 10px;
  border-radius: 6px;
  background: #f8fafc;
  line-height: 18px;
  padding: 7px 9px;
}

.print-message--success {
  background: #ecfdf5;
  color: #047857;
}

.print-message--error {
  background: #fef2f2;
  color: #b91c1c;
}

.print-template-list {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow: auto;
  padding: 2px 8px 12px;
}

.print-template-row {
  display: grid;
  gap: 3px;
  min-height: 50px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #111827;
  cursor: pointer;
  font: inherit;
  padding: 8px 10px;
  text-align: left;
}

.print-template-row:hover,
.print-template-row.is-active {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.print-template-row__name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 750;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.print-canvas-shell {
  position: relative;
}

.print-canvas-shell :deep(.app-shell) {
  height: 100%;
}

@media (max-width: 980px) {
  .print-designer-page {
    grid-template-columns: 1fr;
    height: auto;
    min-height: calc(100vh - 60px);
  }

  .print-template-panel {
    min-height: 260px;
  }

  .print-canvas-shell {
    min-height: 640px;
  }
}
</style>
