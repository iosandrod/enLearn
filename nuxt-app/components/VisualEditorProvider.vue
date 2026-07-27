<template>
  <component :is="PackageVisualEditorProviderView" ref="providerRef" v-bind="$attrs">
    <template v-if="hasMetaSlot" #meta>
      <slot name="meta" />
    </template>
    <template v-if="hasActionsSlot" #actions>
      <slot name="actions" />
    </template>
  </component>
</template>

<script setup lang="ts">
import { computed, ref, useSlots } from 'vue';
import { VisualEditorProvider as PackageVisualEditorProvider } from '@enlearn/lowcode-framework/designer';

defineOptions({
  inheritAttrs: false
});

const providerRef = ref<InstanceType<typeof PackageVisualEditorProvider> | null>(null);
const PackageVisualEditorProviderView = PackageVisualEditorProvider as any;
const slots = useSlots();
const hasMetaSlot = computed(() => Boolean(slots.meta));
const hasActionsSlot = computed(() => Boolean(slots.actions));

defineExpose({
  getSnapshot: () => providerRef.value?.getSnapshot()
});
</script>
