# 审批流 API 草案

## 1. 接口风格

审批流后端作为独立 NestJS 微服务提供 REST API。第一期接口以 JSON 为主，后续可以接入统一服务网关。

统一前缀：

```text
/api/workflow
```

通用请求头：

| Header | 说明 |
|---|---|
| `x-tenant-id` | 租户 ID |
| `x-user-id` | 当前用户 ID |
| `x-request-id` | 请求追踪 ID |
| `idempotency-key` | 审批动作幂等键 |

通用响应：

```ts
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

## 2. 定义中心 API

### 保存流程草稿

```http
POST /api/workflow/models
```

请求：

```json
{
  "code": "expense_approval",
  "name": "费用报销审批",
  "documentType": "expense",
  "schema": {}
}
```

完成指标：

- schema 必须通过基础校验。
- 同一租户下 `code` 唯一。
- 保存草稿不影响已发布版本。

### 更新流程草稿

```http
PUT /api/workflow/models/{modelId}
```

### 查询流程模型列表

```http
GET /api/workflow/models?documentType=expense&status=draft
```

### 查询流程模型详情

```http
GET /api/workflow/models/{modelId}
```

### 发布流程

```http
POST /api/workflow/models/{modelId}/publish
```

请求：

```json
{
  "remark": "首次发布"
}
```

完成指标：

- 发布前必须执行服务端完整校验。
- 发布后生成不可变版本。
- 发布版本可以被运行时实例绑定。

### 停用流程定义

```http
POST /api/workflow/definitions/{definitionId}/disable
```

### 查询可用流程定义

```http
GET /api/workflow/definitions?documentType=expense&status=active
```

## 3. 运行时 API

### 发起流程

```http
POST /api/workflow/instances
```

请求：

```json
{
  "definitionId": "uuid",
  "businessKey": "expense:10001",
  "documentType": "expense",
  "documentId": "10001",
  "title": "费用报销 10001",
  "variables": {
    "amount": 1200,
    "departmentId": "dept-1"
  }
}
```

完成指标：

- 创建流程实例。
- 写入流程变量。
- 触发 Trigger.dev `workflow.instance.run`。
- 回写 `trigger_run_id`。
- 首个审批任务由 Trigger.dev worker 异步创建。
- 记录历史事件。

### 查询流程实例

```http
GET /api/workflow/instances/{instanceId}
```

### 查询单据绑定的流程实例

```http
GET /api/workflow/documents/{documentType}/{documentId}/instance
```

### 撤回流程

```http
POST /api/workflow/instances/{instanceId}/withdraw
```

### 终止流程

```http
POST /api/workflow/instances/{instanceId}/terminate
```

## 4. 任务中心 API

### 我的待办

```http
GET /api/workflow/tasks/todo?page=1&pageSize=20
```

查询规则：

- 包含直接指派给当前用户的任务。
- 包含当前用户角色、部门匹配的候选任务。
- 默认只返回 `pending` 和 `claimed` 状态。

### 我的已办

```http
GET /api/workflow/tasks/done?page=1&pageSize=20
```

### 发起列表

```http
GET /api/workflow/tasks/started?page=1&pageSize=20
```

### 抄送列表

```http
GET /api/workflow/tasks/cc?page=1&pageSize=20
```

### 查询任务详情

```http
GET /api/workflow/tasks/{taskId}
```

### 认领任务

```http
POST /api/workflow/tasks/{taskId}/claim
```

### 审批通过

```http
POST /api/workflow/tasks/{taskId}/approve
```

请求：

```json
{
  "comment": "同意",
  "variables": {}
}
```

### 审批驳回

```http
POST /api/workflow/tasks/{taskId}/reject
```

请求：

```json
{
  "comment": "资料不完整",
  "targetNodeId": "start"
}
```

### 转交任务

```http
POST /api/workflow/tasks/{taskId}/transfer
```

### 加签

```http
POST /api/workflow/tasks/{taskId}/add-sign
```

## 5. 历史与审计 API

### 查询流程时间线

```http
GET /api/workflow/instances/{instanceId}/timeline
```

返回：

```json
[
  {
    "eventType": "PROCESS_STARTED",
    "operatorId": "user-1",
    "createdAt": "2026-07-26T00:00:00.000Z",
    "payload": {}
  }
]
```

### 查询节点轨迹

```http
GET /api/workflow/instances/{instanceId}/nodes
```

### 查询异常实例

```http
GET /api/workflow/ops/failed-instances
```

### 重试异常节点

```http
POST /api/workflow/ops/node-instances/{nodeInstanceId}/retry
```

## 6. 集成 API

### 按单据类型查找默认流程

```http
GET /api/workflow/integration/default-definition?documentType=expense
```

### 从单据提交审批

```http
POST /api/workflow/integration/submit-document
```

请求：

```json
{
  "documentType": "expense",
  "documentId": "10001",
  "title": "费用报销 10001",
  "variables": {
    "amount": 1200
  }
}
```

完成指标：

- 自动选择当前可用流程定义。
- 创建流程实例。
- 绑定单据。
- 返回当前审批状态和待办信息。

## 7. 错误码

| 错误码 | 说明 |
|---|---|
| `WORKFLOW_SCHEMA_INVALID` | 流程定义不合法 |
| `WORKFLOW_MODEL_NOT_FOUND` | 流程模型不存在 |
| `WORKFLOW_DEFINITION_NOT_FOUND` | 流程定义不存在 |
| `WORKFLOW_INSTANCE_NOT_FOUND` | 流程实例不存在 |
| `WORKFLOW_TASK_NOT_FOUND` | 任务不存在 |
| `WORKFLOW_TASK_ALREADY_COMPLETED` | 任务已处理 |
| `WORKFLOW_PERMISSION_DENIED` | 无权限 |
| `WORKFLOW_DUPLICATE_SUBMIT` | 重复提交 |
| `WORKFLOW_INVALID_STATE` | 状态不允许当前操作 |

## 8. 第一阶段接口范围

阶段 1 只实现健康检查和模块骨架。

阶段 3 实现定义中心 API。

阶段 4 实现运行时发起和简单流转 API。

阶段 5 实现完整任务中心 API。
