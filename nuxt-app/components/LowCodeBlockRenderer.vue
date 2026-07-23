<template>
  <section
    v-if="block.kind === 'container'"
    :class="['lc-node-container', { 'content-panel': block.panel === true }]"
    :style="containerStyle(block)"
  >
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <LowCodeBlockRenderer
      v-for="child in block.blocks"
      :key="child.id"
      :block="child"
      :resolved-data="resolvedData"
      :form-models="formModels"
      :search-filters="searchFilters"
      :loading-block-id="loadingBlockId"
      :loading-grid-id="loadingGridId"
      @form-submit="(payload) => emit('formSubmit', payload)"
      @form-action="(payload) => emit('formAction', payload)"
      @grid-edit="(payload) => emit('gridEdit', payload)"
      @grid-delete="(payload) => emit('gridDelete', payload)"
      @toolbar-action="(payload) => emit('toolbarAction', payload)"
      @search-submit="(payload) => emit('searchSubmit', payload)"
      @search-action="(payload) => emit('searchAction', payload)"
    />
  </section>

  <section
    v-else-if="block.kind === 'section'"
    :class="['lc-node-section', { 'content-panel': block.panel !== false }]"
  >
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <div class="lc-node-stack">
      <LowCodeBlockRenderer
        v-for="child in block.blocks"
        :key="child.id"
        :block="child"
        :resolved-data="resolvedData"
        :form-models="formModels"
        :search-filters="searchFilters"
        :loading-block-id="loadingBlockId"
        :loading-grid-id="loadingGridId"
        @form-submit="(payload) => emit('formSubmit', payload)"
        @form-action="(payload) => emit('formAction', payload)"
        @grid-edit="(payload) => emit('gridEdit', payload)"
        @grid-delete="(payload) => emit('gridDelete', payload)"
        @toolbar-action="(payload) => emit('toolbarAction', payload)"
        @search-submit="(payload) => emit('searchSubmit', payload)"
        @search-action="(payload) => emit('searchAction', payload)"
      />
    </div>
  </section>

  <section v-else-if="block.kind === 'tabs'" class="content-panel lc-node-tabs">
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <div class="lc-tab-list">
      <button
        v-for="tab in block.tabs"
        :key="tab.key"
        :class="['lc-tab-button', { active: activeTabKey(block) === tab.key }]"
        type="button"
        @click="setActiveTab(block, tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="lc-node-stack">
      <LowCodeBlockRenderer
        v-for="child in activeTabBlocks(block)"
        :key="child.id"
        :block="child"
        :resolved-data="resolvedData"
        :form-models="formModels"
        :search-filters="searchFilters"
        :loading-block-id="loadingBlockId"
        :loading-grid-id="loadingGridId"
        @form-submit="(payload) => emit('formSubmit', payload)"
        @form-action="(payload) => emit('formAction', payload)"
        @grid-edit="(payload) => emit('gridEdit', payload)"
        @grid-delete="(payload) => emit('gridDelete', payload)"
        @toolbar-action="(payload) => emit('toolbarAction', payload)"
        @search-submit="(payload) => emit('searchSubmit', payload)"
        @search-action="(payload) => emit('searchAction', payload)"
      />
    </div>
  </section>

  <section v-else-if="block.kind === 'toolbar'" class="content-panel lc-node-toolbar">
    <div>
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </div>
    <div class="lc-actions">
      <vxe-button
        v-for="action in block.actions"
        :key="action.code"
        :status="action.status"
        :disabled="action.disabled"
        @click="emit('toolbarAction', { block, action })"
      >
        {{ action.label }}
      </vxe-button>
    </div>
  </section>

  <article v-else-if="block.kind === 'text'" class="content-panel">
    <p v-if="block.title" class="section-kicker">{{ block.title }}</p>
    <p :class="textToneClass(block.tone)">{{ block.content }}</p>
  </article>

  <article v-else-if="block.kind === 'searchForm'" class="content-panel">
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <LowCodeForm
      v-model="formModels[block.id]"
      :schema="block.schema"
      :option-sources="resolvedData"
      :loading="loadingBlockId === block.id"
      @submit="(values) => emitSearchSubmit(block, values)"
      @action="(action, values) => emitSearchAction(block, action, values)"
    />
  </article>

  <article v-else-if="block.kind === 'form'" class="content-panel">
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <LowCodeForm
      v-model="formModels[block.id]"
      :schema="block.schema"
      :option-sources="resolvedData"
      :loading="loadingBlockId === block.id"
      @submit="(values) => emit('formSubmit', { block, values })"
      @action="(action, values) => emit('formAction', { block, action, values })"
    />
  </article>

  <article v-else-if="block.kind === 'grid'" class="content-panel">
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <LowCodeGrid
      :schema="block.schema"
      :rows="resolveGridRows(block)"
      :loading="loadingGridId === block.id"
      @edit="(row) => emitGridEdit(block, row)"
      @delete="(row) => emitGridDelete(block, row)"
    />
  </article>

  <article v-else-if="block.kind === 'detail'" class="content-panel lc-detail">
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <dl>
      <template v-for="field in block.fields" :key="field.field">
        <dt>{{ field.label }}</dt>
        <dd>{{ formatDetailValue(resolveDetailRecord(block)?.[field.field], field.formatter) }}</dd>
      </template>
    </dl>
  </article>

  <section
    v-else-if="block.kind === 'modal' && block.open !== false"
    class="lc-overlay-node"
  >
    <article class="content-panel lc-modal-node" :style="widthStyle(block.width)">
      <header v-if="block.title || block.description" class="lc-node-header">
        <h2 v-if="block.title">{{ block.title }}</h2>
        <p v-if="block.description">{{ block.description }}</p>
      </header>
      <div class="lc-node-stack">
        <LowCodeBlockRenderer
          v-for="child in block.blocks"
          :key="child.id"
          :block="child"
          :resolved-data="resolvedData"
          :form-models="formModels"
          :search-filters="searchFilters"
          :loading-block-id="loadingBlockId"
          :loading-grid-id="loadingGridId"
          @form-submit="(payload) => emit('formSubmit', payload)"
          @form-action="(payload) => emit('formAction', payload)"
          @grid-edit="(payload) => emit('gridEdit', payload)"
          @grid-delete="(payload) => emit('gridDelete', payload)"
          @toolbar-action="(payload) => emit('toolbarAction', payload)"
          @search-submit="(payload) => emit('searchSubmit', payload)"
          @search-action="(payload) => emit('searchAction', payload)"
        />
      </div>
    </article>
  </section>

  <section
    v-else-if="block.kind === 'drawer' && block.open !== false"
    :class="['lc-drawer-node', block.placement === 'left' ? 'left' : 'right']"
    :style="widthStyle(block.width)"
  >
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <div class="lc-node-stack">
      <LowCodeBlockRenderer
        v-for="child in block.blocks"
        :key="child.id"
        :block="child"
        :resolved-data="resolvedData"
        :form-models="formModels"
        :search-filters="searchFilters"
        :loading-block-id="loadingBlockId"
        :loading-grid-id="loadingGridId"
        @form-submit="(payload) => emit('formSubmit', payload)"
        @form-action="(payload) => emit('formAction', payload)"
        @grid-edit="(payload) => emit('gridEdit', payload)"
        @grid-delete="(payload) => emit('gridDelete', payload)"
        @toolbar-action="(payload) => emit('toolbarAction', payload)"
        @search-submit="(payload) => emit('searchSubmit', payload)"
        @search-action="(payload) => emit('searchAction', payload)"
      />
    </div>
  </section>

  <section v-else-if="block.kind === 'statCard'" class="lc-stat-grid">
    <article v-for="item in block.items" :key="item.label" class="content-panel lc-stat-card">
      <span>{{ item.label }}</span>
      <strong>{{ resolveStatValue(block, item) }}</strong>
      <small v-if="item.suffix">{{ item.suffix }}</small>
    </article>
  </section>

  <article v-else-if="block.kind === 'tree'" class="content-panel lc-tree-node">
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <ul>
      <LowCodeTreeItem
        v-for="row in resolveTreeRows(block)"
        :key="String(row[block.keyField ?? 'id'] ?? row[block.titleField ?? 'title'])"
        :row="row"
        :title-field="block.titleField ?? 'title'"
        :children-field="block.childrenField ?? 'children'"
      />
    </ul>
  </article>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { formatLowCodeGridValue } from '~/utils/lowcode';
