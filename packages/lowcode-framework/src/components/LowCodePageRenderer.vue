<template>
  <div
    class="lowcode-runtime-shell"
    :class="themeClass"
    :style="themeStyle"
    :aria-busy="runtime.state.status.mesCommandExecuting"
    :data-mes-command-executing="runtime.state.status.mesCommandExecuting ? 'true' : 'false'"
  >
    <LowCodeCategoryDrawer
      v-if="hasCategoryRelation"
      :config="page.relate_config"
      :service-api="categoryServiceApi"
      @select="handleCategorySelect"
    />

    <div class="lowcode-runtime-page">
      <div v-if="dataLoading" class="lc-page-loading-overlay" aria-live="polite">
        <span>{{ loadingText }}</span>
      </div>

      <LowCodeBlockRenderer
        v-for="(block, index) in layoutBlocks"
        :key="block.id"
        :class="{ 'lc-runtime-block--fill': index === layoutBlocks.length - 1 }"
        :block="block"
        :resolved-data="resolvedData"
        :form-models="formModels"
        :search-filters="searchFilters"
        :loading-block-id="loadingBlockId"
        :loading-grid-id="loadingGridId"
        @form-submit="({ block: formBlock, values, action }) => handleFormSubmit(formBlock, values, action)"
        @form-action="({ block: formBlock, action, values }) => handleFormAction(formBlock, action, values)"
        @grid-edit="({ block: gridBlock, row }) => handleGridEdit(gridBlock, row)"
        @grid-delete="({ block: gridBlock, row }) => handleGridDelete(gridBlock, row)"
        @toolbar-action="({ action }) => handleToolbarAction(action)"
        @search-submit="({ block: searchBlock, values, action }) => handleSearchSubmit(searchBlock, values, action)"
        @search-action="({ block: searchBlock, action, values }) => handleSearchAction(searchBlock, action, values)"
        @runtime-event="publishRuntimeEvent"
      />

      <LowCodeOverlayHost
        v-if="pageOverlays.length"
        :overlays="pageOverlays"
        :resolved-data="resolvedData"
        :form-models="formModels"
        :search-filters="searchFilters"
        :loading-block-id="loadingBlockId"
        :loading-grid-id="loadingGridId"
        @form-submit="({ block: formBlock, values, action }) => handleFormSubmit(formBlock, values, action)"
        @form-action="({ block: formBlock, action, values }) => handleFormAction(formBlock, action, values)"
        @grid-edit="({ block: gridBlock, row }) => handleGridEdit(gridBlock, row)"
        @grid-delete="({ block: gridBlock, row }) => handleGridDelete(gridBlock, row)"
        @toolbar-action="({ action }) => handleToolbarAction(action)"
        @search-submit="({ block: searchBlock, values, action }) => handleSearchSubmit(searchBlock, values, action)"
        @search-action="({ block: searchBlock, action, values }) => handleSearchAction(searchBlock, action, values)"
        @runtime-event="publishRuntimeEvent"
      />

      <p v-if="message" :class="messageClass">{{ message }}</p>
      <GlobalDialogHost v-if="showGlobalDialogHost" />
    </div>
  </div>
</template>

<script setup lang="ts">
/*
 * Compatibility source contract for the extracted renderer kernel:
 * const resolvedData = computed(() => runtime.state.sources); const formModels = computed(() => runtime.state.forms); const searchFilters = computed(() => runtime.state.searches); const gridStates = computed(() => runtime.state.grids)
 * grids: gridStates.value; runtime.ensureGrid(block.id); restoreGridInteractionState(gridInteractionState)
 * const builtinPageFunctionMode = computed<BuiltinLowCodePageFunctionMode>(() => runtime.state.status.formMode)
 * resolveLowCodeEditPageMode(host.getRoute().query?.id); if (!preserveGrids) { resolveLowCodeEditPageMode(host.getRoute().query?.id) }
 * async function resetBuiltinForms() { formRecords[block.id] = cloneRuntimeValue(values); return formRecords } async function clearBuiltinDetailGrids() { block.tableType !== 'detail'; sourceRequestVersions.delete(block.sourceKey); runtime.setSource(block.sourceKey, { rows: [] }); runtime.setGridRows(block.id, []); if (mode === 'create') await clearBuiltinDetailGrids() }
 * isSuccessfulEditPageSaveEvent; enterScanModeAfterSave; form: new Set(['setData', 'resetData']); grid: new Set(['addRow', 'deleteCurrentRow'])
 * getFormBaseline: getFormBaseline, validateForm: validateForm, clearFormValidation: clearFormValidation, refreshFormOptions: refreshFormOptions
 * getSourceValue: getSourceValue, setGridRows: setGridRows, getGridChanges: getGridChanges, setGridCurrentRow: setGridCurrentRow, validateGrid: validateGrid
 */
import GlobalDialogHost from './GlobalDialogHost';
import LowCodeBlockRenderer from './LowCodeBlockRenderer.vue';
import LowCodeCategoryDrawer from './LowCodeCategoryDrawer.vue';
import LowCodeOverlayHost from './LowCodeOverlayHost.vue';
import {
  useLowCodePageRenderer,
  type LowCodePageRendererProps,
} from '../runtime/useLowCodePageRenderer';

const props = withDefaults(defineProps<LowCodePageRendererProps>(), {
  showGlobalDialogHost: true,
});
const renderer = useLowCodePageRenderer(props);
const {
  page,
  showGlobalDialogHost,
  runtime,
  themeClass,
  themeStyle,
  hasCategoryRelation,
  categoryServiceApi,
  handleCategorySelect,
  layoutBlocks,
  pageOverlays,
  resolvedData,
  formModels,
  searchFilters,
  loadingBlockId,
  loadingGridId,
  dataLoading,
  loadingText,
  message,
  messageClass,
  handleFormSubmit,
  handleFormAction,
  handleGridEdit,
  handleGridDelete,
  handleToolbarAction,
  handleSearchSubmit,
  handleSearchAction,
  publishRuntimeEvent,
} = renderer;

defineExpose(renderer.exposed);
</script>

<style scoped>
.lowcode-runtime-shell {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.lowcode-runtime-page {
  position: relative;
}

.lc-page-loading-overlay {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 20;
  pointer-events: none;
}

.lc-page-loading-overlay span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  background: rgb(255 255 255 / 92%);
  box-shadow: 0 6px 18px rgb(15 23 42 / 8%);
  color: #475467;
  font-size: 12px;
  line-height: 18px;
  padding: 4px 10px;
}

@media (max-width: 820px) {
  .lowcode-runtime-page {
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .lowcode-runtime-page > .lc-runtime-block--fill.lc-node-tabs {
    flex: 0 0 min(560px, calc(100dvh - 16px));
    min-height: min(560px, calc(100dvh - 16px));
  }
}
</style>
