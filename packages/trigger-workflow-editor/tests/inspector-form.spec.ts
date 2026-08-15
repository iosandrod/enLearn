import { strict as assert } from 'node:assert';
import {
  TRIGGER_EDGE_FORM_SCHEMA_CODE,
  assertTriggerInspectorFormSchema,
  createTriggerEdgeFormModel,
  createTriggerEdgeFormSchema,
  createTriggerNodeFormModel,
  createTriggerNodeFormSchema,
  getTriggerNodeFormSchemaCode,
  resolveTriggerNodeFormSchema,
  triggerInspectorNodeTypes,
  triggerNodeFormSchemaCodeByType,
  triggerNodeFormSchemaCodes,
  updateTriggerEdgeFromFormField,
  updateTriggerNodeFromFormField,
  type TriggerInspectorFormSchema
} from '../src/inspector-form';
import { normalizeTriggerWorkflow } from '../src/schema/normalize';
import { createApprovalTriggerWorkflow } from '../src/templates';

const workflow = createApprovalTriggerWorkflow();
const approvalNode = workflow.nodes.find((node) => node.id === 'manager_approval');
assert.ok(approvalNode);

for (const type of triggerInspectorNodeTypes) {
  const schema = createTriggerNodeFormSchema({ id: type, type, name: type });
  assertTriggerInspectorFormSchema(schema);
  assert.ok(schema.fields.some((field) => field.field === 'id'), `${type} must expose id.`);
  assert.ok(schema.fields.some((field) => field.field === 'name'), `${type} must expose name.`);
  assert.ok(schema.fields.some((field) => field.field === 'metadata'), `${type} must expose metadata.`);
  assert.ok(schema.fields.some((field) => field.field === 'rawConfig'), `${type} must expose rawConfig.`);
  const tabs = schema.layout?.find((node) => node.kind === 'tabs');
  assert.ok(tabs && tabs.kind === 'tabs', `${type} must use a tab layout.`);
  assert.equal(tabs.tabs.at(-1)?.key, 'advanced');
}

assert.equal(triggerNodeFormSchemaCodes.length, triggerInspectorNodeTypes.length);
assert.equal(new Set(triggerNodeFormSchemaCodes).size, triggerInspectorNodeTypes.length);
assert.equal(getTriggerNodeFormSchemaCode('manualApproval'), 'trigger-workflow.node.manual-approval');
assert.equal(getTriggerNodeFormSchemaCode('triggerAndWait'), 'trigger-workflow.node.trigger-and-wait');
assert.equal(getTriggerNodeFormSchemaCode('dataSource'), 'trigger-workflow.node.data-source');
assert.match(TRIGGER_EDGE_FORM_SCHEMA_CODE, /^[a-z][a-z0-9._-]*$/);
for (const code of Object.values(triggerNodeFormSchemaCodeByType)) {
  assert.match(code, /^[a-z][a-z0-9._-]*$/);
}

const approvalSchema = createTriggerNodeFormSchema(approvalNode);
assert.ok(approvalSchema.fields.some((field) => field.field === 'assigneeType'));
assert.ok(approvalSchema.fields.some((field) => field.field === 'taskType'));
assert.ok(approvalSchema.fields.some((field) => field.field === 'taskImportPath'));
assert.ok(approvalSchema.fields.some((field) => field.field === 'retryFactor'));
assert.ok(approvalSchema.fields.some((field) => field.component === 'lc-json-editor'));

const taskSchema = createTriggerNodeFormSchema({ id: 'task', type: 'task', name: 'Task' });
const taskTypeField = taskSchema.fields.find((field) => field.field === 'taskType');
assert.deepEqual(taskTypeField?.options?.map((option) => option.value), [
  'frontendCommand',
  'backendCommand',
  'storedProcedure',
  'registeredTask'
]);
assert.equal(
  taskSchema.fields.find((field) => field.field === 'frontendFunction')?.component,
  'lc-monaco-editor'
);
assert.equal(
  taskSchema.fields.find((field) => field.field === 'backendFunction')?.component,
  'lc-monaco-editor'
);
for (const field of [
  'procedureName',
  'procedureSchema',
  'taskInput',
  'outputPath',
  'outputMapping',
  'failureStrategy',
  'defaultOutput',
  'priority',
  'taskTags',
  'queueName'
]) {
  assert.ok(taskSchema.fields.some((item) => item.field === field), `task must expose ${field}.`);
}
const queueField = taskSchema.fields.find((field) => field.field === 'queueName');
assert.equal(queueField?.component, 'vxe-select');
assert.equal(queueField?.options?.[0]?.value, '');
assert.ok(queueField?.options?.some((option) => option.value === 'trigger-workflow-jobs'));
assert.equal(taskSchema.fields.some((field) => field.field === 'concurrencyLimit'), false);
const taskTabs = taskSchema.layout?.find((node) => node.kind === 'tabs');
assert.ok(taskTabs && taskTabs.kind === 'tabs');
assert.ok(taskTabs.tabs.some((tab) => tab.key === 'execution' && tab.label === '执行策略'));

