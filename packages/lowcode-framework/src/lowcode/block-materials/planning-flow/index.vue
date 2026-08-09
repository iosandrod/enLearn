<template>
  <article class="content-panel lc-planning-visual lc-planning-flow" :style="panelStyle">
    <header class="lc-planning-visual__header">
      <div>
        <strong>{{ block.title || '工艺路线' }}</strong>
        <span v-if="block.description">{{ block.description }}</span>
      </div>
      <div class="lc-planning-visual__actions">
        <span>{{ nodes.length }} 道工序 · {{ edges.length }} 条关系</span>
        <button type="button" title="适应视图" aria-label="适应视图" @click="fitCanvas">
          <i class="ri-focus-3-line" aria-hidden="true" />
        </button>
        <button type="button" title="放大" aria-label="放大" @click="zoomIn()">
          <i class="ri-zoom-in-line" aria-hidden="true" />
        </button>
        <button type="button" title="缩小" aria-label="缩小" @click="zoomOut()">
          <i class="ri-zoom-out-line" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="nodes.length" ref="canvasElement" class="lc-planning-flow__canvas">
      <VueFlow
        :id="flowId"
        :nodes="nodes"
        :edges="edges"
        :fit-view-on-init="block.fitViewOnInit !== false"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :edges-updatable="false"
        :elements-selectable="true"
        :min-zoom="0.25"
        :max-zoom="1.8"
        @node-click="handleNodeClick"
      >
        <template #node-planning-operation="{ id, data, selected }">
          <article
            class="lc-planning-flow__node"
            :class="[{ 'is-selected': selected }, `is-${operationTone(data.type)}`]"
          >
            <Handle type="target" :position="Position.Left" :connectable="false" />
            <span class="lc-planning-flow__node-index">{{ data.sequence }}</span>
            <div>
              <strong>{{ data.label }}</strong>
              <small>{{ operationTypeLabel(data.type) }}<template v-if="data.locationName"> · {{ data.locationName }}</template></small>
            </div>
            <dl>
              <template v-if="data.itemName">
                <dt>产出</dt>
                <dd>{{ data.itemName }}</dd>
              </template>
              <template v-if="data.resourceSummary">
                <dt>资源</dt>
                <dd>{{ data.resourceSummary }}</dd>
              </template>
              <template v-if="data.materialSummary">
                <dt>物料</dt>
                <dd>{{ data.materialSummary }}</dd>
              </template>
            </dl>
            <Handle type="source" :position="Position.Right" :connectable="false" />
            <button
              class="lc-planning-flow__node-hit"
              type="button"
              :aria-label="`选择工序 ${data.label}`"
              @click.stop="selectNode(id, data)"
            />
          </article>
        </template>
      </VueFlow>
    </div>

    <div v-else class="lc-planning-visual__empty">
      <i class="ri-route-line" aria-hidden="true" />
      <span>当前筛选条件下没有工艺路线</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  Handle,
  MarkerType,
  Position,
  VueFlow,
  useVueFlow,
  type Edge,
  type Node,
} from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import { useLowCodePageRuntime } from '../../../runtime/page-runtime';
import type { LowCodePagePlanningFlowBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

type PlanningFlowPayload = {
  nodes?: Record<string, unknown>[];
  edges?: Record<string, unknown>[];
};

const props = defineProps<LowCodeBlockMaterialProps<LowCodePagePlanningFlowBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const runtime = useLowCodePageRuntime(false);
const flowId = `planning-flow-${Math.random().toString(36).slice(2)}`;
const { fitView, zoomIn, zoomOut } = useVueFlow(flowId);
const canvasElement = ref<HTMLDivElement>();
let resizeObserver: ResizeObserver | null = null;
let observedCanvasElement: HTMLDivElement | undefined;
let fitTimer: number | undefined;
let lastCanvasSize = '';

const source = computed<PlanningFlowPayload>(() => {
  const value = (runtime?.state.sources ?? props.resolvedData)[props.block.sourceKey ?? ''];
  return isRecord(value) ? value : {};
});

const nodes = computed<Node[]>(() => (Array.isArray(source.value.nodes) ? source.value.nodes : [])
  .filter(isRecord)
  .map((row, index) => ({
    id: readString(row.id, `operation-${index + 1}`),
    type: 'planning-operation',
    position: isRecord(row.position)
      ? { x: readNumber(row.position.x, 40 + index * 280), y: readNumber(row.position.y, 40) }
      : { x: 40 + index * 280, y: 40 },
    data: {
      ...row,
      label: readString(row.label, readString(row.name, `工序 ${index + 1}`)),
      sequence: index + 1,
    },
    draggable: false,
    connectable: false,
  })));

const edges = computed<Edge[]>(() => (Array.isArray(source.value.edges) ? source.value.edges : [])
  .filter(isRecord)
  .map((row, index) => {
    const relation = readString(row.relation, 'dependency');
    const color = relation === 'dependency' ? '#0f766e' : relation === 'routing' ? '#2563eb' : '#64748b';
    return {
      id: readString(row.id, `edge-${index + 1}`),
      source: readString(row.source),
      target: readString(row.target),
      label: readString(row.label),
      type: 'smoothstep',
      animated: relation === 'dependency',
      style: { stroke: color, strokeWidth: 2.2 },
      labelStyle: { fill: '#334155', fontSize: 10, fontWeight: 700 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.94 },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, color },
    };
  })
  .filter((edge) => edge.source && edge.target));

