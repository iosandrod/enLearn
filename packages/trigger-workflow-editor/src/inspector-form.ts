import type {
  TriggerWorkflowEdge,
  TriggerWorkflowNode
} from './schema/types';

export type TriggerInspectorFormOption = {
  label: string;
  value: string | number;
};

export type TriggerInspectorFormField = {
  field: string;
  label: string;
  component: string;
  props?: Record<string, unknown>;
  options?: TriggerInspectorFormOption[];
  rules?: Array<{ required?: boolean; min?: number; message: string }>;
};

export type TriggerInspectorFormSchema = {
  columns: number;
  fields: TriggerInspectorFormField[];
  layout: Array<{ kind: 'field'; field: string }>;
  actions: [];
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
  taskId: ['task', 'id'],
  queueName: ['task', 'queue', 'name'],
  concurrencyLimit: ['task', 'queue', 'concurrencyLimit'],
  maxAttempts: ['task', 'retry', 'maxAttempts'],
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
  aiProvider: ['ai', 'provider'],
  aiModel: ['ai', 'model'],
  aiPrompt: ['ai', 'prompt'],
  aiMaxTurns: ['ai', 'maxTurns'],
  requireHumanReview: ['ai', 'requireHumanReview'],
  memoryKey: ['ai', 'memoryKey'],
  expression: ['expression']
};

const positiveIntegerFields = new Set([
  'concurrencyLimit',
  'timeoutSeconds',
  'approvalTimeoutSeconds',
  'batchSize',
  'aiMaxTurns'
]);

export function createTriggerNodeFormSchema(node: TriggerWorkflowNode): TriggerInspectorFormSchema {
  const fields: TriggerInspectorFormField[] = [
    textField('id', '节点 ID', { disabled: true }),
    textField('name', '节点名称', { placeholder: '请输入节点名称' }, true),
    {
      field: 'description',
      label: '节点说明',
      component: 'vxe-textarea',
      props: { placeholder: '可选', rows: 2, resize: 'none' }
    }
  ];

  if (node.type === 'schedule') {
    fields.push(
      textField('cron', 'Cron 表达式', { placeholder: '例如：0 8 * * *' }, true),
      textField('timezone', '时区', { placeholder: 'Asia/Shanghai' }),
      textField('externalId', '外部标识')
    );
  }

  if (node.type === 'webhook') {
    fields.push(
      textField('webhookPath', '请求路径', { placeholder: '/events/created' }),
      selectField('webhookMethod', '请求方法', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
    );
  }

  if (taskNodeTypes.has(node.type)) {
    fields.push(
      textField('taskId', '任务 ID', { placeholder: '业务任务标识' }),
      textField('queueName', '队列名称'),
      numberField('concurrencyLimit', '并发数', 1),
      numberField('maxAttempts', '重试次数', 0),
      numberField('timeoutSeconds', '超时秒数', 1),
      textField('idempotencyKey', '幂等键')
    );
  }

  if (node.type === 'manualApproval' || node.type === 'humanReview') {
    fields.push(
      selectField('assigneeType', '处理人类型', [
        { label: '用户', value: 'user' },
        { label: '角色', value: 'role' },
        { label: '团队', value: 'team' },
        { label: '表达式', value: 'expression' }
      ]),
      textField('assigneeIds', '处理人标识', { placeholder: '多个标识使用逗号分隔' }),
      numberField('approvalTimeoutSeconds', '审批超时秒数', 1),
      selectField('onTimeout', '超时策略', [
        { label: '标记失败', value: 'fail' },
        { label: '自动通过', value: 'autoApprove' },
        { label: '自动驳回', value: 'autoReject' },
        { label: '继续执行', value: 'continue' }
      ])
    );
  }

  if (node.type === 'wait') {
    const mode = node.config?.wait?.mode ?? 'duration';
    fields.push(selectField('waitMode', '等待方式', [
      { label: '等待时长', value: 'duration' },
      { label: '指定时间', value: 'until' },
      { label: '等待令牌', value: 'token' }
    ]));
    if (mode === 'duration') fields.push(textField('waitDuration', '等待时长', { placeholder: '例如：PT1H' }));
    if (mode === 'until') fields.push(textField('waitUntil', '结束时间', { type: 'datetime-local' }));
    if (mode === 'token') fields.push(textField('waitTokenKey', '令牌键'));
  }

  if (node.type === 'dataSource' || node.type === 'dataSink' || node.type === 'batchTrigger') {
    fields.push(
      textField('connector', '连接器'),
      selectField('operation', '数据操作', [
        { label: '提取', value: 'extract' },
        { label: '写入', value: 'load' },
        { label: '同步', value: 'sync' },
        { label: '查询', value: 'query' },
        { label: '更新或插入', value: 'upsert' }
      ]),
      textField('source', '数据源'),
      textField('target', '目标位置'),
      numberField('batchSize', '批次大小', 1)
    );
  }

  if (node.type === 'agent') {
    fields.push(
      selectField('aiProvider', '模型服务', [
        { label: 'OpenAI', value: 'openai' },
        { label: 'Anthropic', value: 'anthropic' },
        { label: '自定义', value: 'custom' }
      ]),
      textField('aiModel', '模型名称'),
      {
        field: 'aiPrompt',
        label: '系统提示词',
        component: 'vxe-textarea',
        props: { rows: 4, resize: 'vertical' }
      },
      numberField('aiMaxTurns', '最大轮次', 1),
      {
        field: 'requireHumanReview',
        label: '需要人工复核',
        component: 'vxe-switch'
      }
    );
  }

  if (node.type === 'memory') fields.push(textField('memoryKey', '记忆键'));
  if (node.type === 'condition' || node.type === 'transform') {
    fields.push({
      field: 'expression',
      label: '处理表达式',
      component: 'vxe-textarea',
      props: { rows: 3, resize: 'vertical' }
    });
  }

  fields.push({
    field: 'rawConfig',
    label: '高级配置',
    component: 'lc-json-editor',
    props: {
      dialogTitle: '编辑节点高级配置',
      jsonRootType: 'object',
      jsonValueMode: 'parsed',
      placeholder: '打开 JSON 编辑器'
    }
  });

  return createSchema(fields);
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
    taskId: config.task?.id ?? '',
    queueName: config.task?.queue?.name ?? '',
    concurrencyLimit: config.task?.queue?.concurrencyLimit,
    maxAttempts: config.task?.retry?.maxAttempts,
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
    aiProvider: config.ai?.provider ?? 'openai',
    aiModel: config.ai?.model ?? '',
    aiPrompt: config.ai?.prompt ?? '',
    aiMaxTurns: config.ai?.maxTurns,
    requireHumanReview: config.ai?.requireHumanReview ?? false,
    memoryKey: config.ai?.memoryKey ?? '',
    expression: config.expression ?? '',
    rawConfig: cloneRecord(config)
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
    return { ...node, config: isRecord(value) ? cloneRecord(value) : {} };
  }

  const path = nodeFieldPaths[field];
  if (!path) return node;
  const config = cloneRecord(node.config ?? {});
  setNestedValue(config, path, normalizeNodeFieldValue(field, value));
  return { ...node, config };
}

