<template>
  <article class="content-panel lc-planning-visual lc-planning-flow" :style="panelStyle">
    <header class="lc-planning-visual__header">
      <div>
        <strong>{{ block.title || '工艺路线' }}</strong>
        <span v-if="block.description">{{ block.description }}</span>
      </div>
      <div class="lc-planning-visual__actions">
        <span>
          {{ flowLanes.length }} 条路线 · {{ operationCount }} 道工序
          <template v-if="dependencyCount"> · {{ dependencyCount }} 条前置约束</template>
        </span>
        <div class="lc-planning-flow__view-switch" role="group" aria-label="工艺路线视图">
          <button
            type="button"
            :class="{ 'is-active': viewMode === 'lanes' }"
            title="路线视图"
            aria-label="路线视图"
            @click="viewMode = 'lanes'"
          >
            <i class="ri-layout-row-line" aria-hidden="true" />
            <span>路线</span>
          </button>
          <button
            type="button"
            :class="{ 'is-active': viewMode === 'graph' }"
            title="流程与约束视图"
            aria-label="流程与约束视图"
            @click="showGraph"
          >
            <i class="ri-node-tree" aria-hidden="true" />
            <span>流程图</span>
          </button>
        </div>
        <button v-if="viewMode === 'graph'" type="button" title="适应视图" aria-label="适应视图" @click="fitCanvas">
          <i class="ri-focus-3-line" aria-hidden="true" />
        </button>
        <button v-if="viewMode === 'graph'" type="button" title="放大" aria-label="放大" @click="zoomIn()">
          <i class="ri-zoom-in-line" aria-hidden="true" />
        </button>
        <button v-if="viewMode === 'graph'" type="button" title="缩小" aria-label="缩小" @click="zoomOut()">
          <i class="ri-zoom-out-line" aria-hidden="true" />
        </button>
      </div>
    </header>

    <p v-if="actionMessage" class="lc-planning-flow__action-message" role="status">{{ actionMessage }}</p>

    <div v-if="flowLanes.length && viewMode === 'lanes'" class="lc-planning-flow__lanes">
      <section v-for="lane in laneRows" :key="lane.id" class="lc-planning-flow__lane">
        <header
          class="lc-planning-flow__lane-header"
          :class="{ 'is-clickable': lane.routeNode }"
        >
          <div class="lc-planning-flow__lane-icon">
            <i class="ri-route-line" aria-hidden="true" />
          </div>
          <div>
            <strong :title="lane.label">{{ lane.label }}</strong>
            <small :title="lane.itemName">
              <template v-if="lane.itemName">{{ lane.itemName }} · </template>{{ lane.operationCount }} 道工序
            </small>
          </div>
          <button
            v-if="lane.routeNode"
            class="lc-planning-flow__route-hit"
            type="button"
            :aria-label="`选择工艺路线 ${lane.label}`"
            @click="selectNode(lane.routeNode.id, lane.routeNode.data)"
          />
        </header>
        <div class="lc-planning-flow__lane-scroll">
          <div class="lc-planning-flow__lane-track">
            <span v-if="!lane.nodes.length" class="lc-planning-flow__lane-empty">尚未配置工序</span>
            <template v-for="(node, index) in lane.nodes" :key="node.id">
              <i
                v-if="index"
                class="ri-arrow-right-line lc-planning-flow__lane-arrow"
                aria-hidden="true"
              />
              <article
                class="lc-planning-flow__lane-node"
                :class="`is-${operationTone(node.data.type)}`"
                @contextmenu.stop.prevent="openContextMenu($event, node.id, node.data)"
              >
                <div class="lc-planning-flow__lane-node-title">
                  <span>{{ node.data.sequence }}</span>
                  <div>
                    <strong :title="readString(node.data.label)">{{ node.data.label }}</strong>
                    <small :title="operationMetaTitle(node.data)">
                      {{ operationTypeLabel(node.data.type) }}<template v-if="node.data.isParallel"> · 并行分支</template><template v-if="node.data.locationName"> · {{ node.data.locationName }}</template>
                    </small>
                  </div>
                </div>
                <dl>
                  <template v-if="node.data.resourceSummary">
                    <dt>资源</dt>
                    <dd :title="readString(node.data.resourceSummary)">{{ node.data.resourceSummary }}</dd>
                  </template>
                  <template v-if="node.data.materialSummary">
                    <dt>物料</dt>
                    <dd :title="readString(node.data.materialSummary)">{{ node.data.materialSummary }}</dd>
                  </template>
                  <template v-if="node.data.parentOperationPath">
                    <dt>父级</dt>
                    <dd :title="readString(node.data.parentOperationPath)">{{ node.data.parentOperationPath }}</dd>
                  </template>
                  <template v-if="incomingDependencyCount(node.id)">
                    <dt>前置</dt>
                    <dd :title="incomingDependencyTitle(node.id)">{{ incomingDependencyCount(node.id) }} 个约束</dd>
                  </template>
                </dl>
                <button
                  class="lc-planning-flow__node-hit"
                  type="button"
                  :aria-label="`选择工序 ${node.data.label}`"
                  @click="selectNode(node.id, node.data)"
                />
              </article>
            </template>
          </div>
        </div>
      </section>
    </div>

    <div v-else-if="nodes.length" ref="canvasElement" class="lc-planning-flow__canvas">
      <VueFlow
        :id="flowId"
        :nodes="graphNodes"
        :edges="edges"
        :fit-view-on-init="block.fitViewOnInit !== false"
        :nodes-draggable="true"
        :nodes-connectable="false"
        :edges-updatable="false"
        :elements-selectable="true"
        :min-zoom="0.1"
        :max-zoom="2"
        @node-click="handleNodeClick"
        @node-drag-stop="handleNodeDragStop"
      >
        <template #node-planning-container="{ data }">
          <section
            class="lc-planning-flow__graph-container"
            :class="`is-${operationTone(data.type)}`"
            :style="{ width: `${data.width}px`, height: `${data.height}px` }"
            @contextmenu.stop.prevent="openContextMenu($event, data.operationId, data, true)"
          >
            <header>
              <i :class="containerIcon(data.type)" aria-hidden="true" />
              <div>
                <strong>{{ data.label }}</strong>
                <span>{{ operationTypeLabel(data.type) }}<template v-if="data.itemName"> · {{ data.itemName }}</template></span>
              </div>
            </header>
          </section>
        </template>
        <template #node-planning-operation="{ id, data, selected }">
          <article
            class="lc-planning-flow__node"
            :class="[{ 'is-selected': selected }, `is-${operationTone(data.type)}`]"
            @contextmenu.stop.prevent="openContextMenu($event, id, data)"
          >
            <Handle type="target" :position="Position.Left" :connectable="false" />
            <span class="lc-planning-flow__node-index">{{ data.sequence }}</span>
            <div>
              <strong :title="readString(data.label)">{{ data.label }}</strong>
            <small :title="operationMetaTitle(data)">{{ operationTypeLabel(data.type) }}<template v-if="data.isParallel"> · 并行分支</template><template v-if="data.locationName"> · {{ data.locationName }}</template></small>
            </div>
            <dl>
              <template v-if="data.parentOperationPath">
                <dt>父级</dt>
                <dd :title="readString(data.parentOperationPath)">{{ data.parentOperationPath }}</dd>
              </template>
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

  <Teleport to="body">
    <div
      v-if="contextMenu"
      class="lc-planning-flow__context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      role="menu"
      @click.stop
    >
      <button type="button" role="menuitem" @click="beginCreate('before')">
        <i class="ri-arrow-left-line" aria-hidden="true" /> 新增前工序
      </button>
      <button type="button" role="menuitem" @click="beginCreate('after')">
        <i class="ri-arrow-right-line" aria-hidden="true" /> 新增后工序
      </button>
      <button v-if="contextMenu.isContainer" type="button" role="menuitem" @click="beginCreate('child')">
        <i class="ri-node-tree" aria-hidden="true" /> 新增子工序
      </button>
    </div>

    <div v-if="createDraft" class="lc-planning-flow__dialog-mask" @click.self="cancelCreate">
      <section class="lc-planning-flow__dialog" role="dialog" aria-modal="true" :aria-label="createDraft.title">
        <header>
          <div>
            <strong>{{ createDraft.title }}</strong>
            <span>{{ createDraft.targetLabel }}</span>
          </div>
          <button type="button" aria-label="关闭" @click="cancelCreate"><i class="ri-close-line" aria-hidden="true" /></button>
        </header>
        <div class="lc-planning-flow__dialog-body">
          <span v-if="createDraft.loading" class="lc-planning-flow__dialog-loading">正在加载工序表单…</span>
          <LowCodeForm
            v-else-if="createDraft.schema"
            ref="createFormRef"
            v-model="createDraft.values"
            :schema="createDraft.schema"
            :option-sources="createDraft.optionSources"
            :loading="createDraft.saving"
            @submit="saveCreatedOperation"
          />
        </div>
        <p v-if="createDraft.error" class="lc-planning-flow__dialog-error">{{ createDraft.error }}</p>
        <footer>
          <button type="button" @click="cancelCreate">取消</button>
          <button
            type="button"
            class="is-primary"
            :disabled="createDraft.loading || createDraft.saving || !createDraft.schema"
            @click="submitCreateForm"
          >{{ createDraft.saving ? '保存中…' : '保存' }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
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
import LowCodeForm from '../../../components/LowCodeForm.vue';
import { useLowCodeHost } from '../../../core/host';
import { getLowCodePage } from '../../../runtime/lowcode-pages';
import { useLowCodePageRuntime } from '../../../runtime/page-runtime';
import type {
  LowCodeFormSchema,
  LowCodePageDataSource,
  LowCodePageFormBlock,
  LowCodePagePlanningFlowBlock,
} from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

type PlanningFlowPayload = {
  nodes?: Record<string, unknown>[];
  edges?: Record<string, unknown>[];
  lanes?: Record<string, unknown>[];
  containers?: Record<string, unknown>[];
};

type FlowLane = {
  id: string;
  routeId: string;
  label: string;
  itemName: string;
  operationCount: number;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeIds: string[];
};

type FlowContainer = {
  id: string;
  operationId: string;
  itemId: string;
  locationId: string;
  parentOperationId: string;
  type: string;
  label: string;
  itemName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeIds: string[];
};

type CreateMode = 'before' | 'after' | 'child';

type ContextMenuState = {
  x: number;
  y: number;
  operationId: string;
  data: Record<string, unknown>;
  isContainer: boolean;
};

type CreateDraft = {
  mode: CreateMode;
  targetId: string;
  target: Record<string, unknown>;
  title: string;
  targetLabel: string;
  schema: LowCodeFormSchema | null;
  values: Record<string, unknown>;
  optionSources: Record<string, unknown>;
  loading: boolean;
  saving: boolean;
  error: string;
};

const props = defineProps<LowCodeBlockMaterialProps<LowCodePagePlanningFlowBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const host = useLowCodeHost();
const runtime = useLowCodePageRuntime(false);
const flowId = `planning-flow-${Math.random().toString(36).slice(2)}`;
const { fitView, setCenter, zoomIn, zoomOut } = useVueFlow(flowId);
const canvasElement = ref<HTMLDivElement>();
const viewMode = ref<'lanes' | 'graph'>('graph');
const localPositions = reactive(new Map<string, { x: number; y: number }>());
const contextMenu = ref<ContextMenuState | null>(null);
const createDraft = ref<CreateDraft | null>(null);
const createFormRef = ref<{ submit: () => Promise<boolean> }>();
const actionMessage = ref('');
let resizeObserver: ResizeObserver | null = null;
let observedCanvasElement: HTMLDivElement | undefined;
let fitTimer: number | undefined;
let lastCanvasSize = '';

const source = computed<PlanningFlowPayload>(() => {
  const value = (runtime?.state.sources ?? props.resolvedData)[props.block.sourceKey ?? ''];
  return isRecord(value) ? value : {};
});

const flowLanes = computed<FlowLane[]>(() => {
  const rows = (Array.isArray(source.value.lanes) ? source.value.lanes : []).filter(isRecord);
  if (rows.length) {
    return rows.map((row, index) => ({
      id: readString(row.id, `lane-${index + 1}`),
      routeId: readString(row.routeId),
      label: readString(row.label, `路线 ${index + 1}`),
      itemName: readString(row.itemName),
      operationCount: readNumber(row.operationCount),
      x: readNumber(row.x, 16),
      y: readNumber(row.y, 16 + index * 196),
      width: readNumber(row.width, 316),
      height: readNumber(row.height, 184),
      nodeIds: Array.isArray(row.nodeIds) ? row.nodeIds.map((id) => readString(id)).filter(Boolean) : [],
    }));
  }
  const nodeIds = (Array.isArray(source.value.nodes) ? source.value.nodes : [])
    .filter(isRecord)
    .map((row) => readString(row.id))
    .filter(Boolean);
  return nodeIds.length ? [{
    id: 'lane-all',
    routeId: '',
    label: '工艺路线',
    itemName: '',
    operationCount: nodeIds.length,
    x: 16,
    y: 16,
    width: 316 + Math.max(0, nodeIds.length - 1) * 360,
    height: 184,
    nodeIds,
  }] : [];
});

const allNodes = computed<Node[]>(() => (Array.isArray(source.value.nodes) ? source.value.nodes : [])
  .filter(isRecord)
  .map((row, index) => {
    const id = readString(row.id, `operation-${index + 1}`);
    const savedPosition = isRecord(row.position)
      ? { x: readNumber(row.position.x, 40 + index * 360), y: readNumber(row.position.y, 40) }
      : { x: 40 + index * 360, y: 40 };
    const position = localPositions.get(id) ?? savedPosition;
    const type = readString(row.type, 'fixed_time');
    return {
      id,
      type: 'planning-operation',
      position,
      data: {
        ...row,
        label: readString(row.label, readString(row.name, `工序 ${index + 1}`)),
        sequence: readSequence(row.sequence, index + 1),
      },
      draggable: !isContainerType(type),
      connectable: false,
    };
  }));

const nodes = computed<Node[]>(() => allNodes.value.filter((node) => !isContainerType(node.data.type)));

const flowContainers = computed<FlowContainer[]>(() => {
  const rows = (Array.isArray(source.value.containers) ? source.value.containers : []).filter(isRecord);
  if (rows.length) {
    return rows.map((row, index) => ({
      id: readString(row.id, `container-${index + 1}`),
      operationId: readString(row.operationId),
      itemId: readString(row.itemId),
      locationId: readString(row.locationId),
      parentOperationId: readString(row.parentOperationId),
      type: readString(row.type, 'routing'),
      label: readString(row.label, `工艺容器 ${index + 1}`),
      itemName: readString(row.itemName),
      x: readNumber(row.x, 16),
      y: readNumber(row.y, 16),
      width: readNumber(row.width, 300),
      height: readNumber(row.height, 180),
      nodeIds: Array.isArray(row.nodeIds) ? row.nodeIds.map((id) => readString(id)).filter(Boolean) : [],
    }));
  }
  return flowLanes.value.filter((lane) => lane.routeId).map((lane) => ({
    id: `container:${lane.routeId || lane.id}`,
    operationId: lane.routeId,
    itemId: '',
    locationId: '',
    parentOperationId: '',
    type: 'routing',
    label: lane.label,
    itemName: lane.itemName,
    x: lane.x,
    y: lane.y,
    width: lane.width,
    height: lane.height,
    nodeIds: lane.nodeIds,
  }));
});

const graphNodes = computed<Node[]>(() => [
  ...flowContainers.value.filter((container) => {
    const parentId = container.parentOperationId ||
      readString(allNodeById.value.get(container.operationId)?.data.parentOperationId);
    return Boolean(parentId && isContainerType(allNodeById.value.get(parentId)?.data.type));
  }).map((container) => ({
    id: container.id,
    type: 'planning-container',
    position: { x: container.x, y: container.y },
    data: container,
    draggable: false,
    connectable: false,
    selectable: false,
    focusable: false,
    zIndex: 0,
  })),
  ...nodes.value,
]);

const nodeById = computed(() => new Map(nodes.value.map((node) => [node.id, node])));
const allNodeById = computed(() => new Map(allNodes.value.map((node) => [node.id, node])));

const laneRows = computed(() => flowLanes.value.map((lane) => {
  const laneSourceNodes = lane.nodeIds
    .map((id) => allNodeById.value.get(id))
    .filter((node): node is Node => Boolean(node));
  const routeNode = allNodeById.value.get(lane.routeId) ??
    laneSourceNodes.find((node) => isContainerType(node.data.type));
  return {
    ...lane,
    routeNode,
    nodes: laneSourceNodes.filter((node) => !isContainerType(node.data.type)),
  };
}).filter((lane) => lane.routeNode || lane.nodes.length));

const operationCount = computed(() => nodes.value.length);

const rawEdges = computed<Record<string, unknown>[]>(() =>
  (Array.isArray(source.value.edges) ? source.value.edges : []).filter(isRecord)
);
const dependencyCount = computed(() =>
  rawEdges.value.filter((edge) => readString(edge.relation) === 'dependency').length
);

const edges = computed<Edge[]>(() => {
  const edgeGroups = new Map<string, Record<string, unknown>[]>();
  const visibleNodeIds = new Set(nodes.value.map((node) => node.id));
  rawEdges.value.forEach((row) => {
    const sourceId = readString(row.source);
    const targetId = readString(row.target);
    const relation = readString(row.relation, 'dependency');
    if (!sourceId || !targetId || relation === 'owner') return;
    if (!visibleNodeIds.has(sourceId) || !visibleNodeIds.has(targetId)) return;
    const key = `${sourceId}:${targetId}`;
    edgeGroups.set(key, [...(edgeGroups.get(key) ?? []), row]);
  });

  return [...edgeGroups.values()]
    .map((rows, index) => {
      const first = rows[0];
      const sourceId = readString(first.source);
      const targetId = readString(first.target);
      const relations = [...new Set(rows.map((row) => readString(row.relation, 'dependency')))];
      const hasDependency = relations.includes('dependency');
      const hasRouting = relations.includes('routing');
      const tone = hasDependency && hasRouting
        ? 'combined'
        : hasDependency
          ? 'dependency'
          : 'routing';
      const color = edgeColor(tone);
      const label = hasDependency ? '前置约束' : '';
      const sameLane = readString(nodeById.value.get(sourceId)?.data.laneId) ===
        readString(nodeById.value.get(targetId)?.data.laneId);
      const presentation = flowEdgePresentation(
        flowNodePosition(sourceId),
        flowNodePosition(targetId),
        sameLane
      );
      return {
        id: rows.length === 1
          ? readString(first.id, `edge-${index + 1}`)
          : `combined:${sourceId}:${targetId}`,
        source: sourceId,
        target: targetId,
        label,
        type: presentation.type,
        class: [`is-${tone}`, { 'is-combined': rows.length > 1 }],
        animated: false,
        interactionWidth: 18,
        pathOptions: presentation.pathOptions,
        style: {
          stroke: color,
          strokeWidth: tone === 'routing' ? 2.4 : 2.8,
          strokeDasharray: tone === 'dependency' ? '8 6' : undefined,
        },
        labelStyle: {
          fill: '#172033',
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 0,
          transform: presentation.labelOffset ? `translateY(${presentation.labelOffset}px)` : undefined,
        },
        labelShowBg: Boolean(label),
        labelBgStyle: {
          fill: '#ffffff',
          fillOpacity: 0.98,
          stroke: color,
          strokeOpacity: 0.5,
          strokeWidth: 1,
          transform: presentation.labelOffset ? `translateY(${presentation.labelOffset}px)` : undefined,
        },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
        ariaLabel: label || '工序执行顺序',
        zIndex: rows.length > 1 ? 2 : 1,
      };
    });
});

const panelStyle = computed(() => ({
  '--lc-planning-visual-height': '100%',
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
  if (viewMode.value !== 'graph') return;
  await nextTick();
  observeCanvasElement(canvasElement.value);
  if (!nodes.value.length) return;
  scheduleFit(180);
}, { flush: 'post' });

onMounted(() => {
  window.addEventListener('lowcode:tab-activated', handleTabActivated);
  window.addEventListener('pointerdown', handleDocumentPointerDown);
  window.addEventListener('keydown', handleDocumentKeydown);
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
  window.removeEventListener('pointerdown', handleDocumentPointerDown);
  window.removeEventListener('keydown', handleDocumentKeydown);
  resizeObserver?.disconnect();
  observedCanvasElement = undefined;
  if (typeof fitTimer === 'number') window.clearTimeout(fitTimer);
});

function handleTabActivated() {
  if (viewMode.value === 'graph') void nextTick(() => scheduleFit());
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

function readSequence(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return readString(value, String(fallback));
}

function flowNodePosition(id: string) {
  return nodes.value.find((node) => node.id === id)?.position ?? { x: 0, y: 0 };
}

function flowEdgePresentation(
  source: { x: number; y: number },
  target: { x: number; y: number },
  sameLane = false
) {
  const horizontalDistance = target.x - source.x;
  const verticalDistance = target.y - source.y;
  const isAlignedNeighbor = sameLane && horizontalDistance > 0 &&
    horizontalDistance <= 420 &&
    Math.abs(verticalDistance) <= 20;

  if (isAlignedNeighbor) {
    return {
      type: 'straight',
      pathOptions: undefined,
      labelOffset: 0,
    } as const;
  }

  const verticalDirection = Math.sign(verticalDistance);
  const curvature = Math.min(
    0.58,
    Math.max(0.32, 0.36 + Math.abs(verticalDistance) / Math.max(Math.abs(horizontalDistance), 240) * 0.12)
  );
  return {
    type: 'bezier',
    pathOptions: { curvature },
    labelOffset: verticalDirection * 18,
  } as const;
}

function toCssSize(value: unknown, fallback: string) {
  return typeof value === 'number' ? `${value}px` : readString(value, fallback);
}

function operationTypeLabel(value: unknown) {
  const labels: Record<string, string> = {
    fixed_time: '固定时长',
    time_per: '单位时长',
    routing: '路线',
    route: '路线',
    alternate: '备选',
    split: '拆分',
  };
  const type = readString(value, 'fixed_time');
  return labels[type] ?? type;
}

function operationTone(value: unknown) {
  const type = readString(value);
  if (type === 'routing' || type === 'route') return 'routing';
  if (type === 'alternate') return 'alternate';
  if (type === 'split') return 'split';
  return 'operation';
}

function isContainerType(value: unknown) {
  const type = operationTone(value);
  return type === 'routing' || type === 'alternate' || type === 'split';
}

function containerIcon(value: unknown) {
  const type = operationTone(value);
  if (type === 'alternate') return 'ri-git-branch-line';
  if (type === 'split') return 'ri-node-tree';
  return 'ri-route-line';
}

function operationMetaTitle(data: Record<string, unknown>) {
  return [operationTypeLabel(data.type), readString(data.locationName), readString(data.parentOperationPath)]
    .filter(Boolean)
    .join(' · ');
}

function edgeColor(tone: string) {
  if (tone === 'dependency') return '#0f766e';
  if (tone === 'routing') return '#2563eb';
  if (tone === 'combined') return '#0f5f73';
  return '#64748b';
}

function currentFitViewOptions() {
  const focusedRoute = flowLanes.value.length === 1 && nodes.value.length <= 6;
  return {
    padding: focusedRoute ? 0.02 : 0.1,
    minZoom: focusedRoute ? 0.8 : 0.35,
    maxZoom: 1.05,
  } as const;
}

function fitCanvasToLayout(duration = 180) {
  if ((canvasElement.value?.clientWidth ?? 0) < 900) {
    const firstNode = nodes.value[0];
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

async function showGraph() {
  viewMode.value = 'graph';
  await nextTick();
  scheduleFit(180);
}

function incomingDependencies(nodeId: string) {
  return rawEdges.value.filter((edge) => {
    return readString(edge.relation) === 'dependency' && readString(edge.target) === nodeId;
  });
}

function incomingDependencyCount(nodeId: string) {
  return incomingDependencies(nodeId).length;
}

function incomingDependencyTitle(nodeId: string) {
  return incomingDependencies(nodeId)
    .map((edge) => readString(allNodeById.value.get(readString(edge.source))?.data.label, readString(edge.source)))
    .join('、');
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

function openContextMenu(
  event: MouseEvent,
  operationId: string,
  data: Record<string, unknown>,
  isContainer = false,
) {
  actionMessage.value = '';
  contextMenu.value = {
    x: Math.min(event.clientX, Math.max(8, window.innerWidth - 220)),
    y: Math.min(event.clientY, Math.max(8, window.innerHeight - 150)),
    operationId,
    data,
    isContainer,
  };
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target;
  if (target instanceof Element && target.closest('.lc-planning-flow__context-menu')) return;
  contextMenu.value = null;
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (createDraft.value) {
    cancelCreate();
    return;
  }
  contextMenu.value = null;
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function findOperationForm(blocks: unknown[]): LowCodePageFormBlock | undefined {
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    if (block.kind === 'form' && isRecord(block.schema) && Array.isArray(block.schema.fields)) {
      return block as unknown as LowCodePageFormBlock;
    }
    if (Array.isArray(block.blocks)) {
      const nested = findOperationForm(block.blocks);
      if (nested) return nested;
    }
    if (Array.isArray(block.tabs)) {
      for (const tab of block.tabs) {
        if (!isRecord(tab) || !Array.isArray(tab.blocks)) continue;
        const nested = findOperationForm(tab.blocks);
        if (nested) return nested;
      }
    }
  }
  return undefined;
}

function readOptionRows(value: unknown) {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.rows)) return value.rows;
  return [];
}

async function loadCreateForm(draft: CreateDraft) {
  try {
    const page = await getLowCodePage(host.getServiceApi(), {
      code: 'planning_operation-edit',
      includeData: false,
    });
    const form = findOperationForm(page.schema?.blocks ?? []);
    if (!form) throw new Error('数据库低代码页面中没有找到工序表单。');

    const managedFields = new Set(['id', 'owner_id', 'priority', 'lastmodified']);
    draft.schema = {
      ...cloneValue(form.schema),
      fields: form.schema.fields.filter((field) => !managedFields.has(field.field)),
      actions: [],
    };
    draft.values = {
      ...(cloneValue(form.initialValues ?? {}) as Record<string, unknown>),
      type: 'fixed_time',
    };
    const targetItem = readTargetValue(draft.target, 'itemId', 'item_id');
    const targetLocation = readTargetValue(draft.target, 'locationId', 'location_id');
    if (targetItem) draft.values.item_id = targetItem;
    if (targetLocation) draft.values.location_id = targetLocation;

    const sourceKeys = new Set(
      draft.schema.fields
        .map((field) => field.optionsSourceKey)
        .filter((key): key is string => Boolean(key)),
    );
    const sources = page.schema?.dataSources ?? {};
    const entries = await Promise.all([...sourceKeys].map(async (key) => {
      const source = sources[key] as LowCodePageDataSource | undefined;
      if (!source?.serviceName || !source.serviceMethod) return [key, []] as const;
      const result = await host.getServiceApi().invoke(source.serviceName, source.serviceMethod, source.postData ?? {});
      return [key, readOptionRows(result)] as const;
    }));
    draft.optionSources = Object.fromEntries(entries);
  } catch (error) {
    draft.error = error instanceof Error ? error.message : '工序表单加载失败。';
  } finally {
    draft.loading = false;
  }
}

async function beginCreate(mode: CreateMode) {
  const menu = contextMenu.value;
  if (!menu) return;
  const target = menu.data;
  const targetId = menu.operationId;
  const targetLabel = readString(target.label, readString(target.name, targetId));

  contextMenu.value = null;
  const draft: CreateDraft = {
    mode,
    targetId,
    target,
    title: mode === 'child' ? '新增子工序' : mode === 'before' ? '新增前工序' : '新增后工序',
    targetLabel: mode === 'child' ? `容器：${targetLabel}` : `相邻于：${targetLabel}`,
    schema: null,
    values: {},
    optionSources: {},
    loading: true,
    saving: false,
    error: '',
  };
  createDraft.value = draft;
  await loadCreateForm(draft);
}

function cancelCreate() {
  if (createDraft.value?.saving) return;
  createDraft.value = null;
}

function readTargetValue(target: Record<string, unknown>, camelKey: string, snakeKey: string) {
  const direct = readString(target[camelKey], readString(target[snakeKey]));
  if (direct) return direct;
  const nodeIds = Array.isArray(target.nodeIds)
    ? target.nodeIds.map((id) => readString(id)).filter(Boolean)
    : [];
  for (const nodeId of nodeIds) {
    const value = allNodeById.value.get(nodeId)?.data;
    const inherited = readString(value?.[camelKey], readString(value?.[snakeKey]));
    if (inherited) return inherited;
  }
  return '';
}

function submitCreateForm() {
  void createFormRef.value?.submit();
}

async function saveCreatedOperation(values: Record<string, unknown>) {
  const draft = createDraft.value;
  if (!draft || draft.saving) return;

  draft.error = '';

  draft.saving = true;
  try {
    const serviceApi = host.getServiceApi();
    await serviceApi.invoke('planning', 'insertRouteOperation', {
      targetOperationId: draft.targetId,
      position: draft.mode,
      operation: values,
    });

    const sourceKey = props.block.sourceKey ?? '';
    const filters = props.searchFilters[sourceKey] ?? {};
    const value = await serviceApi.invoke('planning', 'getPlanningConsoleData', {
      dataset: 'flow',
      filters,
    });
    runtime?.setSource(sourceKey, value);
    localPositions.clear();
    createDraft.value = null;
    actionMessage.value = '工序已新增。';
  } catch (error) {
    draft.error = error instanceof Error ? error.message : '工序创建失败。';
  } finally {
    if (createDraft.value === draft) draft.saving = false;
  }
}

function handleNodeDragStop(event: { node?: Node }) {
  const node = event.node;
  if (!node || isContainerType(node.data?.type)) return;
  localPositions.set(node.id, {
    x: Number(node.position.x) || 0,
    y: Number(node.position.y) || 0,
  });
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

.lc-planning-flow__action-message {
  margin: 0;
  border-bottom: 1px solid #b7e2d7;
  background: #effcf8;
  color: #0f766e;
  font-size: 12px;
  line-height: 30px;
  padding: 0 12px;
}

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

.lc-planning-flow__view-switch {
  display: flex;
  overflow: hidden;
  border: 1px solid #d7dee8;
  border-radius: 5px;
  background: #f5f7fa;
}
.lc-planning-visual__actions .lc-planning-flow__view-switch button {
  display: flex;
  width: auto;
  min-width: 62px;
  gap: 5px;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0 8px;
}
.lc-planning-flow__view-switch button + button { border-left: 1px solid #d7dee8; }
.lc-planning-flow__view-switch button.is-active {
  background: #ffffff;
  color: #0f766e;
  box-shadow: inset 0 -2px #0f766e;
}
.lc-planning-flow__view-switch button span { color: inherit; font-size: 12px; font-weight: 700; }

.lc-planning-flow__lanes {
  height: var(--lc-planning-visual-height);
  min-height: 340px;
  overflow: auto !important;
  background: #f8fafc;
  padding: 8px 10px 12px;
}
.lc-planning-flow__lane {
  display: grid;
  min-width: 0;
  grid-template-columns: 176px minmax(0, 1fr);
  border-bottom: 1px solid #dfe5ec;
  background: #ffffff;
}
.lc-planning-flow__lane:first-child { border-top: 1px solid #dfe5ec; }
.lc-planning-flow__lane-header {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 9px;
  border-right: 1px solid #dfe5ec;
  background: #f3f7f7;
  padding: 14px 11px;
}
.lc-planning-flow__lane-header.is-clickable { cursor: pointer; }
.lc-planning-flow__route-hit {
  position: absolute;
  inset: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.lc-planning-flow__lane-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 5px;
  background: #dceeea;
  color: #0f766e;
}
.lc-planning-flow__lane-header > div:last-child { min-width: 0; }
.lc-planning-flow__lane-header strong,
.lc-planning-flow__lane-header small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-planning-flow__lane-header strong { color: #172033; font-size: 13px; line-height: 18px; }
.lc-planning-flow__lane-header small { margin-top: 3px; color: #64748b; font-size: 11px; line-height: 16px; }
.lc-planning-flow__lane-scroll { min-width: 0; overflow-x: auto; }
.lc-planning-flow__lane-track {
  display: flex;
  width: max-content;
  min-width: 100%;
  min-height: 154px;
  align-items: center;
  padding: 12px 14px;
}
.lc-planning-flow__lane-empty { color: #7a8797; font-size: 12px; }
.lc-planning-flow__lane-arrow {
  width: 34px;
  flex: 0 0 34px;
  color: #0f766e;
  font-size: 18px;
  text-align: center;
}
.lc-planning-flow__lane-node {
  position: relative;
  display: grid;
  width: 220px;
  min-height: 122px;
  flex: 0 0 220px;
  align-content: start;
  gap: 9px;
  border: 1px solid #b8d5cf;
  border-left: 4px solid #0f766e;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 3px 10px rgb(15 23 42 / 7%);
  padding: 10px;
}
.lc-planning-flow__lane-node.is-routing { border-color: #b8cdf1; border-left-color: #2563eb; background: #f8fbff; }
.lc-planning-flow__lane-node.is-alternate { border-color: #e4c97e; border-left-color: #b7791f; }
.lc-planning-flow__lane-node.is-split { border-color: #d2c4e9; border-left-color: #7655a8; }
.lc-planning-flow__lane-node-title { display: grid; min-width: 0; grid-template-columns: 30px minmax(0, 1fr); gap: 8px; }
.lc-planning-flow__lane-node-title > span {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 5px;
  background: #e8f5f1;
  color: #0f766e;
  font-size: 11px;
  font-weight: 800;
}
.lc-planning-flow__lane-node.is-routing .lc-planning-flow__lane-node-title > span { background: #e7effd; color: #2563eb; }
.lc-planning-flow__lane-node-title > div { min-width: 0; }
.lc-planning-flow__lane-node-title strong,
.lc-planning-flow__lane-node-title small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-planning-flow__lane-node-title strong { color: #172033; font-size: 14px; line-height: 18px; }
.lc-planning-flow__lane-node-title small { margin-top: 2px; color: #64748b; font-size: 11px; line-height: 15px; }
.lc-planning-flow__lane-node dl { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 3px 6px; margin: 0; font-size: 11px; line-height: 16px; }
.lc-planning-flow__lane-node dt { color: #7a8797; font-weight: 600; }
.lc-planning-flow__lane-node dd { overflow: hidden; margin: 0; color: #3d4a5c; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }

.lc-planning-flow__canvas {
  min-height: 340px;
  flex:1;
  height: var(--lc-planning-visual-height);
  background-color: #f8fafc;
  background-image: radial-gradient(circle, rgb(100 116 139 / 20%) 1px, transparent 1px);
  background-size: 20px 20px;
}
.lc-planning-flow__canvas :deep(.vue-flow) { width: 100%; height: 100%; }
.lc-planning-flow__graph-container {
  overflow: hidden;
  border: 1px solid #9db9d4;
  border-radius: 6px;
  background: rgb(237 246 255 / 52%);
  color: #385a78;
  padding: 8px 10px;
  pointer-events: auto;
}
.lc-planning-flow__graph-container.is-alternate { border-style: dashed; border-color: #c69b3c; background: rgb(255 248 225 / 50%); color: #805d18; }
.lc-planning-flow__graph-container.is-split { border-color: #9b7ac3; background: rgb(246 241 255 / 54%); color: #65458c; }
.lc-planning-flow__graph-container header { display: flex; min-width: 0; align-items: center; gap: 7px; }
.lc-planning-flow__graph-container header > i { font-size: 15px; }
.lc-planning-flow__graph-container header > div { min-width: 0; }
.lc-planning-flow__graph-container strong,
.lc-planning-flow__graph-container span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lc-planning-flow__graph-container strong { font-size: 12px; line-height: 16px; }
.lc-planning-flow__graph-container span { margin-top: 1px; font-size: 10px; line-height: 14px; }
.lc-planning-flow__canvas :deep(.vue-flow__node-planning-container) {
  z-index: 0 !important;
  pointer-events: auto;
}

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

.lc-planning-flow__context-menu {
  position: fixed;
  z-index: 10000;
  display: grid;
  min-width: 168px;
  overflow: hidden;
  border: 1px solid #d8e0ea;
  border-radius: 7px;
  background: #ffffff;
  box-shadow: 0 12px 30px rgb(15 23 42 / 18%);
  padding: 5px;
}
.lc-planning-flow__context-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #263449;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  padding: 8px 9px;
}
.lc-planning-flow__context-menu button:hover { background: #eff8f6; color: #0f766e; }
.lc-planning-flow__dialog-mask {
  position: fixed;
  z-index: 10001;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(15 23 42 / 30%);
  padding: 16px;
}
.lc-planning-flow__dialog {
  display: grid;
  width: min(760px, 100%);
  max-height: min(760px, calc(100vh - 32px));
  overflow: auto;
  gap: 14px;
  border: 1px solid #d8e0ea;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 20px 50px rgb(15 23 42 / 22%);
  padding: 18px;
}
.lc-planning-flow__dialog-body { min-height: 80px; }
.lc-planning-flow__dialog-body :deep(.lc-form) { padding: 0; }
.lc-planning-flow__dialog-loading { color: #64748b; font-size: 13px; }
.lc-planning-flow__dialog header,
.lc-planning-flow__dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.lc-planning-flow__dialog header > div { display: grid; gap: 3px; }
.lc-planning-flow__dialog header strong { color: #172033; font-size: 16px; }
.lc-planning-flow__dialog header span { color: #64748b; font-size: 12px; }
.lc-planning-flow__dialog header button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}
.lc-planning-flow__dialog header button:hover { background: #f1f5f9; color: #172033; }
.lc-planning-flow__dialog label {
  display: grid;
  gap: 6px;
  color: #455468;
  font-size: 12px;
  font-weight: 700;
}
.lc-planning-flow__dialog input,
.lc-planning-flow__dialog select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  background: #ffffff;
  color: #172033;
  font: inherit;
  font-weight: 400;
  padding: 8px 9px;
}
.lc-planning-flow__dialog input:focus,
.lc-planning-flow__dialog select:focus { outline: 2px solid rgb(15 118 110 / 20%); border-color: #0f766e; }
.lc-planning-flow__dialog footer { justify-content: flex-end; margin-top: 2px; }
.lc-planning-flow__dialog footer button {
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  background: #ffffff;
  color: #455468;
  cursor: pointer;
  font-size: 12px;
  padding: 7px 14px;
}
.lc-planning-flow__dialog footer button.is-primary { border-color: #0f766e; background: #0f766e; color: #ffffff; }
.lc-planning-flow__dialog footer button:disabled { cursor: wait; opacity: 0.65; }
.lc-planning-flow__dialog-error { margin: -4px 0 0; color: #b42318; font-size: 12px; }

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
  .lc-planning-flow__view-switch button span { display: none; }
  .lc-planning-visual__actions .lc-planning-flow__view-switch button { min-width: 34px; padding: 0; }
  .lc-planning-flow__lane { grid-template-columns: 126px minmax(0, 1fr); }
  .lc-planning-flow__lane-header { padding: 12px 8px; }
  .lc-planning-flow__canvas { height: min(64vh, var(--lc-planning-visual-height)); }
  .lc-planning-flow__lanes { height: min(64vh, var(--lc-planning-visual-height)); }
}
</style>
