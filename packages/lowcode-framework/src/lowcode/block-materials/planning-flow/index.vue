<template>
  <article class="content-panel lc-planning-visual lc-planning-flow" :style="panelStyle">
    <header class="lc-planning-visual__header">
      <div>
        <strong>{{ block.title || '工艺路线' }}</strong>
        <span v-if="block.description">{{ block.description }}</span>
      </div>
      <div class="lc-planning-visual__actions">
        <span>
          {{ nodes.length }} 道工序 · {{ edges.length }} 条连线
          <template v-if="rawEdges.length !== edges.length">（{{ rawEdges.length }} 条关系）</template>
        </span>
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
        :min-zoom="0.1"
        :max-zoom="2"
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
              <strong :title="readString(data.label)">{{ data.label }}</strong>
              <small :title="operationMetaTitle(data)">{{ operationTypeLabel(data.type) }}<template v-if="data.locationName"> · {{ data.locationName }}</template></small>
            </div>
            <dl>
              <template v-if="data.itemName">
                <dt>产出</dt>
                <dd :title="readString(data.itemName)">{{ data.itemName }}</dd>
              </template>
              <template v-if="data.resourceSummary">
                <dt>资源</dt>
                <dd :title="readString(data.resourceSummary)">{{ data.resourceSummary }}</dd>
              </template>
              <template v-if="data.materialSummary">
                <dt>物料</dt>
                <dd :title="readString(data.materialSummary)">{{ data.materialSummary }}</dd>
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
const { fitView, setCenter, zoomIn, zoomOut } = useVueFlow(flowId);
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
      ? { x: readNumber(row.position.x, 40 + index * 360), y: readNumber(row.position.y, 40) }
      : { x: 40 + index * 360, y: 40 },
    data: {
      ...row,
      label: readString(row.label, readString(row.name, `工序 ${index + 1}`)),
      sequence: index + 1,
    },
    draggable: false,
    connectable: false,
  })));

const rawEdges = computed<Record<string, unknown>[]>(() =>
  (Array.isArray(source.value.edges) ? source.value.edges : []).filter(isRecord)
);

const edges = computed<Edge[]>(() => {
  const edgeGroups = new Map<string, Record<string, unknown>[]>();
  rawEdges.value.forEach((row) => {
    const sourceId = readString(row.source);
    const targetId = readString(row.target);
    if (!sourceId || !targetId) return;
    const key = `${sourceId}:${targetId}`;
    edgeGroups.set(key, [...(edgeGroups.get(key) ?? []), row]);
  });

  const structuralTargets = new Map<string, Set<string>>();
  edgeGroups.forEach((rows) => {
    if (!rows.some((row) => readString(row.relation, 'dependency') !== 'owner')) return;
    const sourceId = readString(rows[0].source);
    const targetId = readString(rows[0].target);
    if (!sourceId || !targetId) return;
    const targets = structuralTargets.get(sourceId) ?? new Set<string>();
    targets.add(targetId);
    structuralTargets.set(sourceId, targets);
  });

  const hasStructuralPath = (sourceId: string, targetId: string) => {
    const pending = [...(structuralTargets.get(sourceId) ?? [])];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.shift();
      if (!current || visited.has(current)) continue;
      if (current === targetId) return true;
      visited.add(current);
      pending.push(...(structuralTargets.get(current) ?? []));
    }
    return false;
  };

  return [...edgeGroups.values()]
    .filter((rows) => {
      const sourceId = readString(rows[0].source);
      const targetId = readString(rows[0].target);
      const ownerOnly = rows.every((row) => readString(row.relation, 'dependency') === 'owner');
      return !ownerOnly || !hasStructuralPath(sourceId, targetId);
    })
    .map((rows, index) => {
      const first = rows[0];
      const sourceId = readString(first.source);
      const targetId = readString(first.target);
      const relations = [...new Set(rows.map((row) => readString(row.relation, 'dependency')))];
      const tone = relations.length > 1
        ? 'combined'
        : relations[0] === 'dependency'
          ? 'dependency'
          : relations[0] === 'routing'
            ? 'routing'
            : 'owner';
      const color = edgeColor(tone);
      const labels = [...new Set(rows.map(edgeDisplayLabel).filter(Boolean))];
      const label = labels.join(' · ');
      const sourcePosition = flowNodePosition(sourceId);
      const targetPosition = flowNodePosition(targetId);
      const verticalDirection = Math.sign(targetPosition.y - sourcePosition.y);
      const labelOffset = verticalDirection === 0 ? 0 : verticalDirection * 28;
      return {
        id: rows.length === 1
          ? readString(first.id, `edge-${index + 1}`)
          : `combined:${sourceId}:${targetId}`,
        source: sourceId,
        target: targetId,
        label,
        type: 'smoothstep',
        class: [`is-${tone}`, { 'is-combined': rows.length > 1 }],
        animated: tone === 'dependency',
        interactionWidth: 18,
        pathOptions: { offset: 30, borderRadius: 8 },
        style: { stroke: color, strokeWidth: 2.8 },
        labelStyle: {
          fill: '#172033',
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: 0,
          transform: labelOffset ? `translateY(${labelOffset}px)` : undefined,
        },
        labelShowBg: true,
        labelBgStyle: {
          fill: '#ffffff',
          fillOpacity: 0.98,
          stroke: color,
          strokeOpacity: 0.5,
          strokeWidth: 1,
          transform: labelOffset ? `translateY(${labelOffset}px)` : undefined,
        },
        labelBgPadding: [8, 5] as [number, number],
        labelBgBorderRadius: 6,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
        ariaLabel: label,
        zIndex: rows.length > 1 ? 2 : 1,
      };
    });
});

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
    void fitCanvasToLayout(duration);
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

