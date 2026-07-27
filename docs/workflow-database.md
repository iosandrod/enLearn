# 审批流数据库设计草案

## 1. 设计原则

表结构借鉴 Flowable、Camunda 的 Repository、Runtime、History 分层，但针对单据审批做简化。

原则：

- 定义层保存流程模型和发布版本。
- 运行层只保存当前运行中的实例、节点、任务和变量。
- 历史层保存完整审计轨迹，流程结束后仍可追溯。
- 运行中实例必须绑定不可变的流程定义版本。
- 审批人解析结果保存快照，避免组织架构变动影响历史流程。

## 2. 定义层

### wf_model

流程模型主表，保存草稿入口。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `tenant_id` | text | 租户 |
| `code` | text | 流程编码 |
| `name` | text | 流程名称 |
| `document_type` | text | 单据类型 |
| `status` | text | `draft`、`published`、`disabled`、`archived` |
| `current_version` | int | 当前发布版本 |
| `draft_schema` | jsonb | 草稿 DSL |
| `created_by` | text | 创建人 |
| `updated_by` | text | 更新人 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

建议索引：

- `(tenant_id, code)` 唯一索引。
- `(tenant_id, document_type, status)` 查询索引。

### wf_model_version

流程模型版本表。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `model_id` | uuid | 关联 `wf_model.id` |
| `version` | int | 版本号 |
| `schema` | jsonb | 发布时 DSL 快照 |
| `remark` | text | 发布说明 |
| `created_by` | text | 发布人 |
| `created_at` | timestamptz | 发布时间 |

建议索引：

- `(model_id, version)` 唯一索引。

### wf_process_definition

可执行流程定义。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `tenant_id` | text | 租户 |
| `model_id` | uuid | 模型 ID |
| `model_version_id` | uuid | 模型版本 ID |
| `code` | text | 流程编码 |
| `name` | text | 流程名称 |
| `version` | int | 版本 |
| `document_type` | text | 单据类型 |
| `schema` | jsonb | 执行定义快照 |
| `status` | text | `active`、`disabled`、`archived` |
| `published_by` | text | 发布人 |
| `published_at` | timestamptz | 发布时间 |

建议索引：

- `(tenant_id, code, version)` 唯一索引。
- `(tenant_id, document_type, status)` 查询索引。

### wf_node_definition

节点定义快照，便于查询和统计。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `definition_id` | uuid | 流程定义 ID |
| `node_id` | text | DSL 节点 ID |
| `node_type` | text | 节点类型 |
| `name` | text | 节点名称 |
| `config` | jsonb | 节点配置 |

### wf_edge_definition

连线定义快照。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `definition_id` | uuid | 流程定义 ID |
| `edge_id` | text | DSL 连线 ID |
| `source_node_id` | text | 来源节点 |
| `target_node_id` | text | 目标节点 |
| `condition` | jsonb | 条件 |
| `priority` | int | 优先级 |

## 3. 运行层

### wf_process_instance

流程实例。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `tenant_id` | text | 租户 |
| `definition_id` | uuid | 流程定义 ID |
| `definition_version` | int | 定义版本 |
| `business_key` | text | 业务唯一键 |
| `document_type` | text | 单据类型 |
| `document_id` | text | 单据 ID |
| `title` | text | 实例标题 |
| `status` | text | `running`、`approved`、`rejected`、`canceled`、`terminated`、`failed` |
| `initiator_id` | text | 发起人 |
| `trigger_run_id` | text | Trigger.dev run id |
| `trigger_task_id` | text | Trigger.dev task id，默认 `workflow.instance.run` |
| `started_at` | timestamptz | 发起时间 |
| `ended_at` | timestamptz | 结束时间 |

建议索引：

- `(tenant_id, business_key)` 唯一索引，按重复提交策略决定是否启用。
- `(tenant_id, initiator_id, status, started_at)` 查询索引。
- `(tenant_id, document_type, document_id)` 查询索引。

### wf_node_instance

