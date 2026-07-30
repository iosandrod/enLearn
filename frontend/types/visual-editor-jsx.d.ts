import type {
  ComponentPublicInstance,
  FunctionalComponent,
  VNode,
  VNodeChild
} from 'vue';

declare global {
  namespace JSX {
    type Element = VNode;
    type ElementClass = ComponentPublicInstance;

    interface ElementAttributesProperty {
      $props: Record<string, unknown>;
    }

    interface IntrinsicAttributes {
      [key: string]: unknown;
    }

    interface IntrinsicElements {
      [elem: string]: any;
    }
  }

  type VueNode = VNodeChild | JSX.Element;
}

declare module 'vue' {
  export type JSXComponent<Props = any> =
    | { new (): ComponentPublicInstance<Props> }
    | FunctionalComponent<Props>;
}
