<template>
  <article class="content-panel lc-planning-bom" :style="panelStyle">
    <header class="lc-planning-bom__header">
      <div>
        <strong>{{ block.title || '工艺 BOM' }}</strong>
        <span v-if="block.description">{{ block.description }}</span>
      </div>
      <span>{{ nodeCount }} 个节点</span>
    </header>
    <div v-if="rows.length" class="lc-planning-bom__tree">
      <ul>
        <PlanningBomNode
          v-for="row in rows"
          :key="String(row[keyField] ?? row[titleField])"
          :row="row"
          :key-field="keyField"
          :title-field="titleField"
          :children-field="childrenField"
          :selected-id="selectedId"
          @select="selectNode"
        />
      </ul>
    </div>
    <div v-else class="lc-planning-bom__empty">
      <i class="ri-node-tree" aria-hidden="true" />
      <span>当前筛选条件下没有可展开的 BOM</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useLowCodePageRuntime } from '../../../runtime/page-runtime';
import type { LowCodePagePlanningBomBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';
import PlanningBomNode from './PlanningBomNode.vue';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePagePlanningBomBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const runtime = useLowCodePageRuntime(false);
const selectedId = ref('');
const keyField = computed(() => props.block.keyField ?? 'id');
const titleField = computed(() => props.block.titleField ?? 'title');
const childrenField = computed(() => props.block.childrenField ?? 'children');
const rows = computed(() => {
  if (Array.isArray(props.block.rows) && props.block.rows.length) return props.block.rows;
  const value = (runtime?.state.sources ?? props.resolvedData)[props.block.sourceKey ?? ''];
  return Array.isArray(value) ? value.filter(isRecord) : [];
});
const nodeCount = computed(() => countNodes(rows.value));
const panelStyle = computed(() => ({ '--lc-bom-height': toCssSize(props.block.height, '520px') }));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function toCssSize(value: unknown, fallback: string) {
  return typeof value === 'number' ? `${value}px` : readString(value, fallback);
}
function countNodes(values: Record<string, unknown>[]): number {
  return values.reduce((total, row) => total + 1 + (Array.isArray(row[childrenField.value]) ? countNodes((row[childrenField.value] as unknown[]).filter(isRecord)) : 0), 0);
}
function selectNode(row: Record<string, unknown>) {
  selectedId.value = String(row.entityId ?? row[keyField.value] ?? '');
  emit('runtimeEvent', {
    name: 'planningBom.nodeSelect',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: { row, value: selectedId.value, id: selectedId.value },
  });
}
</script>

<style scoped>
.lc-planning-bom { display: grid; min-height: 0; overflow: hidden; grid-template-rows: auto minmax(0, 1fr); padding: 0; }
.lc-planning-bom__header { display: flex; min-height: 44px; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #e2e8f0; padding: 7px 12px; }
.lc-planning-bom__header > div { display: grid; min-width: 0; gap: 1px; }
.lc-planning-bom__header strong { color: #172033; font-size: 13px; }
.lc-planning-bom__header span { color: #64748b; font-size: 10px; }
.lc-planning-bom__tree, .lc-planning-bom__empty { min-height: 300px; height: var(--lc-bom-height); }
.lc-planning-bom__tree { overflow: auto; background: #ffffff; padding: 10px 12px 18px; }
.lc-planning-bom__tree > ul { min-width: 420px; margin: 0; padding: 0; }
.lc-planning-bom__empty { display: grid; place-content: center; justify-items: center; gap: 8px; background: #f8fafc; color: #758195; font-size: 12px; }
.lc-planning-bom__empty i { font-size: 26px; }
@media (max-width: 720px) { .lc-planning-bom__tree, .lc-planning-bom__empty { height: min(64vh, var(--lc-bom-height)); } }
</style>
