import { createVisualEditorConfig } from '@enlearn/lowcode-framework/designer';
import baseWidgets from '@enlearn/lowcode-framework/packages/base-widgets';
import containerComponent from '@enlearn/lowcode-framework/packages/container-component';
import businessComponent from '@enlearn/lowcode-framework/packages/business-component';

export const visualConfig = createVisualEditorConfig();
const formComponentKeys = new Set([
  'array-table',
  'checkbox',
  'datetimePicker',
  'input',
  'picker',
  'radio',
  'rate',
  'slider',
  'stepper',
  'sub-form',
  'switch',
]);
// 注册基础控件
Object.entries(baseWidgets).forEach(([name, widget]) =>
  visualConfig.registry(formComponentKeys.has(name) ? 'formComponents' : 'baseWidgets', name, widget),
);
// 注册容器组件
Object.entries(containerComponent).forEach(([name, widget]) =>
  visualConfig.registry('containerComponents', name, widget),
);
// 注册业务组件
Object.entries(businessComponent).forEach(([name, widget]) =>
  visualConfig.registry('businessComponents', name, widget),
);

console.log(
  `%c成功加载组件数量:${Object.keys(visualConfig.componentMap).length}`,
  'color:#409EFF;background-color:#ecf5ff;padding:0 10px;line-height:2;margin-bottom:4px;',
);

console.log('visualConfig:', visualConfig);
