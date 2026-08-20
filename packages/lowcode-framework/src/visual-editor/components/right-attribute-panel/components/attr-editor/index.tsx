/*
 * @Author: 卜启缘
 * @Date: 2021-06-10 16:23:06
 * @LastEditTime: 2021-07-11 18:36:24
 * @LastEditors: 卜启缘
 * @Description: 组件属性编辑器
 * @FilePath: \vite-vue3-lowcode\src\visual-editor\components\right-attribute-panel\components\attr-editor\index.tsx
 */
import { computed, defineComponent, inject, ref, watch } from 'vue';
import { ElAlert, ElEmpty } from '../../../common/designer-ui';
import LowCodeForm from '../../../../../components/LowCodeForm.vue';
import { useLowCodeHost } from '../../../../../core/host';
import { useVisualData } from '../../../../hooks/useVisualData';
import {
  applyMaterialPropFieldValue,
  createMaterialPropForm,
  createMaterialPropModel,
  createMaterialPropOptionSources,
  loadDatabaseMaterialPropForm,
  type MaterialPropFormField,
  type MaterialPropFormDefinition,
} from '../../../../material-prop-forms';
import type { LowCodeField } from '../../../../../types/lowcode';
import {
  formDesignerPageDataKey,
  formDesignerTableFieldOptionsKey,
} from '../../../../form-designer-context';

export const AttrEditor = defineComponent({
  setup() {
    const { currentBlock, jsonData, historyState } = useVisualData();
    const host = useLowCodeHost();
    const designerPageData = inject(formDesignerPageDataKey, null);
    const injectedTableFieldOptions = inject(formDesignerTableFieldOptionsKey, null);
    const definition = ref<MaterialPropFormDefinition | null>(null);
    const loading = ref(false);
    const loadError = ref('');
    let loadSequence = 0;
    const tableFieldPageData = computed(() => designerPageData?.value ?? jsonData);
    const optionSources = computed(() => {
      const sources = createMaterialPropOptionSources(
        jsonData.models,
        tableFieldPageData.value,
      );
      if (injectedTableFieldOptions) {
        sources.__visualTableFields = injectedTableFieldOptions.value;
      }
      return sources;
    });

    watch(
      () => currentBlock.value?.componentKey,
      async (componentKey) => {
        const sequence = ++loadSequence;
        definition.value = null;
        loadError.value = '';
        if (!componentKey) {
          loading.value = false;
          return;
        }

        loading.value = true;
        try {
          const loaded = await loadDatabaseMaterialPropForm(host.getServiceApi(), componentKey);
          if (sequence === loadSequence) definition.value = loaded;
        } catch (error) {
          if (sequence === loadSequence) {
            loadError.value = error instanceof Error ? error.message : '属性表单加载失败';
          }
        } finally {
          if (sequence === loadSequence) loading.value = false;
        }
      },
      { immediate: true },
    );

    const formState = computed(() => {
      const block = currentBlock.value;
      if (!block || !definition.value) return null;
      const schema = createMaterialPropForm(definition.value, block);

      return {
        schema,
        model: createMaterialPropModel(block, schema.fields),
        optionSources: optionSources.value,
      };
    });

    const handleFieldChange = (payload: {
      field: LowCodeField;
      value: unknown;
    }) => {
      if (!currentBlock.value?._vid) return;
      applyMaterialPropFieldValue(
        currentBlock.value,
        payload.field as MaterialPropFormField,
        payload.value,
      );
    };

    return () => (
      <>
        {!currentBlock.value?._vid ? (
          <ElEmpty description="请选择画布节点" imageSize={96} />
        ) : loading.value ? (
          <ElEmpty description="正在加载属性表单…" imageSize={72} />
        ) : loadError.value ? (
          <ElAlert type="error" title="属性表单加载失败" description={loadError.value} showIcon={true} />
        ) : !formState.value ? (
          <ElEmpty description="该物料尚未配置属性表单" imageSize={96} />
        ) : (
          <div class="material-prop-form">
            <LowCodeForm
              key={`${currentBlock.value._vid}-${currentBlock.value.componentKey}-${historyState.restoreVersion}`}
              schema={formState.value!.schema}
              modelValue={formState.value!.model}
              optionSources={formState.value!.optionSources}
              vertical={true}
              onFieldChange={handleFieldChange}
            />
          </div>
        )}
      </>
    );
  },
});
