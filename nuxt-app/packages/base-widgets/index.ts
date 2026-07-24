import type { VisualEditorComponent } from '@/visual-editor/visual-editor.utils';

const modules = import.meta.glob<{ default?: VisualEditorComponent } | VisualEditorComponent>(
  './*/index.tsx',
  { eager: true }
);

const components: Record<string, VisualEditorComponent> = {};

Object.entries(modules).forEach(([key, module]) => {
  const name = key.replace(/\.\/(.*)\/index\.(tsx|vue)/, '$1');
  components[name] = ((module as { default?: VisualEditorComponent }).default ||
    module) as VisualEditorComponent;
});

export default components;
