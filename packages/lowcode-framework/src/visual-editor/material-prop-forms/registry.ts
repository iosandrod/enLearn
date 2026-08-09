import { shallowRef } from 'vue';
import type { MaterialPropFormDefinition, MaterialPropFormModule } from './types';

const modules = import.meta.glob<MaterialPropFormModule>('./materials/*.ts', {
  eager: true,
});

const definitionMap: Record<string, MaterialPropFormDefinition> = {};
const definitionVersion = shallowRef(0);

function mergeFields(
  currentFields: MaterialPropFormDefinition['fields'],
  nextFields: MaterialPropFormDefinition['fields'],
) {
  if (!nextFields.length) return currentFields;

  const mergedFields = [...currentFields];
  const fieldIndexes = new Map(
    currentFields.map((field, index) => [field.field, index]),
  );

  nextFields.forEach((field) => {
    const currentIndex = fieldIndexes.get(field.field);
    if (currentIndex === undefined) {
      fieldIndexes.set(field.field, mergedFields.length);
      mergedFields.push(field);
      return;
    }

    mergedFields[currentIndex] = {
      ...mergedFields[currentIndex],
      ...field,
    };
  });

  return mergedFields;
}

function mergeDefinition(
  current: MaterialPropFormDefinition,
  next: MaterialPropFormDefinition,
): MaterialPropFormDefinition {
  return {
    ...current,
    ...next,
    fields: mergeFields(current.fields, next.fields),
    layout: next.layout ?? current.layout,
    actions: next.actions ?? current.actions,
  };
}

function normalizeModule(module: MaterialPropFormModule): MaterialPropFormDefinition[] {
  if (Array.isArray(module)) return module;

  if ('default' in module && module.default) {
    return Array.isArray(module.default) ? module.default : [module.default];
  }

  return [module as MaterialPropFormDefinition];
}

export function registerMaterialPropForm(definition: MaterialPropFormDefinition) {
  const current = definitionMap[definition.componentKey];
  definitionMap[definition.componentKey] =
    definition.mergeBuiltinFields && current
      ? mergeDefinition(current, definition)
      : definition;
  definitionVersion.value += 1;
}

Object.values(modules).forEach((module) => {
  normalizeModule(module).forEach(registerMaterialPropForm);
});

export function getMaterialPropFormDefinition(componentKey?: string) {
  void definitionVersion.value;
  return componentKey ? definitionMap[componentKey] : undefined;
}

export function getMaterialPropFormDefinitions() {
  void definitionVersion.value;
  return { ...definitionMap };
}
