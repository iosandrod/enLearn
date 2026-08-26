<template>
  <aside
    class="lowcode-category-drawer"
    :class="{ 'is-collapsed': collapsed }"
    :aria-label="collapsed ? '类别树（已收起）' : '类别树'"
  >
    <header class="lc-category-drawer__header">
      <template v-if="!collapsed">
        <div class="lc-category-drawer__title">
          <i class="ri-folder-tree-line" aria-hidden="true" />
          <span>类别</span>
        </div>
        <button
          type="button"
          class="lc-category-drawer__icon-button"
          title="刷新类别树"
          aria-label="刷新类别树"
          :disabled="loading"
          @click="loadCategories"
        >
          <i class="ri-refresh-line" :class="{ 'is-spinning': loading }" aria-hidden="true" />
        </button>
      </template>

      <button
        type="button"
        class="lc-category-drawer__icon-button lc-category-drawer__collapse"
        :title="collapsed ? '展开类别树' : '收起类别树'"
        :aria-label="collapsed ? '展开类别树' : '收起类别树'"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <i :class="collapsed ? 'ri-arrow-right-s-line' : 'ri-arrow-left-s-line'" aria-hidden="true" />
      </button>
    </header>

    <div v-if="!collapsed" class="lc-category-drawer__body" aria-live="polite">
      <div v-if="loading" class="lc-category-drawer__state">
        <i class="ri-loader-4-line is-spinning" aria-hidden="true" />
        <span>正在加载类别...</span>
      </div>
      <div v-else-if="errorMessage" class="lc-category-drawer__state is-error">
        <i class="ri-error-warning-line" aria-hidden="true" />
        <span>{{ errorMessage }}</span>
      </div>
      <div v-else-if="!tree.length" class="lc-category-drawer__state">
        <i class="ri-folder-line" aria-hidden="true" />
        <span>暂无类别</span>
      </div>
      <ul v-else class="lc-category-drawer__tree" role="tree" aria-label="页面关联类别">
        <LowCodeCategoryTreeNode
          v-for="node in tree"
          :key="String(node.id)"
          :node="node"
          :expanded-ids="expandedIds"
          :selected-id="selectedId"
          @toggle="toggleNode"
          @select="selectNode"
          @add-child="addChildCategory"
          @delete="deleteCategory"
        />
      </ul>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import type { LowCodeHostServiceApi } from '../core/host';
import type { LowCodePageBlock, LowCodePageRecord, LowCodePageRelateConfig } from '../types/lowcode';
import { confirmLowCodePage, openGlobalDialog } from '../runtime/global-dialog';
import { getLowCodePage } from '../runtime/lowcode-pages';
import LowCodeCategoryTreeNode, {
  type LowCodeCategoryTreeNodeData,
} from './LowCodeCategoryTreeNode.vue';

const props = defineProps<{
  config: LowCodePageRelateConfig;
  serviceApi: LowCodeHostServiceApi;
}>();

const emit = defineEmits<{
  select: [node: LowCodeCategoryTreeNodeData];
}>();

const collapsed = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const tree = ref<LowCodeCategoryTreeNodeData[]>([]);
const expandedIds = ref(new Set<string>());
const selectedId = ref('');
let requestVersion = 0;

watch(
  () => readString(props.config?.category),
  () => void loadCategories(),
  { immediate: true },
);

onBeforeUnmount(() => {
  requestVersion += 1;
});

async function loadCategories() {
  const category = readString(props.config?.category);
  if (!category) {
    tree.value = [];
    expandedIds.value = new Set();
    selectedId.value = '';
    return;
  }

  const currentVersion = ++requestVersion;
  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await props.serviceApi.invoke('planning', 'listRelationOptions', {
      resource: 'planning_category',
      labelField: 'name',
      filters: {
        target_type: category,
        status: 'active',
      },
      tree: true,
    });
    if (currentVersion !== requestVersion) return;

    const nextTree = normalizeTree(result);
    tree.value = nextTree;
    expandedIds.value = collectBranchIds(nextTree);
    if (!containsNode(nextTree, selectedId.value)) selectedId.value = '';
  } catch (error) {
    if (currentVersion !== requestVersion) return;
    tree.value = [];
    expandedIds.value = new Set();
    errorMessage.value = error instanceof Error ? error.message : '类别树加载失败';
  } finally {
    if (currentVersion === requestVersion) loading.value = false;
  }
}

