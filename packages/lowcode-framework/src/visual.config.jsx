import { createVisualEditorConfig } from './visual-editor/visual-editor.utils';
import baseWidgets from './packages/base-widgets';
import containerComponent from './packages/container-component';
import chartComponent from './packages/chart-component';
import businessComponent from './packages/business-component';
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
Object.entries(baseWidgets).forEach(([name, widget]) => visualConfig.registry(formComponentKeys.has(name) ? 'formComponents' : 'baseWidgets', name, widget));
// 注册容器组件
Object.entries(containerComponent).forEach(([name, widget]) => visualConfig.registry('containerComponents', name, widget));
Object.entries(chartComponent).forEach(([name, widget]) => visualConfig.registry('chartComponents', name, widget));
// 注册业务组件
Object.entries(businessComponent).forEach(([name, widget]) => visualConfig.registry('businessComponents', name, widget));
console.log(`%c成功加载组件数量:${Object.keys(visualConfig.componentMap).length}`, 'color:#409EFF;background-color:#ecf5ff;padding:0 10px;line-height:2;margin-bottom:4px;');
console.log('visualConfig:', visualConfig);
