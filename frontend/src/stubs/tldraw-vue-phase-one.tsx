import { defineComponent, onMounted } from 'vue';

export type TLContent = Record<string, unknown>;

export type Editor = {
  getCurrentPageShapeIdsSorted(): unknown[];
  getCurrentPageId(): string;
  getCurrentPage(): { id: string; name: string };
  getPages(): Array<{ id: string; name: string }>;
  getPageShapeIds(pageId: string): Set<string>;
  getPage(pageId: string): { id: string; name: string } | undefined;
  createPage(page: { id: string; name: string }): Editor;
  renamePage(pageId: string, name: string): Editor;
  deletePage(pageId: string): Editor;
  setCurrentPage(pageId: string): Editor;
  getContentFromCurrentPage(shapeIds: unknown[], pageId?: string): TLContent;
  resolveAssetsInContent(content: TLContent): Promise<TLContent>;
  clearHistory(): void;
  markHistoryStoppingPoint(label: string): void;
  run(callback: () => void, options?: Record<string, unknown>): void;
  deleteShapes(shapeIds: unknown[]): void;
  selectNone(): void;
  putContentOntoCurrentPage(content: TLContent, options?: Record<string, unknown>): void;
  store: {
    mergeRemoteChanges(callback: () => void): void;
  };
};

export type VueTemplateWorkspaceConfig = Record<string, unknown>;
export type DesignerMode = 'print' | 'presentation';

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
  getCurrentPageId: () => 'page:stub',
  getCurrentPage: () => ({ id: 'page:stub', name: 'Page 1' }),
  getPages: () => [{ id: 'page:stub', name: 'Page 1' }],
  getPageShapeIds: () => new Set(),
  getPage: (pageId) => pageId === 'page:stub' ? { id: 'page:stub', name: 'Page 1' } : undefined,
  createPage: () => unavailableEditor,
  renamePage: () => unavailableEditor,
  deletePage: () => unavailableEditor,
  setCurrentPage: () => unavailableEditor,
  getContentFromCurrentPage: () => ({}),
  resolveAssetsInContent: async (content) => content,
  clearHistory: () => undefined,
  markHistoryStoppingPoint: () => undefined,
  run: (callback) => callback(),
  deleteShapes: () => undefined,
  selectNone: () => undefined,
  putContentOntoCurrentPage: () => undefined,
  store: {
    mergeRemoteChanges: (callback) => callback(),
  },
};

export function defineVueEditorPlugin(plugin: VueEditorPlugin): VueEditorPlugin {
  return plugin;
}

const TldrawVue = defineComponent({
  name: 'TldrawVueUnavailable',
  props: {
    showTemplateControls: {
      type: Boolean,
      default: true,
    },
    showModeControls: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['content-change', 'ready', 'workspace-config-change'],
  setup(_, { emit, expose }) {
    expose({
      getEditor: () => unavailableEditor,
      getWorkspaceTemplateConfig: () => undefined,
      applyWorkspaceTemplateConfig: () => undefined,
      getDesignerMode: () => 'print' as DesignerMode,
    });

    onMounted(() => {
      emit('ready', unavailableEditor);
    });

    return () => (
      <div class="tldraw-vue-unavailable">
        <strong>Print designer unavailable</strong>
        <span>The local tldraw-vue package is missing, so this optional designer view is disabled.</span>
      </div>
    );
  },
});

export { TldrawVue };
export default TldrawVue;
