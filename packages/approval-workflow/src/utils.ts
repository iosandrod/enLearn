import {
  WORKFLOW_SCHEMA_VERSION,
  normalizeWorkflowModel,
  prepareWorkflowModel,
  type AssigneeStrategy,
  type WorkflowEdge,
  type WorkflowModel,
  type WorkflowNode
} from '@enlearn/workflow-schema';

export type CreateWorkflowModelOptions = {
  code?: string;
  name?: string;
  documentType?: string;
};

const defaultNodeY = {
  start: 48,
  first: 258,
  second: 468
};

export function createEmptyWorkflowModel(
  options: CreateWorkflowModelOptions = {}
): WorkflowModel {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    code: options.code ?? 'approval_workflow',
    name: options.name ?? '审批流程',
    ...(options.documentType ? { documentType: options.documentType } : {}),
    status: 'draft',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        position: { x: 360, y: defaultNodeY.start }
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        position: { x: 360, y: defaultNodeY.first }
      }
    ],
    edges: [
      {
        id: 'edge_start_end',
        source: 'start',
        target: 'end'
      }
    ],
    settings: {
      allowCancel: true,
      allowWithdraw: true,
      duplicateSubmitPolicy: 'reject',
      historyLevel: 'full'
    }
  };
}

export function createSimpleApprovalWorkflow(
  assigneeStrategy: AssigneeStrategy,
  options: CreateWorkflowModelOptions = {}
): WorkflowModel {
  return {
    ...createEmptyWorkflowModel(options),
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        position: { x: 360, y: defaultNodeY.start }
      },
      {
        id: 'approval',
        type: 'approval',
        name: '审批',
        position: { x: 360, y: defaultNodeY.first },
        config: {
          assigneeStrategy,
          allowReject: true
        }
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        position: { x: 360, y: defaultNodeY.second }
      }
    ],
    edges: [
      {
        id: 'edge_start_approval',
        source: 'start',
        target: 'approval'
      },
      {
        id: 'edge_approval_end',
        source: 'approval',
        target: 'end'
      }
    ]
  };
}

export const ORDER_APPROVAL_TEST_VARIABLES = {
  amount: 6800,
  customerLevel: 'VIP',
  riskLevel: 'medium',
  orderType: 'standard',
  orderNo: 'ORDER-20260726-0001'
};

