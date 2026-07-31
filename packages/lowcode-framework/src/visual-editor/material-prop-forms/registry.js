const modules = import.meta.glob('./materials/*.ts', {
    eager: true,
});
const definitionMap = {};
function normalizeModule(module) {
    if (Array.isArray(module))
        return module;
    if ('default' in module && module.default) {
        return Array.isArray(module.default) ? module.default : [module.default];
    }
    return [module];
}
export function registerMaterialPropForm(definition) {
    definitionMap[definition.componentKey] = definition;
}
Object.values(modules).forEach((module) => {
    normalizeModule(module).forEach(registerMaterialPropForm);
});
export function getMaterialPropFormDefinition(componentKey) {
    return componentKey ? definitionMap[componentKey] : undefined;
}
export function getMaterialPropFormDefinitions() {
    return { ...definitionMap };
}
