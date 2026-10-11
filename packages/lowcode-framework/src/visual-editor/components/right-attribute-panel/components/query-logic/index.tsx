import { computed, defineComponent, inject } from 'vue';
import QueryLogicTable from './QueryLogicTable.vue';
import { useVisualData } from '../../../../hooks/useVisualData';
import { formDesignerQueryLogicKey } from '../../../../form-designer-context';
import { normalizeLowCodeSearchQueryLogic } from '../../../../../lowcode/search-query-logic';
import type { LowCodeSearchQueryRule } from '../../../../../types/lowcode';

export const QueryLogicEditor = defineComponent({
  name: 'QueryLogicEditor',
  setup() {
    const { currentBlock, currentPage } = useVisualData();
    const formDesigner = inject(formDesignerQueryLogicKey, null);
    const fields = computed(() => {
      if (formDesigner) return formDesigner.getFields(currentPage.value);
      const props = currentBlock.value.props ?? {};
      return Array.isArray(props.fields) ? props.fields : props.schema?.fields ?? [];
    });
    const rules = computed(() => normalizeLowCodeSearchQueryLogic(
      formDesigner ? currentPage.value.queryLogic
        : currentBlock.value.props?.queryLogic ?? currentBlock.value.props?.schema?.queryLogic,
    ));
    const update = (value: LowCodeSearchQueryRule[]) => {
      if (formDesigner) currentPage.value.queryLogic = value;
      else if (currentBlock.value._vid) currentBlock.value.props.queryLogic = value;
    };
    return () => <QueryLogicTable fields={fields.value} modelValue={rules.value} onUpdate:modelValue={update} />;
  },
});
