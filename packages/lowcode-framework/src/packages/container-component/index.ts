import type { VisualEditorComponent } from '../../visual-editor/visual-editor.utils';
import layout from './layout';
import vxeTabs from './vxe-tabs';

const modules = import.meta.glob<{ default?: VisualEditorComponent } | VisualEditorComponent>(
  './*/index.tsx',
  { eager: true }
);

const components: Record<string, VisualEditorComponent> = {
  layout,
  'vxe-tabs': vxeTabs,
};

Object.keys(modules).forEach((key: string) => {
  const name = key.replace(/\.\/(.*)\/index\.(tsx|vue)/, '$1');
  if (name === 'form') return;
  const module = modules[key];
  components[name] = ((module as { default?: VisualEditorComponent }).default ||
    module) as VisualEditorComponent;
});

export default components;
