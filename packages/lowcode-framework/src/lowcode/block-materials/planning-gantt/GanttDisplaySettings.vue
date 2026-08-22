<template>
  <form class="gantt-display-settings" aria-label="甘特图显示设置" @submit.prevent>
    <span class="gantt-display-settings__title">
      <i class="ri-equalizer-3-line" aria-hidden="true" />显示设置
    </span>
    <label v-for="field in GANTT_DISPLAY_FIELDS" :key="field.key">
      <span>{{ field.label }}</span>
      <select
        v-if="field.control === 'select'"
        :value="fieldValue(field.key)"
        @change="updateField(field, $event)"
      >
        <option v-for="option in field.options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <input
        v-else
        :type="field.control"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :value="fieldValue(field.key)"
        @change="updateField(field, $event)"
      />
    </label>
    <button
      class="gantt-display-settings__reset"
      type="button"
      title="恢复默认显示设置"
      aria-label="恢复默认显示设置"
      @click="resetDisplaySettings"
    >
      <i class="ri-refresh-line" aria-hidden="true" />
    </button>
    <span v-if="invalidRange" class="gantt-display-settings__error">结束时间必须晚于开始时间</span>
  </form>
</template>

<script setup lang="ts">
import {
  DEFAULT_GANTT_DISPLAY_SETTINGS,
  GANTT_DISPLAY_FIELDS,
  type GanttDisplaySettingsDefaults,
  type GanttDisplaySettingsField,
  type GanttDisplaySettingsModel,
} from './display-settings';

const props = defineProps<{
  defaults: GanttDisplaySettingsDefaults;
  invalidRange?: boolean;
  modelValue: GanttDisplaySettingsModel;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: GanttDisplaySettingsModel];
}>();

function fieldValue(key: keyof GanttDisplaySettingsModel) {
  const value = props.modelValue[key];
  return value === '' || value == null ? props.defaults[key] : value;
}

function updateField(field: GanttDisplaySettingsField, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  let value: string | number = target.value;
  if (field.control === 'number') {
    value = Number(value);
    if (!Number.isFinite(value)) return;
    if (typeof field.min === 'number') value = Math.max(field.min, value);
    if (typeof field.max === 'number') value = Math.min(field.max, value);
  }
  emit('update:modelValue', {
    ...props.modelValue,
    [field.key]: value,
  } as GanttDisplaySettingsModel);
}

function resetDisplaySettings() {
  emit('update:modelValue', { ...DEFAULT_GANTT_DISPLAY_SETTINGS });
}
</script>

<style scoped>
.gantt-display-settings { display: flex; flex-wrap: wrap; min-height: 40px; align-items: end; gap: 7px 10px; border-bottom: 1px solid #e2e8f0; padding: 6px 12px; background: #f8fafc; }
.gantt-display-settings__title { display: inline-flex; height: 28px; align-items: center; gap: 4px; color: #334155; font-size: 11px; font-weight: 600; white-space: nowrap; }
.gantt-display-settings label { display: inline-grid; min-width: 118px; gap: 2px; color: #64748b; font-size: 10px; }
.gantt-display-settings label input, .gantt-display-settings label select { box-sizing: border-box; height: 28px; min-width: 0; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; color: #1e293b; font: inherit; padding: 3px 6px; }
.gantt-display-settings label input[type='number'] { width: 88px; }
.gantt-display-settings__reset { display: inline-grid; width: 28px; height: 28px; place-items: center; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; color: #475569; cursor: pointer; }
.gantt-display-settings__reset:hover { border-color: #0f766e; color: #0f766e; }
.gantt-display-settings__error { align-self: center; color: #b42318; font-size: 10px; }
@media (max-width: 720px) {
  .gantt-display-settings { align-items: stretch; }
  .gantt-display-settings label { flex: 1 1 132px; }
  .gantt-display-settings label input[type='number'] { width: 100%; }
}
</style>
