import { TRIGGER_WORKFLOW_SCHEMA_VERSION, type TriggerWorkflowModel } from '../schema/types';
import { normalizeTriggerWorkflow } from '../schema/normalize';

export function createApprovalTriggerWorkflow(): TriggerWorkflowModel {
  return normalizeTriggerWorkflow({
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: 'expense_approval_trigger',
    name: '费用报销审批流程',
    kind: 'approval',
    nodes: [
      node('webhook', 'webhook', '提交报销申请', 380, 40, {
        webhook: { path: '/expenses/submitted', method: 'POST' }
      }),
      node('task', 'validate_expense', '校验报销数据', 380, 190, {
        task: { type: 'registeredTask', id: 'expense.validate', retry: { maxAttempts: 3 }, idempotencyKey: '{{payload.expenseId}}:validate' }
      }),
      node('condition', 'amount_condition', '判断报销金额', 380, 340),
      node('manualApproval', 'manager_approval', '经理审批', 190, 510, {
        task: { type: 'registeredTask', id: 'approval.manager.wait' },
        approval: { assigneeType: 'role', assigneeIds: ['manager'], timeoutSeconds: 86400, onTimeout: 'autoReject' }
      }),
      node('manualApproval', 'finance_approval', '财务审批', 570, 510, {
        task: { type: 'registeredTask', id: 'approval.finance.wait' },
        approval: { assigneeType: 'role', assigneeIds: ['finance'], timeoutSeconds: 172800, onTimeout: 'autoReject' }
      }),
      node('task', 'sync_status', '同步审批结果', 380, 690, {
        task: { type: 'registeredTask', id: 'expense.syncApprovalStatus', retry: { maxAttempts: 5 } }
      }),
      node('end', 'end', '审批完成', 380, 850)
    ],
    edges: [
      edge('webhook', 'validate_expense'),
      edge('validate_expense', 'amount_condition'),
      edge('amount_condition', 'manager_approval', '普通金额', { type: 'field', field: 'amount', operator: 'lt', value: 5000 }),
      edge('amount_condition', 'finance_approval', '大额报销', { type: 'field', field: 'amount', operator: 'gte', value: 5000 }),
      edge('manager_approval', 'sync_status'),
      edge('finance_approval', 'sync_status'),
      edge('sync_status', 'end')
    ]
  });
}

export function createDataSyncTriggerWorkflow(): TriggerWorkflowModel {
  return normalizeTriggerWorkflow({
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: 'daily_crm_sync',
    name: '每日 CRM 数据同步',
    kind: 'dataSync',
    nodes: [
      node('schedule', 'schedule', '每天早晨', 380, 40, {
        schedule: { cron: '0 8 * * *', timezone: 'Asia/Shanghai', externalId: 'daily-crm-sync' }
      }),
      node('dataSource', 'extract_crm', '读取 CRM 记录', 380, 190, {
        task: { type: 'registeredTask', id: 'crm.extract', queue: { name: 'crm-sync', concurrencyLimit: 2 } },
        data: { connector: 'salesforce', operation: 'extract', source: 'accounts', batchSize: 500 }
      }),
      node('transform', 'normalize_records', '标准化数据', 380, 340, {
        task: { type: 'registeredTask', id: 'crm.normalize' },
        data: { mapping: { externalId: 'Id', name: 'Name', owner: 'Owner.Email' } }
      }),
      node('batchTrigger', 'upsert_batches', '批量更新数据', 380, 490, {
        task: { type: 'registeredTask', id: 'warehouse.upsertBatch', retry: { maxAttempts: 5 } },
        data: { connector: 'postgres', operation: 'upsert', target: 'crm_accounts', batchSize: 1000 }
      }),
      node('dataSink', 'write_audit', '写入同步日志', 380, 640, {
        task: { type: 'registeredTask', id: 'sync.writeAudit' },
        data: { connector: 'postgres', operation: 'load', target: 'sync_runs' }
      }),
      node('end', 'end', '同步完成', 380, 790)
    ],
    edges: [
      edge('schedule', 'extract_crm'),
      edge('extract_crm', 'normalize_records'),
      edge('normalize_records', 'upsert_batches'),
      edge('upsert_batches', 'write_audit'),
      edge('write_audit', 'end')
    ]
  });
}

export function createAiAgentTriggerWorkflow(): TriggerWorkflowModel {
  return normalizeTriggerWorkflow({
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: 'support_agent_triage',
    name: '客服 AI 智能分诊',
    kind: 'aiAgent',
    nodes: [
      node('webhook', 'ticket_created', '收到客户工单', 380, 40, {
        webhook: { path: '/support/tickets', method: 'POST' }
      }),
      node('memory', 'load_context', '加载客户上下文', 380, 190, {
        task: { type: 'registeredTask', id: 'agent.memory.load' },
        ai: { memoryKey: '{{payload.customerId}}' }
      }),
      node('agent', 'triage_agent', '智能分诊', 380, 340, {
        task: { type: 'registeredTask', id: 'agent.support.triage', queue: { name: 'ai-agent', concurrencyLimit: 4 } },
        ai: {
          provider: 'openai',
          model: 'gpt-4.1',
          prompt: '判断紧急程度，概括客户问题，并决定下一步处理方式。',
          tools: ['search_docs', 'create_reply'],
          maxTurns: 6,
          requireHumanReview: true
        }
      }),
      node('parallel', 'tool_parallel', '并行调用工具', 380, 490),
      node('tool', 'search_docs', '检索知识库', 180, 650, {
        task: { type: 'registeredTask', id: 'agent.tool.searchDocs' },
        ai: { tools: ['search_docs'] }
      }),
      node('tool', 'draft_reply', '生成回复草稿', 580, 650, {
        task: { type: 'registeredTask', id: 'agent.tool.draftReply' },
        ai: { tools: ['create_reply'] }
      }),
      node('humanReview', 'review_reply', '人工复核回复', 380, 830, {
        task: { type: 'registeredTask', id: 'agent.review.wait' },
        approval: { assigneeType: 'team', assigneeIds: ['support-leads'], timeoutSeconds: 3600, onTimeout: 'continue' }
      }),
      node('task', 'send_reply', '发送回复', 380, 990, {
        task: { type: 'registeredTask', id: 'support.sendReply', idempotencyKey: '{{payload.ticketId}}:reply' }
      }),
      node('end', 'end', '处理完成', 380, 1150)
    ],
    edges: [
      edge('ticket_created', 'load_context'),
      edge('load_context', 'triage_agent'),
      edge('triage_agent', 'tool_parallel'),
      edge('tool_parallel', 'search_docs'),
      edge('tool_parallel', 'draft_reply'),
      edge('search_docs', 'review_reply'),
      edge('draft_reply', 'review_reply'),
      edge('review_reply', 'send_reply'),
      edge('send_reply', 'end')
    ]
  });
}

export const triggerWorkflowTemplates = {
  approval: createApprovalTriggerWorkflow,
  dataSync: createDataSyncTriggerWorkflow,
  aiAgent: createAiAgentTriggerWorkflow
};

function node(type: string, id: string, name: string, x: number, y: number, config?: Record<string, unknown>) {
  return {
    id,
    type,
    name,
    position: { x, y },
    ...(config ? { config } : {})
  };
}

function edge(source: string, target: string, name?: string, condition?: Record<string, unknown>) {
  return {
    id: `edge_${source}_${target}`,
    source,
    target,
    ...(name ? { name } : {}),
    ...(condition ? { condition } : {})
  };
}
