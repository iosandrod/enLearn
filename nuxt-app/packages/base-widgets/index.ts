import type { VisualEditorComponent } from '@/visual-editor/visual-editor.utils';
import arrayTable from './array-table';

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

components['array-table'] = arrayTable;

export default components;
