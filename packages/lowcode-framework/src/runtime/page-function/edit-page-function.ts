import {
  APPROVE_TRANSITION_CANDIDATES,
  CLOSE_TRANSITION_CANDIDATES,
  OPEN_TRANSITION_CANDIDATES,
  UNAPPROVE_TRANSITION_CANDIDATES,
  createPageFunctionInsertText,
  executeEditPageTransition,
  readPageFunctionString,
  type BuiltinLowCodePageFunction,
} from './shared.ts';

/**
 * 编辑页可通过 `this.executeFunction()` 调用的系统内置函数。
 *
 * 这些函数负责编辑页级别的模式切换、表单保存和状态迁移。实际表单数据读写、
 * Service 调用和路由操作由 Renderer 创建的受信任 Context 完成。
 */
export const BUILTIN_LOW_CODE_EDIT_PAGE_FUNCTIONS: readonly BuiltinLowCodePageFunction[] = [
  {
    // 复制当前表单，清理主键及流程状态，并将页面切换到 copy 模式。
    id: 'edit.copy',
    name: 'copy',
    label: '复制',
    description: '复制当前表单并清除主键、审核和关闭信息。',
    pageType: 'edit',
    insertText: createPageFunctionInsertText('copy'),
    execute: async (context) => {
      const result = await context.prepareForms('copy');
      await context.setMode('copy');
      context.notify(
        readPageFunctionString(context.args.message) || '复制数据已准备，请修改后保存。',
        'info',
      );
      return result;
    },
  },
  {
    // 使用表单初始值准备新记录，并将页面切换到 create 模式。
    id: 'edit.create',
    name: 'create',
    label: '新增',
    description: '按表单初始值创建一份新的编辑数据。',
    pageType: 'edit',
    insertText: createPageFunctionInsertText('create'),
    execute: async (context) => {
      const result = await context.prepareForms('create');
      await context.setMode('create');
      context.notify(
        readPageFunctionString(context.args.message) || '已进入新增状态。',
        'info',
      );
      return result;
    },
  },
  {
    // 保留当前表单数据，将页面切换到 edit 模式。
    id: 'edit.modify',
    name: 'modify',
    label: '修改',
    description: '将当前编辑页切换到修改状态，并发布 page.modeChange 事件。',
    pageType: 'edit',
    insertText: createPageFunctionInsertText('modify'),
    execute: async (context) => {
      await context.setMode('edit');
      context.notify(
        readPageFunctionString(context.args.message) || '已进入修改状态。',
        'info',
      );
      return context.getFormRecords();
    },
  },
  {
    // 统一提交当前页面所有绑定了保存数据源的表单。
    id: 'edit.save',
    name: 'save',
    label: '保存',
    description: '统一保存当前编辑页中绑定了保存数据源的表单。',
    pageType: 'edit',
    insertText: createPageFunctionInsertText('save'),
    execute: async (context) => {
      // const saved = await context.submitForms();
      // if (!saved) throw new Error('保存失败。');
      // return true;
    },
  },
  {
    // 默认写入 status=approved，然后保存当前编辑页。
    id: 'edit.approve',
    name: 'approve',
    label: '审核',
    description: '更新审核状态并保存当前编辑页。',
    pageType: 'edit',
    insertText: createPageFunctionInsertText('approve'),
    execute: (context) =>
      executeEditPageTransition(context, '审核', APPROVE_TRANSITION_CANDIDATES),
  },
  {
    // 默认将 status 恢复为 draft，然后保存当前编辑页。
    id: 'edit.unapprove',
    name: 'unapprove',
    label: '反审',
    description: '恢复未审核状态并保存当前编辑页。',
    pageType: 'edit',
    insertText: createPageFunctionInsertText('unapprove'),
    execute: (context) =>
      executeEditPageTransition(context, '反审', UNAPPROVE_TRANSITION_CANDIDATES),
  },
  {
    // 默认写入 status=closed，然后保存当前编辑页。
    id: 'edit.close',
    name: 'close',
    label: '关闭',
    description: '更新关闭状态并保存当前编辑页。',
    pageType: 'edit',
    insertText: createPageFunctionInsertText('close'),
    execute: (context) =>
      executeEditPageTransition(context, '关闭', CLOSE_TRANSITION_CANDIDATES),
  },
  {
    // 默认写入 status=open，然后保存当前编辑页。
    id: 'edit.open',
    name: 'open',
    label: '打开',
    description: '恢复打开状态并保存当前编辑页。',
    pageType: 'edit',
    insertText: createPageFunctionInsertText('open'),
    execute: (context) =>
      executeEditPageTransition(context, '打开', OPEN_TRANSITION_CANDIDATES),
  },
  {
    // 放弃当前未持久化展示状态，并重新加载页面全部数据源。
    id: 'edit.refresh',
    name: 'refresh',
    label: '刷新',
    description: '重新加载当前编辑页的全部数据源。',
    pageType: 'edit',
    insertText: createPageFunctionInsertText('refresh'),
    execute: (context) => context.refresh(),
  },
  {
    // 返回来源列表页，或跳转到 args.route 指定的路由。
    id: 'edit.exit',
    name: 'exit',
    label: '退出',
    description: '返回来源列表页；args.route 可指定目标路由。',
    pageType: 'edit',
    insertText: createPageFunctionInsertText('exit'),
    execute: (context) => context.exit(),
  },
];
