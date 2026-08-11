import type { LowCodeFormMaterial } from './types';

type MaterialModule =
  | { default?: LowCodeFormMaterial | LowCodeFormMaterial[]; material?: LowCodeFormMaterial }
  | LowCodeFormMaterial
  | LowCodeFormMaterial[];

const materialModules = import.meta.glob<MaterialModule>('./*/index.ts', { eager: true });
const materialMap: Record<string, LowCodeFormMaterial> = {};
const materialList: LowCodeFormMaterial[] = [];
const defaultMaterialType = 'vxe-input';

function normalizeModule(module: MaterialModule) {
  if (Array.isArray(module)) return module;
  if ('default' in module && module.default) {
    return Array.isArray(module.default) ? module.default : [module.default];
  }
  if ('material' in module && module.material) return [module.material];
  return [module as LowCodeFormMaterial];
}

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
}

Object.values(materialModules).forEach((module) => {
  normalizeModule(module).forEach(registerLowCodeFormMaterial);
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
