import type { MobilePageRecord } from './types';

export function createDemoPage(): MobilePageRecord {
  const now = new Date().toISOString();

  return {
    id: 'mobile-runtime-demo',
    code: 'mobile-runtime-demo',
    route: '/mobile-runtime-demo',
    title: '移动低代码工作台',
    description: 'Hippy Vue 3 runtime preview',
    layout: 'blank',
    status: 'draft',
    keep_alive: true,
    page_type: 'custom',
    edit_page_id: null,
    version: 1,
    published_at: null,
    created_at: now,
    updated_at: now,
    resolvedData: {
      approvals: Array.from({ length: 1000 }, (_, index) => ({
        id: String(index + 1),
        title: `业务申请 #A-${String(index + 1048).padStart(4, '0')}`,
        owner: ['赵明', '林然', '陈杰', '周宁'][index % 4],
        department: ['采购部', '财务部', '法务部', '运营部'][index % 4],
        category: ['采购申请', '差旅报销', '合同用印', '付款申请'][index % 4],
        status: ['待审批', '待补充', '已通过', '已驳回'][index % 4],
        amount: (index + 1) * 128.5,
        createdAt: `2026-08-${String(index % 28 + 1).padStart(2, '0')}`,
      })),
    },
    schema: {
      schemaVersion: 1,
      code: 'mobile-runtime-demo',
      route: '/mobile-runtime-demo',
      title: '移动低代码工作台',
      layout: 'blank',
      status: 'draft',
      keepAlive: true,
      pageType: 'custom',
      dataSources: {},
      blocks: [
        {
          id: 'welcome',
          kind: 'text',
          materialVersion: '1.0.0',
          title: '今日待办',
          content: '移动端运行时已经就绪。下面的内容由与 Web 端兼容的 Schema 渲染。',
          tone: 'default',
        },
        {
          id: 'stats',
          kind: 'statCard',
          materialVersion: '1.0.0',
          title: '审批概览',
          items: [
            { label: '待处理', value: 8 },
            { label: '本周完成', value: 24 },
            { label: '平均耗时', value: '1.6天' },
          ],
        },
        {
          id: 'approval-list',
          kind: 'grid',
          materialVersion: '1.0.0',
          title: '最近申请',
          sourceKey: 'approvals',
          schema: {
            grid: {
              height: 420,
              rowHeight: 48,
              headerHeight: 44,
              overscanRowCount: 6,
              overscanColumnCount: 1,
              rowConfig: { keyField: 'id', isCurrent: true },
              columns: [
                { type: 'seq', title: '序号', width: 48, align: 'center' },
                { field: 'title', title: '申请', width: 110, fixed: 'left', sortable: true },
                { field: 'owner', title: '发起人', width: 100, sortable: true },
                { field: 'department', title: '部门', width: 110 },
                { field: 'category', title: '类型', width: 120 },
                { field: 'status', title: '状态', width: 100, align: 'center' },
                {
                  field: 'amount',
                  title: '金额',
                  width: 130,
                  align: 'right',
                  sortable: true,
                  formatter: { type: 'currency', currency: 'CNY' },
                },
                { field: 'createdAt', title: '申请日期', width: 120, sortable: true },
              ],
            },
            rowActions: {
              actions: [
                {
                  code: 'open',
                  label: '查看',
                  eventName: 'grid.rowAction',
                  directives: [
                    { type: 'showMessage', message: '已选择 {{row.title}}', status: 'info' },
                  ],
                },
              ],
            },
          },
        },
        {
          id: 'quick-form',
          kind: 'form',
          materialVersion: '1.0.0',
          title: '快速申请',
          schema: {
            columns: 1,
            fields: [
              {
                field: 'subject',
                label: '申请主题',
                component: 'vxe-input',
                props: { placeholder: '请输入申请主题' },
                rules: [{ required: true, message: '申请主题不能为空' }],
              },
              {
                field: 'description',
                label: '说明',
                component: 'vxe-textarea',
                props: { placeholder: '补充必要说明' },
              },
            ],
            actions: [
              {
                code: 'submit',
                label: '提交申请',
                type: 'submit',
                status: 'primary',
                directives: [
                  { type: 'showMessage', message: '申请已暂存：{{values.subject}}', status: 'success' },
                ],
              },
            ],
          },
          initialValues: {
            subject: '',
            description: '',
          },
        },
      ],
    },
  };
}
