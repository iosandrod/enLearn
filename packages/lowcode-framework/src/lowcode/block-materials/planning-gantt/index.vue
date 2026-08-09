<template>
  <article class="content-panel lc-planning-gantt" :style="panelStyle">
    <header class="lc-planning-gantt__header">
      <div>
        <strong>{{ block.title || '排产甘特图' }}</strong>
        <span v-if="block.description">{{ block.description }}</span>
      </div>
      <div class="lc-planning-gantt__legend">
        <span><i class="is-proposed" />建议</span>
        <span><i class="is-approved" />批准</span>
        <span><i class="is-confirmed" />确认</span>
        <span><i class="is-delayed" />延期</span>
      </div>
    </header>
    <div
      v-show="validRows.length"
      ref="chartElement"
      class="lc-planning-gantt__chart"
      :class="{ 'has-selection': selectedTaskId }"
    />
    <div v-if="!validRows.length" class="lc-planning-gantt__empty">
      <i class="ri-calendar-schedule-line" aria-hidden="true" />
      <span>当前筛选条件下没有可绘制的计划单</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import type { CustomSeriesRenderItem, EChartsOption } from 'echarts';
import { useLowCodePageRuntime } from '../../../runtime/page-runtime';
import type { LowCodePagePlanningGanttBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

type GanttRow = Record<string, unknown> & {
  __start: number;
  __end: number;
  __rowLabel: string;
  __taskLabel: string;
  __color: string;
  __status: string;
};

type CartesianRenderCoordinates = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const props = defineProps<LowCodeBlockMaterialProps<LowCodePagePlanningGanttBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const runtime = useLowCodePageRuntime(false);
const chartElement = ref<HTMLDivElement>();
const selectedTaskId = ref('');
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let observedChartElement: HTMLDivElement | undefined;

const rows = computed(() => {
  const value = (runtime?.state.sources ?? props.resolvedData)[props.block.sourceKey ?? ''];
  return Array.isArray(value) ? value.filter(isRecord) : [];
});
const validRows = computed<GanttRow[]>(() => rows.value.flatMap((row) => {
  const start = new Date(readString(row[props.block.startField ?? 'startdate'])).getTime();
  const end = new Date(readString(row[props.block.endField ?? 'enddate'])).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const status = readString(row[props.block.statusField ?? 'status'], 'proposed');
  const delayed = Number(row.delay_hours ?? 0) > 0;
  return [{
    ...row,
    __start: start,
    __end: Math.max(end, start + 15 * 60_000),
    __rowLabel: readString(row[props.block.rowLabelField ?? 'resource_name'], '未分配资源'),
    __taskLabel: readString(row[props.block.labelField ?? 'reference'], readString(row.name, '计划单')),
    __color: readString(row[props.block.colorField ?? 'gantt_color'], statusColor(status, delayed)),
    __status: status,
  }];
}));
const panelStyle = computed(() => ({ '--lc-gantt-height': toCssSize(props.block.height, '520px') }));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function toCssSize(value: unknown, fallback: string) {
  return typeof value === 'number' ? `${value}px` : readString(value, fallback);
}
function statusColor(status: string, delayed: boolean) {
  if (delayed) return '#c2413b';
  if (status === 'completed' || status === 'closed') return '#667085';
  if (status === 'confirmed') return '#0f766e';
  if (status === 'approved') return '#2563a6';
  return '#b7791f';
}
function dateLabel(value: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
}

const renderItem: CustomSeriesRenderItem = (params, api) => {
  const categoryIndex = Number(api.value(0));
  const start = api.coord([api.value(1), categoryIndex]);
  const end = api.coord([api.value(2), categoryIndex]);
  const rowHeight = Math.max(15, Number(api.size?.([0, 1])?.[1] ?? 26) * 0.58);
  const coordinateSystem = params.coordSys as typeof params.coordSys & CartesianRenderCoordinates;
  const clipped = echarts.graphic.clipRectByRect(
    { x: start[0], y: start[1] - rowHeight / 2, width: Math.max(2, end[0] - start[0]), height: rowHeight },
    {
      x: coordinateSystem.x,
      y: coordinateSystem.y,
      width: coordinateSystem.width,
      height: coordinateSystem.height,
    }
  );
  if (!clipped) return undefined;
  return {
    type: 'rect',
    shape: clipped,
    style: api.style({ fill: api.value(3) as string, stroke: '#ffffff', lineWidth: 1 }),
    emphasis: { style: { shadowBlur: 8, shadowColor: 'rgba(15,23,42,.24)' } },
  };
};

function buildOption(): EChartsOption {
  const rowLabels = [...new Set(validRows.value.map((row) => row.__rowLabel))];
  const rowIndex = new Map(rowLabels.map((label, index) => [label, index]));
  const values = validRows.value.map((row) => [
    rowIndex.get(row.__rowLabel) ?? 0,
    row.__start,
    row.__end,
    row.__color,
    row.__taskLabel,
    row.__status,
    readString(row.id),
  ]);
  return {
    animation: false,
    grid: { top: 26, right: 24, bottom: 74, left: 154, containLabel: false },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const row = validRows.value[params.dataIndex];
        if (!row) return '';
        return [
          `<strong>${escapeHtml(row.__taskLabel)}</strong>`,
          `资源：${escapeHtml(row.__rowLabel)}`,
          `开始：${dateLabel(row.__start)}`,
          `结束：${dateLabel(row.__end)}`,
          `数量：${escapeHtml(String(row.quantity ?? '-'))}`,
          `状态：${escapeHtml(row.__status)}`,
        ].join('<br>');
      },
    },
    dataZoom: [
      { type: 'slider', xAxisIndex: 0, height: 20, bottom: 34, borderColor: '#d7dee8', fillerColor: 'rgba(15,118,110,.14)', handleStyle: { color: '#0f766e' } },
      { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: true },
      { type: 'slider', yAxisIndex: 0, width: 12, right: 4, show: rowLabels.length > 14, borderColor: 'transparent' },
    ],
    xAxis: {
      type: 'time',
      position: 'top',
      axisLine: { lineStyle: { color: '#bcc6d3' } },
      axisLabel: { color: '#536174', fontSize: 10, formatter: (value: number) => dateLabel(value) },
      splitLine: { show: true, lineStyle: { color: '#edf1f5', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rowLabels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#d7dee8' } },
      axisLabel: { color: '#344054', fontSize: 11, width: 138, overflow: 'truncate', margin: 10 },
      splitLine: { show: true, lineStyle: { color: '#edf1f5' } },
    },
    series: [{
      type: 'custom',
      renderItem,
      encode: { x: [1, 2], y: 0 },
      data: values,
      selectedMode: 'single',
      select: {
        itemStyle: {
          borderColor: '#111827',
          borderWidth: 2,
          shadowBlur: 7,
          shadowColor: 'rgba(17,24,39,.28)',
        },
      },
    }],
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character));
}