const panelStyle = computed(() => ({
  '--lc-planning-visual-height': toCssSize(props.block.height, '520px'),
}));

function scheduleFit(duration = 0) {
  if (!nodes.value.length || !canvasElement.value) return;
  const { width, height } = canvasElement.value.getBoundingClientRect();
  if (width < 2 || height < 2) return;
  if (typeof fitTimer === 'number') window.clearTimeout(fitTimer);
  fitTimer = window.setTimeout(() => {
    fitTimer = undefined;
    void fitView({ padding: 0.16, duration });
  }, 32);
}

function observeCanvasElement(element: HTMLDivElement | undefined) {
  if (!resizeObserver || observedCanvasElement === element) return;
  if (observedCanvasElement) resizeObserver.unobserve(observedCanvasElement);
  observedCanvasElement = element;
  if (observedCanvasElement) resizeObserver.observe(observedCanvasElement);
}

watch([nodes, edges], async () => {
  await nextTick();
  observeCanvasElement(canvasElement.value);
  if (!nodes.value.length) return;
  scheduleFit(180);
}, { flush: 'post' });

onMounted(() => {
  window.addEventListener('lowcode:tab-activated', handleTabActivated);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width < 2 || box.height < 2) return;
      const size = `${Math.round(box.width)}x${Math.round(box.height)}`;
      if (size === lastCanvasSize) return;
      lastCanvasSize = size;
      scheduleFit();
    });
    observeCanvasElement(canvasElement.value);
  }
  scheduleFit();
});

onBeforeUnmount(() => {
  window.removeEventListener('lowcode:tab-activated', handleTabActivated);
  resizeObserver?.disconnect();
  observedCanvasElement = undefined;
  if (typeof fitTimer === 'number') window.clearTimeout(fitTimer);
});

