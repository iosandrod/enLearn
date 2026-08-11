<template>
  <div class="lc-context-drawer">
    <div class="lc-context-drawer__search">
      <vxe-input
        v-model="query"
        clearable
        prefix-icon="ri-search-line"
        placeholder="搜索表、字段、API、函数或节点"
      />
    </div>

    <div class="lc-context-drawer__tabs" role="tablist" aria-label="上下文分类">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="lc-context-drawer__tab"
        :class="{ 'is-active': activeTab === tab.key }"
        :aria-selected="activeTab === tab.key"
        role="tab"
        @click="activeTab = tab.key"
      >
        <i :class="tab.icon" aria-hidden="true" />
        <span>{{ tab.label }}</span>
        <small>{{ tab.count }}</small>
      </button>
    </div>

    <div
      class="lc-context-drawer__content"
      :class="{ 'is-field-table': activeTab === 'fields' }"
    >
      <div v-if="activeTab === 'fields'" class="lc-context-drawer__field-tree">
        <vxe-table
          ref="fieldTableRef"
          auto-resize
          border
          size="mini"
          height="100%"
          show-overflow="tooltip"
          :data="filteredFieldTree"
          :row-config="fieldTreeRowConfig"
          :tree-config="fieldTreeConfig"
          :row-class-name="fieldTreeRowClassName"
          @cell-click="handleFieldTreeCellClick"
        >
          <vxe-column
            field="label"
            title="表 / 字段"
            min-width="176"
            tree-node
          >
            <template #default="{ row }">
              <span
                class="lc-context-drawer__field-name"
                :class="{ 'is-table': row.type === 'table' }"
              >
                <i :class="row.icon || (row.type === 'table' ? 'ri-table-line' : 'ri-braces-line')" />
                <span class="flex flex-row">
                  <strong>{{ row.label }}</strong>
                  <small v-if="row.type === 'field' && row.field !== row.label">
                    {{ row.field }}
                  </small>
                  <small v-else-if="row.type === 'table'">
                    {{ row.children.length }} 个字段
                  </small>
                </span>
              </span>
            </template>
          </vxe-column>
          <vxe-column title="来源" min-width="116">
            <template #default="{ row }">
              <span class="lc-context-drawer__field-source">
                <strong>{{ row.sourceKey || '-' }}</strong>
                <small v-if="row.blockId">{{ row.blockId }}</small>
              </span>
            </template>
          </vxe-column>
          <vxe-column title="类型" width="74" align="center">
            <template #default="{ row }">
              <span class="lc-context-drawer__field-kind">
                {{ row.type === 'table' ? row.role : row.badge }}
              </span>
            </template>
          </vxe-column>
          <vxe-column width="42" align="center">
            <template #default="{ row }">
              <button
                v-if="allowInsert && row.entry"
                type="button"
                class="lc-context-drawer__field-insert"
                :title="`插入 ${row.entry.insertText}`"
                @click.stop="insertEntry(row.entry)"
              >
                <i class="ri-add-line" aria-hidden="true" />
              </button>
            </template>
          </vxe-column>
        </vxe-table>
      </div>

      <template v-else-if="activeTab !== 'nodes'">
        <section
          v-for="section in groupedEntries"
          :key="section.group"
          class="lc-context-drawer__section"
        >
          <header>
            <span>{{ section.group }}</span>
            <small>{{ section.entries.length }}</small>
          </header>
          <button
            v-for="entry in section.entries"
            :key="entry.id"
            type="button"
            class="lc-context-drawer__entry"
            :class="{ 'is-inspect-only': !allowInsert }"
            :title="allowInsert ? `插入 ${entry.insertText}` : entry.insertText"
            @click="insertEntry(entry)"
          >
            <i :class="entry.icon || 'ri-code-line'" aria-hidden="true" />
            <span class="lc-context-drawer__entry-main">
              <strong>{{ entry.label }}</strong>
              <small v-if="entry.description">{{ entry.description }}</small>
              <code>{{ entry.insertText }}</code>
            </span>
            <span v-if="entry.badge" class="lc-context-drawer__badge">
              {{ entry.badge }}
            </span>
            <i
              v-if="allowInsert"
              class="ri-add-line lc-context-drawer__insert"
              aria-hidden="true"
            />
          </button>
        </section>
      </template>

      <div v-else class="lc-context-drawer__tree">
        <template
          v-for="row in visibleNodeRows"
          :key="row.id"
        >
          <button
            v-if="row.type === 'node'"
            type="button"
            class="lc-context-drawer__node"
            :class="{ 'is-inspect-only': !allowInsert }"
            :style="{ paddingLeft: `${12 + row.depth * 18}px` }"
            :title="allowInsert ? `插入节点 ID ${row.node.blockId}` : `节点 ID ${row.node.blockId}`"
            @click="allowInsert ? insertNode(row.node) : toggleNode(row.node)"
          >
            <span
              class="lc-context-drawer__node-toggle"
              @click.stop="toggleNode(row.node)"
            >
              <i
                v-if="row.node.children.length || row.node.methods.length"
                :class="expandedNodeIds.has(row.node.id)
                  ? 'ri-arrow-down-s-line'
                  : 'ri-arrow-right-s-line'"
                aria-hidden="true"
              />
            </span>
            <i :class="row.node.icon" aria-hidden="true" />
            <span class="lc-context-drawer__node-main">
              <strong>{{ row.node.label }}</strong>
              <small>{{ row.node.blockId }}</small>
            </span>
            <span class="lc-context-drawer__node-meta">
              <span class="lc-context-drawer__kind">
                {{ row.node.kindLabel }} · {{ row.node.kind }}
              </span>
              <small>{{ row.node.methods.length }} methods</small>
            </span>
            <i
              v-if="allowInsert"
              class="ri-add-line lc-context-drawer__insert"
              aria-hidden="true"
            />
          </button>

          <button
            v-else
            type="button"
            class="lc-context-drawer__node-method"
            :class="{ 'is-inspect-only': !allowInsert }"
            :style="{ paddingLeft: `${30 + row.depth * 18}px` }"
            :title="allowInsert ? `插入 ${row.node.blockId}.${row.method.method}` : row.method.description"
            @click="insertNodeMethod(row.method)"
          >
            <i class="ri-function-line" aria-hidden="true" />
            <span class="lc-context-drawer__method-main">
              <span class="lc-context-drawer__method-title">
                <strong>{{ row.method.method }}</strong>
                <small>{{ row.method.label }}</small>
              </span>
              <small>{{ row.method.description }}</small>
              <code>{{ methodSignature(row.method) }}</code>
              <small class="lc-context-drawer__method-return">
                返回：{{ row.method.returns }}
              </small>
            </span>
            <i
              v-if="allowInsert"
              class="ri-add-line lc-context-drawer__insert"
              aria-hidden="true"
            />
          </button>
        </template>
      </div>

      <div v-if="isEmpty" class="lc-context-drawer__empty">
        <i class="ri-search-eye-line" aria-hidden="true" />
        <span>没有匹配的上下文项</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type {
  LowCodeContextCatalog,
  LowCodeContextCategory,
  LowCodeContextEntry,
  LowCodeContextFieldTreeNode,
  LowCodeContextNode,
  LowCodeContextNodeMethod,
} from '../runtime/lowcode-context';

