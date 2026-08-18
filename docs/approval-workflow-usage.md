# 审批流框架使用文档

本文档面向后续发布 npm 和项目接入，按当前代码实现整理审批流框架、前端包 API、共享 Schema API、后端 REST API、参数与返回值类型。

当前日期：2026-07-27

## 1. 模块边界

审批流由三个模块组成：

| 模块 | 目录 | 发布定位 | 说明 |
|---|---|---|---|
| `@enlearn/approval-workflow` | `packages/approval-workflow` | 对外 npm 包 | Vue 3 审批流设计器、查看器、任务面板、时间线、工具函数，并重新导出 `@enlearn/workflow-schema` |
| `@enlearn/workflow-schema` | `packages/workflow-schema` | 对外 npm 包 | 流程 DSL 类型、标准化、校验、编译和节点注册表，供前后端共享 |
| Workflow domain | `api/src/workflow` | API 内部领域模块 | 由 `/api/service` 的 `serviceName: "workflow"` 直接调用，使用 PostgreSQL 业务投影和 Trigger.dev 持久化运行时 |

当前 Nuxt 示例页在 `frontend/pages/dashboard/workflow/designer.vue`，可作为接入参考。

运行时架构详见 [approval-workflow-triggerdev-runtime.md](./approval-workflow-triggerdev-runtime.md)。

## 2. 安装与快速接入

### 2.1 安装

发布到 npm 后，Vue 项目可安装：

```bash
pnpm add @enlearn/approval-workflow @enlearn/workflow-schema
```

`@enlearn/approval-workflow` 的 peer dependency 是：

| 依赖 | 类型 | 版本要求 |
|---|---|---|
| `vue` | peerDependency | `^3.5.0` |

`@vue-flow/core` 当前是 `@enlearn/approval-workflow` 的直接 dependency。

### 2.2 最小示例

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  ApprovalDesigner,
  createSimpleApprovalWorkflow,
  serializeWorkflowModel,
  type WorkflowModel,
  type WorkflowSchemaIssue
} from '@enlearn/approval-workflow';

const workflow = ref<WorkflowModel>(
  createSimpleApprovalWorkflow(
    { type: 'users', userIds: ['user-1'] },
    {
      code: 'expense_approval',
      name: '费用报销审批',
      documentType: 'expense'
    }
  )
);

function handleExport(model: WorkflowModel) {
  console.log(serializeWorkflowModel(model));
}

function handleValidation(issues: WorkflowSchemaIssue[]) {
  console.log(issues);
}
</script>

<template>
  <ApprovalDesigner
    v-model="workflow"
    @export="handleExport"
    @validation="handleValidation"
  />
</template>
```

## 3. npm 包导出

### 3.1 `@enlearn/approval-workflow`

根入口导出：

```ts
export { default as ApprovalDesigner } from './components/ApprovalDesigner.vue';
export { default as ApprovalFlowViewer } from './components/ApprovalFlowViewer.vue';
export { default as ApprovalTaskPanel } from './components/ApprovalTaskPanel.vue';
export { default as ApprovalTimeline } from './components/ApprovalTimeline.vue';