function handleTabActivated() {
  void nextTick(() => scheduleFit());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function toCssSize(value: unknown, fallback: string) {
  return typeof value === 'number' ? `${value}px` : readString(value, fallback);
}

function operationTypeLabel(value: unknown) {
  const labels: Record<string, string> = {
    fixed_time: '固定时长',
    time_per: '单位时长',
    routing: '路线',
    alternate: '备选',
    split: '拆分',
  };
  const type = readString(value, 'fixed_time');
  return labels[type] ?? type;
}

function operationTone(value: unknown) {
  const type = readString(value);
  if (type === 'routing') return 'routing';
  if (type === 'alternate') return 'alternate';
  if (type === 'split') return 'split';
  return 'operation';
}

function fitCanvas() {
  void fitView({ padding: 0.16, duration: 180 });
}

function selectNode(id: string, data: Record<string, unknown>) {
  emit('runtimeEvent', {
    name: 'planningFlow.nodeSelect',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: { id, row: isRecord(data.raw) ? data.raw : data, value: id },
  });
}

function handleNodeClick(event: { node?: Node }) {
  if (event.node) selectNode(event.node.id, event.node.data as Record<string, unknown>);
}
</script>

<style scoped>
.lc-planning-visual {
  display: grid;
  min-height: 0;
  overflow: hidden;
  grid-template-rows: auto minmax(0, 1fr);
  padding: 0;
}

.lc-planning-visual__header {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #e2e8f0;
  padding: 7px 10px 7px 12px;
}

.lc-planning-visual__header > div:first-child {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.lc-planning-visual__header strong { color: #172033; font-size: 13px; }
.lc-planning-visual__header span { color: #64748b; font-size: 10px; }

.lc-planning-visual__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.lc-planning-visual__actions > span { margin-right: 5px; white-space: nowrap; }
.lc-planning-visual__actions button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid #d7dee8;
  border-radius: 5px;
  background: #ffffff;
  color: #405064;
  cursor: pointer;
}
.lc-planning-visual__actions button:hover { background: #f5f7fa; color: #0f766e; }

.lc-planning-flow__canvas {
  min-height: 340px;
  height: var(--lc-planning-visual-height);
  background-color: #f8fafc;
  background-image: radial-gradient(circle, rgb(100 116 139 / 20%) 1px, transparent 1px);
  background-size: 20px 20px;
}
.lc-planning-flow__canvas :deep(.vue-flow) { width: 100%; height: 100%; }

.lc-planning-flow__node {
  position: relative;
  display: grid;
  width: 238px;
  min-height: 112px;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 8px;
  border: 1px solid #b8d5cf;
  border-left: 4px solid #0f766e;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 5px 13px rgb(15 23 42 / 8%);
  color: #172033;
  padding: 10px;
}
.lc-planning-flow__node.is-routing { border-color: #b8cdf1; border-left-color: #2563eb; }
.lc-planning-flow__node.is-alternate { border-color: #e4c97e; border-left-color: #b7791f; }
.lc-planning-flow__node.is-split { border-color: #d2c4e9; border-left-color: #7655a8; }
.lc-planning-flow__node.is-selected { box-shadow: 0 0 0 3px rgb(15 118 110 / 18%), 0 8px 18px rgb(15 23 42 / 12%); }

.lc-planning-flow__node-index {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border-radius: 5px;
  background: #e8f5f1;
  color: #0f766e;
  font-size: 11px;
  font-weight: 800;
}
.lc-planning-flow__node strong { display: block; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.lc-planning-flow__node small { display: block; overflow: hidden; margin-top: 2px; color: #64748b; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.lc-planning-flow__node dl { grid-column: 1 / -1; display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 3px 6px; margin: 1px 0 0; font-size: 10px; line-height: 15px; }
.lc-planning-flow__node dt { color: #8a96a7; }
.lc-planning-flow__node dd { overflow: hidden; margin: 0; color: #445065; text-overflow: ellipsis; white-space: nowrap; }
.lc-planning-flow__node-hit { position: absolute; inset: 0; z-index: 1; border: 0; background: transparent; cursor: pointer; }
.lc-planning-flow__node :deep(.vue-flow__handle) { z-index: 2; width: 9px; height: 9px; border: 2px solid #ffffff; background: #0f766e; box-shadow: 0 0 0 1px #0f766e; }

.lc-planning-visual__empty {
  display: grid;
  min-height: 260px;
  height: var(--lc-planning-visual-height);
  place-content: center;
  justify-items: center;
  gap: 8px;
  background: #f8fafc;
  color: #758195;
  font-size: 12px;
}
.lc-planning-visual__empty i { font-size: 26px; }

@media (max-width: 720px) {
  .lc-planning-visual__header { align-items: flex-start; }
  .lc-planning-visual__actions > span { display: none; }
  .lc-planning-flow__canvas { height: min(64vh, var(--lc-planning-visual-height)); }
}
</style>