export function createTriggerEdgeFormSchema(edge: TriggerWorkflowEdge): TriggerInspectorFormSchema {
  const conditionType = edge.condition?.type ?? 'always';
  const fields: TriggerInspectorFormField[] = [
    textField('name', '连接名称'),
    selectField('conditionType', '执行条件', [
      { label: '始终执行', value: 'always' },
      { label: '字段判断', value: 'field' },
      { label: '表达式判断', value: 'expression' }
    ])
  ];

  if (conditionType === 'field') {
    fields.push(
      textField('conditionField', '字段路径'),
      selectField('conditionOperator', '比较方式', [
        { label: '等于', value: 'eq' },
        { label: '不等于', value: 'ne' },
        { label: '大于', value: 'gt' },
        { label: '大于等于', value: 'gte' },
        { label: '小于', value: 'lt' },
        { label: '小于等于', value: 'lte' },
        { label: '包含', value: 'contains' },
        { label: '属于集合', value: 'in' }
      ]),
      textField('conditionValue', '比较值')
    );
  }

  if (conditionType === 'expression') {
    fields.push({
      field: 'conditionExpression',
      label: '条件表达式',
      component: 'vxe-textarea',
      props: { rows: 4, resize: 'vertical' }
    });
  }

  return createSchema(fields);
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

function createSchema(fields: TriggerInspectorFormField[]): TriggerInspectorFormSchema {
  return {
    columns: 1,
    fields,
    layout: fields.map((field) => ({ kind: 'field' as const, field: field.field })),
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

function numberField(field: string, label: string, min: number): TriggerInspectorFormField {
  return {
    field,
    label,
    component: 'lc-number-input',
    props: { min, controls: true }
  };
}

function selectField(
  field: string,
  label: string,
  options: string[] | Array<{ label: string; value: string }>
): TriggerInspectorFormField {
  return {
    field,
    label,
    component: 'vxe-select',
    props: { clearable: false },
    options: options.map((option) =>
      typeof option === 'string' ? { label: option, value: option } : option
    )
  };
}

function normalizeNodeFieldValue(field: string, value: unknown) {
  if (field === 'assigneeIds') {
    return String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (field === 'requireHumanReview') return value === true;
  if (field === 'maxAttempts') return toOptionalInteger(value, 0);
  if (positiveIntegerFields.has(field)) return toOptionalInteger(value, 1);
  return typeof value === 'string' ? value : value ?? '';
}

function toOptionalInteger(value: unknown, min: number) {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? Math.round(parsed) : undefined;
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

function cloneRecord(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
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
