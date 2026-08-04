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
      approvals: [
        { id: '1', title: '采购申请 #A-1048', owner: '赵明', status: '待审批', amount: '¥ 12,800' },
        { id: '2', title: '差旅报销 #E-2207', owner: '林然', status: '待补充', amount: '¥ 3,460' },
        { id: '3', title: '合同用印 #C-0182', owner: '陈杰', status: '已通过', amount: '华东合作协议' },
      ],
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
              columns: [
                { field: 'title', title: '申请' },
                { field: 'owner', title: '发起人' },
                { field: 'status', title: '状态' },
                { field: 'amount', title: '金额/说明' },
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
