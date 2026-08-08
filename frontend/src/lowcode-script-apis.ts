import { registerLowCodeScriptApi } from '../../packages/lowcode-framework/src/runtime/scripts';
import { useServiceApi } from '../composables/useServiceApi';

let installed = false;

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
}
