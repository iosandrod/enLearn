import type { VisualEditorComponent } from '../../visual-editor/visual-editor.utils';
import { formMaterialVisualComponents } from '../../visual-editor/form-material-visual-components';

const modules = import.meta.glob<{ default?: VisualEditorComponent } | VisualEditorComponent>(
  './*/index.tsx',
  { eager: true }
);

const components: Record<string, VisualEditorComponent> = {};
const formMaterialComponentKeys = new Set(Object.keys(formMaterialVisualComponents));

Object.entries(modules).forEach(([key, module]) => {
  const name = key.replace(/\.\/(.*)\/index\.(tsx|vue)/, '$1');
  if (formMaterialComponentKeys.has(name)) return;
  components[name] = ((module as { default?: VisualEditorComponent }).default ||
    module) as VisualEditorComponent;
});

Object.assign(components, formMaterialVisualComponents);

export default components;
