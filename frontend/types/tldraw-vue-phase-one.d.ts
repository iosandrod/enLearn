declare module 'tldraw-vue-phase-one' {
  import type { DefineComponent } from 'vue';

  export type TLContent = Record<string, unknown>;

  export type Editor = {
    getCurrentPageShapeIdsSorted(): unknown[];
    getContentFromCurrentPage(shapeIds: unknown[]): TLContent;
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

  export type {
    Editor,
    TLContent,
    VueEditorPlugin,
    VueTemplateLoadHandler,
    VueTemplateRecord,
    VueTemplateSaveHandler,
    VueTemplateWorkspaceConfig
  };

  export function defineVueEditorPlugin(plugin: VueEditorPlugin): VueEditorPlugin;

  export const TldrawVue: DefineComponent;
  export default TldrawVue;
}

declare module 'tldraw-vue-phase-one/style.css';
