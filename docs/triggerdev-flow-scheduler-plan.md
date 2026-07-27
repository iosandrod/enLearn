# Trigger.dev 运行时方案说明

本文原本是“Trigger.dev + Flow Editor 定时任务”的阶段计划。当前项目已经采用更完整的方案：

- Trigger.dev 是审批流唯一后端持久化执行引擎。
- 每个流程实例触发一个 `workflow.instance.run`。
- 人工审批使用 Trigger.dev waitpoint：`wait.createToken`、`wait.forToken`、`wait.completeToken`。
- timer 节点使用 `wait.for` / `wait.until`，不再创建本地 timer worker。
- `workflow-api` 保留 PostgreSQL 业务投影、待办查询、审批 API、历史审计和定义发布。
- Redis、BullMQ、`WORKFLOW_JOB_WORKER_ENABLED` 已从运行路径移除。

最新实现与接入方式以 [approval-workflow-triggerdev-runtime.md](./approval-workflow-triggerdev-runtime.md) 为准。
