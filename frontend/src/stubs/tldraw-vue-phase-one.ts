import { defineComponent, h, onMounted } from 'vue';

export type TLContent = Record<string, unknown>;

export type Editor = {
  getCurrentPageShapeIdsSorted(): unknown[];
  getContentFromCurrentPage(shapeIds: unknown[]): TLContent;
  resolveAssetsInContent(content: TLContent): Promise<TLContent>;
  markHistoryStoppingPoint(label: string): void;
  run(callback: () => void, options?: Record<string, unknown>): void;
  deleteShapes(shapeIds: unknown[]): void;
  selectNone(): void;
  putContentOntoCurrentPage(content: TLContent, options?: Record<string, unknown>): void;
};

export type VueTemplateWorkspaceConfig = Record<string, unknown>;

export type VueTemplateRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  content: TLContent;
  workspace?: VueTemplateWorkspaceConfig;
};

export type VueTemplateLoadHandler = () => Promise<VueTemplateRecord[]> | VueTemplateRecord[];
export type VueTemplateSaveHandler = (templates: readonly VueTemplateRecord[]) => Promise<void> | void;

export type VueEditorPlugin = {
  id: string;
  commands?: Array<{
    id: string;
    label?: string;
    run: (...args: unknown[]) => unknown;
  }>;
  [key: string]: unknown;
};

const unavailableEditor: Editor = {
  getCurrentPageShapeIdsSorted: () => [],
  getContentFromCurrentPage: () => ({}),
  resolveAssetsInContent: async (content) => content,
  markHistoryStoppingPoint: () => undefined,
  run: (callback) => callback(),
  deleteShapes: () => undefined,
  selectNone: () => undefined,
  putContentOntoCurrentPage: () => undefined,
};

export function defineVueEditorPlugin(plugin: VueEditorPlugin): VueEditorPlugin {
  return plugin;
}

const TldrawVue = defineComponent({
  name: 'TldrawVueUnavailable',
  emits: ['ready', 'workspace-config-change'],
  setup(_, { emit, expose }) {
    expose({
      getEditor: () => unavailableEditor,
      getWorkspaceTemplateConfig: () => undefined,
      applyWorkspaceTemplateConfig: () => undefined,
    });

    onMounted(() => {
      emit('ready', unavailableEditor);
    });

    return () =>
      h('div', { class: 'tldraw-vue-unavailable' }, [
        h('strong', 'Print designer unavailable'),
        h('span', 'The local tldraw-vue package is missing, so this optional designer view is disabled.'),
      ]);
  },
});

export { TldrawVue };
export default TldrawVue;
