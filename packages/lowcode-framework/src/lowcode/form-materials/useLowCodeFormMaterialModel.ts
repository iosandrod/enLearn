import { computed } from 'vue';
import type { LowCodeFormMaterialProps } from './types';

export function useLowCodeFormMaterialModel(
  props: Readonly<Pick<LowCodeFormMaterialProps, 'modelValue'>>,
  emit: (event: 'update:modelValue', value: any) => void
) {
  return computed<any>({
    get: () => props.modelValue,
    set: (value) =>{
       emit('update:modelValue', value)
    },
  });
}//
