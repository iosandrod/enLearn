<template>
  <section class="entity-design-flow-material" :style="{ minHeight: `${height}px` }">
    <div class="entity-design-flow-material__toolbar">
      <strong>{{ block.title || '实体关系画布' }}</strong>
      <span>{{ tables.length }} 张表 · {{ relations.length }} 条关系</span>
    </div>
    <div class="entity-design-flow-material__canvas">
      <article
        v-for="table in tables"
        :key="table.id"
        class="entity-design-flow-material__table"
        :style="{ left: `${table.position_x || 40}px`, top: `${table.position_y || 40}px` }"
        @click="selectTable(table)"
      >
        <header><strong>{{ table.title || table.table_name }}</strong><small>{{ table.full_name || table.table_name }}</small></header>
        <div v-for="column in table.columns || []" :key="column.id || column.column_name" class="entity-design-flow-material__column">
          <span>{{ column.column_name }}</span><em>{{ column.data_type }}</em>
        </div>
      </article>
      <p v-if="!tables.length" class="entity-design-flow-material__empty">暂无实体表，请先创建或加载实体。</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LowCodePageEntityDesignFlowBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageEntityDesignFlowBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
type EntityColumn = Record<string, any> & { id?: string | number; column_name?: string; data_type?: string };
type EntityTable = Record<string, any> & {
  id: string | number;
  title?: string;
  table_name?: string;
  full_name?: string;
  position_x?: number | string;
  position_y?: number | string;
  columns?: EntityColumn[];
};
const block = computed(() => props.block);
const graph = computed<Record<string, unknown>>(() => {
  const value = props.resolvedData[block.value.sourceKey ?? ''];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
});
const tables = computed<EntityTable[]>(() =>
  Array.isArray(graph.value.tables)
    ? graph.value.tables.filter((table): table is EntityTable =>
      Boolean(table) && typeof table === 'object' && !Array.isArray(table))
    : [],
);
const relations = computed<Record<string, any>[]>(() =>
  Array.isArray(graph.value.relations)
    ? graph.value.relations.filter((relation): relation is Record<string, any> =>
      Boolean(relation) && typeof relation === 'object' && !Array.isArray(relation))
    : [],
);
const height = computed(() => Number(block.value.height) || 560);

function selectTable(table: EntityTable) {
  emit('runtimeEvent', {
    name: 'entityDesign.tableSelect',
    blockId: block.value.id,
    blockKind: block.value.kind,
    timestamp: Date.now(),
    payload: { row: table },
  });
}
</script>

<style scoped>
.entity-design-flow-material { position: relative; overflow: auto; min-width: 640px; border: 1px solid #dfe5ec; border-radius: 10px; background: #f7f9fc; }
.entity-design-flow-material__toolbar { position: sticky; z-index: 2; top: 0; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #dfe5ec; background: rgb(255 255 255 / 94%); padding: 10px 14px; }
.entity-design-flow-material__toolbar span, .entity-design-flow-material__empty { color: #667085; font-size: 12px; }
.entity-design-flow-material__canvas { position: relative; min-height: 500px; background-image: linear-gradient(#94a3b829 1px, transparent 1px), linear-gradient(90deg, #94a3b829 1px, transparent 1px); background-size: 28px 28px; }
.entity-design-flow-material__table { position: absolute; width: 250px; overflow: hidden; border: 1px solid #b8c7dc; border-radius: 8px; background: #fff; box-shadow: 0 8px 18px rgb(15 23 42 / 10%); cursor: pointer; }
.entity-design-flow-material__table header { display: grid; gap: 2px; border-bottom: 1px solid #dfe5ec; background: #eef6ff; padding: 9px 11px; }
.entity-design-flow-material__table header small { color: #667085; font-size: 10px; }
.entity-design-flow-material__column { display: flex; justify-content: space-between; border-bottom: 1px solid #eef2f6; padding: 6px 11px; color: #344054; font-size: 11px; }
.entity-design-flow-material__column em { color: #667085; font-style: normal; }
.entity-design-flow-material__empty { padding: 40px; text-align: center; }
</style>
