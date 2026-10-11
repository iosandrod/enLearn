<template>
  <div v-if="searchModelsEnabled && searchModelController" class="lc-search-form-host" :class="blockClass" :style="blockStyle">
    <LowCodeSearchModelTabs
      :models="searchModelController.state.models"
      :active-model-id="searchModelController.state.activeId"
      :loading="searchModelController.state.loading"
      :create-model="searchModelController.create"
      :service-api="searchModelController.serviceApi()"
      @select="searchModelController.select"
    />
    <component :is="materialComponent" v-if="materialComponent" v-bind="props" v-on="materialEvents" />
  </div>

  <component
    :is="materialComponent"
    v-else-if="materialComponent"
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
    @row-action="(payload) => emit('gridRowAction', { block, ...payload })"
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
import { computed, inject } from 'vue';
import LowCodeSearchModelTabs from './LowCodeSearchModelTabs.vue';
import { searchModelControllerKey } from '../runtime/search-model-controller';
import {
  getLowCodeBlockMaterial,
  lowCodeBlockMaterialRevision,
  type LowCodeBlockMaterialEmits,
  type LowCodeBlockMaterialProps,
} from '../lowcode/block-materials';

const props = defineProps<LowCodeBlockMaterialProps>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const searchModelController = inject(searchModelControllerKey, undefined);
const searchModelsEnabled = computed(() => searchModelController?.enabled(props.block) ?? false);
const materialEvents = {
  formSubmit: (payload: LowCodeBlockMaterialEmits['formSubmit'][0]) => emit('formSubmit', payload),
  formAction: (payload: LowCodeBlockMaterialEmits['formAction'][0]) => emit('formAction', payload),
  searchSubmit: (payload: LowCodeBlockMaterialEmits['searchSubmit'][0]) => emit('searchSubmit', payload),
  searchAction: (payload: LowCodeBlockMaterialEmits['searchAction'][0]) => emit('searchAction', payload),
  runtimeEvent: (payload: LowCodeBlockMaterialEmits['runtimeEvent'][0]) => emit('runtimeEvent', payload),
};
const materialComponent = computed(() => {
  lowCodeBlockMaterialRevision.value;
  return getLowCodeBlockMaterial(props.block.kind)?.component;
});
const blockClass = computed(() => [
  {
    'lc-runtime-block': true,
    'lc-runtime-block--fill': props.block.layout?.fillRemaining === true,
  },
  props.block.className,
]);
const blockStyle = computed(() => props.block.style);
</script>

<style scoped>
.lc-search-form-host {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}
</style>
