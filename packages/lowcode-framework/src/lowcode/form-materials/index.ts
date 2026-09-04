import { defineComponent, h, ref, type PropType } from 'vue';
import type { LowCodeFormMaterial } from './types';
import { lowCodeFormMaterialAdapters } from '../material-runtime/material-adapters';
import { registerLowCodeFormMaterialComponent } from '../material-runtime/component-bridge';

const PendingFormMaterial = defineComponent({
  name: 'LowCodePendingFormMaterial',
  props: {
    field: { type: Object as PropType<{ component?: string; props?: Record<string, unknown> }>, required: true },
    modelValue: { type: null as unknown as PropType<unknown>, default: undefined },
    options: { type: Array as PropType<Array<{ label?: string; value?: unknown; disabled?: boolean }>>, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => {
      const component = props.field.component ?? '';
      const fieldProps = props.field.props ?? {};
      const common = {
        id: props.field.component,
        disabled: fieldProps.disabled === true,
        readonly: fieldProps.readonly === true,
        placeholder: typeof fieldProps.placeholder === 'string' ? fieldProps.placeholder : undefined,
        value: props.modelValue as string | number | undefined,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      };
      if (component === 'vxe-textarea') return h('textarea', common);
      if (component === 'vxe-select' || component === 'vxe-tree-select') {
        return h('select', {
          ...common,
          value: props.modelValue,
          onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
        }, props.options.map((option) => h('option', {
          key: String(option.value), value: option.value, disabled: option.disabled,
        }, option.label ?? String(option.value ?? ''))));
      }
      if (component === 'vxe-switch' || component === 'vxe-checkbox-group') {
        return h('input', {
          ...common,
          type: 'checkbox',
          checked: Boolean(props.modelValue),
          onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).checked),
        });
      }
      if (component === 'vxe-radio-group') return h('input', { ...common, type: 'radio' });
      return h('input', {
        ...common,
        type: component === 'lc-number-input' ? 'number' : component === 'vxe-password-input' ? 'password' : 'text',
      });
    };
  },
});
const materialMap: Record<string, LowCodeFormMaterial> = {};
const materialList: LowCodeFormMaterial[] = [];
const defaultMaterialType = 'vxe-input';
export const lowCodeFormMaterialRevision = ref(0);

export function registerLowCodeFormMaterial(material: LowCodeFormMaterial) {
  const keys = [material.type, ...(material.aliases ?? [])].filter(Boolean);

  keys.forEach((key) => {
    materialMap[key] = material;
  });

  const existsIndex = materialList.findIndex((item) => item.type === material.type);
  if (existsIndex >= 0) {
    materialList.splice(existsIndex, 1, material);
  } else {
    materialList.push(material);
  }

  materialList.sort((prev, next) => (prev.order ?? 0) - (next.order ?? 0));
  lowCodeFormMaterialRevision.value += 1;
}

Object.values(lowCodeFormMaterialAdapters).forEach((adapter) => {
  registerLowCodeFormMaterialComponent(adapter.type, PendingFormMaterial, adapter.aliases);
  registerLowCodeFormMaterial({ ...adapter, component: PendingFormMaterial } as LowCodeFormMaterial);
});

export function getLowCodeFormMaterial(type?: string): LowCodeFormMaterial {
  const material =
    materialMap[type || defaultMaterialType] ?? materialMap[defaultMaterialType] ?? materialList[0];

  if (!material) {
    throw new Error('No low-code form material has been registered.');
  }

  return material;
}

export function getLowCodeFormMaterials() {
  return [...materialList];
}

export { materialMap as lowCodeFormMaterialMap };
export type {
  LowCodeFormMaterial,
  LowCodeFormMaterialPatchPayload,
  LowCodeFormMaterialProps,
  LowCodeFormMaterialSelectPayload,
  LowCodeResolvedOption,
} from './types';
