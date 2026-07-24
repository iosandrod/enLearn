<template>
  <div class="lc-form-layout">
    <template v-for="(node, index) in nodes" :key="nodeKey(node, index)">
      <div
        v-if="node.kind === 'row'"
        class="lc-form-row"
        :style="{ gap: gapValue(node.gutter) }"
      >
        <div
          v-for="(column, columnIndex) in node.columns"
          :key="columnIndex"
          class="lc-form-col"
          :style="columnStyle(column)"
        >
          <LowCodeFormLayout
            :nodes="column.blocks"
            :fields-by-key="fieldsByKey"
          >
            <template #field="{ field }">
              <slot name="field" :field="field" />
            </template>
          </LowCodeFormLayout>
        </div>
      </div>

      <LowCodeFormLayout
        v-else-if="node.kind === 'stack'"
        :nodes="node.blocks"
        :fields-by-key="fieldsByKey"
      >
        <template #field="{ field }">
          <slot name="field" :field="field" />
        </template>
      </LowCodeFormLayout>

      <slot
        v-else-if="fieldsByKey[node.field]"
        name="field"
        :field="fieldsByKey[node.field]"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type {
  LowCodeField,
  LowCodeFormLayoutColumn,
  LowCodeFormLayoutNode
} from '~/types/lowcode';

defineOptions({
  name: 'LowCodeFormLayout'
});

defineProps<{
  nodes: LowCodeFormLayoutNode[];
  fieldsByKey: Record<string, LowCodeField>;
}>();

function nodeKey(node: LowCodeFormLayoutNode, index: number) {
  return node.kind === 'field' ? `${node.field}-${index}` : `${node.kind}-${index}`;
}

function gapValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? `${numeric}px` : undefined;
}

function columnStyle(column: LowCodeFormLayoutColumn) {
  const span = Number(column.span);

  if (!Number.isFinite(span) || span <= 0) {
    return undefined;
  }

  const basis = `${Math.min(span, 24) / 24 * 100}%`;

  return {
    flex: `0 0 ${basis}`,
    maxWidth: basis
  };
}
</script>
