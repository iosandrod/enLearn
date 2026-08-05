<template>
  <div class="mobile-form-layout">
    <template v-for="(node, index) in nodes" :key="nodeKey(node, index)">
      <div v-if="node.kind === 'row'" :class="['layout-row', { 'is-compact': compact }]">
        <div
          v-for="(column, columnIndex) in node.columns"
          :key="columnIndex"
          class="layout-column"
          :style="columnStyle(column.span)"
        >
          <MobileFormLayout
            :nodes="column.blocks"
            :fields-by-key="fieldsByKey"
            :model="model"
            :errors="errors"
            :option-sources="optionSources"
            :disabled="disabled"
            :readonly="readonly"
            :compact="compact"
            @field-update="forwardFieldUpdate"
          />
        </div>
      </div>

      <MobileFormLayout
        v-else-if="node.kind === 'stack'"
        :nodes="node.blocks"
        :fields-by-key="fieldsByKey"
        :model="model"
        :errors="errors"
        :option-sources="optionSources"
        :disabled="disabled"
        :readonly="readonly"
        :compact="compact"
        @field-update="forwardFieldUpdate"
      />

      <div v-else-if="fieldsByKey[node.field]" class="layout-field">
        <MobileFormField
          :field="fieldsByKey[node.field]"
          :model-value="model[node.field]"
          :error="errors[node.field]"
          :option-sources="optionSources"
          :disabled="disabled"
          :readonly="readonly"
          @update:model-value="(value) => forwardFieldUpdate(fieldsByKey[node.field], value)"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue';

import MobileFormField from './mobile-form-field.vue';
import type { SharedLowCodeField } from '../types';
import type { LowCodeFormLayoutNode } from '../../../../packages/lowcode-framework/src/types/lowcode';
import { readFormNumber } from '../mobile-form';

defineOptions({
  name: 'MobileFormLayout',
});

const props = withDefaults(defineProps<{
  nodes: LowCodeFormLayoutNode[];
  fieldsByKey: Record<string, SharedLowCodeField>;
  model: Record<string, unknown>;
  errors: Record<string, string>;
  optionSources: Record<string, unknown>;
  disabled?: boolean;
  readonly?: boolean;
  compact?: boolean;
}>(), {
  disabled: false,
  readonly: false,
  compact: false,
});

const emit = defineEmits<{
  fieldUpdate: [field: SharedLowCodeField, value: unknown];
}>();

function nodeKey(node: LowCodeFormLayoutNode, index: number) {
  return node.kind === 'field' ? `${node.field}-${index}` : `${node.kind}-${index}`;
}

function columnStyle(span: number | string | undefined): CSSProperties {
  if (props.compact) return { width: '100%', flexBasis: '100%' };
  const normalizedSpan = Math.min(24, Math.max(1, readFormNumber(span, 24) ?? 24));
  const width = `${normalizedSpan / 24 * 100}%`;
  return { width, flexBasis: width };
}

function forwardFieldUpdate(field: SharedLowCodeField, value: unknown) {
  emit('fieldUpdate', field, value);
}
</script>

<style scoped>
.mobile-form-layout {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.layout-row {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
}

.layout-row.is-compact {
  flex-direction: column;
}

.layout-column {
  min-width: 0;
  padding-right: 7px;
  padding-left: 7px;
}

.layout-row > .layout-column:first-child {
  padding-left: 0;
}

.layout-row > .layout-column:last-child {
  padding-right: 0;
}

.layout-row.is-compact > .layout-column {
  width: 100%;
  padding-right: 0;
  padding-left: 0;
}

.layout-field {
  width: 100%;
  min-width: 0;
  margin-top: 11px;
}
</style>
