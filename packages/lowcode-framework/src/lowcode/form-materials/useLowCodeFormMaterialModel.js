import { computed } from 'vue';
export function useLowCodeFormMaterialModel(props, emit) {
    return computed({
        get: () => props.modelValue,
        set: (value) => emit('update:modelValue', value),
    });
}
