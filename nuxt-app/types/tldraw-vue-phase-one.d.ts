declare module 'tldraw-vue-phase-one' {
  import type TldrawVueComponent from '../../packages/tldraw-vue/src/TldrawVue.vue';
  import type { Editor, TLContent } from '../../packages/tldraw-vue/packages/editor/src/vue-core';
  import type {
    VueTemplateLoadHandler,
    VueTemplateRecord,
    VueTemplateSaveHandler,
    VueTemplateWorkspaceConfig
  } from '../../packages/tldraw-vue/src/editor/templateStore';
  import type { VueEditorPlugin } from '../../packages/tldraw-vue/src/editor/vuePlugins';

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

  export const TldrawVue: typeof TldrawVueComponent;
  export default TldrawVueComponent;
}

declare module 'tldraw-vue-phase-one/style.css';