const props = defineProps<{
  catalog: LowCodeContextCatalog;
  initialTab?: LowCodeContextCategory;
  allowInsert?: boolean;
  onInsert?: (
    insertText: string,
    item: LowCodeContextEntry | LowCodeContextNode | LowCodeContextNodeMethod,
  ) => void;
}>();

const query = ref('');
const activeTab = ref<LowCodeContextCategory>(props.initialTab ?? 'fields');
const expandedNodeIds = ref(new Set(flattenNodes(props.catalog.nodes).map((node) => node.id)));
const fieldTableRef = ref<{
  setAllTreeExpand?: (expanded: boolean) => Promise<void>;
}>();
const fieldTreeRowConfig = { keyField: 'id', isHover: true };
const fieldTreeConfig = {
  transform: false,
  childrenField: 'children',
  expandAll: true,
  showLine: true,
  indent: 16,
  trigger: 'row' as const,
};

function countFieldTreeEntries(nodes: LowCodeContextFieldTreeNode[]): number {
  return nodes.reduce((count, node) =>
    count + (node.type === 'field' || node.entry ? 1 : 0) + countFieldTreeEntries(node.children),
  0);
}

const fieldTreeEntryCount = computed(() => countFieldTreeEntries(props.catalog.fieldTree));

const tabs = computed(() => [
  { key: 'fields' as const, label: '字段', icon: 'ri-table-line', count: fieldTreeEntryCount.value },
  { key: 'apis' as const, label: 'API', icon: 'ri-shield-keyhole-line', count: props.catalog.apis.length },
  { key: 'functions' as const, label: '函数', icon: 'ri-function-line', count: props.catalog.functions.length },
  {
    key: 'nodes' as const,
    label: '节点',
    icon: 'ri-node-tree',
    count: flattenNodes(props.catalog.nodes).reduce(
      (count, node) => count + 1 + node.methods.length,
      0,
    ),
  },
]);

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