import type {
  LowCodeAction,
  LowCodeGridFormatter,
  LowCodePageBlock,
  LowCodePageContainerBlock,
  LowCodePageDetailBlock,
  LowCodePageGridBlock,
  LowCodePageSearchFormBlock,
  LowCodePageStatCardBlock,
  LowCodePageTabsBlock,
  LowCodePageTreeBlock,
  LowCodeStatItem
} from '~/types/lowcode';

const props = defineProps<{
  block: LowCodePageBlock;
  resolvedData: Record<string, unknown>;
  formModels: Record<string, Record<string, unknown>>;
  searchFilters: Record<string, Record<string, unknown>>;
  loadingBlockId?: string;
  loadingGridId?: string;
}>();

const emit = defineEmits<{
  formSubmit: [payload: { block: LowCodePageBlock; values: Record<string, unknown> }];
  formAction: [payload: { block: LowCodePageBlock; action: LowCodeAction; values: Record<string, unknown> }];
  gridEdit: [payload: { block: LowCodePageGridBlock; row: Record<string, unknown> }];
  gridDelete: [payload: { block: LowCodePageGridBlock; row: Record<string, unknown> }];
  toolbarAction: [payload: { block: LowCodePageBlock; action: LowCodeAction }];
  searchSubmit: [payload: { block: LowCodePageSearchFormBlock; values: Record<string, unknown> }];
  searchAction: [payload: { block: LowCodePageSearchFormBlock; action: LowCodeAction; values: Record<string, unknown> }];
}>();

