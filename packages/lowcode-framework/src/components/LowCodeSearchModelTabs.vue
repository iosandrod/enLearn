<template>
  <div class="lc-search-models" aria-label="查询方案">
    <div class="lc-search-models__tabs" role="tablist" aria-label="查询方案">
      <button
        v-for="model in models"
        :key="model.id"
        class="lc-search-models__tab"
        :class="{ 'is-active': model.id === activeModelId }"
        type="button"
        role="tab"
        :aria-selected="model.id === activeModelId"
        :disabled="loading"
        @click="emit('select', model)"
      >
        {{ model.name }}
      </button>
      <button
        class="lc-search-models__add"
        type="button"
        title="新增查询方案"
        aria-label="新增查询方案"
        :disabled="loading"
        @click="openCreateDialog"
      >
        <i class="ri-add-line" aria-hidden="true" />
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { LowCodeHostServiceApi } from '../core/host';
import type { SearchModel } from '../runtime/search-model-controller';
import { confirmForm } from '../runtime/global-dialog';

const SEARCH_MODEL_FORM_CODE = 'admin.search-model.create';
const SEARCH_MODEL_FORM_ID = 'confirm-form-admin-search-model-create';

const props = defineProps<{
  models: SearchModel[];
  activeModelId: string;
  loading?: boolean;
  createModel(name: string): Promise<boolean>;
  serviceApi: LowCodeHostServiceApi;
}>();

const emit = defineEmits<{
  select: [model: SearchModel];
}>();

const opening = ref(false);

async function openCreateDialog() {
  if (props.loading || opening.value) return;
  opening.value = true;
  try {
    await confirmForm({
    formCode: SEARCH_MODEL_FORM_CODE,
    title: '新增查询方案',
    width: 460,
    confirmLabel: '新增并保存',
    cancelLabel: '取消',
    disablePageAutoLoad: true,
    serviceApi: props.serviceApi,
    formInitialValues: { [SEARCH_MODEL_FORM_CODE]: { name: '' } },
    dialog: { id: 'search-model-create-dialog' },
    beforeConfirm: async (payload) => {
      const form = payload.formModels[SEARCH_MODEL_FORM_ID] ?? payload.formModels[SEARCH_MODEL_FORM_CODE] ?? {};
      const name = typeof form.name === 'string' ? form.name.trim() : '';
      if (!name) throw new Error('请输入方案名称。');
      if (name.length > 120) throw new Error('方案名称不能超过 120 个字符。');
      if (props.models.some((model) => model.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('该方案名称已存在，请使用其他名称。');
      }
      if (!(await props.createModel(name))) throw new Error('保存失败，请重试。');
      return true;
    },
    });
  } catch (error) {
    const { VxeUI } = await import('vxe-pc-ui');
    void VxeUI.modal.message({ content: error instanceof Error ? error.message : '加载表单失败。', status: 'error' });
  } finally {
    opening.value = false;
  }
}
</script>

<style scoped>
.lc-search-models {
  flex: 0 0 auto;
  width: 100%;
  min-width: 0;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}

.lc-search-models__tabs {
  display: flex;
  align-items: end;
  gap: 4px;
  min-height: 36px;
  padding: 0 12px;
  overflow-x: auto;
}

.lc-search-models__tab,
.lc-search-models__add {
  flex: 0 0 auto;
  min-height: 36px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #606266;
  cursor: pointer;
}

.lc-search-models__tab {
  max-width: 180px;
  padding: 0 12px;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-search-models__tab:hover,
.lc-search-models__tab.is-active {
  color: var(--vxe-ui-font-primary-color, #409eff);
}

.lc-search-models__tab.is-active {
  border-bottom-color: var(--vxe-ui-font-primary-color, #409eff);
  font-weight: 600;
}

.lc-search-models__add {
  display: inline-grid;
  width: 32px;
  place-items: center;
  padding: 0;
  font-size: 17px;
}

.lc-search-models__tab:disabled,
.lc-search-models__add:disabled {
  cursor: wait;
  opacity: 0.55;
}

</style>
