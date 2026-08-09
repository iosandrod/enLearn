import type { LowCodePageBlock } from '../types/lowcode';
import { executeGridLoadDataNodeAction } from './grid-node-actions';
import type { LowCodeNodeActionRuntimeHandler } from './node-action-runtime';

export type LowCodeNodeKind = LowCodePageBlock['kind'];

export type LowCodeNodeActionExecutor =
  | 'overlay.open'
  | 'grid.loadData'
  | 'grid.reloadData'
  | 'form.setData';

export type LowCodeNodeActionParameter = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
};

export type LowCodeNodeActionMethodDefinition = {
  method: string;
  label: string;
  description: string;
  executor: LowCodeNodeActionExecutor;
  dataSourceLoader?: boolean;
  parameters: LowCodeNodeActionParameter[];
  returns: string;
  createInsertText: (nodeId: string) => string;
  execute?: LowCodeNodeActionRuntimeHandler;
};

export type LowCodeNodeTypeDefinition = {
  kind: LowCodeNodeKind;
  label: string;
  icon: string;
  methods: Record<string, LowCodeNodeActionMethodDefinition>;
};

function quoted(value: string) {
  return JSON.stringify(value);
}

function createOpenInsertText(nodeId: string) {
  return `const result = await this.executeAction({\n  node: ${quoted(nodeId)},\n  method: "open",\n  data: {},\n});`;
}

function createReloadDataInsertText(nodeId: string) {
  return `await this.executeAction({\n  node: ${quoted(nodeId)},\n  method: "reloadData",\n  data: [],\n});`;
}

function createLoadDataInsertText(nodeId: string) {
  return `const rows = await this.executeAction({\n  node: ${quoted(nodeId)},\n  method: "loadData",\n  filters: {},\n});`;
}

function createSetDataInsertText(nodeId: string) {
  return `await this.executeAction({\n  node: ${quoted(nodeId)},\n  method: "setData",\n  data: {},\n  mode: "merge",\n});`;
}

const openMethod: LowCodeNodeActionMethodDefinition = {
  method: 'open',
  label: '打开',
  description: '打开节点，并在确认后返回结果表单数据。',
  executor: 'overlay.open',
  parameters: [
    {
      name: 'data',
      type: 'object',
      description: '传给弹框或抽屉结果表单的初始数据。',
    },
    {
      name: 'resultNode',
      type: 'string',
      description: '可选的结果表单节点 ID，默认使用节点配置。',
    },
  ],
  returns: '确认时返回表单对象，取消时返回 null。',
  createInsertText: createOpenInsertText,
};

const reloadDataMethod: LowCodeNodeActionMethodDefinition = {
  method: 'reloadData',
  label: '覆盖表格数据',
  description: '使用 data 数组覆盖表格当前绑定的数据。',
  executor: 'grid.reloadData',
  parameters: [
    {
      name: 'data',
      type: 'object[] | { rows: object[] }',
      required: true,
      description: '新的表格行数据。',
    },
  ],
  returns: '返回规范化后的表格行数组。',
  createInsertText: createReloadDataInsertText,
};

const loadDataMethod: LowCodeNodeActionMethodDefinition = {
  method: 'loadData',
  label: '获取表格数据',
  description: '按表格类型获取数据；主表使用查询条件，明细表使用主表当前行生成关联条件。',
  executor: 'grid.loadData',
  dataSourceLoader: true,
  parameters: [
    {
      name: 'filters',
      type: 'object',
      description: '附加过滤条件，会覆盖数据源中的同名过滤条件。',
    },
    {
      name: 'postData',
      type: 'object',
      description: '附加请求参数。',
    },
    {
      name: 'mainGrid',
      type: 'string',
      description: '明细表关联的主表节点 ID；未填写时自动查找 tableType=main 的表格。',
    },
    {
      name: 'filterMap',
      type: 'Record<string, string>',
      description: '明细字段到主表字段的映射，例如 { order_id: "id" }。',
    },
  ],
  returns: '返回服务端获取的数据；缺少明细关联主表行时返回空数组。',
  createInsertText: createLoadDataInsertText,
  execute: executeGridLoadDataNodeAction,
};