function entryMatches(entry: LowCodeContextEntry, search: string) {
  if (!search) return true;
  return [
    entry.label,
    entry.description,
    entry.insertText,
    entry.group,
    entry.badge,
    ...(entry.keywords ?? []),
  ].some((value) => value?.toLocaleLowerCase().includes(search));
}

const activeEntries = computed(() => {
  if (activeTab.value === 'nodes') return [];
  return props.catalog[activeTab.value];
});

const groupedEntries = computed(() => {
  const search = normalizeSearch(query.value);
  const groups = new Map<string, LowCodeContextEntry[]>();
  activeEntries.value
    .filter((entry) => entryMatches(entry, search))
    .forEach((entry) => {
      const entries = groups.get(entry.group) ?? [];
      entries.push(entry);
      groups.set(entry.group, entries);
    });
  return [...groups].map(([group, entries]) => ({ group, entries }));
});

function fieldTreeNodeMatches(node: LowCodeContextFieldTreeNode, search: string) {
  if (!search) return true;
  return [
    node.label,
    node.role,
    node.field,
    node.sourceKey,
    node.blockId,
    node.description,
    node.badge,
    node.entry?.insertText,
    ...(node.entry?.keywords ?? []),
  ].some((value) => value?.toLocaleLowerCase().includes(search));
}

function filterFieldTree(
  nodes: LowCodeContextFieldTreeNode[],
  search: string,
): LowCodeContextFieldTreeNode[] {
  if (!search) return nodes;
  return nodes.flatMap((node) => {
    const matches = fieldTreeNodeMatches(node, search);
    const children = matches
      ? node.children
      : filterFieldTree(node.children, search);
    return matches || children.length ? [{ ...node, children }] : [];
  });
}

const filteredFieldTree = computed(() =>
  filterFieldTree(props.catalog.fieldTree, normalizeSearch(query.value)),
);

watch([activeTab, filteredFieldTree], async ([tab]) => {
  if (tab !== 'fields') return;
  await nextTick();
  await fieldTableRef.value?.setAllTreeExpand?.(true);
}, { flush: 'post', immediate: true });

function fieldTreeRowClassName({ row }: { row: LowCodeContextFieldTreeNode }) {
  return row.type === 'table'
    ? 'lc-context-drawer__field-table-row'
    : 'lc-context-drawer__field-row';
}

function handleFieldTreeCellClick({ row }: { row: LowCodeContextFieldTreeNode }) {
  if (row.type !== 'field' || !row.entry) return;
  insertEntry(row.entry);
}

function flattenNodes(nodes: LowCodeContextNode[]) {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

function nodeMatches(node: LowCodeContextNode, search: string) {
  return [node.label, node.blockId, node.kind, node.kindLabel, node.description]
    .some((value) => value?.toLocaleLowerCase().includes(search));
}

function nodeMethodMatches(method: LowCodeContextNodeMethod, search: string) {
  return [
    method.method,
    method.label,
    method.description,
    method.returns,
    method.insertText,
    ...method.parameters.flatMap((parameter) => [
      parameter.name,
      parameter.type,
      parameter.description,
    ]),
  ].some((value) => value?.toLocaleLowerCase().includes(search));
}

type VisibleNodeRow =
  | {
      id: string;
      type: 'node';
      node: LowCodeContextNode;
      depth: number;
    }
  | {
      id: string;
      type: 'method';
      node: LowCodeContextNode;
      method: LowCodeContextNodeMethod;
      depth: number;
    };

const visibleNodeRows = computed(() => {
  const search = normalizeSearch(query.value);
  const rows: VisibleNodeRow[] = [];

  const visit = (nodes: LowCodeContextNode[], depth: number) => {
    nodes.forEach((node) => {
      if (search) {
        const matchesNode = nodeMatches(node, search);
        const matchingMethods = node.methods.filter((method) =>
          nodeMethodMatches(method, search),
        );
        if (matchesNode || matchingMethods.length) {
          rows.push({ id: node.id, type: 'node', node, depth });
          (matchesNode ? node.methods : matchingMethods).forEach((method) => {
            rows.push({
              id: method.id,
              type: 'method',
              node,
              method,
              depth: depth + 1,
            });
          });
        }
        visit(node.children, depth + 1);
        return;
      }
      rows.push({ id: node.id, type: 'node', node, depth });
      if (expandedNodeIds.value.has(node.id)) {
        node.methods.forEach((method) => {
          rows.push({
            id: method.id,
            type: 'method',
            node,
            method,
            depth: depth + 1,
          });
        });
        visit(node.children, depth + 1);
      }
    });
  };
  visit(props.catalog.nodes, 0);
  return rows;
});

const isEmpty = computed(() =>
  activeTab.value === 'fields'
    ? filteredFieldTree.value.length === 0
    : activeTab.value === 'nodes'
      ? visibleNodeRows.value.length === 0
      : groupedEntries.value.length === 0,
);

function toggleNode(node: LowCodeContextNode) {
  const next = new Set(expandedNodeIds.value);
  if (next.has(node.id)) next.delete(node.id);
  else next.add(node.id);
  expandedNodeIds.value = next;
}

function insertEntry(entry: LowCodeContextEntry) {
  if (!props.allowInsert) return;
  props.onInsert?.(entry.insertText, entry);
}

function insertNode(node: LowCodeContextNode) {
  if (!props.allowInsert) return;
  props.onInsert?.(node.insertText, node);
}

function insertNodeMethod(method: LowCodeContextNodeMethod) {
  if (!props.allowInsert) return;
  props.onInsert?.(method.insertText, method);
}

function methodSignature(method: LowCodeContextNodeMethod) {
  const parameters = method.parameters
    .map((parameter) => `${parameter.name}${parameter.required ? '' : '?'}: ${parameter.type}`)
    .join(', ');
  return `${method.method}({ ${parameters} })`;
}
</script>

<style>
.lc-context-drawer {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  color: #233044;
  background: #fff;
}

.lc-context-drawer__search {
  padding: 12px;
  border-bottom: 1px solid #e5e9ef;
}

.lc-context-drawer__search .vxe-input {
  width: 100%;
}

.lc-context-drawer__tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-bottom: 1px solid #dfe5ec;
}

