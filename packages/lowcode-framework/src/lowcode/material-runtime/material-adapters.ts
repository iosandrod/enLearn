import type { LowCodeBlockMaterial } from '../block-materials/types';
import {
  createDefaultButtonGroupBlock,
  createDefaultContainerBlock,
  createDefaultDetailBlock,
  createDefaultDrawerBlock,
  createDefaultFormBlock,
  createDefaultGridBlock,
  createDefaultModalBlock,
  createDefaultPlanningBomBlock,
  createDefaultPlanningFlowBlock,
  createDefaultPlanningGanttBlock,
  createDefaultSearchFormBlock,
  createDefaultSectionBlock,
  createDefaultStatCardBlock,
  createDefaultTabsBlock,
  createDefaultTextBlock,
  createDefaultToolbarBlock,
  createDefaultTreeBlock,
} from '../block-materials/defaults';
import buttonGroupConverter from '../visual-converters/lowcode-button-group';
import editFormConverter from '../visual-converters/lowcode-edit-form';
import gridConverter from '../visual-converters/lowcode-grid';
import searchFormConverter from '../visual-converters/lowcode-search-form';
import tabsConverter from '../visual-converters/vxe-tabs';
import planningConverter from '../visual-converters/planning-visual';
import type { LowCodeFormMaterial } from '../form-materials/types';

type BlockAdapter = Omit<LowCodeBlockMaterial, 'component'>;
type FormAdapter = Omit<LowCodeFormMaterial, 'component'>;

const buttonGroupDesigner = () => import('../../packages/business-component/lowcode-button-group')
  .then((module) => module.default);
const editFormDesigner = () => import('../../packages/business-component/lowcode-edit-form')
  .then((module) => module.default);
const searchFormDesigner = () => import('../../packages/business-component/lowcode-search-form')
  .then((module) => module.default);
const gridDesigner = () => import('../../packages/business-component/lowcode-grid')
  .then((module) => module.default);
const planningFlowDesigner = () => import('../../packages/business-component/planning-flow')
  .then((module) => module.default);
const planningGanttDesigner = () => import('../../packages/business-component/planning-gantt')
  .then((module) => module.default);
const planningBomDesigner = () => import('../../packages/business-component/planning-bom')
  .then((module) => module.default);

const containerDesigner = () => import('../../packages/container-component/vxe-tabs')
  .then((module) => module.default);

export const lowCodeBlockMaterialAdapters: Record<string, BlockAdapter> = {
  container: {
    type: 'container',
    label: '容器',
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultContainerBlock,
    order: 10,
  },
  section: {
    type: 'section',
    label: '分区',
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultSectionBlock,
    order: 20,
  },
  text: {
    type: 'text',
    label: '文本',
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultTextBlock,
    order: 30,
  },
  tabs: {
    type: 'tabs',
    label: '页签',
    designer: containerDesigner,
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultTabsBlock,
    converter: tabsConverter,
    order: 40,
  },
  toolbar: {
    type: 'toolbar',
    label: '工具栏',
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultToolbarBlock,
    order: 50,
  },
  buttonGroup: {
    type: 'buttonGroup',
    label: '按钮组',
    designer: buttonGroupDesigner,
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultButtonGroupBlock,
    converter: buttonGroupConverter,
    order: 55,
  },
  form: {
    type: 'form',
    label: '普通表单',
    designer: editFormDesigner,
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultFormBlock,
    converter: editFormConverter,
    order: 60,
  },
  searchForm: {
    type: 'searchForm',
    label: '查询表单',
    designer: searchFormDesigner,
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultSearchFormBlock,
    converter: searchFormConverter,
    aliases: ['search-form'],
    order: 70,
  },
  grid: {
    type: 'grid',
    label: '表格',
    designer: gridDesigner,
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultGridBlock,
    converter: gridConverter,
    order: 80,
  },
  detail: {
    type: 'detail',
    label: '详情',
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultDetailBlock,
    order: 90,
  },
  modal: {
    type: 'modal',
    label: '弹框',
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultModalBlock,
    order: 100,
  },
  drawer: {
    type: 'drawer',
    label: '抽屉',
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultDrawerBlock,
    order: 110,
  },
  statCard: {
    type: 'statCard',
    label: '统计卡',
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultStatCardBlock,
    aliases: ['stat-card'],
    order: 120,
  },
  tree: {
    type: 'tree',
    label: '树',
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultTreeBlock,
    order: 130,
  },
  planningFlow: {
    type: 'planningFlow',
    label: '工艺路线图',
    designer: planningFlowDesigner,
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultPlanningFlowBlock,
    converter: planningConverter,
    order: 140,
  },
  planningGantt: {
    type: 'planningGantt',
    label: '排产甘特图',
    designer: planningGanttDesigner,
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultPlanningGanttBlock,
    converter: planningConverter,
    order: 150,
  },
  planningBom: {
    type: 'planningBom',
    label: '工艺 BOM 树',
    designer: planningBomDesigner,
    materialVersion: '1.0.0',
    createDefaultBlock: createDefaultPlanningBomBlock,
    converter: planningConverter,
    order: 160,
  },
};

const formMaterials: Array<[string, string, string[], number]> = [
  ['vxe-input', '输入框', ['input'], 10],
  ['vxe-textarea', '多行文本', ['textarea'], 20],
  ['vxe-password-input', '密码输入框', ['password'], 30],
  ['lc-number-input', '数字输入', [], 31],
  ['lc-basic-control', '基础数值控件', ['lc-rate', 'lc-slider', 'lc-stepper'], 32],
  ['lc-color-picker', '颜色选择', [], 32],
  ['lc-json-editor', 'JSON 编辑器', [], 33],
  ['lc-option-select', '选项选择', [], 34],
  ['lc-sub-form', '子表单', [], 34],
  ['lc-monaco-editor', '代码编辑器', ['monaco-editor'], 34],
  ['base-info', '关联资料', [], 35],
  ['lc-array-table', '数组表格', [], 35],
  ['lc-cascader', '级联选择', [], 35],
  ['vxe-switch', '开关', ['switch'], 40],
  ['vxe-select', '下拉选择', ['select'], 50],
  ['vxe-checkbox-group', '复选框组', ['checkbox', 'checkbox-group'], 60],
  ['vxe-radio-group', '单选框组', ['radio', 'radio-group'], 70],
  ['vxe-tree-select', '树形选择', ['tree-select'], 80],
];

export const lowCodeFormMaterialAdapters: Record<string, FormAdapter> = Object.fromEntries(
  formMaterials.map(([type, label, aliases, order]) => [type, {
    type,
    label,
    aliases,
    order,
  }]),
);

export function getLowCodeBlockMaterialAdapter(type?: string) {
  return type ? lowCodeBlockMaterialAdapters[type] : undefined;
}

export function getLowCodeFormMaterialAdapter(type?: string) {
  return type ? lowCodeFormMaterialAdapters[type] : undefined;
}
