import type { VisualEditorComponent } from '@/visual-editor/visual-editor.utils';

const modules = import.meta.glob<{ default?: VisualEditorComponent } | VisualEditorComponent>(
  './*/index.tsx',
  { eager: true }
);

const components: Record<string, VisualEditorComponent> = {};

Object.keys(modules).forEach((key: string) => {
  const name = key.replace(/\.\/(.*)\/index\.(tsx|vue)/, '$1');
  const module = modules[key];
  components[name] = ((module as { default?: VisualEditorComponent }).default ||
    module) as VisualEditorComponent;
});

console.log(components, 'container-component');
export default components;
