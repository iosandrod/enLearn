<template>
  <section class="content-panel lc-node-toolbar">
    <div>
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </div>
    <div class="lc-actions">
      <vxe-button
        v-for="action in block.actions"
        :key="action.code"
        :status="action.status"
        :disabled="action.disabled"
        @click="handleAction(action)"
      >
        {{ action.label }}
      </vxe-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { LowCodeAction, LowCodePageToolbarBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageToolbarBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();

function handleAction(action: LowCodeAction) {
  emit('runtimeEvent', {
    name: action.eventName ?? 'toolbar.click',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      action,
      actionCode: action.code,
      directives: action.directives ?? [],
    },
  });
  emit('toolbarAction', { block: props.block, action });
}
</script>
