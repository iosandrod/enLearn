import type { ArrayTableToolbarButton, ArrayTableToolbarExecute } from '../lowcode/form-materials/array-table-types';

export type PrintDetailAction = 'fetch' | 'clear' | 'import' | 'configure' | 'delete';

/** Keep the designer panel and data import dialog in the same order. */
export function createPrintDetailToolbar(
  handlers: Record<PrintDetailAction, ArrayTableToolbarExecute>,
  fetching = false,
): ArrayTableToolbarButton[] {
  return [
    { code: 'add', label: '新增行', command: 'add', status: 'primary' },
    { code: 'fetch', label: '获取数据', status: 'primary', prefixIcon: 'ri-download-cloud-2-line', disabled: fetching, execute: handlers.fetch },
    { code: 'clear', label: '清空', status: 'warning', execute: handlers.clear },
    { code: 'import', label: '导入', execute: handlers.import },
    { code: 'configure', label: '表格配置', execute: handlers.configure },
    // { code: 'delete', label: '删除子表', status: 'danger', execute: handlers.delete },
  ];
}

export type PrintDetailActionRequest = {
  formCode: string;
  field: string;
  action: 'fetch' | 'configure' | 'delete';
  formValues?: Record<string, unknown>;
  /** Assigned synchronously by the matching designer panel. */
  run?: Promise<unknown>;
};

export async function requestPrintDetailAction(request: PrintDetailActionRequest) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('enlearn:print-detail-action', { detail: request }));
  }
  if (!request.run) throw new Error('未找到对应的打印数据源面板，请重新打开打印设计器。');
  return request.run;
}
