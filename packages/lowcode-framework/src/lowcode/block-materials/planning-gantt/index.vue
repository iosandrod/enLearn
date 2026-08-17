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
      v-if="validRows.length"
      ref="chartElement"
      class="lc-planning-gantt__chart"
      :class="{ 'has-selection': selectedTaskId }"
    >
      <Willow :fonts="false">
        <Gantt
          :key="ganttInstanceKey"
          :tasks="ganttTasks"
          :links="[]"
          :columns="ganttColumns"
          :task-types="ganttTaskTypes"
          :scales="ganttScales"
          :selected="selectedTasks"
          :start="ganttDataRange.start"
          :end="ganttDataRange.end"
          :cell-width="ganttCellWidth"
          :cell-height="34"
          :scale-height="28"
          :grid-width="ganttGridWidth"
          :auto-scale="false"
          length-unit="hour"
          duration-unit="hour"
          cell-borders="full"
          readonly
          :onselecttask="handleTaskSelect"
        />
      </Willow>
    </div>
    <div v-if="!validRows.length" class="lc-planning-gantt__empty">
      <i class="ri-calendar-schedule-line" aria-hidden="true" />
      <span>当前筛选条件下没有可绘制的计划单</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Gantt, Willow } from '@svar-ui/vue-gantt';
