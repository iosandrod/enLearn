import { Fragment as VueFragment, h, type VNode } from 'vue';

function normalizeProps(props: unknown, key?: unknown) {
  if (props && typeof props === 'object') {
    return typeof key === 'undefined' ? props : { ...(props as object), key };
  }

  return typeof key === 'undefined' ? null : { key };
}

export const Fragment = VueFragment;

export function jsx(type: unknown, props: unknown, key?: unknown): VNode {
  return h(type as never, normalizeProps(props, key) as never);
}

export const jsxs = jsx;
export const jsxDEV = jsx;
