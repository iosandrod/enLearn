import type { VisualEditorComponent } from '../../visual-editor/visual-editor.utils';
import lowcodeButtonGroup from './lowcode-button-group';
import approvalWorkflowDesigner from './approval-workflow-designer';
import triggerWorkflowDesigner from './trigger-workflow-designer';
import labelDesigner from './label-designer';
import normalForm from '../container-component/form';

const modules = import.meta.glob<{ default?: VisualEditorComponent } | VisualEditorComponent>(
  './*/index.tsx',
  { eager: true }
);

const components: Record<string, VisualEditorComponent> = {
  form: normalForm,
  'lowcode-button-group': lowcodeButtonGroup,
  'approval-workflow-designer': approvalWorkflowDesigner,
  'trigger-workflow-designer': triggerWorkflowDesigner,
  'label-designer': labelDesigner,
};

Object.keys(modules).forEach((key: string) => {
  const name = key.replace(/\.\/(.*)\/index\.(tsx|vue)/, '$1');
  const module = modules[key];
  components[name] = ((module as { default?: VisualEditorComponent }).default ||
    module) as VisualEditorComponent;
});

export default components;
