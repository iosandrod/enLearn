import { shallowRef } from 'vue';
import type { MaterialPropFormDefinition } from './types';

const definitionMap: Record<string, MaterialPropFormDefinition> = {};
const definitionVersion = shallowRef(0);

export function registerMaterialPropForm(definition: MaterialPropFormDefinition) {
  definitionMap[definition.componentKey] = definition;
  definitionVersion.value += 1;
}

export function unregisterMaterialPropForm(componentKey: string) {
  if (!definitionMap[componentKey]) return;
  delete definitionMap[componentKey];
  definitionVersion.value += 1;
}

export function getMaterialPropFormDefinition(componentKey?: string) {
  void definitionVersion.value;
  return componentKey ? definitionMap[componentKey] : undefined;
}

export function getMaterialPropFormDefinitions() {
  void definitionVersion.value;
  return { ...definitionMap };
}
