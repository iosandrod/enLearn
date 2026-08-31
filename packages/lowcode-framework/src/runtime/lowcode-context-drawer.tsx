import { h } from 'vue';
import LowCodeContextDrawerPanel from '../components/LowCodeContextDrawerPanel.vue';
import {
  createLowCodeContextCatalog,
  cloneLowCodeContextSource,
  type LowCodeContextCategory,
  type LowCodeContextEntry,
  type LowCodeContextNode,
  type LowCodeContextNodeMethod,
  type LowCodeContextSource,
} from './lowcode-context';
import { openGlobalDrawer, type GlobalDrawerHandle } from './global-drawer-core';

export type OpenLowCodeContextDrawerOptions = {
  id?: string;
  title?: string;
  width?: string | number;
  source?: LowCodeContextSource;
  initialTab?: LowCodeContextCategory;
  onInsert?: (
    insertText: string,
    item: LowCodeContextEntry | LowCodeContextNode | LowCodeContextNodeMethod,
  ) => void;
};

export function openLowCodeContextDrawer(
  options: OpenLowCodeContextDrawerOptions = {},
): GlobalDrawerHandle {
  const source = options.source
    ? cloneLowCodeContextSource(options.source)
    : undefined;
  const catalog = createLowCodeContextCatalog(source);
  return openGlobalDrawer({
    id: options.id,
    title: options.title ?? '低代码上下文',
    width: options.width ?? 'min(460px, calc(100vw - 24px))',
    position: 'right',
    className: 'lowcode-context-drawer',
    props: {
      mask: false,
      lockView: false,
      lockScroll: false,
      resize: true,
    },
    body: () => h(LowCodeContextDrawerPanel, {
      catalog,
      initialTab: options.initialTab,
      allowInsert: Boolean(options.onInsert),
      onInsert: options.onInsert,
    }),
  });
}

export * from './lowcode-context';