节点实例。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `process_instance_id` | uuid | 流程实例 ID |
| `execution_key` | text | Trigger.dev 重试下的节点投影幂等键 |
| `node_id` | text | DSL 节点 ID |
| `node_type` | text | 节点类型 |
| `name` | text | 节点名称 |
| `status` | text | `created`、`running`、`waiting`、`completed`、`skipped`、`failed` |
| `started_at` | timestamptz | 开始时间 |
| `ended_at` | timestamptz | 结束时间 |

### wf_task

当前待办任务。任务完成后移入历史任务表。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `tenant_id` | text | 租户 |
| `process_instance_id` | uuid | 流程实例 ID |
| `node_instance_id` | uuid | 节点实例 ID |
| `node_id` | text | DSL 节点 ID |
| `title` | text | 任务标题 |
| `status` | text | `pending`、`claimed`、`completed`、`canceled` |
| `assignee_id` | text | 实际处理人 |
| `claimed_at` | timestamptz | 认领时间 |
| `due_at` | timestamptz | 截止时间 |
| `waitpoint_token_id` | text | Trigger.dev waitpoint token id |
| `trigger_run_id` | text | 可选关联 Trigger.dev run id |
| `decision_payload` | jsonb | 审批 API 发送给 waitpoint 的恢复数据 |
| `created_at` | timestamptz | 创建时间 |
| `completed_at` | timestamptz | 完成时间 |

建议索引：

- `(tenant_id, assignee_id, status, created_at)` 待办查询。
- `(tenant_id, process_instance_id)` 实例任务查询。

### wf_task_candidate

任务候选人、候选角色、候选部门快照。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `task_id` | uuid | 任务 ID |
| `candidate_type` | text | `user`、`role`、`department` |
| `candidate_id` | text | 候选对象 ID |
| `snapshot` | jsonb | 候选对象快照 |

### wf_variable

流程变量。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `process_instance_id` | uuid | 流程实例 ID |
| `key` | text | 变量 key |
| `value` | jsonb | 变量值 |
| `value_type` | text | 类型 |
| `updated_at` | timestamptz | 更新时间 |

### wf_execution_token

已废弃。当前流程等待和恢复由 Trigger.dev run / waitpoint 持久化，业务侧只在 `wf_task.waitpoint_token_id` 保存查询投影。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `process_instance_id` | uuid | 流程实例 ID |
| `node_id` | text | 当前节点 |
| `status` | text | `active`、`waiting`、`completed`、`canceled` |
| `parent_token_id` | uuid | 父 token |

## 4. 历史层

### wf_history_event

完整审计事件。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `tenant_id` | text | 租户 |
| `process_instance_id` | uuid | 流程实例 ID |
| `event_type` | text | 事件类型 |
| `operator_id` | text | 操作人 |
| `payload` | jsonb | 事件内容 |
| `idempotency_key` | text | Trigger.dev 重试下的历史事件幂等键 |
| `created_at` | timestamptz | 事件时间 |

事件类型：

- `PROCESS_STARTED`
- `NODE_ENTERED`
- `TASK_CREATED`
- `TASK_CLAIMED`
- `TASK_COMPLETED`
- `TASK_REJECTED`
- `PROCESS_COMPLETED`
- `PROCESS_CANCELED`
- `PROCESS_FAILED`

### wf_history_task

历史任务。

### wf_history_node

历史节点。

### wf_comment

审批意见。

### wf_attachment

审批附件。

### wf_document_binding

单据与流程实例绑定。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `tenant_id` | text | 租户 |
| `document_type` | text | 单据类型 |
| `document_id` | text | 单据 ID |
| `process_instance_id` | uuid | 流程实例 ID |
| `status` | text | 审批状态 |
| `created_at` | timestamptz | 创建时间 |

建议索引：

- `(tenant_id, document_type, document_id)` 查询索引。

## 5. 第一阶段迁移范围

阶段 1 只需要准备迁移目录和表结构草案，不强制落库。

阶段 3 开始正式创建定义层表。

阶段 4 创建运行层表。

阶段 8 补齐历史层表和审计查询优化。
