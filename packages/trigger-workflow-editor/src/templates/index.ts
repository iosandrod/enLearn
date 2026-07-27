import { TRIGGER_WORKFLOW_SCHEMA_VERSION, type TriggerWorkflowModel } from '../schema/types';
import { normalizeTriggerWorkflow } from '../schema/normalize';

export function createApprovalTriggerWorkflow(): TriggerWorkflowModel {
  return normalizeTriggerWorkflow({
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: 'expense_approval_trigger',
    name: 'Expense Approval Trigger Workflow',
    kind: 'approval',
    nodes: [
      node('webhook', 'webhook', 'Expense submitted', 380, 40, {
        webhook: { path: '/expenses/submitted', method: 'POST' }
      }),
      node('task', 'validate_expense', 'Validate expense', 380, 190, {
        task: { id: 'expense.validate', retry: { maxAttempts: 3 }, idempotencyKey: '{{payload.expenseId}}:validate' }
      }),
      node('condition', 'amount_condition', 'Amount condition', 380, 340),
      node('manualApproval', 'manager_approval', 'Manager approval', 190, 510, {
        task: { id: 'approval.manager.wait' },
        approval: { assigneeType: 'role', assigneeIds: ['manager'], timeoutSeconds: 86400, onTimeout: 'autoReject' }
      }),
      node('manualApproval', 'finance_approval', 'Finance approval', 570, 510, {
        task: { id: 'approval.finance.wait' },
        approval: { assigneeType: 'role', assigneeIds: ['finance'], timeoutSeconds: 172800, onTimeout: 'autoReject' }
      }),
      node('task', 'sync_status', 'Sync approval result', 380, 690, {
        task: { id: 'expense.syncApprovalStatus', retry: { maxAttempts: 5 } }
      }),
      node('end', 'end', 'Completed', 380, 850)
    ],
    edges: [
      edge('webhook', 'validate_expense'),
      edge('validate_expense', 'amount_condition'),
      edge('amount_condition', 'manager_approval', 'Under limit', { type: 'field', field: 'amount', operator: 'lt', value: 5000 }),
      edge('amount_condition', 'finance_approval', 'High value', { type: 'field', field: 'amount', operator: 'gte', value: 5000 }),
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
    name: 'Daily CRM Data Sync',
    kind: 'dataSync',
    nodes: [
      node('schedule', 'schedule', 'Every morning', 380, 40, {
        schedule: { cron: '0 8 * * *', timezone: 'Asia/Shanghai', externalId: 'daily-crm-sync' }
      }),
      node('dataSource', 'extract_crm', 'Extract CRM records', 380, 190, {
        task: { id: 'crm.extract', queue: { name: 'crm-sync', concurrencyLimit: 2 } },
        data: { connector: 'salesforce', operation: 'extract', source: 'accounts', batchSize: 500 }
      }),
      node('transform', 'normalize_records', 'Normalize records', 380, 340, {
        task: { id: 'crm.normalize' },
        data: { mapping: { externalId: 'Id', name: 'Name', owner: 'Owner.Email' } }
      }),
      node('batchTrigger', 'upsert_batches', 'Upsert batches', 380, 490, {
        task: { id: 'warehouse.upsertBatch', retry: { maxAttempts: 5 } },
        data: { connector: 'postgres', operation: 'upsert', target: 'crm_accounts', batchSize: 1000 }
      }),
      node('dataSink', 'write_audit', 'Write sync audit', 380, 640, {
        task: { id: 'sync.writeAudit' },
        data: { connector: 'postgres', operation: 'load', target: 'sync_runs' }
      }),
      node('end', 'end', 'Synced', 380, 790)
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
    name: 'Support AI Agent Triage',
    kind: 'aiAgent',
    nodes: [
      node('webhook', 'ticket_created', 'Ticket created', 380, 40, {
        webhook: { path: '/support/tickets', method: 'POST' }
      }),
      node('memory', 'load_context', 'Load customer context', 380, 190, {
        task: { id: 'agent.memory.load' },
        ai: { memoryKey: '{{payload.customerId}}' }
      }),
      node('agent', 'triage_agent', 'Triage agent', 380, 340, {
        task: { id: 'agent.support.triage', queue: { name: 'ai-agent', concurrencyLimit: 4 } },
        ai: {
          provider: 'openai',
          model: 'gpt-4.1',
          prompt: 'Classify urgency, summarize the issue, and decide the next action.',
          tools: ['search_docs', 'create_reply'],
          maxTurns: 6,
          requireHumanReview: true
        }
      }),
      node('parallel', 'tool_parallel', 'Run agent tools', 380, 490),
      node('tool', 'search_docs', 'Search knowledge base', 180, 650, {
        task: { id: 'agent.tool.searchDocs' },
        ai: { tools: ['search_docs'] }
      }),
      node('tool', 'draft_reply', 'Draft reply', 580, 650, {
        task: { id: 'agent.tool.draftReply' },
        ai: { tools: ['create_reply'] }
      }),
      node('humanReview', 'review_reply', 'Human review', 380, 830, {
        task: { id: 'agent.review.wait' },
        approval: { assigneeType: 'team', assigneeIds: ['support-leads'], timeoutSeconds: 3600, onTimeout: 'continue' }
      }),
      node('task', 'send_reply', 'Send reply', 380, 990, {
        task: { id: 'support.sendReply', idempotencyKey: '{{payload.ticketId}}:reply' }
      }),
      node('end', 'end', 'Resolved', 380, 1150)
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
