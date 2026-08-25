import type { LowCodeNodeActionRuntimeContext } from '../node-action-runtime';
import type { LowCodePageFormBlock } from '../../types/lowcode';
import type {
  LowCodeNodeActionMethodDefinition,
  LowCodeNodeTypeDefinition,
} from './index';
import { isLowCodeEditPageReadonly } from '../edit-page-mode';

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

function createLoadDataInsertText(nodeId: string) {
  return `const data = await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "loadData",\n});`;
}

function assertFormBlock(context: LowCodeNodeActionRuntimeContext) {
  const block = context.block;
  if (block.kind !== 'form' && block.kind !== 'searchForm') {
    throw new Error(`节点 "${block.id}" 不是表单，无法执行表单动作。`);
  }
  return block;
}

function assertEditableFormBlock(context: LowCodeNodeActionRuntimeContext) {
  const block = context.block;
  if (block.kind !== 'form' || block.formType !== 'edit') {
    throw new Error(`节点 "${block.id}" 不是编辑表单，无法获取远程数据。`);
  }
  return block;
}

function readFirstFormRecord(value: unknown): RuntimeRecord | undefined {
  if (Array.isArray(value)) {
    return value.find(isRecord);
  }
  if (!isRecord(value)) return undefined;

  for (const key of ['rows', 'items', 'records', 'data', 'result']) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    return readFirstFormRecord(value[key]);
  }

  return value;
}

function createFormLoadDataPostData(
  sourcePostData: unknown,
  options: RuntimeRecord,
) {
  const configuredPostData = isRecord(sourcePostData) ? sourcePostData : {};
  const optionPostData = isRecord(options.postData) ? options.postData : {};
  const filters = {
    ...(isRecord(configuredPostData.filters) ? configuredPostData.filters : {}),
    ...(isRecord(optionPostData.filters) ? optionPostData.filters : {}),
    ...(isRecord(options.filters) ? options.filters : {}),
  };

  return {
    ...configuredPostData,
    ...optionPostData,
    ...(Object.keys(filters).length ? { filters } : {}),
    limit: 1,
  };
}

function assertFormWritable(context: LowCodeNodeActionRuntimeContext) {
  if (context.block.kind === 'searchForm') return;
  if (!isLowCodeEditPageReadonly(context.editPageMode)) return;
  throw new Error('当前页面为只读状态，请先点击修改。');
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
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
  assertFormWritable(context);
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

export async function executeFormLoadDataNodeAction(
  context: LowCodeNodeActionRuntimeContext,
) {
  const block: LowCodePageFormBlock = assertEditableFormBlock(context);
  const sourceKey = readString(block.sourceKey, readString(block.submitSourceKey));
  if (!sourceKey) {
    throw new Error(`编辑表单 "${block.id}" 没有配置数据源。`);
  }

  const source = context.getDataSource(sourceKey);
  if (!source) {
    throw new Error(`编辑表单 "${block.id}" 的数据源 "${sourceKey}" 不可用。`);
  }

  const postData = context.resolveRuntimePostData(
    createFormLoadDataPostData(source.postData, context.options),
  );
  const request = context.resolveDataSourceRequest(
    sourceKey,
    source,
    postData,
  );
  if (!request.serviceName || !request.serviceMethod) {
    throw new Error(`数据源 "${sourceKey}" 未配置 serviceName 或 serviceMethod。`);
  }

  const requestVersion = context.beginSourceRequest(sourceKey);
  try {
    const value = await context.invokeDataSourceRequest(request, source);
    if (!context.isCurrentSourceRequest(sourceKey, requestVersion)) return null;

    context.setSource(sourceKey, value, { resetGridBaseline: true });
    context.syncGridStates();

    const record = readFirstFormRecord(value);
    if (record) {
      context.replaceFormValues(block.id, {
        ...context.getFormValues(block.id),
        ...cloneValue(record),
      });
    }

    return cloneValue(record ?? null);
  } finally {
    context.finishSourceRequest(sourceKey, requestVersion);
  }
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
  assertFormWritable(context);
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

export const formLoadDataNodeAction: LowCodeNodeActionMethodDefinition = {
  method: 'loadData',
  label: '获取编辑数据',
  description: '编辑表单从绑定数据源获取一条远程记录并绑定到表单。',
  executor: 'form.loadData',
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
      description: '附加请求参数；请求 limit 固定为 1。',
    },
  ],
  returns: '返回远程数据的第一条记录；没有匹配记录时返回 null。',
  createInsertText: createLoadDataInsertText,
  execute: executeFormLoadDataNodeAction,
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
  loadData: formLoadDataNodeAction,
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
