import type {
  TriggerNodeType,
  TriggerWorkflowEdge,
  TriggerWorkflowNode,
  TriggerWorkflowTaskRef,
  TriggerWorkflowTaskType
} from './schema/types';
import { TRIGGER_WORKFLOW_REGISTERED_QUEUES } from './runtime-catalog';

export const TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX = 'trigger-workflow.node.';
export const TRIGGER_EDGE_FORM_SCHEMA_CODE = 'trigger-workflow.edge';

export const triggerInspectorNodeTypes = [
  'start',
  'schedule',
  'webhook',
  'manualApproval',
  'condition',
  'parallel',
  'task',
  'triggerAndWait',
  'batchTrigger',
  'wait',
  'dataSource',
  'transform',
  'dataSink',
  'agent',
  'tool',
  'memory',
  'humanReview',
  'end'
] as const satisfies readonly TriggerNodeType[];

export type TriggerInspectorNodeType = (typeof triggerInspectorNodeTypes)[number];

export const triggerNodeFormSchemaCodeByType = {
  start: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}start`,
  schedule: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}schedule`,
  webhook: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}webhook`,
  manualApproval: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}manual-approval`,
  condition: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}condition`,
  parallel: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}parallel`,
  task: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}task`,
  triggerAndWait: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}trigger-and-wait`,
  batchTrigger: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}batch-trigger`,
  wait: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}wait`,
  dataSource: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}data-source`,
  transform: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}transform`,
  dataSink: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}data-sink`,
  agent: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}agent`,
  tool: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}tool`,
  memory: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}memory`,
  humanReview: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}human-review`,
  end: `${TRIGGER_NODE_FORM_SCHEMA_CODE_PREFIX}end`
} as const satisfies Record<TriggerInspectorNodeType, string>;

export type TriggerInspectorFormOption = {
  label: string;
  value: string | number;
  disabled?: boolean;
};

export type TriggerInspectorFormField = {
  field: string;
  label: string;
  component: string;
  showTitle?: boolean;
  help?: string;
  span?: number;
  props?: Record<string, unknown>;
  options?: TriggerInspectorFormOption[];
  optionsCode?: string;
  optionsSourceKey?: string;
  optionProps?: Record<string, unknown>;
  rules?: Array<{ required?: boolean; min?: number; message: string }>;
};

export type TriggerInspectorFormLayoutNode =
  | { kind: 'field'; field: string }
  | {
      kind: 'row';
      gutter?: number | string;
      columns: Array<{ span?: number | string; blocks: TriggerInspectorFormLayoutNode[] }>;
    }
  | { kind: 'stack'; blocks: TriggerInspectorFormLayoutNode[] }
  | {
      kind: 'tabs';
      fillRemaining?: boolean;
      defaultKey?: string;
      tabs: Array<{ key: string; label: string; blocks: TriggerInspectorFormLayoutNode[] }>;
    };

export type TriggerInspectorFormSchema = {
  title?: string;
  columns?: number;
  fields: TriggerInspectorFormField[];
  layout?: TriggerInspectorFormLayoutNode[];
  actions: Array<{ code: string; label: string; [key: string]: unknown }>;
};

export type TriggerNodeFormSchemaMap = Partial<
  Record<TriggerInspectorNodeType, TriggerInspectorFormSchema>
>;

export type TriggerNodeFormSchemaOverrides = Record<string, TriggerInspectorFormSchema | undefined>;

type FormSection = {
  key: string;
  label: string;
  fields: TriggerInspectorFormField[];
};

const taskNodeTypes = new Set([
  'task',
  'triggerAndWait',
  'batchTrigger',
  'tool',
  'agent',
  'dataSource',
  'dataSink',
  'manualApproval',
  'humanReview',
  'transform',
  'memory'
]);

const nodeFieldPaths: Record<string, string[]> = {
  cron: ['schedule', 'cron'],
  timezone: ['schedule', 'timezone'],
  externalId: ['schedule', 'externalId'],
  webhookPath: ['webhook', 'path'],
  webhookMethod: ['webhook', 'method'],
  webhookSecretHeader: ['webhook', 'secretHeader'],
  taskType: ['task', 'type'],
  taskId: ['task', 'id'],
  taskImportPath: ['task', 'importPath'],
  frontendFunction: ['task', 'frontendFunction'],
  backendFunction: ['task', 'backendFunction'],
  procedureName: ['task', 'procedureName'],
  procedureSchema: ['task', 'procedureSchema'],
  taskInput: ['task', 'input'],
  outputPath: ['task', 'outputPath'],
  outputMapping: ['task', 'outputMapping'],
  failureStrategy: ['task', 'failureStrategy'],
  defaultOutput: ['task', 'defaultOutput'],
  priority: ['task', 'priority'],
  taskTags: ['task', 'tags'],
  queueName: ['task', 'queue', 'name'],
  concurrencyLimit: ['task', 'queue', 'concurrencyLimit'],
  maxAttempts: ['task', 'retry', 'maxAttempts'],
  retryFactor: ['task', 'retry', 'factor'],
  retryMinTimeoutMs: ['task', 'retry', 'minTimeoutMs'],
  retryMaxTimeoutMs: ['task', 'retry', 'maxTimeoutMs'],
  timeoutSeconds: ['task', 'timeoutSeconds'],
  idempotencyKey: ['task', 'idempotencyKey'],
  assigneeType: ['approval', 'assigneeType'],
  assigneeIds: ['approval', 'assigneeIds'],
  approvalTimeoutSeconds: ['approval', 'timeoutSeconds'],
  onTimeout: ['approval', 'onTimeout'],
  waitMode: ['wait', 'mode'],
  waitDuration: ['wait', 'duration'],
  waitUntil: ['wait', 'until'],
  waitTokenKey: ['wait', 'tokenKey'],
  connector: ['data', 'connector'],
  operation: ['data', 'operation'],
  source: ['data', 'source'],
  target: ['data', 'target'],
  batchSize: ['data', 'batchSize'],
  dataMapping: ['data', 'mapping'],
  aiProvider: ['ai', 'provider'],
  aiModel: ['ai', 'model'],
  aiPrompt: ['ai', 'prompt'],
  aiTools: ['ai', 'tools'],
  aiMaxTurns: ['ai', 'maxTurns'],
  requireHumanReview: ['ai', 'requireHumanReview'],
  memoryKey: ['ai', 'memoryKey'],
  expression: ['expression'],
  branches: ['branches'],
  metadata: ['metadata']
};

const integerFields = new Set([
  'maxAttempts',
  'retryMinTimeoutMs',
  'retryMaxTimeoutMs',
  'timeoutSeconds',
  'priority',
  'approvalTimeoutSeconds',
  'batchSize',
  'aiMaxTurns'
]);

export function getTriggerNodeFormSchemaCode(type: TriggerInspectorNodeType) {
  return triggerNodeFormSchemaCodeByType[type];
}

export const triggerNodeFormSchemaCodes = triggerInspectorNodeTypes.map(
  getTriggerNodeFormSchemaCode
);

export function createTriggerNodeFormSchema(node: TriggerWorkflowNode): TriggerInspectorFormSchema {
  const sections: FormSection[] = [
    { key: 'basic', label: '基础信息', fields: createBasicFields() }
  ];
  const configSection = createNodeConfigSection(node.type);
  if (configSection.fields.length) sections.push(configSection);
  if (taskNodeTypes.has(node.type)) {
    sections.push(...createTaskSections(node.type));
  }
  sections.push({ key: 'advanced', label: '高级配置', fields: createAdvancedFields() });
  return createTabbedSchema(sections);
}

export function createTriggerNodeFormSchemaCatalog() {
  return Object.fromEntries(
    triggerInspectorNodeTypes.map((type) => [
      type,
      createTriggerNodeFormSchema({ id: type, type, name: type })
    ])
  ) as Record<TriggerInspectorNodeType, TriggerInspectorFormSchema>;
}

export function resolveTriggerNodeFormSchema(
  node: TriggerWorkflowNode,
  schemas?: TriggerNodeFormSchemaOverrides
): TriggerInspectorFormSchema {
  const databaseSchema = schemas?.[node.type];
  if (databaseSchema) {
    try {
      assertTriggerInspectorFormSchema(databaseSchema);
      return enhanceTaskFormSchema(node, databaseSchema);
    } catch {
      // A malformed database definition must not make the workflow editor unusable.
    }
  }
  return createTriggerNodeFormSchema(node);
}

export function resolveTriggerEdgeFormSchema(
  edge: TriggerWorkflowEdge,
  schema?: TriggerInspectorFormSchema
): TriggerInspectorFormSchema {
  if (schema) {
    try {
      assertTriggerInspectorFormSchema(schema);
      return cloneValue(schema);
    } catch {
      // Keep the built-in edge inspector available when a database definition is invalid.
    }
  }
  return createTriggerEdgeFormSchema(edge);
}

export function assertTriggerInspectorFormSchema(
  value: unknown
): asserts value is TriggerInspectorFormSchema {
  if (!isRecord(value)) throw new Error('节点属性表单 Schema 必须是对象。');
  if (!Array.isArray(value.fields) || !value.fields.length) {
    throw new Error('节点属性表单 Schema.fields 不能为空。');
  }
  if (!Array.isArray(value.actions)) {
    throw new Error('节点属性表单 Schema.actions 必须是数组。');
  }
  if (value.layout !== undefined && !Array.isArray(value.layout)) {
    throw new Error('节点属性表单 Schema.layout 必须是数组。');
  }
  if (value.columns !== undefined) {
    const columns = Number(value.columns);
    if (!Number.isInteger(columns) || columns < 1) {
      throw new Error('节点属性表单 Schema.columns 必须是正整数。');
    }
  }

  const names = new Set<string>();
  value.fields.forEach((field, index) => {
    if (!isRecord(field)) throw new Error(`Schema.fields[${index}] 必须是对象。`);
    const name = readText(field.field);
    const component = readText(field.component);
    if (!name || !component) {
      throw new Error(`Schema.fields[${index}] 缺少 field 或 component。`);
    }
    if (names.has(name)) throw new Error(`节点属性表单存在重复字段：${name}。`);
    names.add(name);
  });

  if (Array.isArray(value.layout)) {
    const layoutFields: string[] = [];
    validateLayoutNodes(value.layout, layoutFields);
    layoutFields.forEach((field) => {
      if (!names.has(field)) throw new Error(`节点属性布局引用了不存在的字段：${field}。`);
    });
    const duplicateLayoutField = layoutFields.find(
      (field, index) => layoutFields.indexOf(field) !== index
    );
    if (duplicateLayoutField) {
      throw new Error(`节点属性布局重复引用了字段：${duplicateLayoutField}。`);
    }
  }
}

export function createTriggerNodeFormModel(node: TriggerWorkflowNode) {
  const config = node.config ?? {};
  return {
    id: node.id,
    name: node.name,
    description: node.description ?? '',
    cron: config.schedule?.cron ?? '',
    timezone: config.schedule?.timezone ?? '',
    externalId: config.schedule?.externalId ?? '',
    webhookPath: config.webhook?.path ?? '',
    webhookMethod: config.webhook?.method ?? 'POST',
    webhookSecretHeader: config.webhook?.secretHeader ?? '',
    taskType: resolveTaskType(config.task),
    taskId: config.task?.id ?? '',
    taskImportPath: config.task?.importPath ?? '',
    frontendFunction: config.task?.frontendFunction ?? '',
    backendFunction: config.task?.backendFunction ?? '',
    procedureName: config.task?.procedureName ?? '',
    procedureSchema: config.task?.procedureSchema ?? 'public',
    taskInput: cloneValue(config.task?.input ?? {}),
    outputPath: config.task?.outputPath ?? '',
    outputMapping: cloneValue(config.task?.outputMapping ?? {}),
    failureStrategy: config.task?.failureStrategy ?? 'failWorkflow',
    defaultOutput: cloneValue(config.task?.defaultOutput ?? {}),
    priority: config.task?.priority,
    taskTags: config.task?.tags?.join(', ') ?? '',
    queueName: config.task?.queue?.name ?? '',
    concurrencyLimit: config.task?.queue?.concurrencyLimit,
    maxAttempts: config.task?.retry?.maxAttempts,
    retryFactor: config.task?.retry?.factor,
    retryMinTimeoutMs: config.task?.retry?.minTimeoutMs,
    retryMaxTimeoutMs: config.task?.retry?.maxTimeoutMs,
    timeoutSeconds: config.task?.timeoutSeconds,
    idempotencyKey: config.task?.idempotencyKey ?? '',
    assigneeType: config.approval?.assigneeType ?? 'role',
    assigneeIds: config.approval?.assigneeIds?.join(', ') ?? '',
    approvalTimeoutSeconds: config.approval?.timeoutSeconds,
    onTimeout: config.approval?.onTimeout ?? 'fail',
    waitMode: config.wait?.mode ?? 'duration',
    waitDuration: config.wait?.duration ?? '',
    waitUntil: config.wait?.until ?? '',
    waitTokenKey: config.wait?.tokenKey ?? '',
    connector: config.data?.connector ?? '',
    operation: config.data?.operation ?? 'sync',
    source: config.data?.source ?? '',
    target: config.data?.target ?? '',
    batchSize: config.data?.batchSize,
    dataMapping: cloneValue(config.data?.mapping ?? {}),
    aiProvider: config.ai?.provider ?? 'openai',
    aiModel: config.ai?.model ?? '',
    aiPrompt: config.ai?.prompt ?? '',
    aiTools: config.ai?.tools?.join(', ') ?? '',
    aiMaxTurns: config.ai?.maxTurns,
    requireHumanReview: config.ai?.requireHumanReview ?? false,
    memoryKey: config.ai?.memoryKey ?? '',
    expression: config.expression ?? '',
    branches: cloneValue(config.branches ?? []),
    metadata: cloneValue(config.metadata ?? {}),
    rawConfig: cloneValue(config)
  };
}

export function updateTriggerNodeFromFormField(
  node: TriggerWorkflowNode,
  field: string,
  value: unknown
): TriggerWorkflowNode {
  if (field === 'name') return { ...node, name: String(value ?? '') };
  if (field === 'description') {
    const description = String(value ?? '');
    return description ? { ...node, description } : omitDescription(node);
  }
  if (field === 'rawConfig') {
    return { ...node, config: isRecord(value) ? cloneValue(value) : {} };
  }

  const path = nodeFieldPaths[field];
  if (!path) return node;
  const config = cloneValue(node.config ?? {});
  setNestedValue(config, path, normalizeNodeFieldValue(field, value));
  return { ...node, config };
}

export function createTriggerEdgeFormSchema(edge: TriggerWorkflowEdge): TriggerInspectorFormSchema {
  const conditionFields: TriggerInspectorFormField[] = [
    selectField('conditionType', '执行条件', [
      { label: '始终执行', value: 'always' },
      { label: '字段判断', value: 'field' },
      { label: '表达式判断', value: 'expression' }
    ])
  ];

  conditionFields.push(
    textField('conditionField', '字段路径', {
      placeholder: '例如：payload.amount',
      visibleWhen: { field: 'conditionType', equals: 'field' }
    }),
    {
      ...selectField('conditionOperator', '比较方式', [
        { label: '等于', value: 'eq' },
        { label: '不等于', value: 'ne' },
        { label: '大于', value: 'gt' },
        { label: '大于等于', value: 'gte' },
        { label: '小于', value: 'lt' },
        { label: '小于等于', value: 'lte' },
        { label: '包含', value: 'contains' },
        { label: '属于集合', value: 'in' }
      ]),
      props: {
        clearable: false,
        visibleWhen: { field: 'conditionType', equals: 'field' }
      }
    },
    textField('conditionValue', '比较值', {
      visibleWhen: { field: 'conditionType', equals: 'field' }
    }),
    textareaField('conditionExpression', '条件表达式', 4, {
      visibleWhen: { field: 'conditionType', equals: 'expression' }
    })
  );

  return createTabbedSchema([
    { key: 'basic', label: '基础信息', fields: [textField('name', '连接名称')] },
    { key: 'condition', label: '执行条件', fields: conditionFields }
  ]);
}

export function createTriggerEdgeFormModel(edge: TriggerWorkflowEdge) {
  return {
    name: edge.name ?? '',
    conditionType: edge.condition?.type ?? 'always',
    conditionField: edge.condition?.type === 'field' ? edge.condition.field : '',
    conditionOperator: edge.condition?.type === 'field' ? edge.condition.operator : 'eq',
    conditionValue: edge.condition?.type === 'field' ? edge.condition.value ?? '' : '',
    conditionExpression: edge.condition?.type === 'expression' ? edge.condition.expression : ''
  };
}

export function updateTriggerEdgeFromFormField(
  edge: TriggerWorkflowEdge,
  field: string,
  value: unknown
): TriggerWorkflowEdge {
  if (field === 'name') {
    const name = String(value ?? '');
    return name ? { ...edge, name } : omitEdgeName(edge);
  }
  if (field === 'conditionType') {
    if (value === 'field') return { ...edge, condition: { type: 'field', field: '', operator: 'eq', value: '' } };
    if (value === 'expression') return { ...edge, condition: { type: 'expression', expression: '' } };
    return omitEdgeCondition(edge);
  }
  if (edge.condition?.type === 'field') {
    if (field === 'conditionField') return { ...edge, condition: { ...edge.condition, field: String(value ?? '') } };
    if (field === 'conditionOperator') {
      return {
        ...edge,
        condition: {
          ...edge.condition,
          operator: String(value ?? 'eq') as Extract<TriggerWorkflowEdge['condition'], { type: 'field' }>['operator']
        }
      };
    }
    if (field === 'conditionValue') return { ...edge, condition: { ...edge.condition, value } };
  }
  if (edge.condition?.type === 'expression' && field === 'conditionExpression') {
    return { ...edge, condition: { ...edge.condition, expression: String(value ?? '') } };
  }
  return edge;
}

function createBasicFields() {
  return [
    textField('id', '节点 ID', { disabled: true }),
    textField('name', '节点名称', { placeholder: '请输入节点名称' }, true),
    textareaField('description', '节点说明', 3, { placeholder: '说明节点的业务用途', resize: 'vertical' })
  ];
}

function createNodeConfigSection(type: TriggerNodeType): FormSection {
  if (type === 'schedule') {
    return {
      key: 'trigger',
      label: '触发设置',
      fields: [
        textField('cron', 'Cron 表达式', { placeholder: '例如：0 8 * * *' }, true),
        textField('timezone', '时区', { placeholder: 'Asia/Shanghai' }),
        textField('externalId', '外部标识', { placeholder: '用于同步 Trigger.dev 计划' })
      ]
    };
  }

  if (type === 'webhook') {
    return {
      key: 'trigger',
      label: '触发设置',
      fields: [
        textField('webhookPath', '请求路径', { placeholder: '/events/created' }, true),
        selectField('webhookMethod', '请求方法', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
        textField('webhookSecretHeader', '签名请求头', { placeholder: '例如：x-webhook-signature' })
      ]
    };
  }

  if (type === 'manualApproval' || type === 'humanReview') {
    return {
      key: 'approval',
      label: type === 'humanReview' ? '复核设置' : '审批设置',
      fields: [
        selectField('assigneeType', '处理人类型', [
          { label: '用户', value: 'user' },
          { label: '角色', value: 'role' },
          { label: '团队', value: 'team' },
          { label: '表达式', value: 'expression' }
        ], true),
        textField('assigneeIds', '处理人标识', { placeholder: '多个标识使用逗号分隔' }),
        numberField('approvalTimeoutSeconds', '审批超时秒数', 1),
        selectField('onTimeout', '超时策略', [
          { label: '标记失败', value: 'fail' },
          { label: '自动通过', value: 'autoApprove' },
          { label: '自动驳回', value: 'autoReject' },
          { label: '继续执行', value: 'continue' }
        ])
      ]
    };
  }

  if (type === 'wait') {
    return {
      key: 'wait',
      label: '等待设置',
      fields: [
        selectField('waitMode', '等待方式', [
          { label: '等待时长', value: 'duration' },
          { label: '指定时间', value: 'until' },
          { label: '等待令牌', value: 'token' }
        ], true),
        textField(
          'waitDuration',
          '等待时长',
          { placeholder: 'ISO 8601，例如：PT1H', visibleWhen: { field: 'waitMode', equals: 'duration' } },
          true
        ),
        textField(
          'waitUntil',
          '结束时间',
          { type: 'datetime-local', visibleWhen: { field: 'waitMode', equals: 'until' } },
          true
        ),
        textField(
          'waitTokenKey',
          '令牌键',
          { placeholder: '用于恢复执行的令牌标识', visibleWhen: { field: 'waitMode', equals: 'token' } },
          true
        )
      ]
    };
  }

  if (type === 'dataSource' || type === 'dataSink' || type === 'batchTrigger') {
    return {
      key: 'data',
      label: type === 'dataSource' ? '数据读取' : type === 'dataSink' ? '数据写入' : '批量设置',
      fields: createDataFields(type)
    };
  }

  if (type === 'transform') {
    return {
      key: 'transform',
      label: '转换设置',
      fields: [
        textareaField('expression', '处理表达式', 5, { placeholder: '填写数据映射或转换表达式' }),
        jsonField('dataMapping', '字段映射', '编辑字段映射', 'object')
      ]
    };
  }

  if (type === 'agent') {
    return {
      key: 'ai',
      label: '智能体设置',
      fields: createAiFields()
    };
  }

  if (type === 'tool') {
    return {
      key: 'tool',
      label: '工具设置',
      fields: [
        textField('aiTools', '工具名称', { placeholder: '多个工具使用逗号分隔' }),
        textField('memoryKey', '上下文记忆键', { placeholder: '{{payload.customerId}}' })
      ]
    };
  }

  if (type === 'memory') {
    return {
      key: 'memory',
      label: '记忆设置',
      fields: [textField('memoryKey', '记忆键', { placeholder: '{{payload.customerId}}' }, true)]
    };
  }

  if (type === 'condition') {
    return {
      key: 'branch',
      label: '分支设置',
      fields: [
        textareaField('expression', '预处理表达式', 4, { placeholder: '可选；实际分支条件在连接线上配置' }),
        jsonField('branches', '分支元数据', '编辑分支元数据', 'array')
      ]
    };
  }

  if (type === 'parallel') {
    return {
      key: 'branch',
      label: '并行设置',
      fields: [jsonField('branches', '分支元数据', '编辑并行分支元数据', 'array')]
    };
  }

  return { key: 'config', label: '节点设置', fields: [] };
}

function createTaskSections(type: TriggerNodeType): FormSection[] {
  const requiresTaskId = ['task', 'triggerAndWait', 'batchTrigger', 'tool'].includes(type);
  return [
    {
      key: 'task',
      label: '任务配置',
      fields: [
        selectField('taskType', '任务类型', [
          { label: '发送前端指令', value: 'frontendCommand' },
          { label: '执行后端指令', value: 'backendCommand' },
          { label: '执行存储过程', value: 'storedProcedure' },
          { label: '已注册 Trigger.dev 任务', value: 'registeredTask' }
        ], true),
        codeField(
          'frontendFunction',
          '前端指令函数',
          '编辑前端指令函数',
          'frontendCommand',
          'async ({ payload, variables, previousOutput, context }) => {\n  return { code: \'message.show\', params: { message: \'执行成功\', type: \'success\' } };\n}'
        ),
        codeField(
          'backendFunction',
          '后端指令函数',
          '编辑后端指令函数',
          'backendCommand',
          'async ({ payload, variables, previousOutput, context }) => {\n  return await context.http.get(\'/api/example\');\n}'
        ),
        textField(
          'procedureName',
          '存储过程名称',
          {
            placeholder: '例如：planning_publish_plan_version',
            visibleWhen: { field: 'taskType', equals: 'storedProcedure' }
          },
          true
        ),
        textField('procedureSchema', '存储过程架构', {
          placeholder: 'public',
          visibleWhen: { field: 'taskType', equals: 'storedProcedure' }
        }),
        textField(
          'taskId',
          '任务 ID',
          {
            placeholder: 'Trigger.dev 任务标识',
            visibleWhen: { field: 'taskType', equals: 'registeredTask' }
          },
          requiresTaskId
        ),
        textField('taskImportPath', '任务导入路径', {
          placeholder: '由后端任务注册表解析',
          visibleWhen: { field: 'taskType', equals: 'registeredTask' }
        }),
        jsonField('taskInput', '输入参数', '编辑任务输入参数', 'object'),
        textField('outputPath', '输出变量路径', { placeholder: '例如：taskOutputs.sendMessage' }),
        jsonField('outputMapping', '输出映射', '编辑任务输出映射', 'object')
      ]
    },
    {
      key: 'execution',
      label: '执行策略',
      fields: [
        numberField('timeoutSeconds', '超时秒数', 1),
        selectField('failureStrategy', '失败策略', [
          { label: '终止流程', value: 'failWorkflow' },
          { label: '记录失败并继续', value: 'continue' },
          { label: '使用默认输出并继续', value: 'useDefaultOutput' }
        ]),
        jsonField(
          'defaultOutput',
          '默认输出',
          '编辑失败时默认输出',
          'object',
          undefined,
          { field: 'failureStrategy', equals: 'useDefaultOutput' }
        ),
        textField('idempotencyKey', '幂等键', { placeholder: '{{runId}} 或业务唯一键' }),
        numberField('priority', '优先级', 0, 1, 100),
        textField('taskTags', '运行标签', { placeholder: '多个标签使用逗号分隔' }),
        selectField('queueName', '执行队列', [
          { label: '使用任务默认队列', value: '' },
          ...TRIGGER_WORKFLOW_REGISTERED_QUEUES.map((queue) => ({
            label: `${queue.label}（并发 ${queue.concurrencyLimit}）`,
            value: queue.name
          }))
        ]),
        numberField('maxAttempts', '最大尝试次数', 0),
        numberField('retryFactor', '重试退避倍数', 1, 0.1),
        numberField('retryMinTimeoutMs', '最小重试间隔（毫秒）', 0),
        numberField('retryMaxTimeoutMs', '最大重试间隔（毫秒）', 0)
      ]
    }
  ];
}

function createDataFields(type: TriggerNodeType) {
  const connectorRequired = type === 'dataSource' || type === 'dataSink';
  return [
    textField('connector', '连接器', { placeholder: 'postgres / http / salesforce' }, connectorRequired),
    selectField('operation', '数据操作', [
      { label: '提取', value: 'extract' },
      { label: '写入', value: 'load' },
      { label: '同步', value: 'sync' },
      { label: '查询', value: 'query' },
      { label: '更新或插入', value: 'upsert' }
    ]),
    textField('source', '数据源', { placeholder: '表、接口或对象名称' }),
    textField('target', '目标位置', { placeholder: '目标表、接口或对象名称' }),
    numberField('batchSize', '批次大小', 1),
    jsonField('dataMapping', '字段映射', '编辑数据字段映射', 'object')
  ];
}

function createAiFields() {
  return [
    selectField('aiProvider', '模型服务', [
      { label: 'OpenAI', value: 'openai' },
      { label: 'Anthropic', value: 'anthropic' },
      { label: '自定义', value: 'custom' }
    ], true),
    textField('aiModel', '模型名称', { placeholder: '例如：gpt-4.1' }, true),
    textareaField('aiPrompt', '系统提示词', 8, { placeholder: '描述角色、目标、边界和输出格式' }),
    textField('aiTools', '可用工具', { placeholder: '多个工具使用逗号分隔' }),
    textField('memoryKey', '上下文记忆键', { placeholder: '{{payload.customerId}}' }),
    numberField('aiMaxTurns', '最大轮次', 1),
    {
      field: 'requireHumanReview',
      label: '需要人工复核',
      component: 'vxe-switch',
      props: { openLabel: '需要', closeLabel: '不需要' }
    }
  ];
}

function createAdvancedFields() {
  return [
    jsonField('metadata', '运行元数据', '编辑运行元数据', 'object'),
    jsonField('rawConfig', '完整配置', '编辑节点完整配置', 'object', '修改后将替换节点的全部 config。')
  ];
}

function createTabbedSchema(sections: FormSection[]): TriggerInspectorFormSchema {
  const activeSections = sections.filter((section) => section.fields.length);
  return {
    columns: 1,
    fields: activeSections.flatMap((section) => section.fields),
    layout: [
      {
        kind: 'tabs',
        defaultKey: activeSections[0]?.key,
        tabs: activeSections.map((section) => ({
          key: section.key,
          label: section.label,
          blocks: section.fields.map((field) => ({ kind: 'field' as const, field: field.field }))
        }))
      }
    ],
    actions: []
  };
}

function textField(
  field: string,
  label: string,
  props: Record<string, unknown> = {},
  required = false
): TriggerInspectorFormField {
  return {
    field,
    label,
    component: 'vxe-input',
    props: { clearable: !props.disabled, ...props },
    ...(required ? { rules: [{ required: true, message: `${label}不能为空` }] } : {})
  };
}

function textareaField(
  field: string,
  label: string,
  rows: number,
  props: Record<string, unknown> = {}
): TriggerInspectorFormField {
  return {
    field,
    label,
    component: 'vxe-textarea',
    props: { rows, resize: 'vertical', ...props }
  };
}

function numberField(
  field: string,
  label: string,
  min: number,
  step = 1,
  max?: number
): TriggerInspectorFormField {
  return {
    field,
    label,
    component: 'lc-number-input',
    props: { min, step, ...(max !== undefined ? { max } : {}), controls: true }
  };
}

function selectField(
  field: string,
  label: string,
  options: string[] | Array<{ label: string; value: string }>,
  required = false
): TriggerInspectorFormField {
  return {
    field,
    label,
    component: 'vxe-select',
    props: { clearable: false },
    options: options.map((option) =>
      typeof option === 'string' ? { label: option, value: option } : option
    ),
    ...(required ? { rules: [{ required: true, message: `${label}不能为空` }] } : {})
  };
}

function jsonField(
  field: string,
  label: string,
  dialogTitle: string,
  rootType: 'object' | 'array',
  help?: string,
  visibleWhen?: Record<string, unknown>
): TriggerInspectorFormField {
  return {
    field,
    label,
    component: 'lc-json-editor',
    ...(help ? { help } : {}),
    props: {
      dialogTitle,
      jsonRootType: rootType,
      jsonValueMode: 'parsed',
      placeholder: '打开 JSON 编辑器',
      ...(visibleWhen ? { visibleWhen } : {})
    }
  };
}

function codeField(
  field: string,
  label: string,
  dialogTitle: string,
  taskType: TriggerWorkflowTaskType,
  placeholder: string
): TriggerInspectorFormField {
  return {
    field,
    label,
    component: 'lc-monaco-editor',
    props: {
      dialog: true,
      dialogTitle,
      language: 'javascript',
      theme: 'vs',
      editorHeight: 'min(540px, calc(100vh - 250px))',
      placeholder,
      visibleWhen: { field: 'taskType', equals: taskType },
      editorOptions: {
        wordWrap: 'on',
        formatOnPaste: true,
        formatOnType: true
      }
    },
    rules: [{ required: true, message: `${label}不能为空` }]
  };
}

export const triggerTaskFormFields = createTaskSections('task').flatMap(
  (section) => section.fields
);

export const triggerTaskFormTabs = createTaskSections('task').map((section) => ({
  key: section.key,
  label: section.label,
  fields: section.fields.map((field) => field.field)
}));

function normalizeNodeFieldValue(field: string, value: unknown) {
  if (field === 'assigneeIds' || field === 'aiTools' || field === 'taskTags') return toStringList(value);
  if (field === 'requireHumanReview') return value === true;
  if (integerFields.has(field)) {
    const minimum = field === 'maxAttempts' || field.startsWith('retry') ? 0 : 1;
    return toOptionalInteger(value, minimum);
  }
  if (field === 'retryFactor') return toOptionalNumber(value, 1);
  if (
    field === 'dataMapping' ||
    field === 'metadata' ||
    field === 'taskInput' ||
    field === 'outputMapping'
  ) return isRecord(value) ? cloneValue(value) : {};
  if (field === 'defaultOutput') return cloneValue(value ?? {});
  if (field === 'branches') return Array.isArray(value) ? cloneValue(value) : [];
  return typeof value === 'string' ? value : value ?? '';
}

function resolveTaskType(task?: TriggerWorkflowTaskRef): TriggerWorkflowTaskType {
  if (task?.type) return task.type;
  if (task?.frontendFunction) return 'frontendCommand';
  if (task?.backendFunction) return 'backendCommand';
  if (task?.procedureName) return 'storedProcedure';
  return 'registeredTask';
}

function enhanceTaskFormSchema(
  node: TriggerWorkflowNode,
  schema: TriggerInspectorFormSchema
) {
  const cloned = cloneValue(schema);
  if (!taskNodeTypes.has(node.type)) return cloned;

  const builtIn = createTriggerNodeFormSchema(node);
  const requiredFields = new Set(
    createTaskSections(node.type).flatMap((section) => section.fields.map((field) => field.field))
  );
  const taskFields = builtIn.fields.filter((field) => requiredFields.has(field.field));
  const firstTaskIndex = cloned.fields.findIndex((field) => requiredFields.has(field.field));
  const insertionIndex = firstTaskIndex < 0 ? cloned.fields.length : firstTaskIndex;
  cloned.fields = [
    ...cloned.fields.slice(0, insertionIndex).filter((field) => !requiredFields.has(field.field)),
    ...taskFields,
    ...cloned.fields.slice(insertionIndex).filter((field) => !requiredFields.has(field.field))
  ];
  const tabsLayout = cloned.layout?.find((item) => item.kind === 'tabs');
  if (!tabsLayout || tabsLayout.kind !== 'tabs') return createTriggerNodeFormSchema(node);

  const builtInTabs = builtIn.layout?.find((item) => item.kind === 'tabs');
  if (!builtInTabs || builtInTabs.kind !== 'tabs') return cloned;
  for (const key of ['task', 'execution']) {
    const sourceTab = builtInTabs.tabs.find((tab) => tab.key === key);
    if (!sourceTab) continue;
    const targetTab = tabsLayout.tabs.find(
      (tab) => tab.key === key || (key === 'execution' && tab.key === 'queue-retry')
    );
    if (targetTab) {
      targetTab.key = key;
      targetTab.label = sourceTab.label;
      targetTab.blocks = sourceTab.blocks;
    } else {
      const advancedIndex = tabsLayout.tabs.findIndex((tab) => tab.key === 'advanced');
      tabsLayout.tabs.splice(advancedIndex < 0 ? tabsLayout.tabs.length : advancedIndex, 0, sourceTab);
    }
  }
  return cloned;
}

function toStringList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toOptionalInteger(value: unknown, min: number) {
  const parsed = toOptionalNumber(value, min);
  return parsed === undefined ? undefined : Math.round(parsed);
}

function toOptionalNumber(value: unknown, min: number) {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : undefined;
}

function setNestedValue(target: Record<string, unknown>, path: string[], value: unknown) {
  let current = target;
  path.forEach((segment, index) => {
    if (index === path.length - 1) {
      if (value === undefined) delete current[segment];
      else current[segment] = value;
      return;
    }
    if (!isRecord(current[segment])) current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  });
}

function validateLayoutNodes(layout: unknown[], fields: string[]) {
  layout.forEach((node, index) => {
    if (!isRecord(node)) throw new Error(`Schema.layout[${index}] 必须是对象。`);
    if (node.kind === 'field') {
      const field = readText(node.field);
      if (!field) throw new Error(`Schema.layout[${index}] 缺少 field。`);
      fields.push(field);
      return;
    }
    if (node.kind === 'stack') {
      if (!Array.isArray(node.blocks)) throw new Error(`Schema.layout[${index}].blocks 必须是数组。`);
      validateLayoutNodes(node.blocks, fields);
      return;
    }
    if (node.kind === 'row') {
      if (!Array.isArray(node.columns) || !node.columns.length) {
        throw new Error(`Schema.layout[${index}].columns 不能为空。`);
      }
      node.columns.forEach((column, columnIndex) => {
        if (!isRecord(column) || !Array.isArray(column.blocks)) {
          throw new Error(`Schema.layout[${index}].columns[${columnIndex}] 无效。`);
        }
        validateLayoutNodes(column.blocks, fields);
      });
      return;
    }
    if (node.kind === 'tabs') {
      if (!Array.isArray(node.tabs) || !node.tabs.length) {
        throw new Error(`Schema.layout[${index}].tabs 不能为空。`);
      }
      const tabKeys = new Set<string>();
      node.tabs.forEach((tab, tabIndex) => {
        if (!isRecord(tab)) throw new Error(`Schema.layout[${index}].tabs[${tabIndex}] 必须是对象。`);
        const key = readText(tab.key);
        const label = readText(tab.label);
        if (!key || !label || !Array.isArray(tab.blocks)) {
          throw new Error(`Schema.layout[${index}].tabs[${tabIndex}] 缺少 key、label 或 blocks。`);
        }
        if (tabKeys.has(key)) throw new Error(`节点属性布局存在重复页签：${key}。`);
        tabKeys.add(key);
        validateLayoutNodes(tab.blocks, fields);
      });
      const defaultKey = readText(node.defaultKey);
      if (defaultKey && !tabKeys.has(defaultKey)) {
        throw new Error(`节点属性布局的默认页签不存在：${defaultKey}。`);
      }
      return;
    }
    throw new Error(`Schema.layout[${index}] 的 kind 无效。`);
  });
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function omitDescription(node: TriggerWorkflowNode) {
  const { description: _description, ...rest } = node;
  return rest;
}

function omitEdgeName(edge: TriggerWorkflowEdge) {
  const { name: _name, ...rest } = edge;
  return rest;
}

function omitEdgeCondition(edge: TriggerWorkflowEdge) {
  const { condition: _condition, ...rest } = edge;
  return rest;
}