const webhookSchema = createTriggerNodeFormSchema({ id: 'webhook', type: 'webhook', name: 'Webhook' });
assert.ok(webhookSchema.fields.some((field) => field.field === 'webhookPath'));
assert.ok(webhookSchema.fields.some((field) => field.field === 'webhookMethod'));
const webhookBodyField = webhookSchema.fields.find((field) => field.field === 'webhookBody');
assert.equal(webhookBodyField?.component, 'lc-sub-form');
assert.deepEqual(
  (webhookBodyField?.props?.schema as { fields?: Array<{ field: string }> })?.fields?.map(
    (field) => field.field
  ),
  ['serviceName', 'serviceMethod', 'postData']
);
assert.equal(
  createTriggerNodeFormModel({ id: 'webhook', type: 'webhook', name: 'Webhook' }).webhookPath,
  '/api/service'
);
const normalizedLegacyWebhook = normalizeTriggerWorkflow({
  schemaVersion: 1,
  code: 'legacy-webhook',
  name: 'Legacy webhook',
  kind: 'custom',
  nodes: [
    {
      id: 'webhook',
      type: 'webhook',
      name: 'Webhook',
      config: {
        webhook: {
          path: '/legacy/events',
          method: 'PATCH',
          secretHeader: 'x-legacy-signature',
          body: {
            serviceName: 'planning',
            serviceMethod: 'listInventoryBuffers',
            postData: { limit: 20 }
          }
        }
      }
    }
  ],
  edges: []
});
assert.deepEqual(normalizedLegacyWebhook.nodes[0]?.config?.webhook, {
  path: '/api/service',
  method: 'POST',
  body: {
    serviceName: 'planning',
    serviceMethod: 'listInventoryBuffers',
    postData: { limit: 20 }
  }
});

const scheduleNode = {
  id: 'schedule',
  type: 'schedule',
  name: 'Schedule',
  config: { schedule: { cron: '0 8 * * *', timezone: 'Asia/Shanghai' } }
} as const;
const scheduleSchema = createTriggerNodeFormSchema(scheduleNode);
assert.equal(scheduleSchema.fields.some((field) => field.field === 'scheduleRule'), false);
assert.equal(createTriggerNodeFormModel(scheduleNode).scheduleRule.kind, 'daily');

const weeklySchedule = updateTriggerNodeFromFormField(scheduleNode, 'scheduleRule', {
  kind: 'weekly',
  time: '09:30',
  weekday: '1'
});
assert.equal(weeklySchedule.config?.schedule?.cron, '30 9 * * 1');

const intervalSchedule = updateTriggerNodeFromFormField(scheduleNode, 'scheduleRule', {
  kind: 'interval',
  intervalMinutes: 15
});
assert.equal(intervalSchedule.config?.schedule?.cron, '*/15 * * * *');

const databaseScheduleSchema: TriggerInspectorFormSchema = {
  columns: 1,
  fields: [
    {
      field: 'scheduleRule',
      label: '数据库业务定时设置',
      component: 'lc-sub-form',
      props: {
        schema: {
          columns: 1,
          fields: [
            { field: 'kind', label: '执行方式', component: 'vxe-select' },
            { field: 'time', label: '执行时间', component: 'vxe-input' }
          ],
          actions: []
        }
      }
    },
    { field: 'cron', label: 'Cron 表达式（高级）', component: 'vxe-input' },
    { field: 'timezone', label: '时区', component: 'vxe-input' }
  ],
  layout: [
    {
      kind: 'tabs',
      defaultKey: 'trigger',
      tabs: [
        {
          key: 'trigger',
          label: '触发配置',
          blocks: [
            { kind: 'field', field: 'scheduleRule' },
            { kind: 'field', field: 'cron' },
            { kind: 'field', field: 'timezone' }
          ]
        }
      ]
    }
  ],
  actions: []
};
const resolvedDatabaseScheduleSchema = resolveTriggerNodeFormSchema(scheduleNode, {
  schedule: databaseScheduleSchema
});
const resolvedScheduleRuleField = resolvedDatabaseScheduleSchema.fields.find(
  (field) => field.field === 'scheduleRule'
);
assert.equal(resolvedScheduleRuleField?.component, 'lc-sub-form');
assert.equal(resolvedScheduleRuleField?.label, '数据库业务定时设置');
assert.equal(
  (resolvedScheduleRuleField?.props?.schema as { fields?: Array<{ field: string }> })?.fields?.[0]
    ?.field,
  'kind'
);
assert.notEqual(
  resolvedDatabaseScheduleSchema,
  databaseScheduleSchema,
  'Database schemas must be cloned before rendering.'
);

