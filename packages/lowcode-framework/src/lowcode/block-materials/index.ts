import type { LowCodeBlockMaterial } from './types';
import type { VisualToLowCodeConverter } from '../visual-converters/types';
import buttonGroupMaterial from './button-group';

type MaterialModule =
  | { default?: LowCodeBlockMaterial | LowCodeBlockMaterial[]; material?: LowCodeBlockMaterial }
  | LowCodeBlockMaterial
  | LowCodeBlockMaterial[];

const materialModules = import.meta.glob<MaterialModule>('./*/index.ts', { eager: true });
const materialMap: Record<string, LowCodeBlockMaterial> = {};
const materialList: LowCodeBlockMaterial[] = [];

function normalizeModule(module: MaterialModule) {
  if (Array.isArray(module)) return module;
  if ('default' in module && module.default) {
    return Array.isArray(module.default) ? module.default : [module.default];
  }
  if ('material' in module && module.material) return [module.material];
  return [module as LowCodeBlockMaterial];
}

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
}

Object.values(materialModules).forEach((module) => {
  normalizeModule(module).forEach(registerLowCodeBlockMaterial);
});
registerLowCodeBlockMaterial(buttonGroupMaterial);

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