import type { ITask, TID } from '@svar-ui/vue-gantt';
import '@svar-ui/vue-gantt/style.css';
import { useLowCodePageRuntime } from '../../../runtime/page-runtime';
import type { LowCodePagePlanningGanttBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

type GanttRow = Record<string, unknown> & {
  __end: Date;
  __rowLabel: string;
  __start: Date;
  __status: string;
  __taskId: string;
  __taskLabel: string;
  __type: GanttTaskType;
};

type GanttTaskType = 'proposed' | 'approved' | 'confirmed' | 'completed' | 'delayed';

type GanttSelectionEvent = {
  id?: TID;
};

const props = defineProps<LowCodeBlockMaterialProps<LowCodePagePlanningGanttBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const runtime = useLowCodePageRuntime(false);
const chartElement = ref<HTMLDivElement>();
const selectedTaskId = ref('');
const ganttRenderKey = ref(0);
const ganttGridWidth = ref(260);
let resizeObserver: ResizeObserver | null = null;
let tabRenderFrame = 0;

const rows = computed(() => {
  const value = (runtime?.state.sources ?? props.resolvedData)[props.block.sourceKey ?? ''];
  if (!Array.isArray(value)) return [];
  const includedTypes = new Set(
    Array.isArray(props.block.includedTypes)
      ? props.block.includedTypes.map((type) => readString(type)).filter(Boolean)
      : []
  );
  return value.filter((row) =>
    isRecord(row) && (!includedTypes.size || includedTypes.has(readString(row.type)))
  );
});

const validRows = computed<GanttRow[]>(() => rows.value.flatMap((row, index) => {
  const start = new Date(readString(row[props.block.startField ?? 'startdate']));
  const end = new Date(readString(row[props.block.endField ?? 'enddate']));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
  const rowLabel = readString(row[props.block.rowLabelField ?? 'resource_name']);
  if (!rowLabel) return [];
  const status = readString(row[props.block.statusField ?? 'status'], 'proposed');
  const delayed = Number(row.delay_hours ?? 0) > 0;
  return [{
    ...row,
    __end: new Date(Math.max(end.getTime(), start.getTime() + 15 * 60_000)),
    __rowLabel: rowLabel,
    __start: start,
    __status: status,
    __taskId: readString(row.id, `planning-task-${index}`),
    __taskLabel: readString(row[props.block.labelField ?? 'reference'], readString(row.name, '计划单')),
    __type: taskType(status, delayed),
  }];
}));

const rowByTaskId = computed(() => new Map(validRows.value.map((row) => [row.__taskId, row])));

const ganttTasks = computed<ITask[]>(() => {
  const groups = new Map<string, GanttRow[]>();
  for (const row of validRows.value) {
    groups.set(row.__rowLabel, [...(groups.get(row.__rowLabel) ?? []), row]);
  }
  const orderedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN'));
  return orderedGroups.flatMap(([label, resourceRows], resourceIndex) => {
    const parentId = `__planning-resource-${resourceIndex}`;
    const start = new Date(Math.min(...resourceRows.map((row) => row.__start.getTime())));
    const end = new Date(Math.max(...resourceRows.map((row) => row.__end.getTime())));
    return [
      {
        id: parentId,
        text: label,
        parent: 0,
        type: 'summary',
        open: true,
        start,
        end,
        resource: label,
      },
      ...resourceRows
        .slice()
        .sort((left, right) => left.__start.getTime() - right.__start.getTime())
        .map((row) => ({
          ...row,
          id: row.__taskId,
          text: row.__taskLabel,
          parent: parentId,
          type: row.__type,
          start: row.__start,
          end: row.__end,
          progress: taskProgress(row.__status),
          color: taskColor(row),
        })),
    ];
  });
});

const selectedTasks = computed<TID[]>(() => selectedTaskId.value ? [selectedTaskId.value] : []);
const panelStyle = computed(() => ({ '--lc-gantt-height': toCssSize(props.block.height, '520px') }));
const ganttCellWidth = computed(() => ganttScaleUnit.value === 'hour' ? 70 : 56);
const ganttDataRange = computed(() => {
  const start = Math.min(...validRows.value.map((row) => row.__start.getTime()));
  const end = Math.max(...validRows.value.map((row) => row.__end.getTime()));
  return { start: new Date(start), end: new Date(end) };
});
const ganttScaleUnit = computed<'hour' | 'day'>(() => {
  if (!validRows.value.length) return 'day';
  const span = ganttDataRange.value.end.getTime() - ganttDataRange.value.start.getTime();
  return span <= 4 * 86_400_000 ? 'hour' : 'day';
});
const ganttTimelineSignature = computed(() => validRows.value
  .map((row) => [
    row.__taskId,
    row.__rowLabel,
    row.__start.getTime(),
    row.__end.getTime(),
  ].join('|'))
  .join(';'));
const ganttInstanceKey = computed(() => [
  ganttRenderKey.value,
  ganttScaleUnit.value,
  ganttTimelineSignature.value,
].join(':'));
const ganttScales = computed(() => ganttScaleUnit.value === 'hour'
  ? [
      { unit: 'day', step: 1, format: formatScaleDay },
      { unit: 'hour', step: 2, format: formatScaleHour },
    ]
  : [
      { unit: 'month', step: 1, format: formatScaleMonth },
      { unit: 'day', step: 1, format: formatScaleDay },
    ]);
const ganttColumns = [
  { id: 'text', header: '资源 / 计划单', width: 188, flexgrow: 1, sort: false },
  { id: 'start', header: '开始', width: 112, align: 'center', sort: false },
];
const ganttTaskTypes = [
  { id: 'proposed', label: '建议' },
  { id: 'approved', label: '批准' },
  { id: 'confirmed', label: '确认' },
  { id: 'completed', label: '完成' },
  { id: 'delayed', label: '延期' },
  { id: 'summary', label: '资源' },
  { id: 'milestone', label: '里程碑' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function toCssSize(value: unknown, fallback: string) {
  return typeof value === 'number' ? `${value}px` : readString(value, fallback);
}

function taskType(status: string, delayed: boolean): GanttTaskType {
  if (delayed) return 'delayed';
  if (status === 'completed' || status === 'closed') return 'completed';
  if (status === 'confirmed') return 'confirmed';
  if (status === 'approved') return 'approved';
  return 'proposed';
}

function taskColor(row: GanttRow) {
  return readString(row[props.block.colorField ?? 'gantt_color'], statusColor(row.__type));
}

function statusColor(type: GanttTaskType) {
  if (type === 'delayed') return '#c2413b';
  if (type === 'completed') return '#667085';
  if (type === 'confirmed') return '#0f766e';
  if (type === 'approved') return '#2563a6';
  return '#b7791f';
}

function taskProgress(status: string) {
  if (status === 'completed' || status === 'closed') return 100;
  if (status === 'confirmed') return 70;
  if (status === 'approved') return 35;
  return 0;
}

function formatScaleMonth(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(date);
}

function formatScaleDay(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
}

function formatScaleHour(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function handleTaskSelect(event: GanttSelectionEvent) {
  const id = event.id == null ? '' : String(event.id);
  const row = rowByTaskId.value.get(id);
  if (!row) return;
  selectedTaskId.value = id;
  emit('runtimeEvent', {
    name: 'planningGantt.taskSelect',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: { row, value: row.id, id: row.id },
  });
}

function updateGanttWidth() {
  const width = chartElement.value?.getBoundingClientRect().width ?? 0;
  if (width > 0) ganttGridWidth.value = Math.max(176, Math.min(320, Math.round(width * 0.3)));
}

async function refreshVisibleGantt() {
  await nextTick();
  updateGanttWidth();
  if (!validRows.value.length || !chartElement.value?.offsetParent) return;
  cancelAnimationFrame(tabRenderFrame);
  tabRenderFrame = requestAnimationFrame(() => {
    ganttRenderKey.value += 1;
  });
}

onMounted(() => {
  void refreshVisibleGantt();
  window.addEventListener('lowcode:tab-activated', refreshVisibleGantt);
  if (typeof ResizeObserver !== 'undefined' && chartElement.value) {
    resizeObserver = new ResizeObserver(updateGanttWidth);
    resizeObserver.observe(chartElement.value);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('lowcode:tab-activated', refreshVisibleGantt);
  resizeObserver?.disconnect();
  cancelAnimationFrame(tabRenderFrame);
});
</script>

<style scoped>
.lc-planning-gantt { display: flex;
  flex-direction: column;
   min-height: 0; overflow: hidden; grid-template-rows: auto minmax(0, 1fr); padding: 0; }
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
.lc-planning-gantt__chart { overflow: hidden; background: #fff; }
.lc-planning-gantt__chart :deep(.wx-willow-theme) {
  width: 100%;
  height: 100%;
  --wx-color-primary: #0f766e;
  --wx-color-primary-selected: #d7eee9;
  --wx-font-family: Inter, "Microsoft YaHei", Arial, sans-serif;
  --wx-font-size: 12px;
  --wx-font-size-sm: 11px;
  --wx-line-height: 18px;
  --wx-gantt-select-color: #e7f5f1;
  --wx-gantt-summary-color: #94a3b8;
  --wx-gantt-summary-fill-color: #64748b;
  --wx-gantt-summary-border-color: #64748b;
  --wx-grid-header-font: 600 12px var(--wx-font-family);
  --wx-grid-body-font: 400 12px var(--wx-font-family);
  --wx-timescale-font: 600 11px var(--wx-font-family);
}
.lc-planning-gantt__chart :deep(.wx-gantt) { min-width: 0; }
.lc-planning-gantt__chart :deep(.wx-bar) { font-size: 11px; }
.lc-planning-gantt__chart :deep(.wx-table-container) { min-width: 176px; }
.lc-planning-gantt__chart :deep(.wx-resizer-display-all .wx-button-expand-box) { display: none; }
.lc-planning-gantt__empty { display: grid; place-content: center; justify-items: center; gap: 8px; background: #f8fafc; color: #758195; font-size: 12px; }
.lc-planning-gantt__empty i { font-size: 26px; }
@media (max-width: 720px) {
  .lc-planning-gantt__header { align-items: flex-start; }
  .lc-planning-gantt__legend { max-width: 45vw; overflow-x: auto; }
  .lc-planning-gantt__chart, .lc-planning-gantt__empty { height: min(50vh, 420px, var(--lc-gantt-height)); }
  .lc-planning-gantt__chart :deep(.wx-table-container) { min-width: 176px; }
}
</style>
