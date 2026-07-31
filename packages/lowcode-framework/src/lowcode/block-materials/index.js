import buttonGroupMaterial from './button-group';
const materialModules = import.meta.glob('./*/index.ts', { eager: true });
const materialMap = {};
const materialList = [];
function normalizeModule(module) {
    if (Array.isArray(module))
        return module;
    if ('default' in module && module.default) {
        return Array.isArray(module.default) ? module.default : [module.default];
    }
    if ('material' in module && module.material)
        return [module.material];
    return [module];
}
export function registerLowCodeBlockMaterial(material) {
    const keys = [material.type, ...(material.aliases ?? [])].filter(Boolean);
    keys.forEach((key) => {
        materialMap[key] = material;
    });
    const existsIndex = materialList.findIndex((item) => item.type === material.type);
    if (existsIndex >= 0) {
        materialList.splice(existsIndex, 1, material);
    }
    else {
        materialList.push(material);
    }
    materialList.sort((prev, next) => (prev.order ?? 0) - (next.order ?? 0));
}
Object.values(materialModules).forEach((module) => {
    normalizeModule(module).forEach(registerLowCodeBlockMaterial);
});
registerLowCodeBlockMaterial(buttonGroupMaterial);
export function getLowCodeBlockMaterial(type) {
    return type ? materialMap[type] : undefined;
}
export function getLowCodeBlockMaterials() {
    return [...materialList];
}
export function getLowCodeBlockMaterialConverters() {
    return materialList
        .map((material) => material.converter)
        .filter((converter) => Boolean(converter));
}
export function createDefaultLowCodeBlock(type, overrides = {}) {
    return getLowCodeBlockMaterial(type)?.createDefaultBlock?.(overrides);
}
export { materialMap as lowCodeBlockMaterialMap };
