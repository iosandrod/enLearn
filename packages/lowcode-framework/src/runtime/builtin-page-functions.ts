import type { LowCodePageType } from '../types/lowcode';

export type BuiltinLowCodePageFunctionPageType = Extract<
  LowCodePageType,
  'list' | 'edit'
>;

export type BuiltinLowCodePageFunctionMode = 'create' | 'copy' | 'edit';

export type BuiltinLowCodePageFunctionContext = {
  pageType: BuiltinLowCodePageFunctionPageType;
  args: Record<string, unknown>;
  getSelectedRows(): Record<string, unknown>[];
  getFormRecords(): Record<string, unknown>[];
  navigateToEdit(row?: Record<string, unknown>): Promise<unknown>;
  updateRecords(
    rows: Record<string, unknown>[],
    values: Record<string, unknown>,
  ): Promise<unknown[]>;
  invokeService(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown>,
  ): Promise<unknown>;
  prepareForms(mode: Extract<BuiltinLowCodePageFunctionMode, 'create' | 'copy'>): Promise<unknown>;
  patchForms(values: Record<string, unknown>): Promise<unknown>;
  submitForms(): Promise<boolean>;
  setMode(mode: BuiltinLowCodePageFunctionMode): Promise<void>;
  refresh(): Promise<unknown>;
  print(): Promise<unknown>;
  exit(): Promise<unknown>;
  notify(message: string, status?: 'success' | 'info' | 'warning' | 'error'): void;
};

export type BuiltinLowCodePageFunction = {
  id: string;
  name: string;
  label: string;
  description: string;
  pageType: BuiltinLowCodePageFunctionPageType;
  insertText: string;
  execute(context: BuiltinLowCodePageFunctionContext): Promise<unknown> | unknown;
};

