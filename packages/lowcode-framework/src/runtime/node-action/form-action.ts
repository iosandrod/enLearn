import type { LowCodeNodeActionRuntimeContext } from '../node-action-runtime';
import type {
  LowCodeNodeActionMethodDefinition,
  LowCodeNodeTypeDefinition,
} from './index';

type RuntimeRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RuntimeRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function createSetDataInsertText(nodeId: string) {
  return `await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "setData",\n  data: {},\n  mode: "merge",\n});`;
}

function assertFormBlock(context: LowCodeNodeActionRuntimeContext) {
  const block = context.block;
  if (block.kind !== 'form' && block.kind !== 'searchForm') {
    throw new Error(`节点 "${block.id}" 不是表单，无法执行表单动作。`);
  }
  return block;
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value
        .map((item) => typeof item === 'string' ? item.trim() : '')
        .filter(Boolean))]
    : [];
}

function hasArrayOption(options: RuntimeRecord, name: 'codes' | 'sourceKeys') {
  if (!Object.prototype.hasOwnProperty.call(options, name)) return false;
  if (!Array.isArray(options[name])) {
    throw new Error(`表单 refreshOptions 的 ${name} 必须是字符串数组。`);
  }
  return true;
}

export function executeFormSetDataNodeAction(
  context: LowCodeNodeActionRuntimeContext,
) {
  const block = assertFormBlock(context);
  if (!isRecord(context.options.data)) {
    throw new Error('表单 setData 的 data 必须是对象。');
  }

  const values = cloneValue(context.options.data);
  if (context.options.mode === 'replace') {
    context.replaceFormValues(block.id, values);
  } else {
    context.patchFormValues(block.id, values);
  }

  return cloneValue(context.getFormValues(block.id));
}

export async function executeFormValidateNodeAction(
  context: LowCodeNodeActionRuntimeContext,
) {
  const block = assertFormBlock(context);
  return context.validateForm(block.id);
}

export function executeFormGetDataNodeAction(
  context: LowCodeNodeActionRuntimeContext,
) {
  const block = assertFormBlock(context);
  return cloneValue(context.getFormValues(block.id));
}

export async function executeFormRefreshOptionsNodeAction(
  context: LowCodeNodeActionRuntimeContext,
) {
  const block = assertFormBlock(context);
  return context.refreshFormOptions(block.id, {
    ...(hasArrayOption(context.options, 'codes')
      ? { codes: readStringList(context.options.codes) }
      : {}),
    ...(hasArrayOption(context.options, 'sourceKeys')
      ? { sourceKeys: readStringList(context.options.sourceKeys) }
      : {}),
  });
}

export async function executeFormResetDataNodeAction(
  context: LowCodeNodeActionRuntimeContext,
) {
  const block = assertFormBlock(context);
  context.replaceFormValues(block.id, cloneValue(context.getFormBaseline(block.id)));
  await context.clearFormValidation(block.id);
  return cloneValue(context.getFormValues(block.id));
}

function createValidateInsertText(nodeId: string) {
  return `const valid = await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "validate",\n});`;
}

function createGetDataInsertText(nodeId: string) {
  return `const data = await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "getData",\n});`;
}

function createRefreshOptionsInsertText(nodeId: string) {
  return `await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "refreshOptions",\n});`;
}

function createResetDataInsertText(nodeId: string) {
  return `const data = await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "resetData",\n});`;
}

export const formSetDataNodeAction: LowCodeNodeActionMethodDefinition = {
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
  execute: executeFormSetDataNodeAction,
};

export const formValidateNodeAction: LowCodeNodeActionMethodDefinition = {
  method: 'validate',
  label: '校验表单数据',
  description: '执行表单字段规则校验，并显示对应的校验状态。',
  executor: 'form.validate',
  parameters: [],
  returns: '校验通过返回 true，否则返回 false。',
  createInsertText: createValidateInsertText,
  execute: executeFormValidateNodeAction,
};

export const formGetDataNodeAction: LowCodeNodeActionMethodDefinition = {
  method: 'getData',
  label: '获取绑定数据',
  description: '获取表单当前绑定的完整数据快照。',
  executor: 'form.getData',
  parameters: [],
  returns: '返回表单当前绑定数据的深拷贝。',
  createInsertText: createGetDataInsertText,
  execute: executeFormGetDataNodeAction,
};

export const formRefreshOptionsNodeAction: LowCodeNodeActionMethodDefinition = {
  method: 'refreshOptions',
  label: '刷新下拉数据',
  description: '重新请求表单字段通过 optionsCode 或 optionsSourceKey 绑定的下拉数据。',
  executor: 'form.refreshOptions',
  parameters: [
    {
      name: 'codes',
      type: 'string[]',
      description: '可选的 optionsCode 列表；省略时刷新表单中的全部 optionsCode。',
    },
    {
      name: 'sourceKeys',
      type: 'string[]',
      description: '可选的数据源键列表；省略时刷新表单字段绑定的全部 optionsSourceKey。',
    },
  ],
  returns: '返回已刷新的 codes 和 sourceKeys。',
  createInsertText: createRefreshOptionsInsertText,
  execute: executeFormRefreshOptionsNodeAction,
};

export const formResetDataNodeAction: LowCodeNodeActionMethodDefinition = {
  method: 'resetData',
  label: '重置表单数据',
  description: '恢复页面最近一次加载完成时的表单数据，并清除校验状态。',
  executor: 'form.resetData',
  parameters: [],
  returns: '返回重置后的完整表单数据。',
  createInsertText: createResetDataInsertText,
  execute: executeFormResetDataNodeAction,
};

const formNodeActionMethods = {
  setData: formSetDataNodeAction,
  validate: formValidateNodeAction,
  getData: formGetDataNodeAction,
  refreshOptions: formRefreshOptionsNodeAction,
  resetData: formResetDataNodeAction,
};

export const formNodeActionDefinition = {
  kind: 'form',
  label: '表单',
  icon: 'ri-survey-line',
  methods: formNodeActionMethods,
} satisfies LowCodeNodeTypeDefinition;

export const searchFormNodeActionDefinition = {
  kind: 'searchForm',
  label: '查询表单',
  icon: 'ri-filter-3-line',
  methods: formNodeActionMethods,
} satisfies LowCodeNodeTypeDefinition;