const legacyScheduleSchema: TriggerInspectorFormSchema = {
  columns: 1,
  fields: [
    { field: 'cron', label: 'Cron 表达式', component: 'vxe-input' },
    { field: 'timezone', label: '时区', component: 'vxe-input' }
  ],
  layout: [
    {
      kind: 'tabs',
      defaultKey: 'trigger',
      tabs: [{ key: 'trigger', label: '触发设置', blocks: [{ kind: 'field', field: 'cron' }] }]
    }
  ],
  actions: []
};
const resolvedLegacyScheduleSchema = resolveTriggerNodeFormSchema(scheduleNode, {
  schedule: legacyScheduleSchema
});
assert.equal(
  resolvedLegacyScheduleSchema.fields.some((field) => field.field === 'scheduleRule'),
  false
);
assert.equal(
  resolvedLegacyScheduleSchema.fields.find((field) => field.field === 'cron')?.label,
  'Cron 表达式'
);

const dataSchema = createTriggerNodeFormSchema({ id: 'data', type: 'dataSource', name: 'Data' });
assert.ok(dataSchema.fields.some((field) => field.field === 'dataMapping'));

const agentSchema = createTriggerNodeFormSchema({ id: 'agent', type: 'agent', name: 'Agent' });
assert.ok(agentSchema.fields.some((field) => field.field === 'aiTools'));
assert.ok(agentSchema.fields.some((field) => field.field === 'memoryKey'));

const override: TriggerInspectorFormSchema = {
  columns: 1,
  fields: [{ field: 'name', label: '数据库节点名称', component: 'vxe-input' }],
  layout: [
    {
      kind: 'tabs',
      defaultKey: 'database',
      tabs: [{ key: 'database', label: '数据库配置', blocks: [{ kind: 'field', field: 'name' }] }]
    }
  ],
  actions: []
};
const resolvedOverride = resolveTriggerNodeFormSchema(approvalNode, { manualApproval: override });
assert.equal(resolvedOverride.fields[0]?.label, '数据库节点名称');
assert.notEqual(resolvedOverride, override, 'Database schemas must be cloned before rendering.');

const invalidOverride = {
  columns: 1,
  fields: [{ field: 'name', label: 'Broken', component: 'vxe-input' }],
  layout: [{ kind: 'field', field: 'missing' }],
  actions: []
} as TriggerInspectorFormSchema;
const fallbackSchema = resolveTriggerNodeFormSchema(approvalNode, { manualApproval: invalidOverride });
assert.ok(fallbackSchema.fields.some((field) => field.field === 'assigneeType'));

const model = createTriggerNodeFormModel(approvalNode);
assert.equal(model.name, '经理审批');
assert.equal(model.assigneeIds, 'manager');

const renamed = updateTriggerNodeFromFormField(approvalNode, 'name', '主管审批');
assert.equal(renamed.name, '主管审批');

const reassigned = updateTriggerNodeFromFormField(approvalNode, 'assigneeIds', 'manager, finance');
assert.deepEqual(reassigned.config?.approval?.assigneeIds, ['manager', 'finance']);

let configured = updateTriggerNodeFromFormField(approvalNode, 'taskImportPath', './tasks/approval');
configured = updateTriggerNodeFromFormField(configured, 'retryFactor', 2.5);
configured = updateTriggerNodeFromFormField(configured, 'retryMinTimeoutMs', 500);
configured = updateTriggerNodeFromFormField(configured, 'retryMaxTimeoutMs', 30_000);
assert.equal(configured.config?.task?.importPath, './tasks/approval');
assert.equal(configured.config?.task?.retry?.factor, 2.5);
assert.equal(configured.config?.task?.retry?.minTimeoutMs, 500);
assert.equal(configured.config?.task?.retry?.maxTimeoutMs, 30_000);

