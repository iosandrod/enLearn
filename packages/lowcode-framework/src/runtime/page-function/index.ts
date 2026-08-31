import type { LowCodeHostServiceApi } from '../../core/host';
import { isLowCodeFormSchema } from '../../lowcode/form-schema.ts';
import type {
  LowCodeEditPageMode,
  LowCodeFormSchema,
  LowCodePageType,
} from '../../types/lowcode';

export type BuiltinLowCodePageFunctionMode = LowCodeEditPageMode;
export type BuiltinLowCodePageFunctionContext = {
  pageType: Extract<LowCodePageType, 'list' | 'edit'>;
  pageCode: string;
  serviceApi: LowCodeHostServiceApi;
  args: Record<string, unknown>;
  getSelectedRows(): Record<string, unknown>[];
  getFormRecords(): Record<string, unknown>[];
  navigateToEdit(row?: Record<string, unknown>): Promise<unknown>;
  updateRecords(rows: Record<string, unknown>[], values: Record<string, unknown>): Promise<unknown[]>;
  deleteRecords(rows: Record<string, unknown>[]): Promise<unknown[]>;
  invokeService(serviceName: string, serviceMethod: string, postData: Record<string, unknown>): Promise<unknown>;
  prepareForms(mode: 'create' | 'copy'): Promise<unknown>;
  patchForms(values: Record<string, unknown>): Promise<unknown>;
  submitForms(options?: { allowScan?: boolean }): Promise<boolean>;
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
  pageType: Extract<LowCodePageType, 'list' | 'edit'>;
  insertText: string;
  execute(context: BuiltinLowCodePageFunctionContext): Promise<unknown> | unknown;
};

type FormDefinition = { id: string; code: string; name: string; schema: LowCodeFormSchema };
type DesignResult = { id: string; saved: boolean };
let activeDesigner: Promise<DesignResult> | null = null;

async function startFormDesigner(id: string, serviceApi: LowCodeHostServiceApi): Promise<DesignResult> {
  const rows = await serviceApi.invoke<FormDefinition[]>('lowcode', 'listItems', {
    resource: 'lowcode_form_definitions', filters: { id }, limit: 1,
  });
  const definition = Array.isArray(rows) ? rows[0] : undefined;
  if (!definition || !isLowCodeFormSchema(definition.schema)) {
    throw new Error('当前表单定义不存在或 schema 格式不正确。');
  }
  const [designer, runtimeDesigner] = await Promise.all([
    import('../../visual-editor/components/form-designer/form-designer.service'),
    import('../../lowcode/block-materials/runtime-form-designer'),
  ]);
  return new Promise((resolve, reject) => {
    try {
      void designer.$$formDesigner({
        title: `表单设计 - ${definition.name || definition.code}`,
        mode: 'edit',
        fields: runtimeDesigner.createFormDesignerFieldsFromSchema(definition.schema),
        layout: definition.schema.layout,
        columns: definition.schema.columns,
        serviceApi,
        onCancel: () => resolve({ id, saved: false }),
        onConfirm: async (result) => {
          const designedSchema = designer.createLowCodeFormSchemaFromDesignerResult(result);
          const schema = runtimeDesigner.mergeRuntimeFormSchema(
            definition.schema, designedSchema, result.fields,
          );
          await serviceApi.invoke('lowcode', 'saveItem', {
            resource: 'lowcode_form_definitions', id, data: { schema },
          });
          resolve({ id, saved: true });
        },
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function openFormDesigner(context: BuiltinLowCodePageFunctionContext) {
  if (context.pageCode !== 'form-definetion') {
    throw new Error('设计表单仅适用于系统表单定义页面。');
  }
  const requestedId = typeof context.args.id === 'string' ? context.args.id.trim() : '';
  const selectedId = context.getSelectedRows()[0]?.id;
  const id = requestedId || (typeof selectedId === 'string' ? selectedId.trim() : '');
  if (!id) throw new Error('请先选择要设计的表单。');
  if (!activeDesigner) {
    const request = startFormDesigner(id, context.serviceApi);
    activeDesigner = request;
    const clear = () => {
      if (activeDesigner === request) activeDesigner = null;
    };
    void request.then(clear, clear);
  }
  const result = await activeDesigner;
  if (result.saved) {
    await context.refresh();
    context.notify('表单配置已保存。', 'success');
  }
  return result;
}

/** Only browser-bound native page function. Business orchestration is database-owned. */
export const BUILTIN_LOW_CODE_LIST_PAGE_FUNCTIONS: readonly BuiltinLowCodePageFunction[] = [{
  id: 'list.designForm',
  name: 'designForm',
  label: '设计表单',
  description: '打开当前系统表单定义的设计器，保存后刷新列表。',
  pageType: 'list',
  insertText: 'const result = await this.executeFunction({\n  name: "designForm",\n  args: {},\n});',
  execute: openFormDesigner,
}];

export const BUILTIN_LOW_CODE_EDIT_PAGE_FUNCTIONS: readonly BuiltinLowCodePageFunction[] = [];
export const BUILTIN_LOW_CODE_PAGE_FUNCTIONS = BUILTIN_LOW_CODE_LIST_PAGE_FUNCTIONS;

export function getBuiltinLowCodePageFunctions(pageType: LowCodePageType | undefined) {
  return BUILTIN_LOW_CODE_PAGE_FUNCTIONS.filter((item) => item.pageType === pageType);
}

export function resolveBuiltinLowCodePageFunction(pageType: LowCodePageType | undefined, name: string) {
  return getBuiltinLowCodePageFunctions(pageType).find((item) => item.name === name);
}

export function hasBuiltinLowCodePageFunctions(pageType: LowCodePageType | undefined) {
  return getBuiltinLowCodePageFunctions(pageType).length > 0;
}
