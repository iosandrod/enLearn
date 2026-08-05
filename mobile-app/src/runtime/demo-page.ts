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
      departments: {
        rows: [
          { id: 'purchase', name: '采购部' },
          { id: 'finance', name: '财务部' },
          { id: 'legal', name: '法务部' },
          { id: 'operations', name: '运营部' },
        ],
      },
      categories: [
        {
          code: 'expense',
          title: '费用类',
          children: [
            { code: 'travel', title: '差旅报销' },
            { code: 'purchase', title: '采购申请' },
          ],
        },
        {
          code: 'business',
          title: '业务类',
          children: [
            { code: 'contract', title: '合同用印' },
            { code: 'payment', title: '付款申请' },
          ],
        },
      ],
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
          title: '高级申请表单',
          description: '同一份 Schema 可在 Hippy 原生端和 Web 预览端渲染。',
          schema: {
            columns: 2,
            fields: [
              {
                field: 'subject',
                label: '申请主题',
                component: 'vxe-input',
                props: { placeholder: '请输入申请主题', maxlength: 40 },
                rules: [
                  { required: true, message: '申请主题不能为空' },
                  { min: 4, message: '申请主题至少 4 个字符' },
                ],
              },
              {
                field: 'department',
                label: '申请部门',
                component: 'vxe-select',
                optionsSourceKey: 'departments',
                optionProps: { label: 'name', value: 'id' },
                props: { placeholder: '请选择部门', searchable: true },
                rules: [{ required: true, message: '请选择申请部门' }],
              },
              {
                field: 'category',
                label: '申请分类',
                component: 'lc-cascader',
                optionsSourceKey: 'categories',
                optionProps: { label: 'title', value: 'code', children: 'children' },
                props: { placeholder: '请选择末级分类' },
              },
              {
                field: 'urgency',
                label: '紧急程度',
                component: 'vxe-radio-group',
                options: [
                  { label: '普通', value: 'normal' },
                  { label: '紧急', value: 'urgent' },
                  { label: '特急', value: 'critical' },
                ],
              },
              {
                field: 'amount',
                label: '预估金额',
                component: 'lc-number-input',
                props: { min: 0, max: 1000000, step: 100, digits: 2 },
                rules: [{ required: true, message: '请输入预估金额' }],
              },
              {
                field: 'notify',
                label: '完成后通知我',
                component: 'vxe-switch',
              },
              {
                field: 'tags',
                label: '业务标签',
                component: 'vxe-checkbox-group',
                options: [
                  { label: '预算内', value: 'budgeted' },
                  { label: '跨部门', value: 'cross-team' },
                  { label: '需归档', value: 'archive' },
                ],
              },
              {
                field: 'themeColor',
                label: '标记颜色',
                component: 'lc-color-picker',
              },
              {
                field: 'requester',
                label: '申请人信息',
                component: 'lc-sub-form',
                span: 2,
                props: {
                  schema: {
                    columns: 2,
                    fields: [
                      {
                        field: 'name',
                        label: '姓名',
                        component: 'vxe-input',
                        rules: [{ required: true, message: '请输入姓名' }],
                      },
                      {
                        field: 'phone',
                        label: '联系电话',
                        component: 'vxe-input',
                        props: { type: 'phone', placeholder: '手机号或分机' },
                      },
                    ],
                    actions: [],
                  },
                },
              },
              {
                field: 'items',
                label: '申请明细',
                component: 'lc-array-table',
                span: 2,
                props: {
                  minRows: 1,
                  maxRows: 8,
                  defaultRow: { name: '', quantity: 1, price: 0 },
                  columns: [
                    {
                      field: 'name',
                      title: '项目名称',
                      component: 'vxe-input',
                      rules: [{ required: true, message: '项目名称不能为空' }],
                    },
                    {
                      field: 'quantity',
                      title: '数量',
                      component: 'lc-number-input',
                      props: { min: 1, step: 1 },
                    },
                    {
                      field: 'price',
                      title: '单价',
                      component: 'lc-number-input',
                      props: { min: 0, step: 10, digits: 2 },
                    },
                  ],
                },
                rules: [{ required: true, message: '请至少填写一条申请明细' }],
              },
              {
                field: 'description',
                label: '补充说明',
                component: 'vxe-textarea',
                span: 2,
                props: { placeholder: '补充必要说明', rows: 4 },
              },
              {
                field: 'metadata',
                label: '扩展参数',
                component: 'lc-json-editor',
                span: 2,
                props: { placeholder: '{\n  "costCenter": "CC-1001"\n}' },
              },
            ],
            actions: [
              {
                code: 'reset',
                label: '重置',
                type: 'reset',
              },
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
            department: '',
            category: '',
            urgency: 'normal',
            amount: 1000,
            notify: true,
            tags: ['budgeted'],
            themeColor: '#1677ff',
            requester: { name: '', phone: '' },
            items: [{ name: '', quantity: 1, price: 0 }],
            description: '',
            metadata: { costCenter: 'CC-1001' },
          },
        },
      ],
    },
  };
}