type TransitionCandidate = {
  field: string;
  value: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function callInsertText(name: string) {
  return `const result = await this.executeFunction({\n  name: "${name}",\n  args: {},\n});`;
}

function requireRows(
  context: BuiltinLowCodePageFunctionContext,
  operation: string,
  single = false,
) {
  const rows = context.getSelectedRows();
  if (!rows.length) throw new Error(`${operation}前请先选择数据。`);
  if (single && rows.length !== 1) throw new Error(`${operation}只能选择一条数据。`);
  return rows;
}

function resolveTransitionValues(
  args: Record<string, unknown>,
  records: Record<string, unknown>[],
  candidates: readonly TransitionCandidate[],
) {
  if (isRecord(args.values) && Object.keys(args.values).length) {
    return { ...args.values };
  }

  const field = readString(args.field);
  if (field) {
    return { [field]: 'value' in args ? args.value : candidates[0]?.value };
  }

  const matched = candidates.find((candidate) =>
    records.some((record) => candidate.field in record),
  ) ?? (!records.length ? candidates[0] : undefined);

  return matched ? { [matched.field]: matched.value } : {};
}

function resolveServiceOperation(args: Record<string, unknown>) {
  const service = isRecord(args.service) ? args.service : {};
  const serviceName = readString(service.name ?? args.serviceName);
  const serviceMethod = readString(service.method ?? args.serviceMethod);
  if (!serviceName && !serviceMethod) return undefined;
  if (!serviceName || !serviceMethod) {
    throw new Error('业务操作必须同时配置 serviceName 和 serviceMethod。');
  }
  return {
    serviceName,
    serviceMethod,
    postData: isRecord(service.postData)
      ? service.postData
      : isRecord(args.postData)
        ? args.postData
        : {},
  };
}

async function executeListTransition(
  context: BuiltinLowCodePageFunctionContext,
  operation: string,
  candidates: readonly TransitionCandidate[],
) {
  const rows = requireRows(context, operation);
  const service = resolveServiceOperation(context.args);
  if (service) {
    const result = await context.invokeService(service.serviceName, service.serviceMethod, {
      ...service.postData,
      rows,
    });
    await context.refresh();
    context.notify(readString(context.args.message) || `${operation}成功。`, 'success');
    return result;
  }
  const values = resolveTransitionValues(context.args, rows, candidates);
  if (!Object.keys(values).length) {
    throw new Error(`${operation}未找到状态字段，请通过 args.values 或 args.field/args.value 指定。`);
  }
  const result = await context.updateRecords(rows, values);
  await context.refresh();
  context.notify(readString(context.args.message) || `${operation}成功。`, 'success');
  return result;
}

async function executeEditTransition(
  context: BuiltinLowCodePageFunctionContext,
  operation: string,
  candidates: readonly TransitionCandidate[],
) {
  const service = resolveServiceOperation(context.args);
  if (service) {
    const result = await context.invokeService(service.serviceName, service.serviceMethod, {
      ...service.postData,
      forms: context.getFormRecords(),
    });
    await context.refresh();
    context.notify(readString(context.args.message) || `${operation}成功。`, 'success');
    return result;
  }
  const values = resolveTransitionValues(
    context.args,
    context.getFormRecords(),
    candidates,
  );
  if (!Object.keys(values).length) {
    throw new Error(`${operation}未找到状态字段，请通过 args.values 或 args.field/args.value 指定。`);
  }
  await context.patchForms(values);
  const saved = await context.submitForms();
  if (!saved) throw new Error(`${operation}保存失败。`);
  context.notify(readString(context.args.message) || `${operation}成功。`, 'success');
  return true;
}

const approveCandidates = [
  { field: 'approval_status', value: 'approved' },
  { field: 'approve_status', value: 'approved' },
  { field: 'audit_status', value: 'approved' },
  { field: 'status', value: 'approved' },
] as const;

const unapproveCandidates = [
  { field: 'approval_status', value: 'draft' },
  { field: 'approve_status', value: 'draft' },
  { field: 'audit_status', value: 'draft' },
  { field: 'status', value: 'draft' },
] as const;

const closeCandidates = [
  { field: 'close_status', value: 'closed' },
  { field: 'status', value: 'closed' },
] as const;

const openCandidates = [
  { field: 'close_status', value: 'open' },
  { field: 'status', value: 'open' },
] as const;

export const BUILTIN_LOW_CODE_PAGE_FUNCTIONS: readonly BuiltinLowCodePageFunction[] = [
  {
    id: 'list.create',
    name: 'create',
    label: '新增跳转到编辑页',
    description: '打开当前列表页关联的编辑页，并携带来源页面。',
    pageType: 'list',
    insertText: callInsertText('create'),
    execute: (context) => context.navigateToEdit(),
  },
  {
    id: 'list.edit',
    name: 'edit',
    label: '编辑跳转到编辑页',
    description: '将当前选中的一条数据带入关联编辑页。',
    pageType: 'list',
    insertText: callInsertText('edit'),
    execute: (context) => context.navigateToEdit(requireRows(context, '编辑', true)[0]),
  },
  {
    id: 'list.approve',
    name: 'approve',
    label: '审核',
    description: '审核选中数据；可通过 args.values 或 args.field/args.value 覆盖状态字段。',
    pageType: 'list',
    insertText: callInsertText('approve'),
    execute: (context) => executeListTransition(context, '审核', approveCandidates),
  },
  {
    id: 'list.unapprove',
    name: 'unapprove',
    label: '反审',
    description: '反审选中数据；可通过 args.values 或 args.field/args.value 覆盖状态字段。',
    pageType: 'list',
    insertText: callInsertText('unapprove'),
    execute: (context) => executeListTransition(context, '反审', unapproveCandidates),
  },
  {
    id: 'list.close',
    name: 'close',
    label: '关闭',
    description: '关闭选中数据，默认写入 close_status=closed。',
    pageType: 'list',
    insertText: callInsertText('close'),
    execute: (context) => executeListTransition(context, '关闭', closeCandidates),
  },
  {
    id: 'list.open',
    name: 'open',
    label: '打开',
    description: '重新打开选中数据，默认写入 close_status=open。',
    pageType: 'list',
    insertText: callInsertText('open'),
    execute: (context) => executeListTransition(context, '打开', openCandidates),
  },
  {
    id: 'list.refresh',
    name: 'refresh',
    label: '刷新',
    description: '重新加载当前列表页的全部数据源。',
    pageType: 'list',
    insertText: callInsertText('refresh'),
    execute: (context) => context.refresh(),
  },
  {
    id: 'list.print',
    name: 'print',
    label: '打印',
    description: '调用浏览器打印当前页面。',
    pageType: 'list',
    insertText: callInsertText('print'),
    execute: (context) => context.print(),
  },
  {
    id: 'list.exit',
    name: 'exit',
    label: '退出',
    description: '退出当前列表页；args.route 可指定目标路由。',
    pageType: 'list',
    insertText: callInsertText('exit'),
    execute: (context) => context.exit(),
  },
  {
    id: 'edit.copy',
    name: 'copy',
    label: '复制',
    description: '复制当前表单并清除主键、审核和关闭信息。',
    pageType: 'edit',
    insertText: callInsertText('copy'),
    execute: async (context) => {
      const result = await context.prepareForms('copy');
      await context.setMode('copy');
      context.notify(readString(context.args.message) || '复制数据已准备，请修改后保存。', 'info');
      return result;
    },
  },
  {
    id: 'edit.create',
    name: 'create',
    label: '新增',
    description: '按表单初始值创建一份新的编辑数据。',
    pageType: 'edit',
    insertText: callInsertText('create'),
    execute: async (context) => {
      const result = await context.prepareForms('create');
      await context.setMode('create');
      context.notify(readString(context.args.message) || '已进入新增状态。', 'info');
      return result;
    },
  },
  {
    id: 'edit.modify',
    name: 'modify',
    label: '修改',
    description: '将当前编辑页切换到修改状态，并发布 page.modeChange 事件。',
    pageType: 'edit',
    insertText: callInsertText('modify'),
    execute: async (context) => {
      await context.setMode('edit');
      context.notify(readString(context.args.message) || '已进入修改状态。', 'info');
      return context.getFormRecords();
    },
  },
  {
    id: 'edit.save',
    name: 'save',
    label: '保存',
    description: '统一保存当前编辑页中绑定了保存数据源的表单。',
    pageType: 'edit',
    insertText: callInsertText('save'),
    execute: async (context) => {
      const saved = await context.submitForms();
      if (!saved) throw new Error('保存失败。');
      return true;
    },
  },
  {
    id: 'edit.approve',
    name: 'approve',
    label: '审核',
    description: '更新审核状态并保存当前编辑页。',
    pageType: 'edit',
    insertText: callInsertText('approve'),
    execute: (context) => executeEditTransition(context, '审核', approveCandidates),
  },
  {
    id: 'edit.unapprove',
    name: 'unapprove',
    label: '反审',
    description: '恢复未审核状态并保存当前编辑页。',
    pageType: 'edit',
    insertText: callInsertText('unapprove'),
    execute: (context) => executeEditTransition(context, '反审', unapproveCandidates),
  },
  {
    id: 'edit.close',
    name: 'close',
    label: '关闭',
    description: '更新关闭状态并保存当前编辑页。',
    pageType: 'edit',
    insertText: callInsertText('close'),
    execute: (context) => executeEditTransition(context, '关闭', closeCandidates),
  },
  {
    id: 'edit.open',
    name: 'open',
    label: '打开',
    description: '恢复打开状态并保存当前编辑页。',
    pageType: 'edit',
    insertText: callInsertText('open'),
    execute: (context) => executeEditTransition(context, '打开', openCandidates),
  },
  {
    id: 'edit.refresh',
    name: 'refresh',
    label: '刷新',
    description: '重新加载当前编辑页的全部数据源。',
    pageType: 'edit',
    insertText: callInsertText('refresh'),
    execute: (context) => context.refresh(),
  },
  {
    id: 'edit.exit',
    name: 'exit',
    label: '退出',
    description: '返回来源列表页；args.route 可指定目标路由。',
    pageType: 'edit',
    insertText: callInsertText('exit'),
    execute: (context) => context.exit(),
  },
];

export function getBuiltinLowCodePageFunctions(pageType: LowCodePageType | undefined) {
  return BUILTIN_LOW_CODE_PAGE_FUNCTIONS.filter((pageFunction) =>
    pageFunction.pageType === pageType,
  );
}

export function resolveBuiltinLowCodePageFunction(
  pageType: LowCodePageType | undefined,
  name: string,
) {
  return getBuiltinLowCodePageFunctions(pageType).find(
    (pageFunction) => pageFunction.name === name,
  );
}

export function hasBuiltinLowCodePageFunctions(pageType: LowCodePageType | undefined) {
  return getBuiltinLowCodePageFunctions(pageType).length > 0;
}