.lc-context-drawer__tab {
  position: relative;
  display: inline-flex;
  min-width: 0;
  height: 42px;
  padding: 0 8px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 0;
  color: #657287;
  background: #f8fafc;
  cursor: pointer;
  font-size: 12px;
}

.lc-context-drawer__tab + .lc-context-drawer__tab {
  border-left: 1px solid #e5e9ef;
}

.lc-context-drawer__tab small {
  color: #8a96a8;
  font-size: 10px;
}

.lc-context-drawer__tab.is-active {
  color: #087f5b;
  background: #fff;
  font-weight: 600;
}

.lc-context-drawer__tab.is-active::after {
  position: absolute;
  right: 8px;
  bottom: 0;
  left: 8px;
  height: 2px;
  background: #0f9d71;
  content: '';
}

.lc-context-drawer__content {
  min-height: 0;
  overflow: auto;
}

.lc-context-drawer__content.is-field-table {
  overflow: hidden;
}

.lc-context-drawer__field-tree {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.lc-context-drawer__field-tree .vxe-table {
  border: 0;
  color: #273548;
}

.lc-context-drawer__field-tree .vxe-header--column {
  color: #566477;
  background: #f5f7fa;
  font-size: 11px;
  font-weight: 600;
}

.lc-context-drawer__field-tree .vxe-cell {
  padding-right: 7px;
  padding-left: 7px;
}

.lc-context-drawer__field-tree .lc-context-drawer__field-table-row > td {
  background: #f7f9fb;
}

.lc-context-drawer__field-tree .lc-context-drawer__field-table-row:hover > td,
.lc-context-drawer__field-tree .lc-context-drawer__field-row:hover > td {
  background: #eef9f4;
}

.lc-context-drawer__field-tree .lc-context-drawer__field-row {
  cursor: pointer;
}

.lc-context-drawer__field-name,
.lc-context-drawer__field-source {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}

.lc-context-drawer__field-name > i {
  flex: 0 0 auto;
  color: #708094;
  font-size: 14px;
}

.lc-context-drawer__field-name.is-table > i {
  color: #087f5b;
}

.lc-context-drawer__field-name > span,
.lc-context-drawer__field-source {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.lc-context-drawer__field-name strong,
.lc-context-drawer__field-source strong,
.lc-context-drawer__field-name small,
.lc-context-drawer__field-source small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-context-drawer__field-name strong,
.lc-context-drawer__field-source strong {
  font-size: 11px;
  font-weight: 600;
}

.lc-context-drawer__field-name small,
.lc-context-drawer__field-source small {
  color: #8792a2;
  font-size: 9px;
}

.lc-context-drawer__field-kind {
  display: inline-block;
  max-width: 64px;
  overflow: hidden;
  color: #667486;
  font-family: Consolas, "SFMono-Regular", monospace;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-context-drawer__field-insert {
  display: inline-grid;
  width: 24px;
  height: 24px;
  padding: 0;
  place-items: center;
  border: 0;
  color: #0b8b65;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
}

.lc-context-drawer__field-insert:hover,
.lc-context-drawer__field-insert:focus-visible {
  color: #056747;
  background: #dff5eb;
  outline: none;
}

.lc-context-drawer__section > header {
  display: flex;
  height: 34px;
  padding: 0 12px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #edf0f4;
  color: #5d697b;
  background: #f7f9fb;
  font-size: 11px;
  font-weight: 600;
}

.lc-context-drawer__section > header small {
  font-weight: 400;
}

.lc-context-drawer__entry,
.lc-context-drawer__node,
.lc-context-drawer__node-method {
  display: flex;
  width: 100%;
  min-width: 0;
  padding: 9px 12px;
  align-items: flex-start;
  gap: 9px;
  border: 0;
  border-bottom: 1px solid #edf0f4;
  color: inherit;
  background: #fff;
  cursor: pointer;
  text-align: left;
}

.lc-context-drawer__entry:hover,
.lc-context-drawer__entry:focus-visible,
.lc-context-drawer__node:hover,
.lc-context-drawer__node:focus-visible,
.lc-context-drawer__node-method:hover,
.lc-context-drawer__node-method:focus-visible {
  background: #f0faf6;
  outline: none;
}

.lc-context-drawer__entry.is-inspect-only,
.lc-context-drawer__node.is-inspect-only,
.lc-context-drawer__node-method.is-inspect-only {
  cursor: default;
}

.lc-context-drawer__entry > i:first-child,
.lc-context-drawer__node > i,
.lc-context-drawer__node-method > i:first-child {
  flex: 0 0 auto;
  margin-top: 2px;
  color: #627085;
  font-size: 15px;
}

.lc-context-drawer__entry-main,
.lc-context-drawer__node-main,
.lc-context-drawer__method-main {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.lc-context-drawer__entry-main strong,
.lc-context-drawer__node-main strong,
.lc-context-drawer__method-main strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-context-drawer__entry-main small,
.lc-context-drawer__node-main small,
.lc-context-drawer__method-main small {
  overflow: hidden;
  color: #7b8798;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-context-drawer__entry-main code {
  overflow: hidden;
  color: #2f5f52;
  font-family: Consolas, "SFMono-Regular", monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-context-drawer__badge,
.lc-context-drawer__kind {
  max-width: 112px;
  flex: 0 1 auto;
  overflow: hidden;
  color: #687588;
  font-family: Consolas, "SFMono-Regular", monospace;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-context-drawer__insert {
  flex: 0 0 auto;
  color: #0f9d71;
  font-size: 16px;
}

.lc-context-drawer__tree {
  display: grid;
}

.lc-context-drawer__node {
  min-height: 38px;
  padding-top: 8px;
  padding-bottom: 8px;
  align-items: center;
}

.lc-context-drawer__node-meta {
  display: grid;
  max-width: 132px;
  flex: 0 1 auto;
  justify-items: end;
  gap: 2px;
}

.lc-context-drawer__node-meta small {
  color: #8a96a8;
  font-size: 9px;
}

.lc-context-drawer__node-method {
  min-height: 62px;
  background: #fbfcfd;
}

.lc-context-drawer__node-method > i:first-child {
  color: #0f8061;
}

.lc-context-drawer__method-main {
  gap: 3px;
}

.lc-context-drawer__method-title {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 7px;
}

.lc-context-drawer__method-title strong {
  color: #26384a;
  font-family: Consolas, "SFMono-Regular", monospace;
}

.lc-context-drawer__method-main code {
  overflow: hidden;
  color: #2f5f52;
  font-family: Consolas, "SFMono-Regular", monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-context-drawer__method-main .lc-context-drawer__method-return {
  color: #687588;
  white-space: normal;
}

.lc-context-drawer__node-toggle {
  display: inline-grid;
  width: 14px;
  height: 20px;
  flex: 0 0 14px;
  place-items: center;
}

.lc-context-drawer__empty {
  display: grid;
  min-height: 180px;
  place-items: center;
  align-content: center;
  gap: 8px;
  color: #8a96a8;
  font-size: 12px;
}

.lc-context-drawer__empty i {
  font-size: 24px;
}

.lowcode-context-drawer .vxe-drawer--body,
.lowcode-context-drawer .vxe-drawer--body-default,
.lowcode-context-drawer .vxe-drawer--content {
  min-height: 0;
  height: 100%;
  padding: 0;
}
</style>
