<template>
  <li class="lc-planning-bom-node">
    <div
      class="lc-planning-bom-node__row"
      :class="[`is-${nodeType}`, { 'is-selected': selectedId === entityId, 'is-cycle': row.cycle === true }]"
    >
      <button
        v-if="children.length"
        type="button"
        class="lc-planning-bom-node__toggle"
        :title="expanded ? '折叠节点' : '展开节点'"
        :aria-label="expanded ? '折叠节点' : '展开节点'"
        @click="expanded = !expanded"
      >
        <i :class="expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" aria-hidden="true" />
      </button>
      <span v-else class="lc-planning-bom-node__spacer" />
      <span class="lc-planning-bom-node__icon"><i :class="nodeIcon" aria-hidden="true" /></span>
      <button type="button" class="lc-planning-bom-node__content" @click="selectNode">
        <strong>{{ title }}</strong>
        <small v-if="subtitle">{{ subtitle }}</small>
      </button>
      <span v-if="typeof row.quantity !== 'undefined'" class="lc-planning-bom-node__quantity">
        {{ row.quantity }}<small v-if="row.uom"> {{ row.uom }}</small>
      </span>
      <span class="lc-planning-bom-node__type">{{ nodeTypeLabel }}</span>
    </div>
    <ul v-if="children.length && expanded">
      <PlanningBomNode
        v-for="child in children"
        :key="String(child[keyField] ?? child[titleField])"
        :row="child"
        :key-field="keyField"
        :title-field="titleField"
        :children-field="childrenField"
        :selected-id="selectedId"
        @select="(value) => emit('select', value)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  row: Record<string, unknown>;
  keyField: string;
  titleField: string;
  childrenField: string;
  selectedId: string;
}>();
const emit = defineEmits<{ select: [row: Record<string, unknown>] }>();
const expanded = ref(true);
const children = computed(() => Array.isArray(props.row[props.childrenField])
  ? props.row[props.childrenField] as Record<string, unknown>[]
  : []);
const title = computed(() => String(props.row[props.titleField] ?? props.row.name ?? props.row.id ?? '未命名节点'));
const subtitle = computed(() => String(props.row.subtitle ?? ''));
const entityId = computed(() => String(props.row.entityId ?? props.row[props.keyField] ?? ''));
const nodeType = computed(() => String(props.row.type ?? 'item'));
const nodeIcon = computed(() => nodeType.value === 'operation' ? 'ri-settings-3-line' : nodeType.value === 'product' ? 'ri-archive-stack-line' : 'ri-box-3-line');
const nodeTypeLabel = computed(() => nodeType.value === 'operation' ? '工序' : nodeType.value === 'product' ? '产成品' : '组件');
function selectNode() { emit('select', props.row); }
</script>

<style scoped>
.lc-planning-bom-node { position: relative; list-style: none; }
.lc-planning-bom-node > ul { position: relative; margin: 0 0 0 23px; padding: 3px 0 3px 21px; }
.lc-planning-bom-node > ul::before { position: absolute; top: 0; bottom: 15px; left: 8px; border-left: 1px solid #d5dde7; content: ''; }
.lc-planning-bom-node > ul > .lc-planning-bom-node::before { position: absolute; top: 18px; left: -13px; width: 13px; border-top: 1px solid #d5dde7; content: ''; }
.lc-planning-bom-node__row { display: grid; min-height: 38px; grid-template-columns: 22px 28px minmax(120px, 1fr) auto auto; align-items: center; gap: 6px; border: 1px solid transparent; border-radius: 5px; padding: 3px 7px 3px 3px; }
.lc-planning-bom-node__row:hover { border-color: #d7dee8; background: #f8fafc; }
.lc-planning-bom-node__row.is-selected { border-color: #8cc8bb; background: #eef9f6; }
.lc-planning-bom-node__row.is-cycle { border-color: #efb2ad; background: #fff5f4; }
.lc-planning-bom-node__toggle, .lc-planning-bom-node__content { border: 0; background: transparent; cursor: pointer; }
.lc-planning-bom-node__toggle { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 4px; color: #6d788a; padding: 0; }
.lc-planning-bom-node__toggle:hover { background: #e9eef4; }
.lc-planning-bom-node__spacer { width: 22px; }
.lc-planning-bom-node__icon { display: grid; width: 27px; height: 27px; place-items: center; border-radius: 5px; background: #e8f5f1; color: #0f766e; }
.lc-planning-bom-node__row.is-operation .lc-planning-bom-node__icon { background: #eaf1fb; color: #2563a6; }
.lc-planning-bom-node__row.is-product .lc-planning-bom-node__icon { background: #fff4dc; color: #9a6700; }
.lc-planning-bom-node__content { display: grid; min-width: 0; justify-items: start; padding: 2px 0; text-align: left; }
.lc-planning-bom-node__content strong { max-width: 100%; overflow: hidden; color: #253044; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.lc-planning-bom-node__content small { max-width: 100%; overflow: hidden; color: #7a8799; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.lc-planning-bom-node__quantity { color: #344054; font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lc-planning-bom-node__quantity small { color: #7a8799; }
.lc-planning-bom-node__type { border: 1px solid #d7dee8; border-radius: 4px; color: #667085; font-size: 9px; line-height: 16px; padding: 0 5px; white-space: nowrap; }
@media (max-width: 620px) {
  .lc-planning-bom-node__row { grid-template-columns: 20px 27px minmax(90px, 1fr) auto; }
  .lc-planning-bom-node__type { display: none; }
  .lc-planning-bom-node > ul { margin-left: 11px; padding-left: 15px; }
}
</style>
