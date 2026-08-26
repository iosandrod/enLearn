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
    <div v-if="displaySettingsSchema" class="lc-planning-gantt__settings">
      <span class="lc-planning-gantt__settings-title">
        <i class="ri-equalizer-3-line" aria-hidden="true" />显示设置
      </span>
      <LowCodeForm
        :model-value="displaySettingsFormModel"
        :schema="displaySettingsSchema"
        @update:model-value="handleDisplaySettingsUpdate"
      />
      <button
        class="lc-planning-gantt__settings-reset"
        type="button"
        title="恢复默认显示设置"
        aria-label="恢复默认显示设置"
        @click="resetDisplaySettings"
      >
        <i class="ri-refresh-line" aria-hidden="true" />
      </button>
      <span v-if="displayRangeError" class="lc-planning-gantt__settings-error">
        结束时间必须晚于开始时间
      </span>
    </div>
    <GanttDisplaySettings
      v-else
      v-model="displaySettings"
      :defaults="displaySettingsDefaults"
      :invalid-range="displayRangeError"
    />
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
          :start="ganttViewRange.start"
          :end="ganttViewRange.end"
          :cell-width="ganttCellWidth"
          :cell-height="34"
          :scale-height="28"
          :grid-width="ganttGridWidth"
          :auto-scale="false"
          :length-unit="ganttLengthUnit"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Gantt, Willow } from '@svar-ui/vue-gantt';