const setDataMethod: LowCodeNodeActionMethodDefinition = {
  method: 'setData',
  label: '设置表单数据',
  description: '合并或完整替换表单数据，数组字段也会整体替换。',
  executor: 'form.setData',
  parameters: [
    {
      name: 'data',
      type: 'object',
      required: true,
      description: '需要写入表单的字段和值。',
    },
    {
      name: 'mode',
      type: '"merge" | "replace"',
      description: '默认 merge；replace 会完整替换表单对象。',
    },
  ],
  returns: '返回更新后的完整表单对象。',
  createInsertText: createSetDataInsertText,
};

function nodeType(
  kind: LowCodeNodeKind,
  label: string,
  icon: string,
  methods: LowCodeNodeActionMethodDefinition[] = [],
): LowCodeNodeTypeDefinition {
  return {
    kind,
    label,
    icon,
    methods: Object.fromEntries(methods.map((method) => [method.method, method])),
  };
}

/**
 * Single source of truth for script-callable page nodes.
 * Add a node method here first, then implement its executor in the runtime.
 */
export const lowCodeNodeActionRegistry: Record<
  LowCodeNodeKind,
  LowCodeNodeTypeDefinition
> = {
  text: nodeType('text', '文本', 'ri-text'),
  container: nodeType('container', '容器', 'ri-layout-line'),
  section: nodeType('section', '分区', 'ri-layout-row-line'),
  tabs: nodeType('tabs', '标签页', 'ri-folder-2-line'),
  toolbar: nodeType('toolbar', '工具栏', 'ri-tools-line'),
  buttonGroup: nodeType('buttonGroup', '按钮组', 'ri-layout-grid-line'),
  form: nodeType('form', '表单', 'ri-survey-line', [setDataMethod]),
  searchForm: nodeType('searchForm', '查询表单', 'ri-filter-3-line', [setDataMethod]),
  grid: nodeType('grid', '表格', 'ri-table-2', [loadDataMethod, reloadDataMethod]),
  detail: nodeType('detail', '详情', 'ri-file-list-3-line'),
  modal: nodeType('modal', '弹框', 'ri-window-line', [openMethod]),
  drawer: nodeType('drawer', '抽屉', 'ri-layout-right-line', [openMethod]),
  statCard: nodeType('statCard', '指标卡', 'ri-dashboard-3-line'),
  tree: nodeType('tree', '树', 'ri-node-tree'),
  planningFlow: nodeType('planningFlow', '工艺路线', 'ri-route-line'),
  planningGantt: nodeType('planningGantt', '排产甘特图', 'ri-calendar-schedule-line'),
  planningBom: nodeType('planningBom', '工艺 BOM', 'ri-node-tree'),
};

export function getLowCodeNodeTypeDefinition(kind: string) {
  return lowCodeNodeActionRegistry[kind as LowCodeNodeKind];
}

export function getLowCodeNodeActionMethods(kind: string) {
  const definition = getLowCodeNodeTypeDefinition(kind);
  return definition ? Object.values(definition.methods) : [];
}

export function resolveLowCodeNodeAction(kind: string, method: string) {
  return getLowCodeNodeTypeDefinition(kind)?.methods[method];
}

export function resolveLowCodeDataSourceNodeAction(
  blocks: LowCodePageBlock[],
  sourceKey: string,
) {
  for (const block of blocks) {
    if (!('sourceKey' in block) || block.sourceKey !== sourceKey) continue;
    const action = getLowCodeNodeActionMethods(block.kind).find(
      (candidate) => candidate.dataSourceLoader,
    );
    if (action) return { block, action };
  }

  return undefined;
}