const activeTabs = reactive<Record<string, string>>({});

function textToneClass(tone?: 'default' | 'muted' | 'success' | 'warning') {
  if (!tone || tone === 'default') return '';
  return tone === 'muted' || tone === 'warning' ? 'muted' : 'lc-help';
}

function containerStyle(block: LowCodePageContainerBlock) {
  return {
    '--lc-container-columns': String(block.columns ?? 1),
    '--lc-container-gap': `${block.gap ?? 8}px`
  };
}

function widthStyle(width?: number | string) {
  if (!width) return undefined;
  return { width: typeof width === 'number' ? `${width}px` : width };
}

function activeTabKey(block: LowCodePageTabsBlock) {
  const firstKey = block.tabs[0]?.key ?? '';
  return activeTabs[block.id] ?? block.defaultKey ?? firstKey;
}

function setActiveTab(block: LowCodePageTabsBlock, key: string) {
  activeTabs[block.id] = key;
}

function activeTabBlocks(block: LowCodePageTabsBlock) {
  return block.tabs.find((tab) => tab.key === activeTabKey(block))?.blocks ?? [];
}

function getSourceValue(sourceKey?: string) {
  if (!sourceKey) return undefined;
  return props.resolvedData[sourceKey];
}

function isSearchValueActive(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function matchesFilter(row: Record<string, unknown>, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([field, value]) => {
    if (!isSearchValueActive(value)) return true;
    const cell = row[field];

    if (Array.isArray(value)) {
      return value.map(String).includes(String(cell ?? ''));
    }

    return String(cell ?? '').toLowerCase().includes(String(value).toLowerCase());
  });
}

function resolveGridRows(block: LowCodePageGridBlock) {
  const rows = Array.isArray(block.rows)
    ? block.rows
    : Array.isArray(getSourceValue(block.sourceKey))
      ? (getSourceValue(block.sourceKey) as Record<string, unknown>[])
      : [];
  const filters = block.sourceKey ? props.searchFilters[block.sourceKey] : undefined;

  return filters ? rows.filter((row) => matchesFilter(row, filters)) : rows;
}

function emitSearchSubmit(
  block: LowCodePageBlock,
  values: Record<string, unknown>
) {
  if (block.kind !== 'searchForm') return;
  emit('searchSubmit', { block, values });
}

function emitSearchAction(
  block: LowCodePageBlock,
  action: LowCodeAction,
  values: Record<string, unknown>
) {
  if (block.kind !== 'searchForm') return;
  emit('searchAction', { block, action, values });
}

function emitGridEdit(block: LowCodePageBlock, row: Record<string, unknown>) {
  if (block.kind !== 'grid') return;
  emit('gridEdit', { block, row });
}

function emitGridDelete(block: LowCodePageBlock, row: Record<string, unknown>) {
  if (block.kind !== 'grid') return;
  emit('gridDelete', { block, row });
}

function resolveDetailRecord(block: LowCodePageDetailBlock) {
  if (block.record) return block.record;
  const sourceValue = getSourceValue(block.sourceKey);
  if (Array.isArray(sourceValue)) return sourceValue[0] as Record<string, unknown> | undefined;
  return typeof sourceValue === 'object' && sourceValue !== null
    ? (sourceValue as Record<string, unknown>)
    : undefined;
}

function formatDetailValue(value: unknown, formatter?: LowCodeGridFormatter) {
  return formatLowCodeGridValue(value, formatter);
}

function resolveStatSource(block: LowCodePageStatCardBlock) {
  const sourceValue = getSourceValue(block.sourceKey);
  if (Array.isArray(sourceValue)) {
    return { count: sourceValue.length };
  }
  return typeof sourceValue === 'object' && sourceValue !== null
    ? (sourceValue as Record<string, unknown>)
    : {};
}

function resolveStatValue(block: LowCodePageStatCardBlock, item: LowCodeStatItem) {
  if (typeof item.value !== 'undefined') return item.value;
  const source = resolveStatSource(block);
  return formatLowCodeGridValue(source[item.field ?? 'count'], item.formatter);
}

function resolveTreeRows(block: LowCodePageTreeBlock) {
  if (Array.isArray(block.rows)) return block.rows;
  const sourceValue = getSourceValue(block.sourceKey);
  return Array.isArray(sourceValue) ? (sourceValue as Record<string, unknown>[]) : [];
}
</script>