export function createOrderApprovalWorkflow(options: CreateWorkflowModelOptions = {}): WorkflowModel {
  const nodes: WorkflowNode[] = [
    {
      id: 'start',
      type: 'start',
      name: '开始',
      description: '订单提交后进入审批',
      position: { x: 360, y: defaultNodeY.start }
    },
    {
      id: 'lock_inventory',
      type: 'serviceTask',
      name: '锁定库存',
      description: '调用订单服务预占库存',
      position: { x: 360, y: defaultNodeY.first },
      config: {
        serviceName: 'order',
        serviceMethod: 'lockInventory'
      }
    },
    {
      id: 'amount_condition',
      type: 'condition',
      name: '订单金额判断',
      description: '金额大于等于 5000 走高金额链路',
      position: { x: 360, y: defaultNodeY.second },
      config: {
        field: 'amount'
      }
    },
    {
      id: 'sales_approval',
      type: 'approval',
      name: '销售主管审批',
      description: '普通订单由销售主管确认',
      position: { x: 525, y: 678 },
      config: {
        assigneeStrategy: {
          type: 'users',
          userIds: ['sales-lead']
        },
        allowReject: true,
        allowTransfer: true
      }
    },
    {
      id: 'manager_approval',
      type: 'approval',
      name: '直属主管审批',
      description: '高金额订单先由发起人主管审批',
      position: { x: 195, y: 678 },
      config: {
        assigneeStrategy: {
          type: 'initiatorManager',
          level: 1
        },
        allowReject: true,
        allowTransfer: true,
        allowAddSign: true
      }
    },
    {
      id: 'finance_sign',
      type: 'sign',
      name: '财务会签',
      description: '财务双人全部同意后继续',
      position: { x: 195, y: 888 },
      config: {
        assigneeStrategy: {
          type: 'users',
          userIds: ['finance-a', 'finance-b']
        },
        completionStrategy: 'all',
        sequential: true,
        allowReject: true
      }
    },
    {
      id: 'legal_or_sign',
      type: 'orSign',
      name: '法务/风控或签',
      description: '任一专业角色通过即可继续',
      position: { x: 195, y: 1098 },
      config: {
        assigneeStrategy: {
          type: 'users',
          userIds: ['legal-a', 'risk-a']
        },
        completionStrategy: 'any',
        allowReject: true
      }
    },
    {
      id: 'parallel_review',
      type: 'parallelGateway',
      name: '并行复核',
      description: '合同归档与仓储通知并行处理',
      position: { x: 195, y: 1308 },
      config: {
        joinMode: 'all'
      }
    },
    {
      id: 'contract_sub_process',
      type: 'subProcess',
      name: '合同归档子流程',
      description: '调用合同归档审批子流程',
      position: { x: 30, y: 1518 },
      config: {
        definitionCode: 'contract_archive'
      }
    },
    {
      id: 'warehouse_cc',
      type: 'cc',
      name: '抄送仓储',
      description: '通知仓储团队准备发货',
      position: { x: 360, y: 1518 },
      config: {
        assigneeStrategy: {
          type: 'users',
          userIds: ['warehouse-a', 'warehouse-b']
        }
      }
    },
    {
      id: 'payment_timer',
      type: 'timer',
      name: '等待付款确认',
      description: '付款状态确认后继续',
      position: { x: 360, y: 1728 },
      config: {
        delaySeconds: 0,
        action: 'continue'
      }
    },
    {
      id: 'sync_order_status',
      type: 'serviceTask',
      name: '回写订单状态',
      description: '同步审批结果到订单中心',
      position: { x: 360, y: 1938 },
      config: {
        serviceName: 'order',
        serviceMethod: 'syncApprovalStatus'
      }
    },
    {
      id: 'end',
      type: 'end',
      name: '结束',
      description: '订单审批流程结束',
      position: { x: 360, y: 2148 }
    }
  ];

  const edges: WorkflowEdge[] = [
    { id: 'edge_start_lock_inventory', source: 'start', target: 'lock_inventory' },
    { id: 'edge_lock_inventory_amount_condition', source: 'lock_inventory', target: 'amount_condition' },
    {
      id: 'edge_amount_condition_manager_approval',
      source: 'amount_condition',
      target: 'manager_approval',
      name: '高金额订单',
      priority: 1,
      condition: {
        type: 'field',
        field: 'amount',
        operator: 'gte',
        value: 5000
      }
    },
    {
      id: 'edge_amount_condition_sales_approval',
      source: 'amount_condition',
      target: 'sales_approval',
      name: '普通订单',
      priority: 99,
      condition: {
        type: 'always'
      }
    },
    { id: 'edge_sales_approval_warehouse_cc', source: 'sales_approval', target: 'warehouse_cc' },
    { id: 'edge_manager_approval_finance_sign', source: 'manager_approval', target: 'finance_sign' },
    { id: 'edge_finance_sign_legal_or_sign', source: 'finance_sign', target: 'legal_or_sign' },
    { id: 'edge_legal_or_sign_parallel_review', source: 'legal_or_sign', target: 'parallel_review' },
    { id: 'edge_parallel_review_contract_sub_process', source: 'parallel_review', target: 'contract_sub_process', name: '合同归档' },
    { id: 'edge_parallel_review_warehouse_cc', source: 'parallel_review', target: 'warehouse_cc', name: '仓储通知' },
    { id: 'edge_contract_sub_process_payment_timer', source: 'contract_sub_process', target: 'payment_timer' },
    { id: 'edge_warehouse_cc_payment_timer', source: 'warehouse_cc', target: 'payment_timer' },
    { id: 'edge_payment_timer_sync_order_status', source: 'payment_timer', target: 'sync_order_status' },
    { id: 'edge_sync_order_status_end', source: 'sync_order_status', target: 'end' }
  ];

  return normalizeWorkflowModel({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    code: options.code ?? 'order_approval',
    name: options.name ?? '订单审批流测试',
    documentType: options.documentType ?? 'order',
    status: 'draft',
    nodes,
    edges,
    variables: [
      { key: 'amount', label: '订单金额', type: 'number', source: 'document', path: 'amount', required: true },
      { key: 'customerLevel', label: '客户等级', type: 'string', source: 'document', path: 'customer.level' },
      { key: 'riskLevel', label: '风险等级', type: 'string', source: 'manual' },
      { key: 'orderType', label: '订单类型', type: 'string', source: 'document', path: 'type' }
    ],
    settings: {
      allowCancel: true,
      allowWithdraw: true,
      duplicateSubmitPolicy: 'reject',
      historyLevel: 'full'
    }
  });
}

export function serializeWorkflowModel(model: WorkflowModel) {
  return JSON.stringify(normalizeWorkflowModel(model), null, 2);
}

export function parseWorkflowModelJson(json: string) {
  return prepareWorkflowModel(JSON.parse(json) as unknown);
}
