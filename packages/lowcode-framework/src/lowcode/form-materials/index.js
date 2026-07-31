const materialModules = import.meta.glob('./*/index.ts', { eager: true });
const materialMap = {};
const materialList = [];
const defaultMaterialType = 'vxe-input';
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
export function registerLowCodeFormMaterial(material) {
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
    normalizeModule(module).forEach(registerLowCodeFormMaterial);
});
export function getLowCodeFormMaterial(type) {
    const material = materialMap[type || defaultMaterialType] ?? materialMap[defaultMaterialType] ?? materialList[0];
    if (!material) {
        throw new Error('No low-code form material has been registered.');
    }
    return material;
}
export function getLowCodeFormMaterials() {
    return [...materialList];
}
export { materialMap as lowCodeFormMaterialMap };