export * from './hooks/useWorkflowValidation';
export * from './types/task';
export * from './utils';
export * from '@enlearn/workflow-schema';
```

`package.json` 还开放了以下子路径：

| 子路径 | 说明 |
|---|---|
| `@enlearn/approval-workflow` | 根入口，推荐优先使用 |
| `@enlearn/approval-workflow/components/*` | 单独引入组件源文件，例如 `components/ApprovalFlowNode.vue` |
| `@enlearn/approval-workflow/hooks/*` | 单独引入 hooks |
| `@enlearn/approval-workflow/types/*` | 单独引入类型 |
| `@enlearn/approval-workflow/styles/*` | 预留样式出口，当前 `src/styles` 为空 |

### 3.2 `@enlearn/workflow-schema`

根入口导出：

```ts
export * from './schema/types';
export * from './schema/normalize';
export * from './node-registry';
export * from './compiler';
export * from './validator/validate';
```

`package.json` 开放的子路径：

| 子路径 | 说明 |
|---|---|
| `@enlearn/workflow-schema` | 根入口，推荐优先使用 |
| `@enlearn/workflow-schema/schema/*` | DSL 类型与标准化 |
| `@enlearn/workflow-schema/validator/*` | 校验器 |
| `@enlearn/workflow-schema/node-registry/*` | 内置节点注册表 |
| `@enlearn/workflow-schema/compiler/*` | 编译后的节点/连线索引 |

## 4. 前端组件 API

### 4.1 `ApprovalDesigner`

审批流可视化设计器。

引入：

```ts
import { ApprovalDesigner } from '@enlearn/approval-workflow';
```

Props：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `modelValue` | `WorkflowModel | undefined` | 内置简单流程 | 用于 `v-model` 的流程 DSL |
| `readonly` | `boolean` | `false` | 只读模式，禁用编辑、拖拽和布局操作 |

Emits：

| 事件 | 参数类型 | 触发时机 |
|---|---|---|
| `update:modelValue` | `(value: WorkflowModel) => void` | 流程结构或属性变化 |
| `change` | `(value: WorkflowModel) => void` | 与 `update:modelValue` 同步触发 |
| `export` | `(value: WorkflowModel) => void` | 点击设计器内“导出” |
| `validation` | `(issues: WorkflowSchemaIssue[]) => void` | 流程变更后返回校验结果 |

组件实例方法：

| 方法 | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `getSchema()` | 无 | `WorkflowModel` | 读取当前设计器 schema |
| `loadSchema(model)` | `WorkflowModel` | `void` | 加载 schema 并自动整理画布 |
| `validate()` | 无 | `WorkflowSchemaIssue[]` | 返回当前校验问题 |
| `autoLayout()` | 无 | `void` | 对当前画布执行自动布局，`readonly` 下不生效 |
| `simulateWorkflowBuild(model, options?)` | `WorkflowModel`, `{ intervalMs?: number }` | `Promise<void>` | 按节点逐步模拟生成流程，主要用于演示和测试页 |

示例：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  ApprovalDesigner,
  createOrderApprovalWorkflow,
  type WorkflowModel,
  type WorkflowSchemaIssue
} from '@enlearn/approval-workflow';

type ApprovalDesignerExpose = {
  getSchema: () => WorkflowModel;
  loadSchema: (model: WorkflowModel) => void;
  validate: () => WorkflowSchemaIssue[];
  autoLayout: () => void;
  simulateWorkflowBuild: (
    model: WorkflowModel,
    options?: { intervalMs?: number }
  ) => Promise<void>;
};

const designerRef = ref<ApprovalDesignerExpose | null>(null);
const model = ref(createOrderApprovalWorkflow());

function layout() {
  designerRef.value?.autoLayout();
}
</script>

<template>
  <button type="button" @click="layout">自动布局</button>
  <ApprovalDesigner ref="designerRef" v-model="model" />
</template>
```

### 4.2 `ApprovalFlowViewer`

审批流只读查看器。

Props：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `model` | `WorkflowModel | undefined` | 空流程 | 要展示的流程 DSL |

返回/事件：无。

示例：

```vue
<ApprovalFlowViewer :model="workflow" />
```

### 4.3 `ApprovalTaskPanel`

审批任务面板，用于展示待办并向外抛出操作事件。

Props：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `tasks` | `ApprovalTask[] | undefined` | `undefined` | 待办任务列表 |
| `loading` | `boolean | undefined` | `undefined` | 加载态 |

Emits：

| 事件 | 参数类型 | 说明 |
|---|---|---|
| `open` | `(task: ApprovalTask) => void` | 点击任务标题 |
| `approve` | `(task: ApprovalTask) => void` | 点击通过 |
| `reject` | `(task: ApprovalTask) => void` | 点击驳回 |

类型：

```ts
export type ApprovalTaskStatus = 'pending' | 'claimed' | 'completed' | 'canceled';

export type ApprovalTask = {
  id: string;
  title: string;
  nodeId: string;
  nodeName: string;
  status: ApprovalTaskStatus;
  assigneeId?: string;
  candidateNames?: string[];
  createdAt?: string;
  dueAt?: string;
};
```

### 4.4 `ApprovalTimeline`

审批时间线展示组件。

Props：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `events` | `ApprovalTimelineEvent[] | undefined` | `undefined` | 时间线事件 |

类型：

```ts
export type ApprovalTimelineEvent = {
  id: string;
  eventType: string;
  title: string;
  operatorName?: string;
  comment?: string;
  createdAt?: string;
  payload?: Record<string, unknown>;
};
```

### 4.5 `ApprovalFlowNode`

底层 Vue Flow 节点卡片组件。根入口不直接导出，但可通过子路径引入：

```ts
import ApprovalFlowNode from '@enlearn/approval-workflow/components/ApprovalFlowNode.vue';
```

Props：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `data` | `ApprovalFlowNodeData | undefined` | 默认审批节点展示数据 | 节点展示信息 |
| `selected` | `boolean` | `false` | 是否选中 |
| `connectable` | `HandleConnectable` | `true` | Vue Flow 连接控制 |
| `extendable` | `boolean` | `false` | 是否展示延伸按钮 |
| `branchable` | `boolean` | `false` | 是否展示分支按钮 |

Emits：

| 事件 | 参数 | 说明 |
|---|---|---|
| `extend` | 无 | 点击延伸按钮 |
| `branch` | 无 | 点击分支按钮 |

## 5. 前端工具 API

### 5.1 工作流模板与 JSON 工具

引入：

```ts
import {
  createEmptyWorkflowModel,
  createSimpleApprovalWorkflow,
  createOrderApprovalWorkflow,
  serializeWorkflowModel,
  parseWorkflowModelJson
} from '@enlearn/approval-workflow';
```

类型：

```ts
export type CreateWorkflowModelOptions = {
  code?: string;
  name?: string;
  documentType?: string;
};
```

API：

| API | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `createEmptyWorkflowModel(options?)` | `CreateWorkflowModelOptions` | `WorkflowModel` | 创建“开始 -> 结束”的空流程 |
| `createSimpleApprovalWorkflow(assigneeStrategy, options?)` | `AssigneeStrategy`, `CreateWorkflowModelOptions` | `WorkflowModel` | 创建“开始 -> 审批 -> 结束”的简单流程 |
| `createOrderApprovalWorkflow(options?)` | `CreateWorkflowModelOptions` | `WorkflowModel` | 创建覆盖高级节点的订单测试流程 |
| `serializeWorkflowModel(model)` | `WorkflowModel` | `string` | 标准化后格式化为 JSON 字符串 |
| `parseWorkflowModelJson(json)` | `string` | `WorkflowModel` | 解析 JSON、标准化并校验；失败时抛出异常 |

常量：

```ts
export const ORDER_APPROVAL_TEST_VARIABLES = {
  amount: 6800,
  customerLevel: 'VIP',
  riskLevel: 'medium',
  orderType: 'standard',
  orderNo: 'ORDER-20260726-0001'
};
```

### 5.2 `useWorkflowValidation`

Vue 校验 hook。

```ts
import { useWorkflowValidation } from '@enlearn/approval-workflow';
```

签名：

```ts
function useWorkflowValidation(model: Ref<WorkflowModel>): {
  issues: ComputedRef<WorkflowSchemaIssue[]>;
  errors: ComputedRef<WorkflowSchemaIssue[]>;
  warnings: ComputedRef<WorkflowSchemaIssue[]>;
  isValid: ComputedRef<boolean>;
};
```

### 5.3 Vue Flow 适配器

这些 API 从根入口导出，主要给二次开发设计器使用。

| API | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `workflowToFlowNodes(model)` | `WorkflowModel` | `ApprovalFlowNode[]` | 将 DSL 节点转换为 Vue Flow 节点 |
| `workflowToFlowEdges(model)` | `WorkflowModel` | `ApprovalFlowEdge[]` | 将 DSL 连线转换为 Vue Flow 连线 |
| `flowToWorkflowModel(model, nodes, edges)` | `WorkflowModel`, `ApprovalFlowNode[]`, `ApprovalFlowEdge[]` | `WorkflowModel` | 将 Vue Flow 状态写回 DSL |
| `connectionToWorkflowEdge(connection, edgeId)` | `Connection`, `string` | `ApprovalFlowEdge` | 将 Vue Flow 连接事件转成连线 |
| `getDefaultNodeName(type)` | `WorkflowNodeType` | `string` | 获取内置节点默认中文名 |
| `getNodePresentation(node)` | `WorkflowNode` | `ApprovalFlowNodeData` | 获取节点卡片展示数据 |
| `getNodeTypePresentation(type)` | `WorkflowNodeType` | `{ type; label; categoryLabel; icon; accent; accentSoft; accentBorder }` | 获取节点类型展示配置 |
| `autoLayoutFlowNodes(nodes, edges)` | `ApprovalFlowNode[]`, `ApprovalFlowEdge[]` | `ApprovalFlowNode[]` | 根据连线自动计算节点位置 |

常量：

```ts
export const APPROVAL_NODE_RENDER_TYPE = 'approval-card';
```

核心类型：

```ts
export type ApprovalFlowNodeData = {
  workflowType: WorkflowNodeType;
  label: string;
  typeLabel: string;
  categoryLabel: string;
  description?: string;
  icon: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  summary: string;
  isStart: boolean;
  isEnd: boolean;
};
```

## 6. 共享 Schema API

### 6.1 DSL 核心类型

```ts
export const WORKFLOW_SCHEMA_VERSION = 1;

export type WorkflowModel = {
  schemaVersion: number;
  id?: string;
  code: string;
  name: string;
  description?: string;
  tenantId?: string;
  documentType?: string;
  status?: WorkflowModelStatus;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: WorkflowVariable[];
  settings?: WorkflowSettings;
};
```

节点类型：

```ts
export type WorkflowNodeType =
  | 'start'
  | 'approval'
  | 'sign'
  | 'orSign'
  | 'condition'
  | 'cc'
  | 'parallelGateway'
  | 'serviceTask'
  | 'timer'
  | 'subProcess'
  | 'end'
  | (string & {});
```

审批人策略：

```ts
export type AssigneeStrategy =
  | { type: 'users'; userIds: string[] }
  | { type: 'roles'; roleCodes: string[] }
  | { type: 'departments'; departmentIds: string[] }
  | { type: 'initiatorManager'; level?: number }
  | { type: 'field'; field: string }
  | { type: 'expression'; expression: string };
```

条件：

```ts
export type WorkflowCondition = {
  type: 'always' | 'expression' | 'field';
  expression?: string;
  field?: string;
  operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value?: unknown;
};
```

校验问题：

```ts
export type WorkflowSchemaIssue = {
  level: 'error' | 'warning';
  path: string;
  message: string;
};
```

### 6.2 标准化 API

| API | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `isRecord(value)` | `unknown` | `value is Record<string, unknown>` | 判断是否为普通对象 |
| `normalizeWorkflowModel(value)` | `unknown` | `WorkflowModel` | 清洗输入，补默认值，过滤非法结构 |

`normalizeWorkflowModel` 默认行为：

- `schemaVersion` 非法时使用 `1`。
- `status` 非 `published`、`archived`、`disabled` 时使用 `draft`。
- `settings.allowCancel`、`settings.allowWithdraw` 默认 `true`。
- `settings.duplicateSubmitPolicy` 默认 `reject`。
- `settings.historyLevel` 默认 `full`。

### 6.3 校验 API

| API | 参数 | 返回值 | 异常 | 说明 |
|---|---|---|---|---|
| `validateWorkflowModel(model)` | `WorkflowModel` | `WorkflowSchemaIssue[]` | 无 | 返回错误和警告，不抛异常 |
| `assertValidWorkflowModel(model)` | `WorkflowModel` | `WorkflowSchemaIssue[]` | `WorkflowSchemaValidationError` | 存在 error 时抛异常，warning 会返回 |
| `prepareWorkflowModel(value)` | `unknown` | `WorkflowModel` | `WorkflowSchemaValidationError` | 先标准化再校验，适合导入 JSON |
| `formatWorkflowSchemaIssue(issue)` | `WorkflowSchemaIssue` | `string` | 无 | 格式化单条问题 |
| `formatWorkflowSchemaIssues(issues)` | `WorkflowSchemaIssue[]` | `string` | 无 | 格式化问题摘要 |

异常类型：

```ts
export class WorkflowSchemaValidationError extends Error {
  issues: WorkflowSchemaIssue[];
}
```

主要校验规则：

- 必须使用 `WORKFLOW_SCHEMA_VERSION`。
- `code`、`name` 必填。
- 必须且只能有一个 `start` 节点。
- 至少一个 `end` 节点。
- 节点 ID、连线 ID 不能重复。
- 连线 source/target 必须引用存在节点。
- 不允许自环。
- 除开始节点外必须有入线，除结束节点外必须有出线。
- 从开始节点出发，所有节点必须可达。
- `approval`、`sign`、`orSign` 必须配置合法审批人策略。
- `condition` 至少两条出线，且必须包含 `{ type: 'always' }` 兜底连线。
- `parallelGateway` 至少两条出线。

### 6.4 编译 API

```ts
export type CompiledWorkflowModel = {
  model: WorkflowModel;
  nodeMap: Map<string, WorkflowNode>;
  edgeMap: Map<string, WorkflowEdge>;
  outgoingEdges: Map<string, WorkflowEdge[]>;
  incomingEdges: Map<string, WorkflowEdge[]>;
};

export function compileWorkflowModel(model: WorkflowModel): CompiledWorkflowModel;
```

说明：

- `nodeMap`、`edgeMap` 便于按 ID 查询。
- `outgoingEdges` 会按 `priority` 升序排序。
- 执行器和校验器可复用该结构。

### 6.5 节点注册表 API

```ts
export type WorkflowNodeDefinition = {
  type: WorkflowNodeType;
  label: string;
  category: 'event' | 'task' | 'gateway' | 'notification';
  allowIncoming: boolean;
  allowOutgoing: boolean;
  minOutgoing?: number;
  maxOutgoing?: number;
};
```

导出：

| API | 类型 | 说明 |
|---|---|---|
| `builtInWorkflowNodeDefinitions` | `WorkflowNodeDefinition[]` | 内置节点定义 |
| `builtInWorkflowNodeTypeSet` | `Set<WorkflowNodeType>` | 内置节点类型集合 |
| `getBuiltInWorkflowNodeDefinition(type)` | `(type: WorkflowNodeType) => WorkflowNodeDefinition | undefined` | 查询单个内置节点 |
| `isBuiltInWorkflowNodeType(type)` | `(type: WorkflowNodeType) => boolean` | 判断是否内置节点 |

当前内置节点：

| type | label | category |
|---|---|---|
| `start` | 开始 | `event` |
| `approval` | 审批 | `task` |
| `sign` | 会签 | `task` |
| `orSign` | 或签 | `task` |
| `condition` | 条件 | `gateway` |
| `cc` | 抄送 | `notification` |
| `parallelGateway` | 并行网关 | `gateway` |
| `serviceTask` | 服务节点 | `task` |
| `timer` | 定时节点 | `event` |
| `subProcess` | 子流程 | `task` |
| `end` | 结束 | `event` |

## 7. 后端领域接口

本节中的 REST 路径是旧接口映射，仅用于理解动作语义。当前客户端必须通过
`POST /api/service` 调用，并使用 `serviceName: "workflow"` 与对应的
`serviceMethod`；这些旧路径不会再注册为 HTTP 路由。

### 7.1 服务信息

启动 API 网关：

```bash
pnpm api:dev
```

统一地址：

```text
http://localhost:3002/api/service
```

通用请求头：

| Header | 类型 | 必填 | 说明 |
|---|---|---|---|
| `Content-Type` | `application/json` | POST/PUT 必填 | JSON 请求体 |
| `x-tenant-id` | `string` | 否 | 租户 ID，未传默认 `default` |
| `x-user-id` | `string` | 否 | 当前用户 ID |
| `x-request-id` | `string` | 否 | 请求追踪，当前代码未消费 |
| `idempotency-key` | `string` | 否 | 幂等键，当前代码未实现 |

成功响应：

```ts
export type WorkflowApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

当前代码中成功响应由 `ok(data)` 包装为 `{ success: true, data }`。异常响应仍使用 NestJS 默认异常格式，尚未接入全局异常过滤器统一为 `WorkflowApiResponse.error`。

### 7.2 通用返回类型

```ts
export type WorkflowModelRecord = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  documentType?: string;
  status: 'draft' | 'published' | 'disabled' | 'archived';
  currentVersion: number;
  draftSchema: Record<string, unknown>;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowModelVersionRecord = {
  id: string;
  modelId: string;
  version: number;
  schema: Record<string, unknown>;
  remark?: string;
  createdBy?: string;
  createdAt: string;
};

export type WorkflowProcessDefinitionRecord = {
  id: string;
  tenantId: string;
  modelId: string;
  modelVersionId: string;
  code: string;
  name: string;
  version: number;
  documentType?: string;
  schema: Record<string, unknown>;
  status: 'active' | 'disabled' | 'archived';
  publishedBy?: string;
  publishedAt: string;
};
```

运行时类型：

```ts
export type ProcessInstanceRecord = {
  id: string;
  tenantId: string;
  definitionId: string;
  definitionVersion: number;
  businessKey: string;
  documentType?: string;
  documentId?: string;
  title: string;
  status: 'running' | 'approved' | 'rejected' | 'canceled' | 'terminated' | 'failed';
  initiatorId?: string;
  startedAt: string;
  endedAt?: string;
};

export type WorkflowTaskRecord = {
  id: string;
  tenantId: string;
  processInstanceId: string;
  nodeInstanceId: string;
  nodeId: string;
  title: string;
  status: 'pending' | 'claimed' | 'completed' | 'canceled';
  assigneeId?: string;
  claimedAt?: string;
  dueAt?: string;
  createdAt: string;
  completedAt?: string;
};

export type ProcessInstanceDetail = ProcessInstanceRecord & {
  variables: WorkflowVariableRecord[];
  comments: WorkflowCommentRecord[];
  ccItems: WorkflowCcRecord[];
  nodeInstances: NodeInstanceRecord[];
  tasks: WorkflowTaskRecord[];
};

export type WorkflowTaskDetail = WorkflowTaskRecord & {
  candidates: WorkflowTaskCandidateRecord[];
};
```

### 7.3 健康检查

```http
GET /api/workflow/health
```

返回：

```ts
WorkflowApiResponse<{
  service: 'workflow-api';
  status: 'ok';
  timestamp: string;
}>
```

### 7.4 定义中心：模型 API

#### 查询模型列表

```http
GET /api/workflow/models?tenantId=default&documentType=expense&status=draft
```

Query：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `tenantId` | `string` | 否 | 租户 ID |
| `documentType` | `string` | 否 | 单据类型 |
| `status` | `string` | 否 | `draft`、`published`、`disabled`、`archived` |

返回：

```ts
WorkflowApiResponse<WorkflowModelRecord[]>
```

#### 查询模型详情

```http
GET /api/workflow/models/{modelId}
```

Path：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `modelId` | `string` | 是 | 流程模型 ID |

返回：

```ts
WorkflowApiResponse<WorkflowModelRecord & {
  versions: WorkflowModelVersionRecord[];
}>
```

#### 保存流程模型

```http
POST /api/workflow/models
```

Body：

```ts
export class SaveWorkflowModelDto {
  tenantId?: string;
  code: string;
  name: string;
  documentType?: string;
  schema: Record<string, unknown>;
}
```

说明：

- `tenantId` 可通过 body 或 `x-tenant-id` 传入，body 优先。
- 保存时会补齐 schema 的 `schemaVersion`、`code`、`name`、`documentType`。
- 当前保存阶段只做基础校验：`code`、`name`、`nodes`、`edges` 必须存在。

返回：

```ts
WorkflowApiResponse<WorkflowModelRecord>
```

#### 更新流程模型

```http
PUT /api/workflow/models/{modelId}
```

Path：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `modelId` | `string` | 是 | 流程模型 ID |

Body：同 `SaveWorkflowModelDto`。

返回：

```ts
WorkflowApiResponse<WorkflowModelRecord>
```

#### 发布流程模型

```http
POST /api/workflow/models/{modelId}/publish
```

Path：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `modelId` | `string` | 是 | 流程模型 ID |

Body：

```ts
export class PublishWorkflowModelDto {
  remark?: string;
}
```

返回：

```ts
WorkflowApiResponse<{
  model?: WorkflowModelRecord;
  version: WorkflowModelVersionRecord;
  definition: WorkflowProcessDefinitionRecord;
}>
```

发布校验：

- 必须存在且仅存在一个 `start`。
- 至少一个 `end`。
- 节点 ID 不重复。
- 连线引用节点必须存在。
- `approval`、`sign`、`orSign` 节点必须配置 `config.assigneeStrategy`。

### 7.5 定义中心：定义 API

#### 查询能力清单

```http
GET /api/workflow/definitions/capabilities
```

返回：

```ts
export type WorkflowCapability = {
  nodeTypes: Array<{
    type: string;
    label: string;
    category: 'event' | 'task' | 'gateway' | 'notification';
  }>;
  assigneeStrategies: string[];
  conditionTypes: string[];
};

WorkflowApiResponse<WorkflowCapability>
```

#### 查询流程定义列表

```http
GET /api/workflow/definitions?tenantId=default&documentType=expense&status=active
```

Query：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `tenantId` | `string` | 否 | 租户 ID |
| `documentType` | `string` | 否 | 单据类型 |
| `status` | `string` | 否 | `active`、`disabled`、`archived` |

返回：

```ts
WorkflowApiResponse<WorkflowProcessDefinitionRecord[]>
```

#### 停用流程定义

```http
POST /api/workflow/definitions/{definitionId}/disable
```

Path：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `definitionId` | `string` | 是 | 发布后的流程定义 ID |

返回：

```ts
WorkflowApiResponse<WorkflowProcessDefinitionRecord>
```

### 7.6 运行时 API

#### 查询流程实例列表

```http
GET /api/workflow/instances?tenantId=default&status=running&documentType=order&documentId=ORDER-1
```

Query：

```ts
export type WorkflowInstanceQuery = {
  tenantId?: string;
  status?: string;
  documentType?: string;
  documentId?: string;
};
```

返回：

```ts
WorkflowApiResponse<ProcessInstanceRecord[]>
```

#### 查询我发起的实例

```http
GET /api/workflow/instances/started
```

Query：同 `WorkflowInstanceQuery`。

返回：

```ts
WorkflowApiResponse<ProcessInstanceRecord[]>
```

#### 查询实例详情

```http
GET /api/workflow/instances/{instanceId}
```

返回：

```ts
WorkflowApiResponse<ProcessInstanceDetail>
```

#### 查询实例时间线

```http
GET /api/workflow/instances/{instanceId}/timeline
```

返回：

```ts
WorkflowApiResponse<WorkflowHistoryEventRecord[]>
```

#### 发起流程实例

```http
POST /api/workflow/instances
```

Body：

```ts
export class StartWorkflowInstanceDto {
  definitionId: string;
  businessKey: string;
  documentType?: string;
  documentId?: string;
  title: string;
  variables?: Record<string, unknown>;
}
```

返回：

```ts
WorkflowApiResponse<ProcessInstanceDetail>
```

业务行为：

- definition 必须为 `active`。
- 同租户、同 `businessKey` 已有 running 实例时会拒绝。
- 创建实例、变量、开始节点历史事件。
- 从 `start` 自动推进到第一个匹配节点。
- `approval` 生成一个任务，`sign`/`orSign` 按候选人生成多个任务。
- `condition` 当前只支持 `field` 条件和 `always` 兜底。

#### 撤回流程

```http
POST /api/workflow/instances/{instanceId}/withdraw
```

Body：

```ts
export class InstanceActionDto {
  comment?: string;
}
```

返回：

```ts
WorkflowApiResponse<ProcessInstanceDetail>
```

说明：当前实现仅允许发起人撤回，状态变为 `canceled`。

#### 终止流程

```http
POST /api/workflow/instances/{instanceId}/terminate
```

Body：同 `InstanceActionDto`。

返回：

```ts
WorkflowApiResponse<ProcessInstanceDetail>
```

说明：状态变为 `terminated`，并取消其他活跃任务。

### 7.7 任务中心 API

#### 我的待办

```http
GET /api/workflow/tasks/todo?tenantId=default&assigneeId=user-1&status=pending
```

Query：

```ts
export type WorkflowTaskQuery = {
  tenantId?: string;
  assigneeId?: string;
  status?: string;
};
```

返回：

```ts
WorkflowApiResponse<WorkflowTaskRecord[]>
```

说明：

- 默认取当前 `x-tenant-id` 租户。
- 只返回 `pending` 或 `claimed`。
- 当前用户可见规则：直接指派、候选人为当前用户、候选类型为非 user。

#### 我的已办

```http
GET /api/workflow/tasks/done
```

Query：同 `WorkflowTaskQuery`，默认 `status=completed`。

返回：

```ts
WorkflowApiResponse<WorkflowTaskRecord[]>
```

#### 抄送列表

```http
GET /api/workflow/tasks/cc?tenantId=default&userId=user-1
```

Query：

```ts
export type WorkflowCcQuery = {
  tenantId?: string;
  userId?: string;
};
```

返回：

```ts
WorkflowApiResponse<WorkflowCcRecord[]>
```

#### 发起列表

```http
GET /api/workflow/tasks/started
```

返回：

```ts
WorkflowApiResponse<ProcessInstanceRecord[]>
```

#### 查询任务详情

```http
GET /api/workflow/tasks/{taskId}
```

返回：

```ts
WorkflowApiResponse<WorkflowTaskDetail>
```

#### 认领任务

```http
POST /api/workflow/tasks/{taskId}/claim
```

Body：无。

返回：

```ts
WorkflowApiResponse<WorkflowTaskDetail>
```

#### 审批通过

```http
POST /api/workflow/tasks/{taskId}/approve
```

Body：

```ts
export class CompleteTaskDto {
  comment?: string;
  variables?: Record<string, unknown>;
}
```

返回：

```ts
WorkflowApiResponse<ProcessInstanceDetail>
```

说明：

- 任务完成后会合并 `variables`。
- 普通审批节点会推进到下一节点。
- `sign` 需要满足完成策略后推进。
- `orSign` 任一任务通过后会取消同节点其他活跃任务。

#### 审批驳回

```http
POST /api/workflow/tasks/{taskId}/reject
```

Body：

```ts
export class RejectTaskDto {
  comment?: string;
  targetNodeId?: string;
}
```

返回：

```ts
WorkflowApiResponse<ProcessInstanceDetail>
```

说明：当前实现会直接将实例状态置为 `rejected`，`targetNodeId` 仅写入历史事件，尚未实现回退到目标节点继续流转。

#### 转交任务

```http
POST /api/workflow/tasks/{taskId}/transfer
```

Body：

```ts
export class TransferTaskDto {
  targetUserId: string;
  comment?: string;
}
```

返回：

```ts
WorkflowApiResponse<WorkflowTaskDetail>
```

#### 加签任务

```http
POST /api/workflow/tasks/{taskId}/add-sign
```

Body：

```ts
export class AddSignTaskDto {
  targetUserId: string;
  comment?: string;
}
```

返回：

```ts
WorkflowApiResponse<WorkflowTaskDetail>
```

说明：当前实现会新建一个同节点待办任务，标题追加 `- 加签`。

### 7.8 历史 API

除运行时实例下的时间线接口外，还提供历史模块路径：

```http
GET /api/workflow/history/instances/{instanceId}/timeline
```

返回：

```ts
WorkflowApiResponse<WorkflowHistoryEventRecord[]>
```

### 7.9 当前未开放的草案 API

以下模块或接口在设计文档中出现，但当前代码还没有 controller 或完整实现：

| API/模块 | 当前状态 |
|---|---|
| `/api/workflow/documents/{documentType}/{documentId}/instance` | 未实现 |
| `/api/workflow/integration/default-definition` | `IntegrationModule` 为空，未实现 |
| `/api/workflow/integration/submit-document` | `IntegrationModule` 为空，未实现 |
| `/api/workflow/ops/failed-instances` | 未实现 |
| `/api/workflow/ops/node-instances/{nodeInstanceId}/retry` | 未实现 |
| Redis/BullMQ 定时任务 | 已移除；流程 timer 由 Trigger.dev `wait.for/until` 执行 |
| 规则引擎模块 | `RuleModule` 为空，运行时当前只支持简单 field 条件 |

## 8. 完整发布链路示例

### 8.1 保存并发布流程

```ts
async function workflowApi<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`http://localhost:3010/api/workflow${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': 'default',
      'x-user-id': 'order-initiator',
      ...(init.headers ?? {})
    }
  });
  const payload = (await response.json()) as WorkflowApiResponse<T>;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message ?? `Workflow API failed: ${response.status}`);
  }

  return payload.data;
}

const schema = createOrderApprovalWorkflow();

const model = await workflowApi<WorkflowModelRecord>('/models', {
  method: 'POST',
  body: JSON.stringify({
    code: schema.code,
    name: schema.name,
    documentType: schema.documentType,
    schema
  })
});

const published = await workflowApi<{
  model?: WorkflowModelRecord;
  version: WorkflowModelVersionRecord;
  definition: WorkflowProcessDefinitionRecord;
}>(`/models/${model.id}/publish`, {
  method: 'POST',
  body: JSON.stringify({
    remark: '首次发布'
  })
});
```

### 8.2 发起流程并审批

```ts
const instance = await workflowApi<ProcessInstanceDetail>('/instances', {
  method: 'POST',
  body: JSON.stringify({
    definitionId: published.definition.id,
    businessKey: `order:${Date.now()}`,
    documentType: 'order',
    documentId: 'ORDER-1',
    title: '订单审批 ORDER-1',
    variables: {
      amount: 6800
    }
  })
});

// 发起接口返回后，首个待办由 Trigger.dev worker 异步投影到 PostgreSQL。
// 生产环境建议轮询 /tasks/todo 或订阅业务通知。
const todoTask = (await workflowApi<WorkflowTaskRecord[]>('/tasks/todo')).find(
  (task) => task.processInstanceId === instance.id && task.status === 'pending'
);

if (todoTask) {
  const approved = await workflowApi<ProcessInstanceDetail>(
    `/tasks/${todoTask.id}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({
        comment: '同意',
        variables: {
          approvedByManager: true
        }
      })
    }
  );

  console.log(approved.status);
}
```

## 9. npm 发布前检查清单

当前包已经具备源码级接入能力，但正式 npm 发布前建议补齐：

| 项目 | 当前状态 | 发布前建议 |
|---|---|---|
| 构建产物 | `main/module/types` 指向 `./src/index.ts` | 增加 `dist` 构建，导出 JS、CSS、`.d.ts` |
| Vue SFC 类型 | 依赖源码和消费者构建能力 | 使用 `vue-tsc` 或库模式生成类型声明 |
| `files` | 当前发布 `src` | 发布 `dist`、README、LICENSE，减少源码耦合 |
| 样式出口 | `./styles/*` 已声明，目录为空 | 若不提供全局样式，移除该出口；若提供主题，补 `src/styles/index.css` |
| 后端仓储 | PostgreSQL 定义/运行时投影 | 发布前确认迁移已执行，Trigger.dev worker 已部署 |
| 异常响应 | 成功响应已统一，异常仍是 Nest 默认格式 | 增加全局异常过滤器，统一 `WorkflowApiResponse.error` |
| 幂等键 | Header 预留，未实现 | 对发起、审批、转交、加签等写操作实现幂等 |
| 条件表达式 | 运行时仅支持 field 条件 | 接入受控规则引擎，避免执行任意 JS |
| 版本化 | 发布会生成 PostgreSQL 模型版本和 definition | 确保发布事务和不可变快照 |
| 文档 | 本文档为当前使用手册 | 发布 npm 时同步到包 README 和 changelog |

推荐发布脚本方向：

```json
{
  "scripts": {
    "build": "vite build && vue-tsc --emitDeclarationOnly -p tsconfig.json",
    "typecheck": "vue-tsc --noEmit -p tsconfig.json",
    "prepublishOnly": "pnpm typecheck && pnpm build"
  }
}
```

## 10. 常用命令

```bash
pnpm workflow-schema:typecheck
pnpm workflow-schema:test
pnpm approval-workflow:typecheck
pnpm workflow-api:typecheck
pnpm workflow-api:test
pnpm --dir services/workflow-api db:apply-trigger-runtime
pnpm --dir services/workflow-api trigger:dev
pnpm api:dev
```
