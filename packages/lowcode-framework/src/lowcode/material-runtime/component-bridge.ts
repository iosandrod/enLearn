import { ref, type Component } from 'vue';

/**
 * Runtime component bridge shared by database-backed materials and the small
 * number of designer adapters that still need a synchronous component
 * reference.  The catalog replaces entries as soon as an SFC is compiled;
 * legacy registries seed the same map during bootstrap.
 */
const blockComponents = new Map<string, Component>();
const formComponents = new Map<string, Component>();

export const lowCodeMaterialComponentRevision = ref(0);

function register(
  target: Map<string, Component>,
  code: string,
  component: Component | undefined,
  aliases: string[] = [],
) {
  if (!component) return;
  for (const key of [code, ...aliases]) {
    if (key) target.set(key, component);
  }
  lowCodeMaterialComponentRevision.value += 1;
}

export function registerLowCodeBlockMaterialComponent(
  code: string,
  component: Component | undefined,
  aliases?: string[],
) {
  register(blockComponents, code, component, aliases);
}

export function registerLowCodeFormMaterialComponent(
  code: string,
  component: Component | undefined,
  aliases?: string[],
) {
  register(formComponents, code, component, aliases);
}

export function resolveLowCodeBlockMaterialComponent(code?: string) {
  return code ? blockComponents.get(code) : undefined;
}

export function resolveLowCodeFormMaterialComponent(code?: string) {
  return code ? formComponents.get(code) : undefined;
}

export function resetLowCodeMaterialComponentBridge() {
  blockComponents.clear();
  formComponents.clear();
  lowCodeMaterialComponentRevision.value += 1;
}
