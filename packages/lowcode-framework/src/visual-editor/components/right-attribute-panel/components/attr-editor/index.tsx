/*
 * @Author: 卜启缘
 * @Date: 2021-06-10 16:23:06
 * @LastEditTime: 2021-07-11 18:36:24
 * @LastEditors: 卜启缘
 * @Description: 组件属性编辑器
 * @FilePath: \vite-vue3-lowcode\src\visual-editor\components\right-attribute-panel\components\attr-editor\index.tsx
 */
import { computed, defineComponent } from 'vue';
import { ElEmpty } from '../../../common/designer-ui';
import LowCodeForm from '../../../../../components/LowCodeForm.vue';
import { useVisualData } from '../../../../hooks/useVisualData';
import {
  applyMaterialPropFieldValue,
  createMaterialPropForm,
  createMaterialPropModel,
  createMaterialPropOptionSources,
  type MaterialPropFormField,
} from '../../../../material-prop-forms';
import type { LowCodeField } from '../../../../../types/lowcode';

export const AttrEditor = defineComponent({
  setup() {
    const { visualConfig, currentBlock, jsonData, historyState } = useVisualData();

    const formState = computed(() => {
      const block = currentBlock.value;
      const component = visualConfig.componentMap[block?.componentKey];
      const schema = createMaterialPropForm(component, block);

      return {
        schema,
        model: createMaterialPropModel(block, schema.fields),
        optionSources: createMaterialPropOptionSources(jsonData.models),
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
        {currentBlock.value?._vid ? (
          <div class="material-prop-form">
            <LowCodeForm
              key={`${currentBlock.value._vid}-${currentBlock.value.componentKey}-${historyState.restoreVersion}`}
              schema={formState.value.schema}
              modelValue={formState.value.model}
              optionSources={formState.value.optionSources}
              onFieldChange={handleFieldChange}
            />
          </div>
        ) : (
          <ElEmpty description="请选择画布节点" imageSize={96} />
        )}
      </>
    );
  },
});
