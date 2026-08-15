import { TRIGGER_WORKFLOW_SCHEMA_VERSION, type TriggerWorkflowModel } from '../schema/types';

const customRuntimeNote = '自定义任务运行时接入后可执行。';

const taskExamples: readonly TriggerWorkflowModel[] = [
  {
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: 'example_frontend_order_success_message',
    name: '示例：订单完成前端提示',
    description: `手动启动后生成 message.show 前端指令，向当前用户提示订单处理完成。${customRuntimeNote}`,
    kind: 'custom',
    variables: [
      { key: 'orderNo', label: '订单编号', type: 'string', source: 'payload', required: true }
    ],
    nodes: [
      startNode('manual_start', '手动启动'),
      taskNode('show_success_message', '显示订单完成消息', {
        type: 'frontendCommand',
        frontendFunction: [
          'async ({ payload }) => {',
          "  const orderNo = payload.orderNo ?? '未知订单';",
          '  return {',
          "    code: 'message.show',",
          "    params: { message: `订单 ${orderNo} 已处理完成`, type: 'success', duration: 5000 }",
          '  };',
          '}'
        ].join('\n'),
        input: { orderNo: '{{payload.orderNo}}' },
        outputPath: 'taskOutputs.frontendMessage',
        failureStrategy: 'continue',
        timeoutSeconds: 30,
        priority: 50,
        tags: ['example', 'frontend-command']
      }),
      endNode('end', '提示完成')
    ],
    edges: chainEdges('manual_start', 'show_success_message', 'end')
  },
  {
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: 'example_backend_http_planning_scenarios',
    name: '示例：HTTP 查询排产场景',
    description: `Webhook 收到请求后，通过 context.http 调用显式允许的 HTTP API。${customRuntimeNote}`,
    kind: 'custom',
    nodes: [
      webhookNode('request_received', '收到查询请求', '/workflow-examples/planning-scenarios'),
      taskNode('query_status', 'HTTP 查询服务状态', {
        type: 'backendCommand',
        backendFunction: [
          'async ({ context }) => {',
          "  return await context.http.get('/api/auth/account-options?login=workflow-example');",
          '}'
        ].join('\n'),
        input: {},
        outputPath: 'taskOutputs.httpResponse',
        failureStrategy: 'failWorkflow',
        timeoutSeconds: 30,
        retry: { maxAttempts: 3, factor: 2, minTimeoutMs: 1000, maxTimeoutMs: 10000 },
        tags: ['example', 'backend-command', 'http']
      }),
      endNode('end', '查询完成')
    ],
    edges: chainEdges('request_received', 'query_status', 'end')
  },
  {
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: 'example_backend_supabase_inventory_query',
    name: '示例：Supabase 读取库存资源配置',
    description: `Webhook 收到请求后，通过 context.supabase.rpc 读取库存缓冲区的动态资源配置摘要。${customRuntimeNote}`,
    kind: 'custom',
    nodes: [
      webhookNode('inventory_resource_requested', '收到资源查询', '/workflow-examples/inventory-resource'),
      taskNode('query_inventory_resource', 'Supabase 读取库存资源配置', {
        type: 'backendCommand',
        backendFunction: [
          'async ({ context }) => {',
          "  const hash = await context.supabase.rpc('get_dynamic_crud_resource_hash', {",
          "    p_resource_name: 'planning_buffer',",
          "    p_table_name: 'planning_buffer'",
          '  });',
          "  return { resource: 'planning_buffer', configHash: hash };",
          '}'
        ].join('\n'),
        input: {},
        outputPath: 'taskOutputs.inventoryResource',
        failureStrategy: 'useDefaultOutput',
        defaultOutput: { resource: 'planning_buffer', configHash: null },
        timeoutSeconds: 45,
        retry: { maxAttempts: 2, factor: 2, minTimeoutMs: 1000, maxTimeoutMs: 5000 },
        tags: ['example', 'backend-command', 'supabase']
      }),
      endNode('end', '资源查询完成')
    ],
    edges: chainEdges('inventory_resource_requested', 'query_inventory_resource', 'end')
  },
  {
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: 'example_backend_base_service_inventory',
    name: '示例：BaseService 查询库存',
    description: `手动启动后，通过 context.baseService 调用受限的 planning.listInventoryBuffers capability 查询库存缓冲。${customRuntimeNote}`,
    kind: 'custom',
    nodes: [
      startNode('manual_start', '手动启动'),
      taskNode('list_inventory_buffers', 'BaseService 查询库存', {
        type: 'backendCommand',
        backendFunction: [
          'async ({ payload, context }) => {',
          '  const filters = {};',
          '  if (payload.itemId) filters.item_id = payload.itemId;',
          '  if (payload.locationId) filters.location_id = payload.locationId;',
          "  return await context.baseService.invoke('planning', 'listInventoryBuffers', {",
          '    itemId: filters.item_id,',
          '    locationId: filters.location_id,',
          '    limit: 50,',
          '  });',
          '}'
        ].join('\n'),
        input: {
          itemId: '{{payload.itemId}}',
          locationId: '{{payload.locationId}}'
        },
        outputPath: 'taskOutputs.inventoryBuffers',
        failureStrategy: 'failWorkflow',
        timeoutSeconds: 45,
        retry: { maxAttempts: 3, factor: 2, minTimeoutMs: 1000, maxTimeoutMs: 10000 },
        idempotencyKey: 'inventory-query-{{runId}}',
        priority: 40,
        tags: ['example', 'backend-command', 'base-service']
      }),
      endNode('end', '查询完成')
    ],
    edges: chainEdges('manual_start', 'list_inventory_buffers', 'end')
  },
  {
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: 'example_stored_procedure_publish_plan',
    name: '示例：存储过程发布计划版本',
    description: `手动启动后执行 public.planning_publish_plan_version 发布指定计划版本。${customRuntimeNote}`,
    kind: 'custom',
    variables: [
      { key: 'planVersionId', label: '计划版本 ID', type: 'string', source: 'payload', required: true }
    ],
    nodes: [
      startNode('manual_start', '手动启动'),
      taskNode('publish_plan_version', '发布计划版本', {
        type: 'storedProcedure',
        procedureSchema: 'public',
        procedureName: 'planning_publish_plan_version',
        input: {
          p_account_id: '{{accountId}}',
          p_version_id: '{{payload.planVersionId}}'
        },
        outputPath: 'taskOutputs.publishedPlanVersion',
        failureStrategy: 'failWorkflow',
        timeoutSeconds: 120,
        idempotencyKey: 'publish-plan-{{payload.planVersionId}}',
        priority: 80,
        tags: ['example', 'stored-procedure', 'planning']
      }),
      endNode('end', '发布完成')
    ],
    edges: chainEdges('manual_start', 'publish_plan_version', 'end')
  },
  {
    schemaVersion: TRIGGER_WORKFLOW_SCHEMA_VERSION,
    code: 'example_registered_notification_dispatch',
    name: '示例：已注册任务发送通知',
    description: 'Webhook 收到业务事件后，调用已注册的 notification.dispatch Trigger.dev 任务发送通知。',
    kind: 'custom',
    nodes: [
      webhookNode('event_received', '收到业务事件', '/workflow-examples/notifications'),
      taskNode('dispatch_notification', '发送业务通知', {
        type: 'registeredTask',
        id: 'notification.dispatch',
        input: {
          tenantId: '{{accountId}}',
          event: {
            tenantId: '{{accountId}}',
            eventType: 'workflow.example.completed',
            sourceType: 'trigger-workflow',
            sourceId: '{{runId}}',
            payload: {
              title: '{{payload.title}}',
              content: '{{payload.content}}',
              recipientIds: '{{payload.recipientIds}}'
            },
            idempotencyKey: 'workflow-example-notification-{{runId}}'
          }
        },
        outputPath: 'taskOutputs.notification',
        failureStrategy: 'failWorkflow',
        timeoutSeconds: 120,
        retry: { maxAttempts: 3, factor: 2, minTimeoutMs: 1000, maxTimeoutMs: 10000 },
        idempotencyKey: 'notification-{{runId}}',
        priority: 60,
        tags: ['example', 'registered-task', 'notification']
      }),
      endNode('end', '通知完成')
    ],
    edges: chainEdges('event_received', 'dispatch_notification', 'end')
  }
];

