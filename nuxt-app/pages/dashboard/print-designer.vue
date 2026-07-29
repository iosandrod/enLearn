<template>
  <section class="print-template-page">
    <header class="print-template-toolbar">
      <div>
        <h1>打印模板管理</h1>
        <span>{{ templates.length }} 个模板</span>
      </div>
      <div class="print-template-toolbar__actions">
        <button type="button" class="print-icon-button" title="刷新" aria-label="刷新" @click="refreshTemplates">
          <i class="ri-refresh-line" />
        </button>
        <button type="button" class="print-button print-button--primary" @click="openDesigner()">
          <i class="ri-file-add-line" />
          <span>新建模板</span>
        </button>
      </div>
    </header>

    <div class="print-template-filters">
      <label class="print-search">
        <i class="ri-search-line" />
        <input v-model.trim="keyword" type="search" placeholder="搜索模板名称" />
      </label>
      <p v-if="message" :class="messageClass">{{ message }}</p>
    </div>

    <div class="print-template-table-shell">
      <table class="print-template-table">
        <thead>
          <tr>
            <th>模板名称</th>
            <th>纸张</th>
            <th>数据源</th>
            <th>节点数</th>
            <th>创建时间</th>
            <th>更新时间</th>
            <th class="print-template-table__actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="template in filteredTemplates" :key="template.id">
            <td>
              <button type="button" class="print-template-name" @click="openDesigner(template)">
                {{ template.name }}
              </button>
            </td>
            <td>{{ formatPageSize(template) }}</td>
            <td>{{ formatDataSource(template) }}</td>
            <td>{{ template.content.shapes.length }}</td>
            <td>{{ formatTemplateDate(template.createdAt) }}</td>
            <td>{{ formatTemplateDate(template.updatedAt) }}</td>
            <td>
              <div class="print-row-actions">
                <button type="button" class="print-icon-button" title="设计" aria-label="设计" @click="openDesigner(template)">
                  <i class="ri-edit-box-line" />
                </button>
                <button type="button" class="print-icon-button" title="重命名" aria-label="重命名" @click="renameTemplate(template)">
                  <i class="ri-edit-2-line" />
                </button>
                <button type="button" class="print-icon-button" title="复制" aria-label="复制" @click="duplicateTemplate(template)">
                  <i class="ri-file-copy-line" />
                </button>
                <button
                  type="button"
                  class="print-icon-button print-icon-button--danger"
                  title="删除"
                  aria-label="删除"
                  @click="deleteTemplate(template)"
                >
                  <i class="ri-delete-bin-line" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!filteredTemplates.length">
            <td colspan="7" class="print-template-empty">
              暂无打印模板
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { VueTemplateRecord, VueTemplateWorkspaceConfig } from 'tldraw-vue-phase-one';

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
});

const TEMPLATE_STORAGE_KEY = 'enlearn.print-designer.templates.v1';

const router = useRouter();
const templates = ref<VueTemplateRecord[]>([]);
const keyword = ref('');
const message = ref('');
const messageType = ref<'info' | 'success' | 'error'>('info');

const filteredTemplates = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  if (!value) return templates.value;
  return templates.value.filter((template) => template.name.toLowerCase().includes(value));
});
const messageClass = computed(() => `print-message print-message--${messageType.value}`);

onMounted(() => {
  refreshTemplates();
});

async function refreshTemplates() {
  templates.value = loadTemplateRecords().sort((left, right) => right.updatedAt - left.updatedAt);
}

function loadTemplateRecords() {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
  if (!raw) return [];

  try {
    return normalizeTemplateRecords(JSON.parse(raw));
  } catch {
    window.localStorage.removeItem(TEMPLATE_STORAGE_KEY);
    return [];
  }
}

function saveTemplateRecords(nextTemplates: readonly VueTemplateRecord[]) {
  const normalizedTemplates = normalizeTemplateRecords(nextTemplates);
  templates.value = normalizedTemplates.sort((left, right) => right.updatedAt - left.updatedAt);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(normalizedTemplates));
  }
}

function openDesigner(template?: VueTemplateRecord) {
  if (template) {
    router.push({ path: '/dashboard/advanced/print-designer', query: { templateId: template.id } });
    return;
  }

  router.push('/dashboard/advanced/print-designer');
}

