import type {
  LowCodeEditPageMode,
  LowCodePageType,
} from '../../types/lowcode';

export type BuiltinLowCodePageFunctionPageType = Extract<
  LowCodePageType,
  'list' | 'edit'
>;

export type BuiltinLowCodePageFunctionMode = LowCodeEditPageMode;
export type BuiltinLowCodePageFunctionPrepareMode = 'create' | 'copy';
export type BuiltinLowCodePageFunctionSubmitOptions = {
  allowScan?: boolean;
};

/**
 * 内置页面函数能够访问的受信任运行时能力。
 * 用户脚本只调用 `executeFunction`，不会直接获得这些底层适配器。
 */
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
  prepareForms(mode: BuiltinLowCodePageFunctionPrepareMode): Promise<unknown>;
  patchForms(values: Record<string, unknown>): Promise<unknown>;
  submitForms(options?: BuiltinLowCodePageFunctionSubmitOptions): Promise<boolean>;
  getMode(): BuiltinLowCodePageFunctionMode;
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

/** 状态迁移候选字段及其目标值。 */
export type PageFunctionTransitionCandidate = {
  field: string;
  value: unknown;
};

export const APPROVE_TRANSITION_CANDIDATES = [
  { field: 'status', value: 'approved' },
] as const;

export const UNAPPROVE_TRANSITION_CANDIDATES = [
  { field: 'status', value: 'draft' },
] as const;

export const CLOSE_TRANSITION_CANDIDATES = [
  { field: 'status', value: 'closed' },
] as const;

export const OPEN_TRANSITION_CANDIDATES = [
  { field: 'status', value: 'open' },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readPageFunctionString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/** 生成上下文面板插入编辑器的 `executeFunction` 调用模板。 */
export function createPageFunctionInsertText(name: string) {
  return `const result = await this.executeFunction({\n  name: "${name}",\n  args: {},\n});`;
}

/**
 * 读取列表页选中行并校验数量。
 * 没有选中数据，或单选操作选择了多行时，会抛出可直接展示给用户的错误。
 */
export function requireSelectedPageRows(
  context: BuiltinLowCodePageFunctionContext,
  operation: string,
  single = false,
) {
  const rows = context.getSelectedRows();
  if (!rows.length) throw new Error(`${operation}前请先选择数据。`);
  if (single && rows.length !== 1) throw new Error(`${operation}只能选择一条数据。`);
  return rows;
}

/**
 * 按优先级解析状态迁移值：`args.values`、`args.field/value`、记录已有字段、默认候选。
 */
function resolveTransitionValues(
  args: Record<string, unknown>,
  records: Record<string, unknown>[],
  candidates: readonly PageFunctionTransitionCandidate[],
) {
  if (isRecord(args.values) && Object.keys(args.values).length) {
    return { ...args.values };
  }

  const field = readPageFunctionString(args.field);
  if (field) {
    return { [field]: 'value' in args ? args.value : candidates[0]?.value };
  }

  const matched = candidates.find((candidate) =>
    records.some((record) => candidate.field in record),
  ) ?? (!records.length ? candidates[0] : undefined);

  return matched ? { [matched.field]: matched.value } : {};
}

/**
 * 解析可选的业务 Service 配置。
 * 只配置 serviceName 或 serviceMethod 其中之一属于无效配置。
 */
function resolveServiceOperation(args: Record<string, unknown>) {
  const service = isRecord(args.service) ? args.service : {};
  const serviceName = readPageFunctionString(service.name ?? args.serviceName);
  const serviceMethod = readPageFunctionString(service.method ?? args.serviceMethod);
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

/**
 * 执行列表页状态迁移。
 *
 * 配置 Service 时调用后端业务方法；否则批量更新选中记录。成功后统一刷新页面并提示。
 */
export async function executeListPageTransition(
  context: BuiltinLowCodePageFunctionContext,
  operation: string,
  candidates: readonly PageFunctionTransitionCandidate[],
) {
  const rows = requireSelectedPageRows(context, operation);
  const service = resolveServiceOperation(context.args);
  if (service) {
    const result = await context.invokeService(service.serviceName, service.serviceMethod, {
      ...service.postData,
      rows,
    });
    await context.refresh();
    context.notify(
      readPageFunctionString(context.args.message) || `${operation}成功。`,
      'success',
    );
    return result;
  }

  const values = resolveTransitionValues(context.args, rows, candidates);
  if (!Object.keys(values).length) {
    throw new Error(`${operation}未找到状态字段，请通过 args.values 或 args.field/args.value 指定。`);
  }
  const result = await context.updateRecords(rows, values);
  await context.refresh();
  context.notify(
    readPageFunctionString(context.args.message) || `${operation}成功。`,
    'success',
  );
  return result;
}

/**
 * 执行编辑页状态迁移。
 *
 * 配置 Service 时提交当前表单快照；否则先修改表单状态字段，再调用统一保存入口。
 */
export async function executeEditPageTransition(
  context: BuiltinLowCodePageFunctionContext,
  operation: string,
  candidates: readonly PageFunctionTransitionCandidate[],
) {
  const service = resolveServiceOperation(context.args);
  if (service) {
    const result = await context.invokeService(service.serviceName, service.serviceMethod, {
      ...service.postData,
      forms: context.getFormRecords(),
    });
    await context.refresh();
    context.notify(
      readPageFunctionString(context.args.message) || `${operation}成功。`,
      'success',
    );
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
  const saved = await context.submitForms({ allowScan: true });
  if (!saved) throw new Error(`${operation}保存失败。`);
  context.notify(
    readPageFunctionString(context.args.message) || `${operation}成功。`,
    'success',
  );
  return true;
}
