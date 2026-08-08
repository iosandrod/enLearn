<template>
  <div class="lc-form-layout">
    <template v-for="(node, index) in nodes" :key="nodeKey(node, index)">
      <div
        v-if="node.kind === 'row'"
        class="lc-form-row lc-form-row--span-grid"
        :style="rowStyle(node)"
      >
        <div
          v-for="(column, columnIndex) in node.columns"
          :key="columnIndex"
          class="lc-form-col"
        >
          <LowCodeFormLayout
            :nodes="column.blocks"
            :fields-by-key="fieldsByKey"
          >
            <template #field="{ field }">
              <slot name="field" :field="field" />
            </template>
          </LowCodeFormLayout>
        </div>
      </div>

      <LowCodeFormLayout
        v-else-if="node.kind === 'stack'"
        :nodes="node.blocks"
        :fields-by-key="fieldsByKey"
      >
        <template #field="{ field }">
          <slot name="field" :field="field" />
        </template>
      </LowCodeFormLayout>

      <div
        v-else-if="node.kind === 'tabs'"
        class="lc-form-tabs"
        :class="{ 'lc-form-tabs--fill': node.fillRemaining }"
      >
        <vxe-tabs
          :model-value="activeTabKey(node, index)"
          size="small"
          :padding="false"
          @update:model-value="(key) => setActiveTab(node, index, String(key))"
        >
          <vxe-tab-pane
            v-for="tab in node.tabs"
            :key="tab.key"
            :name="tab.key"
            :title="tab.label"
          >
            <div
              class="lc-form-tab-pane"
              :class="{ 'lc-form-tab-pane--single': tab.blocks.length === 1 }"
            >
              <LowCodeFormLayout
                :nodes="tab.blocks"
                :fields-by-key="fieldsByKey"
              >
                <template #field="{ field }">
                  <slot name="field" :field="field" />
                </template>
              </LowCodeFormLayout>
            </div>
          </vxe-tab-pane>
        </vxe-tabs>
      </div>

      <slot
        v-else-if="fieldsByKey[node.field]"
        name="field"
        :field="fieldsByKey[node.field]"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import type {
  LowCodeField,
  LowCodeFormLayoutColumn,
  LowCodeFormLayoutNode
} from '../types/lowcode';

defineOptions({
  name: 'LowCodeFormLayout'
});

defineProps<{
  nodes: LowCodeFormLayoutNode[];
  fieldsByKey: Record<string, LowCodeField>;
}>();

defineSlots<{
  field(props: { field: LowCodeField }): unknown;
}>();

const activeTabKeys = reactive<Record<string, string>>({});

function nodeKey(node: LowCodeFormLayoutNode, index: number) {
  return node.kind === 'field' ? `${node.field}-${index}` : `${node.kind}-${index}`;
}

function activeTabKey(
  node: Extract<LowCodeFormLayoutNode, { kind: 'tabs' }>,
  index: number
) {
  const key = nodeKey(node, index);
  const tabKeys = node.tabs.map((tab) => tab.key);
  const currentKey = activeTabKeys[key];

  if (currentKey && tabKeys.includes(currentKey)) return currentKey;
  if (node.defaultKey && tabKeys.includes(node.defaultKey)) return node.defaultKey;
  return tabKeys[0] ?? '';
}

function setActiveTab(
  node: Extract<LowCodeFormLayoutNode, { kind: 'tabs' }>,
  index: number,
  key: string
) {
  if (node.tabs.some((tab) => tab.key === key)) {
    activeTabKeys[nodeKey(node, index)] = key;
  }
}

function gapValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? `${numeric}px` : undefined;
}

function columnWeight(column: LowCodeFormLayoutColumn) {
  const span = Number(column.span);

  if (!Number.isFinite(span) || span <= 0) {
    return 1;
  }

  return Math.min(24, Math.max(1, Math.round(span)));
}

function columnTemplate(columns: LowCodeFormLayoutColumn[]) {
  if (!columns.length) return 'minmax(0, 1fr)';

  return columns
    .map((column) => `minmax(0, ${columnWeight(column)}fr)`)
    .join(' ');
}

function rowStyle(node: Extract<LowCodeFormLayoutNode, { kind: 'row' }>) {
  return {
    gap: gapValue(node.gutter),
    '--lc-form-row-template': columnTemplate(node.columns)
  };
}
</script>

<style>
.lc-form-tabs,
.lc-form-tabs > .vxe-tabs,
.lc-form-tab-pane {
  width: 100%;
  min-width: 0;
}

.lc-form-tabs--fill {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.lc-form-tabs--fill > .vxe-tabs {
  flex: 1 1 0;
  height: 100%;
  min-height: 0;
}

.lc-form-tabs--fill > .vxe-tabs > .vxe-tabs-pane--wrapper,
.lc-form-tabs--fill > .vxe-tabs > .vxe-tabs-pane--wrapper > .vxe-tabs-pane--body,
.lc-form-tabs--fill .lc-form-tab-pane,
.lc-form-tabs--fill .lc-form-tab-pane > .lc-form-layout {
  min-height: 0;
}

.lc-form-tabs--fill > .vxe-tabs > .vxe-tabs-pane--wrapper > .vxe-tabs-pane--body {
  height: 100%;
}

.lc-form-tabs--fill .lc-form-tab-pane {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
}

.lc-form-tabs--fill .lc-form-tab-pane > .lc-form-layout {
  align-content: start;
  grid-auto-rows: max-content;
  height: 100%;
  overflow: auto;
}

.lc-form-tabs--fill .lc-form-tab-pane--single > .lc-form-layout {
  align-content: stretch;
  grid-auto-rows: auto;
  grid-template-rows: minmax(0, 1fr);
}

.lc-form-tabs--fill .lc-form-tab-pane--single > .lc-form-layout > .vxe-form--item,
.lc-form-tabs--fill .lc-form-tab-pane--single > .lc-form-layout > .vxe-form--item > .vxe-form--item-content,
.lc-form-tabs--fill .lc-form-tab-pane--single > .lc-form-layout > .vxe-form--item > .vxe-form--item-content > .vxe-form--item-inner,
.lc-form-tabs--fill .lc-form-tab-pane--single > .lc-form-layout .lc-field,
.lc-form-tabs--fill .lc-form-tab-pane--single > .lc-form-layout .lc-field > .lc-array-table,
.lc-form-tabs--fill .lc-form-tab-pane--single > .lc-form-layout .lc-array-table__viewport {
  height: 100%;
  min-height: 0;
}

.lc-form-tabs--fill .lc-form-tab-pane--single > .lc-form-layout > .vxe-form--item > .vxe-form--item-content {
  align-items: stretch;
}

.lc-form-tab-pane {
  padding-top: 12px;
}
</style>
