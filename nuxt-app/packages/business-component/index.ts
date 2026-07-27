import type { VisualEditorComponent } from '@/visual-editor/visual-editor.utils';
import lowcodeButtonGroup from './lowcode-button-group';
import normalForm from '../container-component/form';

const modules = import.meta.glob<{ default?: VisualEditorComponent } | VisualEditorComponent>(
  './*/index.tsx',
  { eager: true }
);

const components: Record<string, VisualEditorComponent> = {
  form: normalForm,
  'lowcode-button-group': lowcodeButtonGroup,
};

Object.keys(modules).forEach((key: string) => {
  const name = key.replace(/\.\/(.*)\/index\.(tsx|vue)/, '$1');
  const module = modules[key];
  components[name] = ((module as { default?: VisualEditorComponent }).default ||
    module) as VisualEditorComponent;
});

export default components;