import type { ITask, TID } from '@svar-ui/vue-gantt';
import '@svar-ui/vue-gantt/style.css';
import { useLowCodeHost } from '../../../core/host';
import { useLowCodePageRuntime } from '../../../runtime/page-runtime';
import LowCodeForm from '../../../components/LowCodeForm.vue';
import { loadLowCodeFormDefinition } from '../../form-definition-loader';
import type { LowCodeFormSchema, LowCodePagePlanningGanttBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';
import GanttDisplaySettings from './GanttDisplaySettings.vue';
import {
  DEFAULT_GANTT_DISPLAY_SETTINGS,
  DEFAULT_GANTT_DISPLAY_SETTINGS_SCHEMA,
  type GanttDisplaySettingsModel,
  type GanttGranularity,
} from './display-settings';

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

const GANTT_MIN_TIMESTAMP = Date.UTC(2000, 0, 1);
const props = defineProps<LowCodeBlockMaterialProps<LowCodePagePlanningGanttBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const host = useLowCodeHost();
const runtime = useLowCodePageRuntime(false);
const chartElement = ref<HTMLDivElement>();
const selectedTaskId = ref('');
const ganttRenderKey = ref(0);
const autoGanttGridWidth = ref(260);
const displaySettings = ref<GanttDisplaySettingsModel>({ ...DEFAULT_GANTT_DISPLAY_SETTINGS });
const displaySettingsSchema = shallowRef<LowCodeFormSchema | null>(null);
let resizeObserver: ResizeObserver | null = null;
let tabRenderFrame = 0;

async function loadDisplaySettingsSchema() {//
  let code = readString(props.block.settingsFormCode);
  code=code||'planning-gantt-display-settings'//
  if (!code) return;
  // displaySettingsSchema.value = DEFAULT_GANTT_DISPLAY_SETTINGS_SCHEMA;
  try {
    const definition = await loadLowCodeFormDefinition(host.getServiceApi(), code);
    displaySettingsSchema.value = definition.schema;
  } catch(error) {//
    console.error(error)
    // Keep the bundled schema as a usable fallback when the definition is unavailable.
  }
}

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
  if (
    !Number.isFinite(start.getTime())
    || !Number.isFinite(end.getTime())
    || start.getTime() < GANTT_MIN_TIMESTAMP
    || end < start
  ) return [];
  const rowLabel = ganttRowLabel(row);
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
const defaultCellWidth = computed(() => ganttScaleUnit.value === 'hour' ? 70 : 56);
const ganttCellWidth = computed(() => displaySettings.value.cellWidth ?? defaultCellWidth.value);
const ganttDataRange = computed(() => {
  if (!validRows.value.length) {
    const fallback = new Date(GANTT_MIN_TIMESTAMP);
    return { start: fallback, end: new Date(fallback.getTime() + 86_400_000) };
  }
  const start = Math.min(...validRows.value.map((row) => row.__start.getTime()));
  const end = Math.max(...validRows.value.map((row) => row.__end.getTime()));
  return { start: new Date(start), end: new Date(end) };
});
const displaySettingsDefaults = computed(() => ({
  start: formatInputDateTime(ganttDataRange.value.start),
  end: formatInputDateTime(ganttDataRange.value.end),
  granularity: 'auto' as GanttGranularity,
  cellWidth: defaultCellWidth.value,
  gridWidth: autoGanttGridWidth.value,
}));
const displaySettingsFormModel = computed(() => ({
  start: displaySettings.value.start || displaySettingsDefaults.value.start,
  end: displaySettings.value.end || displaySettingsDefaults.value.end,
  granularity: displaySettings.value.granularity || displaySettingsDefaults.value.granularity,
  cellWidth: displaySettings.value.cellWidth ?? displaySettingsDefaults.value.cellWidth,
  gridWidth: displaySettings.value.gridWidth ?? displaySettingsDefaults.value.gridWidth,
}));
const parsedDisplayStart = computed(() => parseInputDate(displaySettings.value.start));
const parsedDisplayEnd = computed(() => parseInputDate(displaySettings.value.end));
const displayRangeError = computed(() => {
  const start = parsedDisplayStart.value ?? ganttDataRange.value.start;
  const end = parsedDisplayEnd.value ?? ganttDataRange.value.end;
  return end <= start;
});
const ganttViewRange = computed(() => {
  const start = parsedDisplayStart.value ?? ganttDataRange.value.start;
  const end = parsedDisplayEnd.value ?? ganttDataRange.value.end;
  if (displayRangeError.value || end <= start) return ganttDataRange.value;
  return { start, end };
});
const autoGanttScaleUnit = computed<'hour' | 'day'>(() => {
  if (!validRows.value.length) return 'day';
  const span = ganttViewRange.value.end.getTime() - ganttViewRange.value.start.getTime();
  return span <= 4 * 86_400_000 ? 'hour' : 'day';
});
const ganttScaleUnit = computed<Exclude<GanttGranularity, 'auto'>>(() =>
  displaySettings.value.granularity === 'auto'
    ? autoGanttScaleUnit.value
    : displaySettings.value.granularity
);
const ganttLengthUnit = computed(() => ganttScaleUnit.value);
const ganttGridWidth = computed(() => displaySettings.value.gridWidth ?? autoGanttGridWidth.value);
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
  ganttViewRange.value.start.getTime(),
  ganttViewRange.value.end.getTime(),
  ganttCellWidth.value,
  ganttGridWidth.value,
  ganttTimelineSignature.value,
].join(':'));
const ganttScales = computed(() => {
  if (ganttScaleUnit.value === 'hour') {
    return [
      { unit: 'day', step: 1, format: formatScaleDay },
      { unit: 'hour', step: 2, format: formatScaleHour },
    ];
  }
  if (ganttScaleUnit.value === 'day') {
    return [
      { unit: 'month', step: 1, format: formatScaleMonth },
      { unit: 'day', step: 1, format: formatScaleDay },
    ];
  }
  if (ganttScaleUnit.value === 'week') {
    return [
      { unit: 'month', step: 1, format: formatScaleMonth },
      { unit: 'week', step: 1, format: formatScaleWeek },
    ];
  }
  return [
    { unit: 'year', step: 1, format: formatScaleYear },
    { unit: 'month', step: 1, format: formatScaleMonth },
  ];
});
const ganttColumns = [
  { id: 'text', header: '对象 / 计划单', width: 188, flexgrow: 1, sort: false },
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

function parseInputDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isGanttGranularity(value: unknown): value is GanttGranularity {
  return value === 'auto' || value === 'hour' || value === 'day' || value === 'week' || value === 'month';
}

function normalizeNumberOrNull(value: unknown) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function handleDisplaySettingsUpdate(values: Record<string, unknown>) {
  displaySettings.value = {
    start: typeof values.start === 'string' ? values.start : '',
    end: typeof values.end === 'string' ? values.end : '',
    granularity: isGanttGranularity(values.granularity) ? values.granularity : 'auto',
    cellWidth: normalizeNumberOrNull(values.cellWidth),
    gridWidth: normalizeNumberOrNull(values.gridWidth),
  };
}

function resetDisplaySettings() {
  displaySettings.value = { ...DEFAULT_GANTT_DISPLAY_SETTINGS };
}

function formatInputDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ganttRowLabel(row: Record<string, unknown>) {
  const configuredLabel = readString(row[props.block.rowLabelField ?? 'resource_name']);
  if (configuredLabel) return configuredLabel;
  const demandLabel = readString(row.demand_name);
  if (demandLabel) return `需求：${demandLabel}`;
  const itemLabel = readString(row.item_name);
  const locationLabel = readString(row.location_name);
  if (itemLabel && locationLabel) return `${itemLabel} @ ${locationLabel}`;
  if (itemLabel) return itemLabel;
  const operationLabel = readString(row.operation_name);
  if (operationLabel) return operationLabel;
  return readString(row.type, '未分配对象');
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

function formatScaleWeek(date: Date) {
  return `第${getWeekNumber(date)}周`;
}

function formatScaleYear(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric' }).format(date);
}

function getWeekNumber(date: Date) {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date.getTime() - start.getTime()) / 86_400_000) + start.getDay() + 1) / 7);
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
  if (width > 0) autoGanttGridWidth.value = Math.max(176, Math.min(320, Math.round(width * 0.3)));
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
  void loadDisplaySettingsSchema();
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
.lc-planning-gantt__settings { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: end; gap: 6px 10px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; padding: 6px 12px; }
.lc-planning-gantt__settings-title { display: inline-flex; height: 28px; align-items: center; gap: 4px; color: #334155; font-size: 11px; font-weight: 600; white-space: nowrap; }
.lc-planning-gantt__settings :deep(.lc-form) { padding: 0; }
.lc-planning-gantt__settings-reset { display: inline-grid; width: 28px; height: 28px; place-items: center; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; color: #475569; cursor: pointer; }
.lc-planning-gantt__settings-reset:hover { border-color: #0f766e; color: #0f766e; }
.lc-planning-gantt__settings-error { grid-column: 1 / -1; display: block; color: #b42318; font-size: 10px; margin-top: 2px; }
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