function flowNodePosition(id: string) {
  return nodes.value.find((node) => node.id === id)?.position ?? { x: 0, y: 0 };
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

function operationMetaTitle(data: Record<string, unknown>) {
  return [operationTypeLabel(data.type), readString(data.locationName)]
    .filter(Boolean)
    .join(' · ');
}

function edgeDisplayLabel(row: Record<string, unknown>) {
  const relation = readString(row.relation);
  const label = readString(row.label);
  if (relation === 'dependency') return '前序';
  if (relation === 'owner') return '包含';
  if (relation === 'routing') return label.includes('首') ? '首道' : '顺序';
  return label;
}

function edgeColor(tone: string) {
  if (tone === 'dependency') return '#0f766e';
  if (tone === 'routing') return '#2563eb';
  if (tone === 'combined') return '#0f5f73';
  return '#64748b';
}

function currentFitViewOptions() {
  const focusedRoute = nodes.value.length <= 6;
  return {
    padding: focusedRoute ? 0.02 : 0.1,
    minZoom: focusedRoute ? 0.8 : 0.35,
    maxZoom: 1.05,
  } as const;
}

function fitCanvasToLayout(duration = 180) {
  if ((canvasElement.value?.clientWidth ?? 0) < 900) {
    const firstNode = nodes.value.find((node) => operationTone(node.data.type) === 'routing') ?? nodes.value[0];
    if (!firstNode) return Promise.resolve(false);
    return setCenter(firstNode.position.x + 126, firstNode.position.y + 64, {
      zoom: 0.82,
      duration,
    });
  }
  return fitView({ ...currentFitViewOptions(), duration });
}

function fitCanvas() {
  void fitCanvasToLayout();
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

.lc-planning-visual__header strong { color: #172033; font-size: 14px; }
.lc-planning-visual__header span { color: #64748b; font-size: 11px; }

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
  flex:1;
  height: var(--lc-planning-visual-height);
  background-color: #f8fafc;
  background-image: radial-gradient(circle, rgb(100 116 139 / 20%) 1px, transparent 1px);
  background-size: 20px 20px;
}
.lc-planning-flow__canvas :deep(.vue-flow) { width: 100%; height: 100%; }

.lc-planning-flow__node {
  position: relative;
  display: grid;
  width: 252px;
  min-height: 128px;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 9px;
  border: 1px solid #b8d5cf;
  border-left: 4px solid #0f766e;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 5px 13px rgb(15 23 42 / 8%);
  color: #172033;
  padding: 11px;
}
.lc-planning-flow__node.is-routing { border-color: #b8cdf1; border-left-color: #2563eb; }
.lc-planning-flow__node.is-alternate { border-color: #e4c97e; border-left-color: #b7791f; }
.lc-planning-flow__node.is-split { border-color: #d2c4e9; border-left-color: #7655a8; }
.lc-planning-flow__node.is-selected { box-shadow: 0 0 0 3px rgb(15 118 110 / 18%), 0 8px 18px rgb(15 23 42 / 12%); }

.lc-planning-flow__node-index {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 5px;
  background: #e8f5f1;
  color: #0f766e;
  font-size: 13px;
  font-weight: 800;
}
.lc-planning-flow__node strong { display: block; overflow: hidden; font-size: 17px; line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.lc-planning-flow__node small { display: block; overflow: hidden; margin-top: 2px; color: #5f6f82; font-size: 14px; line-height: 19px; text-overflow: ellipsis; white-space: nowrap; }
.lc-planning-flow__node dl { grid-column: 1 / -1; display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 3px 7px; margin: 2px 0 0; font-size: 14px; line-height: 20px; }
.lc-planning-flow__node dt { color: #788598; font-weight: 600; }
.lc-planning-flow__node dd { overflow: hidden; margin: 0; color: #354258; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.lc-planning-flow__node-hit { position: absolute; inset: 0; z-index: 1; border: 0; background: transparent; cursor: pointer; }
.lc-planning-flow__node :deep(.vue-flow__handle) { z-index: 2; width: 12px; height: 12px; border: 2px solid #ffffff; background: #0f766e; box-shadow: 0 0 0 1px #0f766e; }
.lc-planning-flow__node.is-routing :deep(.vue-flow__handle) { background: #2563eb; box-shadow: 0 0 0 1px #2563eb; }

.lc-planning-flow__canvas :deep(.vue-flow__edge-path) {
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.lc-planning-flow__canvas :deep(.vue-flow__edge-text) {
  font-family: inherit;
  letter-spacing: 0;
}
.lc-planning-flow__canvas :deep(.vue-flow__edge-textbg) {
  filter: drop-shadow(0 1px 1px rgb(15 23 42 / 10%));
}

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