function toggleNode(node: LowCodeCategoryTreeNodeData) {
  const key = String(node.id ?? '');
  const next = new Set(expandedIds.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedIds.value = next;
}

function selectNode(node: LowCodeCategoryTreeNodeData) {
  selectedId.value = String(node.id ?? '');
  emit('select', node);
}

async function addChildCategory(parent: LowCodeCategoryTreeNodeData) {
  const category = readString(props.config?.category);
  const parentId = readString(parent.id);
  if (!category || !parentId) return;

  const editPage = await getLowCodePage(props.serviceApi, {
    code: 'planning_category-edit',
    includeData: false,
  });
  const result = await confirmLowCodePage({
    page: createCategoryEditPage(editPage, category, parentId),
    includeData: false,
    serviceApi: props.serviceApi,
    title: `添加子类别 - ${parent.label}`,
    width: 'min(560px, calc(100vw - 32px))',
    confirmLabel: '保存',
    cancelLabel: '取消',
    submitOnConfirm: true,
    dialog: { id: `category-child-editor-${parentId}` },
  });
  if (result.action !== 'confirm') return;
  expandedIds.value = new Set([...expandedIds.value, parentId]);
  await loadCategories();
}

function createCategoryEditPage(
  page: LowCodePageRecord,
  category: string,
  parentId: string,
): LowCodePageRecord {
  const initialValues = {
    id: '',
    target_type: category,
    code: '',
    name: '',
    parent_id: parentId,
    description: '',
    status: 'active',
    sort_order: 0,
    metadata: {},
    source: '',
  };
  const prepareBlocks = (blocks: LowCodePageBlock[]): LowCodePageBlock[] => blocks.map((block) => {
    if (block.kind === 'buttonGroup') return { ...block, actions: [] };
    if (block.kind === 'form') {
      return {
        ...block,
        sourceKey: undefined,
        submitSourceKey: 'planning_categoryRows',
        initialValues,
        schema: { ...block.schema, actions: [] },
      };
    }
    if (block.kind === 'tabs') {
      return {
        ...block,
        tabs: block.tabs.map((tab) => ({ ...tab, blocks: prepareBlocks(tab.blocks) })),
      };
    }
    if (block.kind === 'section' || block.kind === 'container') {
      return { ...block, blocks: prepareBlocks(block.blocks) };
    }
    return block;
  });

  return {
    ...page,
    schema: {
      ...page.schema,
      dataSources: {
        planning_categoryRows: {
          key: 'planning_categoryRows',
          serviceName: 'planning',
          serviceMethod: 'listItems',
          saveMethod: 'saveItem',
          postData: { resource: 'planning_category' },
          autoLoad: false,
        },
        ...(page.schema.dataSources?.planning_categoryOptions
          ? { planning_categoryOptions: page.schema.dataSources.planning_categoryOptions }
          : {}),
      },
      blocks: prepareBlocks(page.schema.blocks),
    },
  };
}

async function deleteCategory(node: LowCodeCategoryTreeNodeData) {
  const nodeId = readString(node.id);
  if (!nodeId) return;

  const result = await openGlobalDialog({
    id: `category-delete-confirm-${nodeId}`,
    title: '删除类别',
    width: 'min(440px, calc(100vw - 32px))',
    showFooter: true,
    body: () => `确定删除类别“${node.label}”吗？存在子类别或已关联数据时将无法删除。`,
    actions: [
      { code: 'cancel', label: '取消', role: 'cancel' },
      { code: 'confirm', label: '删除', role: 'confirm', status: 'danger' },
    ],
    onConfirm: async () => {
      await props.serviceApi.invoke('planning', 'deleteItem', {
        resource: 'planning_category',
        id: nodeId,
      });
    },
  });
  if (result.action !== 'confirm') return;
  if (selectedId.value === nodeId) {
    selectedId.value = '';
    emit('select', { id: '', label: '' });
  }
  await loadCategories();
}

function normalizeTree(value: unknown): LowCodeCategoryTreeNodeData[] {
  const candidate = unwrapRows(value);
  if (!Array.isArray(candidate)) return [];

  return candidate
    .filter(isRecord)
    .map((item) => ({
      id: item.id,
      label: readString(item.label ?? item.name ?? item.code ?? item.id),
      ...(Array.isArray(item.children)
        ? { children: normalizeTree(item.children) }
        : {}),
    }))
    .filter((item) => item.label !== '');
}

function unwrapRows(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.rows)) return value.rows;
  return value;
}