async function renderChart() {
  await nextTick();
  const element = chartElement.value;
  observeChartElement(element);
  if (!element) return;
  if (!validRows.value.length) {
    chart?.clear();
    return;
  }
  const { width, height } = element.getBoundingClientRect();
  if (width < 2 || height < 2) return;
  if (!chart || chart.getDom() !== element) {
    chart?.dispose();
    chart = echarts.init(element);
  }
  chart.setOption(buildOption(), true);
  if (selectedTaskId.value) {
    const selectedIndex = validRows.value.findIndex((row) => readString(row.id) === selectedTaskId.value);
    if (selectedIndex >= 0) chart.dispatchAction({ type: 'select', seriesIndex: 0, dataIndex: selectedIndex });
    else selectedTaskId.value = '';
  }
  chart.off('click');
  chart.on('click', (params) => {
    const row = validRows.value[params.dataIndex ?? -1];
    if (!row) return;
    selectedTaskId.value = readString(row.id);
    chart?.dispatchAction({ type: 'unselect', seriesIndex: 0 });
    chart?.dispatchAction({ type: 'select', seriesIndex: 0, dataIndex: params.dataIndex });
    emit('runtimeEvent', {
      name: 'planningGantt.taskSelect',
      blockId: props.block.id,
      blockKind: props.block.kind,
      timestamp: Date.now(),
      payload: { row, value: row.id, id: row.id },
    });
  });
  chart.resize();
}

function observeChartElement(element: HTMLDivElement | undefined) {
  if (!resizeObserver || observedChartElement === element) return;
  if (observedChartElement) resizeObserver.unobserve(observedChartElement);
  observedChartElement = element;
  if (observedChartElement) resizeObserver.observe(observedChartElement);
}

watch(validRows, () => void renderChart(), { deep: true, flush: 'post' });
onMounted(() => {
  void renderChart();
  window.addEventListener('lowcode:tab-activated', renderChart);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width < 2 || box.height < 2) return;
      chart?.resize();
    });
    observeChartElement(chartElement.value);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('lowcode:tab-activated', renderChart);
  resizeObserver?.disconnect();
  observedChartElement = undefined;
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.lc-planning-gantt { display: grid; min-height: 0; overflow: hidden; grid-template-rows: auto minmax(0, 1fr); padding: 0; }
.lc-planning-gantt__header { display: flex; min-height: 44px; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #e2e8f0; padding: 7px 12px; }
.lc-planning-gantt__header > div:first-child { display: grid; min-width: 0; gap: 1px; }
.lc-planning-gantt__header strong { color: #172033; font-size: 13px; }
.lc-planning-gantt__header > div:first-child span { color: #64748b; font-size: 10px; }
.lc-planning-gantt__legend { display: flex; flex: 0 0 auto; align-items: center; gap: 9px; color: #617086; font-size: 10px; white-space: nowrap; }
.lc-planning-gantt__legend span { display: inline-flex; align-items: center; gap: 4px; }
.lc-planning-gantt__legend i { width: 8px; height: 8px; border-radius: 2px; background: #b7791f; }
.lc-planning-gantt__legend .is-approved { background: #2563a6; }
.lc-planning-gantt__legend .is-confirmed { background: #0f766e; }
.lc-planning-gantt__legend .is-delayed { background: #c2413b; }
.lc-planning-gantt__chart, .lc-planning-gantt__empty { min-height: 340px; height: var(--lc-gantt-height); }
.lc-planning-gantt__empty { display: grid; place-content: center; justify-items: center; gap: 8px; background: #f8fafc; color: #758195; font-size: 12px; }
.lc-planning-gantt__empty i { font-size: 26px; }
@media (max-width: 720px) {
  .lc-planning-gantt__header { align-items: flex-start; }
  .lc-planning-gantt__legend { max-width: 45vw; overflow-x: auto; }
  .lc-planning-gantt__chart, .lc-planning-gantt__empty { height: min(64vh, var(--lc-gantt-height)); }
}
</style>