export function createTriggerWorkflowTaskExamples(): TriggerWorkflowModel[] {
  return structuredClone(taskExamples) as TriggerWorkflowModel[];
}

function startNode(id: string, name: string) {
  return {
    id,
    type: 'start' as const,
    name,
    position: { x: 380, y: 40 },
    config: { metadata: { triggerMode: 'manual', example: true } }
  };
}

function webhookNode(id: string, name: string, path: string) {
  return {
    id,
    type: 'webhook' as const,
    name,
    position: { x: 380, y: 40 },
    config: {
      webhook: { path, method: 'POST' as const },
      metadata: { example: true }
    }
  };
}

function taskNode(
  id: string,
  name: string,
  task: NonNullable<NonNullable<TriggerWorkflowModel['nodes'][number]['config']>['task']>
) {
  return {
    id,
    type: 'task' as const,
    name,
    position: { x: 380, y: 220 },
    config: { task, metadata: { example: true } }
  };
}

function endNode(id: string, name: string) {
  return {
    id,
    type: 'end' as const,
    name,
    position: { x: 380, y: 400 }
  };
}

function chainEdges(...nodeIds: string[]) {
  return nodeIds.slice(0, -1).map((source, index) => ({
    id: `edge_${source}_${nodeIds[index + 1]}`,
    source,
    target: nodeIds[index + 1]
  }));
}