function renameTemplate(template: VueTemplateRecord) {
  const nextName = window.prompt('模板名称', template.name);
  if (nextName === null) return;

  const name = nextName.trim();
  if (!name) {
    showMessage('模板名称不能为空', 'error');
    return;
  }

  saveTemplateRecords(
    templates.value.map((item) =>
      item.id === template.id ? { ...item, name, updatedAt: Date.now() } : item
    )
  );
  showMessage('模板已重命名', 'success');
}

function duplicateTemplate(template: VueTemplateRecord) {
  const nextName = window.prompt('模板名称', `${template.name} 副本`);
  if (nextName === null) return;

  const name = nextName.trim();
  if (!name) {
    showMessage('模板名称不能为空', 'error');
    return;
  }

  const now = Date.now();
  saveTemplateRecords([
    {
      ...template,
      id: createTemplateId(),
      name,
      createdAt: now,
      updatedAt: now,
      content: cloneJson(template.content),
      workspace: cloneWorkspace(template.workspace)
    },
    ...templates.value
  ]);
  showMessage('模板已复制', 'success');
}

function deleteTemplate(template: VueTemplateRecord) {
  if (!window.confirm(`删除"${template.name}"？`)) return;

  saveTemplateRecords(templates.value.filter((item) => item.id !== template.id));
  showMessage('模板已删除', 'success');
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
  const content = value.content;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    isRecord(content) &&
    Array.isArray(content.shapes)
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

function formatPageSize(template: VueTemplateRecord) {
  const pageSize = template.workspace?.pageSizeMm;
  if (!pageSize) return '-';
  return `${formatNumber(pageSize.w)} x ${formatNumber(pageSize.h)} mm`;
}

function formatDataSource(template: VueTemplateRecord) {
  const dataSource = template.workspace?.printDataSource;
  if (!dataSource || dataSource.type === 'none') return '-';
  const labels: Record<string, string> = {
    static: '静态数据',
    entity: '实体数据',
    api: '接口数据'
  };
  return labels[dataSource.type] ?? dataSource.type;
}

function formatTemplateDate(timestamp: number) {
  if (!Number.isFinite(timestamp)) return '-';

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
.print-template-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: calc(100vh - 60px);
  padding: 12px;
  background: #f4f6f8;
}

.print-template-toolbar,
.print-template-filters,
.print-template-table-shell {
  border: 1px solid #d6dce5;
  border-radius: 8px;
  background: #ffffff;
}

.print-template-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  padding: 12px 16px;
}

.print-template-toolbar h1 {
  margin: 0;
  color: #111827;
  font-size: 18px;
  line-height: 24px;
}

.print-template-toolbar span {
  color: #64748b;
  font-size: 12px;
}

.print-template-toolbar__actions,
.print-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.print-template-filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
}

.print-search {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: min(360px, 100%);
  height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0 10px;
  color: #64748b;
}

.print-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: #111827;
  font: inherit;
  font-size: 13px;
}

.print-template-table-shell {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.print-template-table {
  width: 100%;
  min-width: 920px;
  border-collapse: collapse;
  color: #111827;
  font-size: 13px;
}

.print-template-table th,
.print-template-table td {
  border-bottom: 1px solid #e5eaf1;
  padding: 11px 14px;
  text-align: left;
  white-space: nowrap;
}

.print-template-table th {
  background: #f8fafc;
  color: #475569;
  font-weight: 750;
}

.print-template-table tbody tr:hover {
  background: #f8fbff;
}

.print-template-table__actions {
  width: 184px;
}

.print-template-name {
  max-width: 260px;
  border: 0;
  background: transparent;
  color: #0f62fe;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  overflow: hidden;
  padding: 0;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.print-button,
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
  font-weight: 700;
}

.print-button {
  min-width: 92px;
  padding: 0 12px;
}

.print-icon-button {
  width: 32px;
  padding: 0;
  font-size: 16px;
}

.print-button:hover,
.print-icon-button:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}

.print-button--primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #ffffff;
}

.print-button--primary:hover {
  border-color: #0b605a;
  background: #0b605a;
}

.print-icon-button--danger {
  color: #b91c1c;
}

.print-message {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.print-message--success {
  color: #047857;
}

.print-message--error {
  color: #b91c1c;
}

.print-template-empty {
  height: 180px;
  color: #94a3b8;
  text-align: center;
}

@media (max-width: 760px) {
  .print-template-toolbar,
  .print-template-filters {
    align-items: stretch;
    flex-direction: column;
  }

  .print-template-toolbar__actions {
    justify-content: flex-end;
  }
}
</style>
