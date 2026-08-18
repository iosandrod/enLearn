import { h, markRaw, type Component } from 'vue';
import {
  findGlobalDialog,
  openGlobalDialog,
} from '../../packages/lowcode-framework/src/runtime/global-dialog';
import { registerLowCodeScriptApi } from '../../packages/lowcode-framework/src/runtime/scripts';
import { useServiceApi } from '../composables/useServiceApi';

let installed = false;
let printDesignerComponent: Component | null = null;

const SALES_ORDER_PRINT_DESIGNER_DIALOG_ID = 'sales-order-print-designer-dialog';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function getPrintDesignerComponent() {
  if (printDesignerComponent) return printDesignerComponent;
  const module = await import('../pages/dashboard/advanced/print-designer.vue');
  printDesignerComponent = markRaw(module.default);
  return printDesignerComponent;
}

async function openSalesOrderPrintDesigner(payload: Record<string, unknown>) {
  const activeDialog = findGlobalDialog(SALES_ORDER_PRINT_DESIGNER_DIALOG_ID);
  if (activeDialog) {
    return { opened: true, active: true, dialogId: activeDialog.id };
  }

  const PrintDesigner = await getPrintDesignerComponent();
  const order = isRecord(payload.order) ? payload.order : {};
  const documentNumber = typeof order.doc_no === 'string' ? order.doc_no.trim() : '';

  void openGlobalDialog({
    id: SALES_ORDER_PRINT_DESIGNER_DIALOG_ID,
    title: documentNumber ? `打印设计器 - ${documentNumber}` : '打印设计器',
    width: 'min(1680px, calc(100vw - 24px))',
    height: 'min(960px, calc(100vh - 24px))',
    className: 'print-designer-dialog',
    props: {
      top: '1vh',
      destroyOnClose: true,
      showZoom: true,
      resize: true,
    },
    showFooter: false,
    body: () => h(PrintDesigner, { embedded: true }),
  });

  return {
    opened: true,
    active: false,
    dialogId: SALES_ORDER_PRINT_DESIGNER_DIALOG_ID,
  };
}

export function installLowCodeScriptApis() {
  if (installed) return;
  installed = true;

  registerLowCodeScriptApi('page.reload', {
    description: '读取当前低代码页面的最新保存版本',
    signature: 'this.$api.invoke("page.reload")',
    insertText: 'const latestPage = await this.$api.invoke("page.reload");',
    authorize: (_payload, context) =>
      context.policy?.apiNames?.includes('page.reload') === true,
    handler: async (_payload, context) => {
      const pageId = typeof context.page.id === 'string' ? context.page.id : '';
      const pageCode = typeof context.page.code === 'string' ? context.page.code : '';
      if (!pageId && !pageCode) throw new Error('当前脚本页面缺少页面标识。');

      const filters = pageId ? { id: pageId } : { code: pageCode };
      const result = await useServiceApi().invoke<unknown>(
        'lowcode',
        'listItems',
        {
          tableName: 'lowcode_pages',
          filters,
          includeData: true,
          limit: 1,
        },
      );
      const rows = Array.isArray(result)
        ? result
        : result && typeof result === 'object' && 'rows' in result &&
            Array.isArray((result as { rows?: unknown }).rows)
          ? (result as { rows: unknown[] }).rows
          : [];

      return rows[0] ?? null;
    },
  });

  registerLowCodeScriptApi('print.designer.open', {
    description: '在全局弹框中打开打印设计器',
    signature: 'this.$api.invoke("print.designer.open", { order })',
    insertText: 'await this.$api.invoke("print.designer.open", { order });',
    authorize: (_payload, context) =>
      context.page.code === 'sales-orders' &&
      context.policy?.apiNames?.includes('print.designer.open') === true,
    handler: (payload) => openSalesOrderPrintDesigner(payload),
  });
}
