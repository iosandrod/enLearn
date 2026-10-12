import { createVisualEditorConfig } from './visual-editor/visual-editor.utils';
import { formMaterialVisualComponents } from './visual-editor/form-material-visual-components';
import legacyTextComponent from './visual-editor/legacy-text-component';
import containerComponent from './packages/container-component';
import chartComponent from './packages/chart-component';
import businessComponent from './packages/business-component';

export const visualConfig = createVisualEditorConfig();
// 注册表单控件
Object.entries(formMaterialVisualComponents).forEach(([name, widget]) =>
  visualConfig.registry('formComponents', name, widget),
);
// Existing page schemas can contain text nodes; keep them renderable without
// exposing the retired basic materials in the palette.
visualConfig.componentMap.text = legacyTextComponent;
// 注册容器组件
Object.entries(containerComponent).forEach(([name, widget]) =>
  visualConfig.registry('containerComponents', name, widget),
);
Object.entries(chartComponent).forEach(([name, widget]) =>
  visualConfig.registry('chartComponents', name, widget),
);
// 注册业务组件
Object.entries(businessComponent).forEach(([name, widget]) =>
  visualConfig.registry('businessComponents', name, widget),
);
