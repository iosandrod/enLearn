import type { MaterialPropFormDefinition, MaterialPropFormModule } from './types';

const modules = import.meta.glob<MaterialPropFormModule>('./materials/*.ts', {
  eager: true,
});

const definitionMap: Record<string, MaterialPropFormDefinition> = {};

function normalizeModule(module: MaterialPropFormModule): MaterialPropFormDefinition[] {
  if (Array.isArray(module)) return module;

  if ('default' in module && module.default) {
    return Array.isArray(module.default) ? module.default : [module.default];
  }

  return [module as MaterialPropFormDefinition];
}

export function registerMaterialPropForm(definition: MaterialPropFormDefinition) {
  definitionMap[definition.componentKey] = definition;
}

Object.values(modules).forEach((module) => {
  normalizeModule(module).forEach(registerMaterialPropForm);
});

export function getMaterialPropFormDefinition(componentKey?: string) {
  return componentKey ? definitionMap[componentKey] : undefined;
}

export function getMaterialPropFormDefinitions() {
  return { ...definitionMap };
}
