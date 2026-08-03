# 审批流 Trigger.dev 持久化运行时

当前审批流后端运行时已完全切换为 Trigger.dev 持久化执行模型。`workflow-api` 不再自己维护流程推进器、内存待办、BullMQ worker 或 Redis timer。

## 1. 当前边界

| 模块 | 职责 |
|---|---|
| `packages/approval-workflow` | Vue 设计器、查看器、任务面板、时间线组件 |
| `packages/workflow-schema` | 流程 DSL 类型、标准化、校验、编译工具 |
| `services/workflow-api` | 流程定义发布、PostgreSQL 业务投影、待办/历史/权限 REST API |
| Trigger.dev | 唯一后端执行引擎，负责流程 run、人工审批 waitpoint、timer wait、重试、恢复、日志 |
| PostgreSQL | 业务查询真源，保存定义、实例、节点、任务、候选人、变量、意见、历史事件 |

```mermaid
sequenceDiagram
  participant Client as Client / UI
  participant API as workflow-api
  participant PG as PostgreSQL
  participant Trigger as Trigger.dev

  Client->>API: POST /api/workflow/instances
  API->>PG: insert wf_process_instance / wf_variable
  API->>Trigger: tasks.trigger("workflow.instance.run")
  API->>PG: save trigger_run_id
  Trigger->>PG: create node/task projection
  Trigger->>Trigger: wait.createToken + wait.forToken
  Client->>API: POST /api/workflow/tasks/{id}/approve
  API->>PG: complete wf_task + write variables/history
  API->>Trigger: wait.completeToken(tokenId, decision)
  Trigger->>Trigger: resume workflow.instance.run
  Trigger->>PG: continue nodes / complete instance
```

## 2. Trigger.dev Tasks

| Task id | 文件 | 说明 |
|---|---|---|
| `workflow.instance.run` | `services/workflow-api/src/trigger/workflow-instance.task.ts` | 每个流程实例对应一个 Trigger.dev run，负责完整流程推进 |
| `workflow.job.run` | `services/workflow-api/src/trigger/workflow-job.task.ts` | 通用后台 job 默认 task，回写 `wf_job_run` |
| `workflow.timer.fire` | `services/workflow-api/src/trigger/workflow-job.task.ts` | 旧 timer job 兼容 task；不再由公开 REST API 创建 |

`workflow.instance.run` 的 payload：

```ts
export type WorkflowInstanceTaskPayload = {
  instanceId: string;
  tenantId: string;
  definitionId: string;
  definitionVersion: number;
  title: string;
  initiatorId?: string;
  schema: Record<string, unknown>;
  variables: Record<string, unknown>;
};
```

人工审批恢复 payload：

```ts
export type WorkflowTaskDecision = {
  action: 'approve' | 'reject';
  taskId: string;
  nodeId: string;
  operatorId?: string;
  comment?: string;
  variables?: Record<string, unknown>;
  targetNodeId?: string;
};
```

## 3. 核心 API 语义

### 发起流程

```http
POST /api/workflow/instances
```

行为：

- 校验发布定义必须为 `active`。
- 写入 `wf_process_instance`、`wf_variable`、`wf_history_event(PROCESS_STARTED)`。
- 触发 `workflow.instance.run`。
- 回写 `wf_process_instance.trigger_run_id`。
- 返回实例详情；首个待办由 Trigger.dev worker 异步生成。

返回类型：

```ts
WorkflowApiResponse<ProcessInstanceDetail>
```

### 审批通过

```http
POST /api/workflow/tasks/{taskId}/approve
```

行为：

- 事务内完成 `wf_task`、写入变量、意见和历史。
- 调用 `wait.completeToken(waitpointTokenId, decision)` 恢复 Trigger.dev run。

### 审批驳回

```http
POST /api/workflow/tasks/{taskId}/reject
```

行为：

- 完成当前任务并取消同实例活动任务。
- 将实例置为 `rejected`。
- 完成 waitpoint，让 Trigger.dev run 感知已停止。

### 撤回/终止

```http
POST /api/workflow/instances/{instanceId}/withdraw
POST /api/workflow/instances/{instanceId}/terminate
```

行为：

- 更新 PostgreSQL 投影状态。
- 取消活动任务和等待节点。
- 调用 `runs.cancel(triggerRunId)` 取消 Trigger.dev run。

## 4. 数据库字段

新增迁移：

```text
supabase/migrations/20260727090000_workflow_triggerdev_runtime.sql
```

关键字段：

| 表 | 字段 | 说明 |
|---|---|---|
| `wf_process_instance` | `trigger_run_id` | Trigger.dev run id |
| `wf_process_instance` | `trigger_task_id` | 默认 `workflow.instance.run` |
| `wf_node_instance` | `execution_key` | Trigger.dev 重试时节点投影幂等键 |
| `wf_task` | `waitpoint_token_id` | Trigger.dev waitpoint token id |
| `wf_task` | `trigger_run_id` | 可选关联 run id |
| `wf_task` | `decision_payload` | 审批 API 写入的恢复 payload |
| `wf_history_event` | `idempotency_key` | 重试时防止重复历史事件 |

`wf_execution_token` 和 `wf_timer_job` 已不再参与流程运行；保留为历史兼容表。

## 5. 环境变量与命令

```env
DATABASE_URL="postgres://postgres:password@host:6543/postgres?pgbouncer=true"
DIRECT_URL="postgres://postgres:password@host:5432/postgres"
WORKFLOW_API_PORT=3010
TRIGGER_API_URL=http://localhost:3030
# Optional: TRIGGER_ENV_FILE=E:\trigger.dev-main\.env
# Optional: TRIGGER_PROJECT_NAME=enlearn-workflow-local
# Optional: TRIGGER_ENVIRONMENT=dev
```

`TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY`, and the admin
`TRIGGER_ACCESS_TOKEN` are resolved from Trigger.dev PostgreSQL on first use and
cached in process. The Trigger.dev database connection and its fixed
`ENCRYPTION_KEY` come from `TRIGGER_ENV_FILE` (auto-discovered from
`../trigger.dev-main/.env` locally).

常用命令：

```bash
pnpm --dir services/workflow-api db:apply-trigger-runtime
pnpm --dir services/workflow-api dev
pnpm --dir services/workflow-api trigger:dev
pnpm --dir services/workflow-api trigger:deploy
pnpm --dir services/workflow-api typecheck
pnpm --dir services/workflow-api test
```

本地开发需要同时启动：

```bash
pnpm --dir services/workflow-api dev
pnpm --dir services/workflow-api trigger:dev
```

## 6. 发布前检查

- `DATABASE_URL` 用于 API 查询和写入。
- `DIRECT_URL` 推荐给 Trigger.dev worker 使用，避免长事务经过 pooler。
- 已执行 `20260726070000_workflow_definitions.sql`、`20260726073000_workflow_runtime.sql`、`20260726080000_workflow_task_center.sql`、`20260727043000_workflow_jobs_triggerdev.sql`、`20260727090000_workflow_triggerdev_runtime.sql`。
- Trigger.dev 项目已部署 `workflow.instance.run`。
- 不需要 Redis、BullMQ 或 `WORKFLOW_JOB_WORKER_ENABLED`。