function collectBranchIds(nodes: LowCodeCategoryTreeNodeData[]) {
  const ids = new Set<string>();
  const visit = (items: LowCodeCategoryTreeNodeData[]) => {
    items.forEach((item) => {
      if (!item.children?.length) return;
      ids.add(String(item.id ?? ''));
      visit(item.children);
    });
  };
  visit(nodes);
  return ids;
}

function containsNode(nodes: LowCodeCategoryTreeNodeData[], id: string): boolean {
  if (!id) return false;
  return nodes.some((node) => (
    String(node.id ?? '') === id || containsNode(node.children ?? [], id)
  ));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}
</script>

<style scoped>
.lowcode-category-drawer {
  display: flex;
  flex: 0 0 248px;
  flex-direction: column;
  width: 248px;
  min-width: 0;
  height: 100%;
  min-height: 0;
  border-right: 1px solid #dfe3e8;
  background: #fff;
  color: #344054;
  transition: flex-basis 160ms ease, width 160ms ease;
}

.lowcode-category-drawer.is-collapsed {
  flex-basis: 20px;
  width: 20px;
  border-right: 0;
  background: transparent;
}

.lc-category-drawer__header {
  display: flex;
  flex: 0 0 40px;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 40px;
  padding: 0 5px 0 10px;
  border-bottom: 1px solid #eaecf0;
}

.is-collapsed .lc-category-drawer__header {
  justify-content: center;
  padding: 0;
  border-bottom-color: transparent;
}

.is-collapsed .lc-category-drawer__collapse {
  flex-basis: 20px;
  width: 20px;
}

.lc-category-drawer__title {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
}

.lc-category-drawer__title i {
  color: #475467;
  font-size: 16px;
}

.lc-category-drawer__icon-button {
  display: inline-grid;
  flex: 0 0 28px;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #667085;
  cursor: pointer;
  font-size: 16px;
}

.lc-category-drawer__icon-button:hover:not(:disabled) {
  background: #f2f4f7;
  color: #101828;
}

.lc-category-drawer__icon-button:disabled {
  cursor: default;
  opacity: 0.55;
}

.lc-category-drawer__body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 8px 6px;
  overflow: auto;
  overscroll-behavior: contain;
}

.lc-category-drawer__tree {
  min-width: max-content;
  margin: 0;
  padding: 0;
}

.lc-category-drawer__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 96px;
  padding: 12px;
  color: #667085;
  font-size: 12px;
  text-align: center;
}

.lc-category-drawer__state.is-error {
  color: #b42318;
}

.is-spinning {
  animation: lc-category-spin 900ms linear infinite;
}

@keyframes lc-category-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 820px) {
  .lowcode-category-drawer {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 35;
    width: min(264px, calc(100vw - 48px));
    box-shadow: 8px 0 20px rgb(15 23 42 / 12%);
  }

  .lowcode-category-drawer.is-collapsed {
    width: 20px;
    box-shadow: none;
  }
}
</style>
