<template>
  <component
    :is="materialComponent"
    v-if="materialComponent"
    :class="blockClass"
    :style="blockStyle"
    :block="block"
    :resolved-data="resolvedData"
    :form-models="formModels"
    :search-filters="searchFilters"
    :loading-block-id="loadingBlockId"
    :loading-grid-id="loadingGridId"
    @form-submit="(payload) => emit('formSubmit', payload)"
    @form-action="(payload) => emit('formAction', payload)"
    @grid-edit="(payload) => emit('gridEdit', payload)"
    @grid-delete="(payload) => emit('gridDelete', payload)"
    @toolbar-action="(payload) => emit('toolbarAction', payload)"
    @search-submit="(payload) => emit('searchSubmit', payload)"
    @search-action="(payload) => emit('searchAction', payload)"
    @runtime-event="(event) => emit('runtimeEvent', event)"
  />

  <article v-else class="content-panel lc-node-unsupported">
    <strong>未注册区块</strong>
    <span>{{ block.kind }}</span>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  getLowCodeBlockMaterial,
  type LowCodeBlockMaterialEmits,
  type LowCodeBlockMaterialProps,
} from '../lowcode/block-materials';

const props = defineProps<LowCodeBlockMaterialProps>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();

const materialComponent = computed(() => getLowCodeBlockMaterial(props.block.kind)?.component);
const blockClass = computed(() => [
  {
    'lc-runtime-block': true,
    'lc-runtime-block--fill': props.block.layout?.fillRemaining === true,
  },
  props.block.className,
]);
const blockStyle = computed(() => props.block.style);
</script>
