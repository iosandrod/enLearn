import { defineComponent, h, ref } from 'vue';
import type { LowCodeBlockMaterial } from './types';
import type { VisualToLowCodeConverter } from '../visual-converters/types';
import { lowCodeBlockMaterialAdapters } from '../material-runtime/material-adapters';
import { registerLowCodeBlockMaterialComponent } from '../material-runtime/component-bridge';

// Synchronous bootstrap entries keep schema/design-time APIs usable while the
// database catalog is loading. Every entry is replaced by its compiled SFC
// once initializeLowCodeMaterialCatalog completes.
const DatabaseMaterialPending = defineComponent({
  name: 'LowCodeDatabaseMaterialPending',
  props: { block: { type: Object, required: false } },
  setup(props) {
    return () => h('article', { class: 'content-panel lc-node-material-pending' }, [
      h('strong', '物料正在加载'),
      h('span', String((props.block as { kind?: unknown } | undefined)?.kind ?? '')),
    ]);
  },
});
const materialMap: Record<string, LowCodeBlockMaterial> = {};
const materialList: LowCodeBlockMaterial[] = [];
export const lowCodeBlockMaterialRevision = ref(0);

export function registerLowCodeBlockMaterial(material: LowCodeBlockMaterial) {
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
  lowCodeBlockMaterialRevision.value += 1;
}

Object.values(lowCodeBlockMaterialAdapters).forEach((adapter) => {
  const component = DatabaseMaterialPending;
  registerLowCodeBlockMaterialComponent(adapter.type, component, adapter.aliases);
  registerLowCodeBlockMaterial({ ...adapter, component } as LowCodeBlockMaterial);
});

export function getLowCodeBlockMaterial(type?: string) {
  return type ? materialMap[type] : undefined;
}

export function getLowCodeBlockMaterials() {
  return [...materialList];
}

export function getLowCodeBlockMaterialConverters() {
  return materialList
    .map((material) => material.converter)
    .filter((converter): converter is VisualToLowCodeConverter => Boolean(converter));
}

export function createDefaultLowCodeBlock(type: string, overrides = {}) {
  return getLowCodeBlockMaterial(type)?.createDefaultBlock?.(overrides);
}

export { materialMap as lowCodeBlockMaterialMap };
export type {
  LowCodeBlockMaterial,
  LowCodeBlockMaterialEmits,
  LowCodeBlockMaterialProps,
  LowCodeBlockValidationIssue,
  LowCodeRuntimeBlock,
} from './types';
