import {
  APPROVE_TRANSITION_CANDIDATES,
  CLOSE_TRANSITION_CANDIDATES,
  OPEN_TRANSITION_CANDIDATES,
  UNAPPROVE_TRANSITION_CANDIDATES,
  createPageFunctionInsertText,
  executeListPageTransition,
  requireSelectedPageRows,
  type BuiltinLowCodePageFunction,
} from './shared.ts';

/**
 * 列表页可通过 `this.executeFunction()` 调用的系统内置函数。
 *
 * 这些函数只描述列表页级别的业务编排：读取选中行、跳转编辑页、执行状态迁移、
 * 刷新数据或离开页面。节点自身的能力仍应通过 `this.executeAction()` 调用。
 */
export const BUILTIN_LOW_CODE_LIST_PAGE_FUNCTIONS: readonly BuiltinLowCodePageFunction[] = [
  {
    // 不要求选择数据，直接打开当前列表页关联的新增编辑页。
    id: 'list.create',
    name: 'create',
    label: '新增跳转到编辑页',
    description: '打开当前列表页关联的编辑页，并携带来源页面。',
    pageType: 'list',
    insertText: createPageFunctionInsertText('create'),
    execute: (context) => context.navigateToEdit(),
  },
  {
    // 必须且只能选择一行，并将该行作为编辑页的导航参数。
    id: 'list.edit',
    name: 'edit',
    label: '编辑跳转到编辑页',
    description: '将当前选中的一条数据带入关联编辑页。',
    pageType: 'list',
    insertText: createPageFunctionInsertText('edit'),
    execute: (context) =>
      context.navigateToEdit(requireSelectedPageRows(context, '编辑', true)[0]),
  },
  {
    // 审核选中行；默认写入 status=approved，也可由 args 覆盖。
    id: 'list.approve',
    name: 'approve',
    label: '审核',
    description: '审核选中数据；可通过 args.values 或 args.field/args.value 覆盖状态字段。',
    pageType: 'list',
    insertText: createPageFunctionInsertText('approve'),
    execute: (context) =>
      executeListPageTransition(context, '审核', APPROVE_TRANSITION_CANDIDATES),
  },
  {
    // 反审选中行；默认将 status 恢复为 draft。
    id: 'list.unapprove',
    name: 'unapprove',
    label: '反审',
    description: '反审选中数据；可通过 args.values 或 args.field/args.value 覆盖状态字段。',
    pageType: 'list',
    insertText: createPageFunctionInsertText('unapprove'),
    execute: (context) =>
      executeListPageTransition(context, '反审', UNAPPROVE_TRANSITION_CANDIDATES),
  },
  {
    // 关闭选中行；默认写入 status=closed。
    id: 'list.close',
    name: 'close',
    label: '关闭',
    description: '关闭选中数据，默认写入 status=closed。',
    pageType: 'list',
    insertText: createPageFunctionInsertText('close'),
    execute: (context) =>
      executeListPageTransition(context, '关闭', CLOSE_TRANSITION_CANDIDATES),
  },
  {
    // 重新打开选中行；默认写入 status=open。
    id: 'list.open',
    name: 'open',
    label: '打开',
    description: '重新打开选中数据，默认写入 status=open。',
    pageType: 'list',
    insertText: createPageFunctionInsertText('open'),
    execute: (context) =>
      executeListPageTransition(context, '打开', OPEN_TRANSITION_CANDIDATES),
  },
  {
    // 重新请求页面数据源，并返回刷新后的页面数据。
    id: 'list.refresh',
    name: 'refresh',
    label: '刷新',
    description: '重新加载当前列表页的全部数据源。',
    pageType: 'list',
    insertText: createPageFunctionInsertText('refresh'),
    execute: (context) => context.refresh(),
  },
  {
    // 调用宿主提供的浏览器打印能力。
    id: 'list.print',
    name: 'print',
    label: '打印',
    description: '调用浏览器打印当前页面。',
    pageType: 'list',
    insertText: createPageFunctionInsertText('print'),
    execute: (context) => context.print(),
  },
  {
    // 离开当前页面；目标路由由 args.route 或页面来源信息决定。
    id: 'list.exit',
    name: 'exit',
    label: '退出',
    description: '退出当前列表页；args.route 可指定目标路由。',
    pageType: 'list',
    insertText: createPageFunctionInsertText('exit'),
    execute: (context) => context.exit(),
  },
];