let frontendTask = updateTriggerNodeFromFormField(
  { id: 'front', type: 'task', name: 'Front' },
  'taskType',
  'frontendCommand'
);
frontendTask = updateTriggerNodeFromFormField(
  frontendTask,
  'frontendFunction',
  'async ({ context }) => context.command({ code: "message.show" })'
);
frontendTask = updateTriggerNodeFromFormField(frontendTask, 'taskInput', { message: '{{payload.message}}' });
frontendTask = updateTriggerNodeFromFormField(frontendTask, 'taskTags', 'frontend, notification');
assert.equal(frontendTask.config?.task?.type, 'frontendCommand');
assert.match(frontendTask.config?.task?.frontendFunction ?? '', /context\.command/);
assert.deepEqual(frontendTask.config?.task?.input, { message: '{{payload.message}}' });
assert.deepEqual(frontendTask.config?.task?.tags, ['frontend', 'notification']);

let procedureTask = updateTriggerNodeFromFormField(
  { id: 'procedure', type: 'task', name: 'Procedure' },
  'taskType',
  'storedProcedure'
);
procedureTask = updateTriggerNodeFromFormField(procedureTask, 'procedureSchema', 'public');
procedureTask = updateTriggerNodeFromFormField(procedureTask, 'procedureName', 'publish_plan');
procedureTask = updateTriggerNodeFromFormField(procedureTask, 'failureStrategy', 'useDefaultOutput');
procedureTask = updateTriggerNodeFromFormField(procedureTask, 'defaultOutput', { ok: false });
assert.equal(procedureTask.config?.task?.procedureName, 'publish_plan');
assert.deepEqual(procedureTask.config?.task?.defaultOutput, { ok: false });

const webhook = updateTriggerNodeFromFormField(
  { id: 'hook', type: 'webhook', name: 'Hook' },
  'webhookBody',
  {
    serviceName: 'planning',
    serviceMethod: 'listInventoryBuffers',
    postData: { itemId: '{{payload.itemId}}' }
  }
);
assert.equal(webhook.config?.webhook?.path, '/api/service');
assert.equal(webhook.config?.webhook?.method, 'POST');
assert.deepEqual(webhook.config?.webhook?.body, {
  serviceName: 'planning',
  serviceMethod: 'listInventoryBuffers',
  postData: { itemId: '{{payload.itemId}}' }
});

const data = updateTriggerNodeFromFormField(
  { id: 'data', type: 'dataSource', name: 'Data' },
  'dataMapping',
  { id: 'source_id' }
);
assert.deepEqual(data.config?.data?.mapping, { id: 'source_id' });

let agent = updateTriggerNodeFromFormField(
  { id: 'agent', type: 'agent', name: 'Agent' },
  'aiTools',
  'search, reply'
);
agent = updateTriggerNodeFromFormField(agent, 'memoryKey', '{{payload.customerId}}');
assert.deepEqual(agent.config?.ai?.tools, ['search', 'reply']);
assert.equal(agent.config?.ai?.memoryKey, '{{payload.customerId}}');

const condition = updateTriggerNodeFromFormField(
  { id: 'condition', type: 'condition', name: 'Condition' },
  'branches',
  [{ label: '通过', condition: { type: 'always' } }]
);
assert.equal(condition.config?.branches?.[0]?.label, '通过');

const withMetadata = updateTriggerNodeFromFormField(approvalNode, 'metadata', { owner: 'finance' });
assert.deepEqual(withMetadata.config?.metadata, { owner: 'finance' });

const edge = workflow.edges.find((item) => item.name === '普通金额');
assert.ok(edge);
const edgeSchema = createTriggerEdgeFormSchema(edge);
assert.ok(edgeSchema.fields.some((field) => field.field === 'conditionOperator'));
assert.ok(edgeSchema.fields.some((field) => field.field === 'conditionExpression'));
assert.equal(createTriggerEdgeFormModel(edge).conditionType, 'field');

const expressionEdge = updateTriggerEdgeFromFormField(edge, 'conditionType', 'expression');
assert.equal(expressionEdge.condition?.type, 'expression');

console.log('trigger-workflow-editor inspector form tests passed');
