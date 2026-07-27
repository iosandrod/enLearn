# 审批流 DSL 与节点协议草案

## 1. 设计目标

审批流 DSL 用于统一前端设计器、后端执行器、低代码单据集成之间的流程描述。它不是完整 BPMN，而是面向单据审批的业务 DSL，后续可以增加 BPMN 导入导出适配层。

核心要求：

- 可版本化：发布后的流程定义不可变。
- 可校验：前端保存、后端发布前都使用同一套校验规则。
- 可扩展：节点类型、审批人策略、动作、事件可以通过注册表扩展。
- 可审计：运行时能从定义快照还原当时的流程结构和节点配置。

## 2. 顶层结构

```ts
export type WorkflowModel = {
  schemaVersion: number;
  id?: string;
  code: string;
  name: string;
  description?: string;
  tenantId?: string;
  documentType?: string;
  status?: 'draft' | 'published' | 'archived' | 'disabled';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: WorkflowVariable[];
  settings?: WorkflowSettings;
};
```

字段说明：

| 字段 | 说明 |
|---|---|
| `schemaVersion` | DSL 版本，第一版固定为 `1` |
| `code` | 流程业务编码，同一租户下唯一 |
| `name` | 流程名称 |
| `documentType` | 绑定的单据类型，如 `purchase_order` |
| `nodes` | 节点列表 |
| `edges` | 连线列表 |
| `variables` | 流程变量定义 |
| `settings` | 流程级配置 |

## 3. 节点协议

```ts
export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  name: string;
  description?: string;
  position?: {
    x: number;
    y: number;
  };
  config?: Record<string, unknown>;
};
```

第一期节点类型：

```ts
export type WorkflowNodeType =
  | 'start'
  | 'approval'
  | 'condition'
  | 'cc'
  | 'end';
```

后续扩展节点类型：

```ts
export type ExtendedWorkflowNodeType =
  | 'sign'
  | 'orSign'
  | 'parallelGateway'
  | 'serviceTask'
  | 'timer'
  | 'subProcess';
```

## 4. 连线协议

```ts
export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  name?: string;
  priority?: number;
  condition?: WorkflowCondition;
};
```

规则：

- `source` 和 `target` 必须引用存在的节点。
- 开始节点不能有入线。
- 结束节点不能有出线。
- 审批节点、抄送节点默认只能有一条出线。
- 条件节点可以有多条出线，按 `priority` 从小到大匹配。

## 5. 审批节点配置

```ts
export type ApprovalNodeConfig = {
  assigneeStrategy: AssigneeStrategy;
  allowTransfer?: boolean;
  allowDelegate?: boolean;
  allowAddSign?: boolean;
  allowReject?: boolean;
  rejectMode?: 'previous' | 'start' | 'specificNode';
  rejectTargetNodeId?: string;
  taskTitleTemplate?: string;
};
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

第一期先实现 `users`、`roles`、`initiatorManager`，其余策略保留类型。

## 6. 条件协议

```ts
export type WorkflowCondition = {
  type: 'always' | 'expression' | 'field';
  expression?: string;
  field?: string;
  operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value?: unknown;
};
```

原则：

- 条件表达式必须由受控表达式引擎执行。
- 不允许在流程定义中保存任意 JS 代码。
- 条件节点必须有至少一条兜底连线，兜底条件为 `{ type: 'always' }`。

## 7. 流程变量

```ts
export type WorkflowVariable = {
  key: string;
  label?: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json';
  source?: 'document' | 'system' | 'manual';
  path?: string;
  required?: boolean;
};
```

变量来源：

- `document`：从单据字段映射。
- `system`：系统运行时注入，如发起人、部门、租户。
- `manual`：发起流程时传入。

## 8. 流程级设置

```ts
export type WorkflowSettings = {
  allowCancel?: boolean;
  allowWithdraw?: boolean;
  duplicateSubmitPolicy?: 'reject' | 'reuseRunning' | 'newInstance';
  historyLevel?: 'basic' | 'full';
};
```

默认值：

- `allowCancel: true`
- `allowWithdraw: true`
- `duplicateSubmitPolicy: 'reject'`
- `historyLevel: 'full'`

## 9. 校验规则

发布前必须通过以下校验：

- 只有一个开始节点。
- 至少一个结束节点。
- 节点 ID 不重复。
- 连线 ID 不重复。
- 连线引用的节点必须存在。
- 除开始节点外，每个可达节点必须有入线。
- 除结束节点外，每个可达节点必须有出线。
- 从开始节点出发，所有非孤立节点必须可达。
- 审批节点必须配置审批人策略。
- 条件节点必须至少有两条出线。
- 条件节点必须有一条兜底出线。

## 10. MVP 示例

```json
{
  "schemaVersion": 1,
  "code": "expense_approval",
  "name": "费用报销审批",
  "documentType": "expense",
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "name": "开始"
    },
    {
      "id": "manager_approval",
      "type": "approval",
      "name": "直属主管审批",
      "config": {
        "assigneeStrategy": {
          "type": "initiatorManager",
          "level": 1
        },
        "allowReject": true
      }
    },
    {
      "id": "end",
      "type": "end",
      "name": "结束"
    }
  ],
  "edges": [
    {
      "id": "edge_start_manager",
      "source": "start",
      "target": "manager_approval"
    },
    {
      "id": "edge_manager_end",
      "source": "manager_approval",
      "target": "end"
    }
  ]
}
```
