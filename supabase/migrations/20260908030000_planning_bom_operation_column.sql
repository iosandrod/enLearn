begin;

do $migration$
declare
  v_source_text text := $bom_route_material_v2$
<template>
  <article class="content-panel lc-planning-bom" :style="panelStyle">
    <header class="lc-planning-bom__header">
      <div class="lc-planning-bom__heading">
        <strong>{{ block.title || '工艺 BOM' }}</strong>
        <span v-if="block.description">{{ block.description }}</span>
      </div>
      <div class="lc-planning-bom__actions">
        <span>{{ nodeSummary }}</span>
        <div class="lc-planning-bom__view-switch" aria-label="BOM 展示方式">
          <button
            type="button"
            :class="{ 'is-active': viewMode === 'table' }"
            @click="viewMode = 'table'"
          >列表</button>
          <button
            type="button"
            :class="{ 'is-active': viewMode === 'graph' }"
            @click="viewMode = 'graph'"
          >结构图</button>
        </div>
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

    <div
      v-if="nodes.length"
      ref="canvasElement"
      class="lc-planning-bom__canvas"
      :class="{ 'is-table': viewMode === 'table' }"
    >
      <VueFlow
        v-if="viewMode === 'graph'"
        :id="flowId"
        :nodes="nodes"
        :edges="edges"
        :fit-view-on-init="true"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :edges-updatable="false"
        :elements-selectable="true"
        :min-zoom="0.08"
        :max-zoom="2"
        @node-click="handleNodeClick"
      >
        <template #node-planning-bom-node="{ id, data, selected }">
          <article
            class="lc-planning-bom-node"
            :class="[
              `is-${nodeTone(data.nodeType)}`,
              {
                'is-selected': selected || selectedNodeId === id,
                'is-cycle': data.cycle,
                'is-collapsed': data.collapsed,
              },
            ]"
          >
            <Handle
              v-if="!data.isRoot"
              type="target"
              :position="Position.Left"
              :connectable="false"
            />
            <span class="lc-planning-bom-node__icon">
              <i :class="nodeIcon(data.nodeType)" aria-hidden="true" />
            </span>
            <div class="lc-planning-bom-node__content" :title="data.label">
              <strong>{{ data.label }}</strong>
              <small v-if="data.subtitle" :title="data.subtitle">{{ data.subtitle }}</small>
            </div>
            <div class="lc-planning-bom-node__meta">
              <span class="lc-planning-bom-node__type">{{ nodeTypeLabel(data.nodeType) }}</span>
              <span v-if="data.hasQuantity" class="lc-planning-bom-node__quantity">
                {{ data.quantity }}<small v-if="data.uom"> {{ data.uom }}</small>
              </span>
            </div>
            <button
              v-if="data.nodeType === 'item' || data.nodeType === 'product'"
              type="button"
              class="lc-planning-bom-node__route-action"
              :aria-label="data.producerRoutes.length ? `查看 ${data.label} 的产出工艺路线` : `新增 ${data.label} 的产出工艺路线`"
              @click.stop="openRoutePicker(id, data)"
            >
              {{ data.producerRoutes.length ? `路线 ${data.producerRoutes.length}` : '新增路线' }}
            </button>
            <button
              v-if="data.hasChildren"
              type="button"
              class="lc-planning-bom-node__toggle"
              :title="data.collapsed ? '展开下级节点' : '折叠下级节点'"
              :aria-label="`${data.collapsed ? '展开' : '折叠'} ${data.label} 的下级节点`"
              @click.stop="toggleNode(id)"
            >
              <i :class="data.collapsed ? 'ri-arrow-right-s-line' : 'ri-arrow-left-s-line'" aria-hidden="true" />
            </button>
            <Handle
              v-if="data.hasChildren && !data.collapsed"
              type="source"
              :position="Position.Right"
              :connectable="false"
            />
            <button
              type="button"
              class="lc-planning-bom-node__hit"
              :aria-label="`选择 BOM 节点 ${data.label}`"
              @click.stop="selectNode(id, data)"
            />
          </article>
        </template>
      </VueFlow>
      <div v-else class="lc-planning-bom__table" role="table" aria-label="BOM 物料及工艺路线操作">
        <div class="lc-planning-bom__table-header" role="row">
          <span role="columnheader">物料</span>
          <span role="columnheader">类型与用量</span>
          <span role="columnheader">操作</span>
        </div>
        <div class="lc-planning-bom__table-body">
          <div
            v-for="node in tableNodes"
            :key="node.id"
            class="lc-planning-bom__table-row"
            :class="{ 'is-selected': selectedNodeId === node.id }"
            role="row"
          >
            <button
              type="button"
              class="lc-planning-bom__table-material"
              :style="{ '--lc-bom-depth': String(node.data.depth) }"
              role="cell"
              @click="selectNode(node.id, node.data)"
            >
              <i :class="nodeIcon(node.data.nodeType)" aria-hidden="true" />
              <span>
                <strong>{{ node.data.label }}</strong>
                <small v-if="node.data.subtitle">{{ node.data.subtitle }}</small>
              </span>
            </button>
            <div class="lc-planning-bom__table-meta" role="cell">
              <span>{{ nodeTypeLabel(node.data.nodeType) }}</span>
              <small v-if="node.data.hasQuantity">
                {{ node.data.quantity }}{{ node.data.uom ? ` ${node.data.uom}` : '' }}
              </small>
            </div>
            <div class="lc-planning-bom__table-operation" role="cell">
              <button
                v-if="node.data.nodeType === 'item' || node.data.nodeType === 'product'"
                type="button"
                @click="openRoutePicker(node.id, node.data)"
              >
                {{ node.data.producerRoutes.length ? `查看路线（${node.data.producerRoutes.length}）` : '新增路线' }}
              </button>
              <span v-else>—</span>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="routePicker.open"
        class="lc-planning-bom__route-picker"
        role="dialog"
        aria-label="可选产出工艺路线"
      >
        <header class="lc-planning-bom__route-picker-header">
          <div>
            <strong>{{ routePicker.label }}</strong>
            <span>选择能够产出该物料的工艺路线</span>
          </div>
          <button type="button" aria-label="关闭工艺路线选择" @click="closeRoutePicker">×</button>
        </header>
        <div v-if="routePicker.routes.length" class="lc-planning-bom__route-list">
          <button
            v-for="route in routePicker.routes"
            :key="route.id"
            type="button"
            class="lc-planning-bom__route-option"
            @click="selectProducerRoute(route)"
          >
            <span class="lc-planning-bom__route-option-main">
              <strong>{{ route.name }}</strong>
              <small>{{ route.typeLabel }} · {{ route.statusLabel }}</small>
            </span>
            <span class="lc-planning-bom__route-option-meta">{{ route.code || route.id }}</span>
          </button>
        </div>
        <div v-else class="lc-planning-bom__route-empty">该物料暂无产出工艺路线。</div>
        <footer class="lc-planning-bom__route-picker-footer">
          <button type="button" class="lc-planning-bom__route-create" @click="createProducerRoute">
            <i class="ri-add-line" aria-hidden="true" />新增该物料的工艺路线
          </button>
        </footer>
      </div>
      <div v-if="viewMode === 'graph'" class="lc-planning-bom__legend" aria-label="节点类型图例">
        <span><i class="is-product" />产成品</span>
        <span><i class="is-routing" />工艺路线</span>
        <span><i class="is-operation" />工序</span>
        <span><i class="is-item" />组件</span>
      </div>
    </div>

    <div v-else class="lc-planning-bom__empty">
      <i class="ri-node-tree" aria-hidden="true" />
      <span>当前筛选条件下没有可展示的 BOM</span>
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
import type { LowCodePagePlanningBomBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

type BomLayoutNode = {
  id: string;
  row: Record<string, unknown>;
  depth: number;
  childCount: number;
  collapsed: boolean;
  children: BomLayoutNode[];
  x: number;
  y: number;
};

type BomNodeData = Record<string, unknown> & {
  raw: Record<string, unknown>;
  entityId: string;
  label: string;
  subtitle: string;
  nodeType: string;
  quantity: unknown;
  uom: string;
  hasQuantity: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  cycle: boolean;
  isRoot: boolean;
  depth: number;
  producerRoutes: ProducerRoute[];
};

type ProducerRoute = {
  id: string;
  name: string;
  code: string;
  type: string;
  typeLabel: string;
  statusLabel: string;
  raw: Record<string, unknown>;
};

const NODE_WIDTH = 252;
const NODE_HEIGHT = 68;
const LEVEL_GAP = 82;
const NODE_GAP = 2;
const ROOT_GAP = 48;
const ORIGIN_X = 42;
const ORIGIN_Y = 38;

const props = defineProps<LowCodeBlockMaterialProps<LowCodePagePlanningBomBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const runtime = useLowCodePageRuntime(false);
const flowId = `planning-bom-${Math.random().toString(36).slice(2)}`;
const { fitView, zoomIn, zoomOut } = useVueFlow(flowId);
const canvasElement = ref<HTMLDivElement>();
const viewMode = ref<'table' | 'graph'>('table');
const selectedNodeId = ref('');
const collapsedNodeIds = ref<Set<string>>(new Set());
const routePicker = ref<{ open: boolean; nodeId: string; entityId: string; label: string; row: Record<string, unknown>; routes: ProducerRoute[] }>({
  open: false,
  nodeId: '',
  entityId: '',
  label: '',
  row: {},
  routes: [],
});
let resizeObserver: ResizeObserver | null = null;
let observedCanvasElement: HTMLDivElement | undefined;
let fitTimer: number | undefined;
let lastCanvasSize = '';

const keyField = computed(() => props.block.keyField ?? 'id');
const titleField = computed(() => props.block.titleField ?? 'title');
const childrenField = computed(() => props.block.childrenField ?? 'children');
const rows = computed<Record<string, unknown>[]>(() => {
  if (Array.isArray(props.block.rows) && props.block.rows.length) return props.block.rows;
  const value = (runtime?.state.sources ?? props.resolvedData)[props.block.sourceKey ?? ''];
  return Array.isArray(value) ? value.filter(isRecord) : [];
});
const nodeCount = computed(() => countNodes(rows.value));
const graph = computed(() => buildGraph(rows.value));
const nodes = computed(() => graph.value.nodes);
const edges = computed(() => graph.value.edges);
const tableNodes = computed(() => nodes.value.map((node) => ({
  id: node.id,
  data: node.data as BomNodeData,
})));
const nodeSummary = computed(() => nodes.value.length === nodeCount.value
  ? `${nodeCount.value} 个节点`
  : `${nodes.value.length} / ${nodeCount.value} 个节点`);
const panelStyle = computed(() => ({ '--lc-bom-height': toCssSize(props.block.height, '520px') }));

watch(rows, (current, previous) => {
  if (current === previous) return;
  collapsedNodeIds.value = new Set();
  selectedNodeId.value = '';
}, { flush: 'sync' });

watch(graph, async () => {
  await nextTick();
  observeCanvasElement(canvasElement.value);
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

function buildGraph(values: Record<string, unknown>[]): { nodes: Node[]; edges: Edge[] } {
  let nextY = ORIGIN_Y;
  const roots = values.map((row, index) => createLayoutNode(row, [index], 0));

  function createLayoutNode(row: Record<string, unknown>, path: number[], depth: number): BomLayoutNode {
    const id = `bom-${path.join('-')}`;
    const childRows = readChildren(row);
    const collapsed = collapsedNodeIds.value.has(id);
    return {
      id,
      row,
      depth,
      childCount: childRows.length,
      collapsed,
      children: collapsed
        ? []
        : childRows.map((child, index) => createLayoutNode(child, [...path, index], depth + 1)),
      x: ORIGIN_X + depth * (NODE_WIDTH + LEVEL_GAP),
      y: 0,
    };
  }

  function positionNode(node: BomLayoutNode) {
    if (!node.children.length) {
      node.y = nextY;
      nextY += NODE_HEIGHT + NODE_GAP;
      return;
    }
    node.children.forEach(positionNode);
    node.y = (node.children[0].y + node.children[node.children.length - 1].y) / 2;
  }

  roots.forEach((root, index) => {
    positionNode(root);
    if (index < roots.length - 1) nextY += ROOT_GAP;
  });

  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];
  const appendNode = (node: BomLayoutNode, parent?: BomLayoutNode) => {
    const nodeType = readString(node.row.type, 'item');
    const entityId = readString(node.row.entityId, readString(node.row[keyField.value], node.id));
    const data: BomNodeData = {
      raw: node.row,
      entityId,
      label: readString(
        node.row[titleField.value],
        readString(node.row.name, readString(node.row[keyField.value], '未命名节点'))
      ),
      subtitle: readString(node.row.subtitle),
      nodeType,
      quantity: node.row.quantity,
      uom: readString(node.row.uom),
      hasQuantity: typeof node.row.quantity !== 'undefined' && node.row.quantity !== null,
      hasChildren: node.childCount > 0,
      collapsed: node.collapsed,
      cycle: node.row.cycle === true,
      isRoot: node.depth === 0,
      depth: node.depth,
      producerRoutes: readProducerRoutes(node.row.producerRoutes),
    };
    flowNodes.push({
      id: node.id,
      type: 'planning-bom-node',
      position: { x: node.x, y: node.y },
      data,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
      connectable: false,
      selectable: true,
      deletable: false,
    });
    if (parent) {
      const color = edgeColor(nodeType);
      flowEdges.push({
        id: `edge-${parent.id}-${node.id}`,
        source: parent.id,
        target: node.id,
        type: 'smoothstep',
        style: { stroke: color, strokeWidth: 1.8 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
      });
    }
    node.children.forEach((child) => appendNode(child, node));
  };
  roots.forEach((root) => appendNode(root));
  return { nodes: flowNodes, edges: flowEdges };
}

function readChildren(row: Record<string, unknown>) {
  const value = row[childrenField.value];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function countNodes(values: Record<string, unknown>[]): number {
  return values.reduce((total, row) => total + 1 + countNodes(readChildren(row)), 0);
}

function scheduleFit(duration = 0) {
  if (!nodes.value.length || !canvasElement.value) return;
  const { width, height } = canvasElement.value.getBoundingClientRect();
  if (width < 2 || height < 2) return;
  if (typeof fitTimer === 'number') window.clearTimeout(fitTimer);
  fitTimer = window.setTimeout(() => {
    fitTimer = undefined;
    void fitView({ padding: 0.06, duration, maxZoom: 1 });
  }, 40);
}

function observeCanvasElement(element: HTMLDivElement | undefined) {
  if (!resizeObserver || observedCanvasElement === element) return;
  if (observedCanvasElement) resizeObserver.unobserve(observedCanvasElement);
  observedCanvasElement = element;
  if (observedCanvasElement) resizeObserver.observe(observedCanvasElement);
}

function handleTabActivated() {
  void nextTick(() => scheduleFit());
}

function fitCanvas() {
  void fitView({ padding: 0.06, duration: 180, maxZoom: 1 });
}

function toggleNode(id: string) {
  const next = new Set(collapsedNodeIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedNodeIds.value = next;
}

function selectNode(id: string, data: BomNodeData) {
  selectedNodeId.value = id;
  const eventId = data.entityId || id;
  emit('runtimeEvent', {
    name: 'planningBom.nodeSelect',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: { row: data.raw, value: eventId, id: eventId },
  });
}

function openRoutePicker(id: string, data: BomNodeData) {
  routePicker.value = {
    open: true,
    nodeId: id,
    entityId: data.entityId,
    label: data.label,
    row: data.raw,
    routes: data.producerRoutes,
  };
}

function closeRoutePicker() {
  routePicker.value.open = false;
}

function selectProducerRoute(route: ProducerRoute) {
  selectedNodeId.value = routePicker.value.nodeId;
  emit('runtimeEvent', {
    name: 'planningBom.routeSelect',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      row: routePicker.value.row,
      value: route.id,
      id: route.id,
      route,
      materialId: routePicker.value.entityId,
      directives: props.block.routeActionDirectives ?? [],
    },
  });
  closeRoutePicker();
}

function createProducerRoute() {
  emit('runtimeEvent', {
    name: 'planningBom.createRoute',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      row: routePicker.value.row,
      value: routePicker.value.entityId,
      id: routePicker.value.entityId,
      materialId: routePicker.value.entityId,
      directives: props.block.routeActionDirectives ?? [],
    },
  });
  closeRoutePicker();
}

function readProducerRoutes(value: unknown): ProducerRoute[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((row) => {
    const type = readString(row.type, 'operation');
    return {
      id: readString(row.id),
      name: readString(row.name, readString(row.title, '未命名路线')),
      code: readString(row.code, readString(row.reference)),
      type,
      typeLabel: readString(row.typeLabel, type),
      statusLabel: readString(row.statusLabel, readString(row.status, '')),
      raw: row,
    };
  }).filter((route) => route.id);
}

function handleNodeClick(event: { node?: Node }) {
  if (!event.node) return;
  selectNode(event.node.id, event.node.data as BomNodeData);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function toCssSize(value: unknown, fallback: string) {
  return typeof value === 'number' ? `${value}px` : readString(value, fallback);
}

function nodeIcon(value: unknown) {
  const type = readString(value, 'item');
  if (type === 'routing') return 'ri-route-line';
  if (type === 'operation') return 'ri-settings-3-line';
  if (type === 'product') return 'ri-archive-stack-line';
  return 'ri-box-3-line';
}

function nodeTypeLabel(value: unknown) {
  const type = readString(value, 'item');
  if (type === 'routing') return '工艺路线';
  if (type === 'operation') return '工序';
  if (type === 'product') return '产成品';
  return '组件';
}

function nodeTone(value: unknown) {
  const type = readString(value, 'item');
  if (type === 'routing') return 'routing';
  if (type === 'operation') return 'operation';
  if (type === 'product') return 'product';
  return 'item';
}

function edgeColor(value: unknown) {
  const type = readString(value);
  return type === 'routing' || type === 'operation' ? '#7d9fc9' : '#75a99d';
}
</script>

<style scoped>
.lc-planning-bom {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  grid-template-rows: auto minmax(0, 1fr);
  padding: 0;
}

.lc-planning-bom__header {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #e2e8f0;
  padding: 7px 10px 7px 12px;
}

.lc-planning-bom__heading {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.lc-planning-bom__heading strong { color: #172033; font-size: 13px; }
.lc-planning-bom__heading span {
  overflow: hidden;
  color: #64748b;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-planning-bom__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.lc-planning-bom__actions > span {
  margin-right: 5px;
  color: #64748b;
  font-size: 10px;
  white-space: nowrap;
}

.lc-planning-bom__actions button {
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

.lc-planning-bom__actions button:hover { background: #f5f7fa; color: #0f766e; }

.lc-planning-bom__view-switch {
  display: inline-flex;
  border: 1px solid #d7dee8;
  border-radius: 5px;
  overflow: hidden;
}

.lc-planning-bom__view-switch button {
  width: auto;
  height: 26px;
  border: 0;
  border-radius: 0;
  background: #fff;
  color: #64748b;
  font-size: 10px;
  padding: 0 8px;
}

.lc-planning-bom__view-switch button + button { border-left: 1px solid #d7dee8; }
.lc-planning-bom__view-switch button.is-active { background: #e8f5f1; color: #0f766e; font-weight: 600; }

.lc-planning-bom__canvas,
.lc-planning-bom__empty {
  min-height: 340px;
  height: var(--lc-bom-height);
}

.lc-planning-bom__canvas {
  position: relative;
  overflow: hidden;
  background-color: #f8fafc;
  background-image: radial-gradient(circle, rgb(100 116 139 / 20%) 1px, transparent 1px);
  background-size: 20px 20px;
}

.lc-planning-bom__canvas.is-table { overflow: auto; background: #f8fafc; }
.lc-planning-bom__table { min-width: 620px; background: #fff; }
.lc-planning-bom__table-header,
.lc-planning-bom__table-row {
  display: grid;
  grid-template-columns: minmax(260px, 1.5fr) minmax(140px, .75fr) minmax(150px, .7fr);
  align-items: center;
}
.lc-planning-bom__table-header {
  position: sticky;
  top: 0;
  z-index: 2;
  min-height: 36px;
  border-bottom: 1px solid #d7dee8;
  background: #f1f5f9;
  color: #64748b;
  font-size: 10px;
  font-weight: 600;
}
.lc-planning-bom__table-header span,
.lc-planning-bom__table-row > * { padding: 0 12px; }
.lc-planning-bom__table-row {
  min-height: 52px;
  border-bottom: 1px solid #edf1f5;
  color: #172033;
}
.lc-planning-bom__table-row:hover,
.lc-planning-bom__table-row.is-selected { background: #f0faf7; }
.lc-planning-bom__table-material {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding-left: calc(12px + var(--lc-bom-depth, 0) * 18px) !important;
  text-align: left;
}
.lc-planning-bom__table-material i { color: #0f766e; font-size: 15px; }
.lc-planning-bom__table-material span { min-width: 0; }
.lc-planning-bom__table-material strong,
.lc-planning-bom__table-material small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lc-planning-bom__table-material strong { font-size: 11px; }
.lc-planning-bom__table-material small { margin-top: 2px; color: #778397; font-size: 9px; }
.lc-planning-bom__table-meta { display: flex; align-items: center; gap: 8px; color: #667085; font-size: 10px; }
.lc-planning-bom__table-meta small { color: #344054; font-size: 10px; }
.lc-planning-bom__table-operation button { border: 0; border-radius: 4px; background: #e8f5f1; color: #0f766e; cursor: pointer; font-size: 10px; padding: 6px 9px; }
.lc-planning-bom__table-operation button:hover { background: #d7eee8; }
.lc-planning-bom__table-operation span { color: #98a2b3; font-size: 12px; }

.lc-planning-bom__canvas :deep(.vue-flow) { width: 100%; height: 100%; }
.lc-planning-bom__canvas :deep(.vue-flow__edge-path) { stroke-linecap: round; }

.lc-planning-bom__legend {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #d7dee8;
  border-radius: 5px;
  background: rgb(255 255 255 / 94%);
  box-shadow: 0 2px 7px rgb(15 23 42 / 7%);
  color: #64748b;
  font-size: 9px;
  padding: 5px 7px;
  pointer-events: none;
}

.lc-planning-bom__legend span { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.lc-planning-bom__legend i { width: 8px; height: 8px; border-radius: 2px; background: #0f766e; }
.lc-planning-bom__legend i.is-product { background: #9a6700; }
.lc-planning-bom__legend i.is-routing { background: #2563a6; }
.lc-planning-bom__legend i.is-operation { background: #2563a6; }

.lc-planning-bom-node {
  position: relative;
  display: grid;
  width: 252px;
  height: 68px;
  box-sizing: border-box;
  grid-template-columns: 34px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 4px 9px;
  border: 1px solid #b8d5cf;
  border-left: 4px solid #0f766e;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 4px 12px rgb(15 23 42 / 9%);
  color: #172033;
  padding: 5px 35px 4px 9px;
}

.lc-planning-bom-node.is-operation { border-color: #b9cce4; border-left-color: #2563a6; }
.lc-planning-bom-node.is-routing { border-color: #b9cce4; border-left-color: #2563a6; }
.lc-planning-bom-node.is-product { border-color: #dfca96; border-left-color: #9a6700; }
.lc-planning-bom-node.is-cycle { border-color: #e0aaa5; border-left-color: #c2413b; background: #fffafa; }
.lc-planning-bom-node.is-selected {
  box-shadow: 0 0 0 3px rgb(15 118 110 / 18%), 0 8px 18px rgb(15 23 42 / 13%);
}

.lc-planning-bom-node__icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 5px;
  background: #e8f5f1;
  color: #0f766e;
  font-size: 15px;
}

.lc-planning-bom-node.is-operation .lc-planning-bom-node__icon { background: #eaf1fb; color: #2563a6; }
.lc-planning-bom-node.is-routing .lc-planning-bom-node__icon { background: #eaf1fb; color: #2563a6; }
.lc-planning-bom-node.is-product .lc-planning-bom-node__icon { background: #fff4dc; color: #9a6700; }
.lc-planning-bom-node.is-cycle .lc-planning-bom-node__icon { background: #feeceb; color: #c2413b; }

.lc-planning-bom-node__content { min-width: 0; padding-top: 1px; }
.lc-planning-bom-node__content strong,
.lc-planning-bom-node__content small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-planning-bom-node__content strong { font-size: 12px; line-height: 16px; }
.lc-planning-bom-node__content small { margin-top: 1px; color: #778397; font-size: 9px; line-height: 12px; }

.lc-planning-bom-node__meta {
  grid-column: 1 / -1;
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.lc-planning-bom-node__route-action {
  position: absolute;
  right: 8px;
  bottom: 5px;
  z-index: 3;
  border: 0;
  border-radius: 3px;
  background: #e8f5f1;
  color: #0f766e;
  cursor: pointer;
  font-size: 9px;
  line-height: 18px;
  padding: 0 5px;
}

.lc-planning-bom-node__route-action:hover { background: #d7eee8; }
.lc-planning-bom-node__route-action:disabled { background: #f1f5f9; color: #94a3b8; cursor: default; }

.lc-planning-bom__route-picker {
  position: absolute;
  top: 48px;
  right: 12px;
  z-index: 10;
  width: min(360px, calc(100% - 24px));
  border: 1px solid #d7dee8;
  border-radius: 7px;
  background: #ffffff;
  box-shadow: 0 12px 26px rgb(15 23 42 / 18%);
  color: #172033;
}

.lc-planning-bom__route-picker-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #e2e8f0;
  padding: 10px 12px;
}

.lc-planning-bom__route-picker-header strong,
.lc-planning-bom__route-picker-header span { display: block; }
.lc-planning-bom__route-picker-header strong { font-size: 12px; }
.lc-planning-bom__route-picker-header span { margin-top: 3px; color: #64748b; font-size: 10px; }
.lc-planning-bom__route-picker-header button { border: 0; background: transparent; color: #64748b; cursor: pointer; font-size: 18px; line-height: 16px; }
.lc-planning-bom__route-list { display: grid; gap: 6px; padding: 10px 12px; }
.lc-planning-bom__route-option { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid #d7dee8; border-radius: 5px; background: #f8fafc; color: #172033; cursor: pointer; padding: 8px; text-align: left; }
.lc-planning-bom__route-option:hover { border-color: #0f766e; background: #eef8f5; }
.lc-planning-bom__route-option-main strong, .lc-planning-bom__route-option-main small { display: block; }
.lc-planning-bom__route-option-main strong { font-size: 11px; font-weight: 600; }
.lc-planning-bom__route-option-main small { margin-top: 3px; color: #64748b; font-size: 9px; }
.lc-planning-bom__route-option-meta { color: #64748b; font-size: 9px; white-space: nowrap; }
.lc-planning-bom__route-empty { color: #64748b; font-size: 10px; padding: 14px 12px; text-align: center; }
.lc-planning-bom__route-picker-footer { border-top: 1px solid #e2e8f0; padding: 9px 12px; text-align: right; }
.lc-planning-bom__route-create { border: 0; border-radius: 4px; background: #0f766e; color: #ffffff; cursor: pointer; font-size: 10px; padding: 6px 9px; }
.lc-planning-bom__route-create:hover { background: #0b625c; }

.lc-planning-bom-node__type {
  border: 1px solid #d7dee8;
  border-radius: 4px;
  color: #667085;
  font-size: 9px;
  line-height: 16px;
  padding: 0 5px;
  white-space: nowrap;
}

.lc-planning-bom-node__quantity {
  overflow: hidden;
  color: #344054;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-planning-bom-node__quantity small { color: #7a8799; }

.lc-planning-bom-node__toggle {
  position: absolute;
  top: 8px;
  right: 7px;
  z-index: 3;
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid #d7dee8;
  border-radius: 4px;
  background: #ffffff;
  color: #59677a;
  cursor: pointer;
  padding: 0;
}
.lc-planning-bom-node__toggle:hover { border-color: #8cc8bb; background: #eef9f6; color: #0f766e; }
.lc-planning-bom-node.is-collapsed .lc-planning-bom-node__toggle { border-color: #a7cfc6; background: #eef9f6; color: #0f766e; }

.lc-planning-bom-node__hit {
  position: absolute;
  inset: 0;
  z-index: 1;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.lc-planning-bom-node :deep(.vue-flow__handle) {
  z-index: 4;
  width: 9px;
  height: 9px;
  border: 2px solid #ffffff;
  background: #0f766e;
  box-shadow: 0 0 0 1px #0f766e;
}
.lc-planning-bom-node.is-operation :deep(.vue-flow__handle) { background: #2563a6; box-shadow: 0 0 0 1px #2563a6; }
.lc-planning-bom-node.is-routing :deep(.vue-flow__handle) { background: #2563a6; box-shadow: 0 0 0 1px #2563a6; }
.lc-planning-bom-node.is-product :deep(.vue-flow__handle) { background: #9a6700; box-shadow: 0 0 0 1px #9a6700; }

.lc-planning-bom__empty {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  background: #f8fafc;
  color: #758195;
  font-size: 12px;
}
.lc-planning-bom__empty i { font-size: 26px; }

@media (max-width: 720px) {
  .lc-planning-bom__header { align-items: flex-start; }
  .lc-planning-bom__actions > span { display: none; }
  .lc-planning-bom__canvas,
  .lc-planning-bom__empty { height: min(64vh, var(--lc-bom-height)); }
}
</style>


$bom_route_material_v2$;
begin
  update public.lowcode_materials
  set source_text = v_source_text,
      source_hash = encode(digest(convert_to(v_source_text, 'UTF8'), 'sha256'), 'hex'),
      material_version = '1.2.0',
      updated_at = timezone('utc'::text, now())
  where material_kind = 'page'
    and code = 'planningBom';

  if not found then
    raise exception 'Low-code page material planningBom does not exist.';
  end if;
end
$migration$;

select pg_notify('pgrst', 'reload schema');
commit;

