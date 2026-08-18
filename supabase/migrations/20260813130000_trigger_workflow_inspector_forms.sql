with
common_fields as (
  select $json$
  [
    {
      "field": "id",
      "label": "节点 ID",
      "component": "vxe-input",
      "props": { "disabled": true, "clearable": false }
    },
    {
      "field": "name",
      "label": "节点名称",
      "component": "vxe-input",
      "props": { "placeholder": "请输入节点名称", "clearable": true },
      "rules": [{ "required": true, "message": "节点名称不能为空" }]
    },
    {
      "field": "description",
      "label": "节点说明",
      "component": "vxe-textarea",
      "props": { "placeholder": "说明节点的业务用途", "rows": 3, "resize": "vertical" }
    }
  ]
  $json$::jsonb as fields
),
task_fields as (
  select $json$
  [
    {
      "field": "taskType",
      "label": "任务类型",
      "component": "vxe-select",
      "props": { "clearable": false },
      "options": [
        { "label": "发送前端指令", "value": "frontendCommand" },
        { "label": "执行后端指令", "value": "backendCommand" },
        { "label": "执行存储过程", "value": "storedProcedure" },
        { "label": "已注册 Trigger.dev 任务", "value": "registeredTask" }
      ],
      "rules": [{ "required": true, "message": "任务类型不能为空" }]
    },
    {
      "field": "frontendFunction",
      "label": "前端指令函数",
      "component": "lc-monaco-editor",
      "props": {
        "dialog": true,
        "dialogTitle": "编辑前端指令函数",
        "language": "javascript",
        "theme": "vs",
        "editorHeight": "min(540px, calc(100vh - 250px))",
        "placeholder": "async ({ payload, variables, previousOutput, context }) => ({ code: 'message.show', params: { message: '执行成功' } })",
        "visibleWhen": { "field": "taskType", "equals": "frontendCommand" },
        "editorOptions": { "wordWrap": "on", "formatOnPaste": true, "formatOnType": true }
      },
      "rules": [{ "required": true, "message": "前端指令函数不能为空" }]
    },
    {
      "field": "backendFunction",
      "label": "后端指令函数",
      "component": "lc-monaco-editor",
      "props": {
        "dialog": true,
        "dialogTitle": "编辑后端指令函数",
        "language": "javascript",
        "theme": "vs",
        "editorHeight": "min(540px, calc(100vh - 250px))",
        "placeholder": "async ({ payload, variables, previousOutput, context }) => context.http.get('/api/example')",
        "visibleWhen": { "field": "taskType", "equals": "backendCommand" },
        "editorOptions": { "wordWrap": "on", "formatOnPaste": true, "formatOnType": true }
      },
      "rules": [{ "required": true, "message": "后端指令函数不能为空" }]
    },
    {
      "field": "procedureName",
      "label": "存储过程名称",
      "component": "vxe-input",
      "props": {
        "placeholder": "例如：planning_publish_plan_version",
        "clearable": true,
        "visibleWhen": { "field": "taskType", "equals": "storedProcedure" }
      }
    },
    {
      "field": "procedureSchema",
      "label": "存储过程架构",
      "component": "vxe-input",
      "props": {
        "placeholder": "public",
        "clearable": true,
        "visibleWhen": { "field": "taskType", "equals": "storedProcedure" }
      }
    },
    {
      "field": "taskId",
      "label": "任务 ID",
      "component": "vxe-input",
      "props": {
        "placeholder": "Trigger.dev 任务标识",
        "clearable": true,
        "visibleWhen": { "field": "taskType", "equals": "registeredTask" }
      }
    },
    {
      "field": "taskImportPath",
      "label": "任务导入路径",
      "component": "vxe-input",
      "props": {
        "placeholder": "由后端任务注册表解析",
        "clearable": true,
        "visibleWhen": { "field": "taskType", "equals": "registeredTask" }
      }
    },
    {
      "field": "taskInput",
      "label": "输入参数",
      "component": "lc-json-editor",
      "props": {
        "dialogTitle": "编辑任务输入参数",
        "jsonRootType": "object",
        "jsonValueMode": "parsed",
        "placeholder": "打开 JSON 编辑器"
      }
    },
    {
      "field": "outputPath",
      "label": "输出变量路径",
      "component": "vxe-input",
      "props": { "placeholder": "例如：taskOutputs.sendMessage", "clearable": true }
    },
    {
      "field": "outputMapping",
      "label": "输出映射",
      "component": "lc-json-editor",
      "props": {
        "dialogTitle": "编辑任务输出映射",
        "jsonRootType": "object",
        "jsonValueMode": "parsed",
        "placeholder": "打开 JSON 编辑器"
      }
    }
  ]
  $json$::jsonb as fields
),
queue_retry_fields as (
  select $json$
  [
    {
      "field": "timeoutSeconds",
      "label": "超时秒数",
      "component": "lc-number-input",
      "props": { "min": 1, "step": 1, "controls": true }
    },
    {
      "field": "failureStrategy",
      "label": "失败策略",
      "component": "vxe-select",
      "props": { "clearable": false },
      "options": [
        { "label": "终止流程", "value": "failWorkflow" },
        { "label": "记录失败并继续", "value": "continue" },
        { "label": "使用默认输出并继续", "value": "useDefaultOutput" }
      ]
    },
    {
      "field": "defaultOutput",
      "label": "默认输出",
      "component": "lc-json-editor",
      "props": {
        "dialogTitle": "编辑失败时默认输出",
        "jsonRootType": "object",
        "jsonValueMode": "parsed",
        "placeholder": "打开 JSON 编辑器",
        "visibleWhen": { "field": "failureStrategy", "equals": "useDefaultOutput" }
      }
    },
    {
      "field": "idempotencyKey",
      "label": "幂等键",
      "component": "vxe-input",
      "props": { "placeholder": "{{runId}} 或业务唯一键", "clearable": true }
    },
    {
      "field": "priority",
      "label": "优先级",
      "component": "lc-number-input",
      "props": { "min": 0, "max": 100, "step": 1, "controls": true }
    },
    {
      "field": "taskTags",
      "label": "运行标签",
      "component": "vxe-input",
      "props": { "placeholder": "多个标签使用逗号分隔", "clearable": true }
    },
    {
      "field": "queueName",
      "label": "队列名称",
      "component": "vxe-input",
      "props": { "placeholder": "例如：workflow-jobs", "clearable": true }
    },
    {
      "field": "concurrencyLimit",
      "label": "并发上限",
      "component": "lc-number-input",
      "props": { "min": 1, "step": 1, "controls": true }
    },
    {
      "field": "maxAttempts",
      "label": "最大尝试次数",
      "component": "lc-number-input",
      "props": { "min": 0, "step": 1, "controls": true }
    },
    {
      "field": "retryFactor",
      "label": "重试退避倍数",
      "component": "lc-number-input",
      "props": { "min": 1, "step": 0.1, "controls": true }
    },
    {
      "field": "retryMinTimeoutMs",
      "label": "最小重试间隔（毫秒）",
      "component": "lc-number-input",
      "props": { "min": 0, "step": 1, "controls": true }
    },
    {
      "field": "retryMaxTimeoutMs",
      "label": "最大重试间隔（毫秒）",
      "component": "lc-number-input",
      "props": { "min": 0, "step": 1, "controls": true }
    }
  ]
  $json$::jsonb as fields
),
advanced_fields as (
  select $json$
  [
    {
      "field": "metadata",
      "label": "运行元数据",
      "component": "lc-json-editor",
      "props": {
        "dialogTitle": "编辑运行元数据",
        "jsonRootType": "object",
        "jsonValueMode": "parsed",
        "placeholder": "打开 JSON 编辑器"
      }
    },
    {
      "field": "rawConfig",
      "label": "完整配置",
      "component": "lc-json-editor",
      "help": "修改后将替换节点的全部 config。",
      "props": {
        "dialogTitle": "编辑节点完整配置",
        "jsonRootType": "object",
        "jsonValueMode": "parsed",
        "placeholder": "打开 JSON 编辑器"
      }
    }
  ]
  $json$::jsonb as fields
),
catalog (
  node_type,
  code,
  name,
  description,
  config_key,
  config_label,
  config_fields,
  task_capable,
  task_required
) as (
  values
    (
      'start',
      'trigger-workflow.node.start',
      '触发器节点 - 开始',
      '开始节点的属性表单。',
      null,
      null,
      '[]'::jsonb,
      false,
      false
    ),
    (
      'schedule',
      'trigger-workflow.node.schedule',
      '触发器节点 - 定时触发',
      '定时触发节点的属性表单。',
      'trigger',
      '触发配置',
      $fields$
      [
        {
          "field": "cron",
          "label": "Cron 表达式",
          "component": "vxe-input",
          "props": { "placeholder": "例如：0 8 * * *", "clearable": true },
          "rules": [{ "required": true, "message": "Cron 表达式不能为空" }]
        },
        {
          "field": "timezone",
          "label": "时区",
          "component": "vxe-input",
          "props": { "placeholder": "Asia/Shanghai", "clearable": true }
        },
        {
          "field": "externalId",
          "label": "外部标识",
          "component": "vxe-input",
          "props": { "placeholder": "用于同步 Trigger.dev 计划", "clearable": true }
        }
      ]
      $fields$::jsonb,
      false,
      false
    ),
    (
      'webhook',
      'trigger-workflow.node.webhook',
      '触发器节点 - Webhook',
      'Webhook 触发节点的属性表单。',
      'trigger',
      '触发配置',
      $fields$
      [
        {
          "field": "webhookPath",
          "label": "请求路径",
          "component": "vxe-input",
          "props": { "placeholder": "/events/created", "clearable": true },
          "rules": [{ "required": true, "message": "请求路径不能为空" }]
        },
        {
          "field": "webhookMethod",
          "label": "请求方法",
          "component": "vxe-select",
          "props": { "clearable": false },
          "options": [
            { "label": "GET", "value": "GET" },
            { "label": "POST", "value": "POST" },
            { "label": "PUT", "value": "PUT" },
            { "label": "PATCH", "value": "PATCH" },
            { "label": "DELETE", "value": "DELETE" }
          ]
        },
        {
          "field": "webhookSecretHeader",
          "label": "签名请求头",
          "component": "vxe-input",
          "props": { "placeholder": "例如：x-webhook-signature", "clearable": true }
        }
      ]
      $fields$::jsonb,
      false,
      false
    ),
    (
      'manualApproval',
      'trigger-workflow.node.manual-approval',
      '触发器节点 - 人工审批',
      '人工审批节点的属性表单。',
      'approval',
      '审批配置',
      $fields$
      [
        {
          "field": "assigneeType",
          "label": "处理人类型",
          "component": "vxe-select",
          "props": { "clearable": false },
          "options": [
            { "label": "用户", "value": "user" },
            { "label": "角色", "value": "role" },
            { "label": "团队", "value": "team" },
            { "label": "表达式", "value": "expression" }
          ],
          "rules": [{ "required": true, "message": "处理人类型不能为空" }]
        },
        {
          "field": "assigneeIds",
          "label": "处理人标识",
          "component": "vxe-input",
          "props": { "placeholder": "多个标识使用逗号分隔", "clearable": true }
        },
        {
          "field": "approvalTimeoutSeconds",
          "label": "审批超时秒数",
          "component": "lc-number-input",
          "props": { "min": 1, "step": 1, "controls": true }
        },
        {
          "field": "onTimeout",
          "label": "超时策略",
          "component": "vxe-select",
          "props": { "clearable": false },
          "options": [
            { "label": "标记失败", "value": "fail" },
            { "label": "自动通过", "value": "autoApprove" },
            { "label": "自动驳回", "value": "autoReject" },
            { "label": "继续执行", "value": "continue" }
          ]
        }
      ]
      $fields$::jsonb,
      true,
      false
    ),
    (
      'condition',
      'trigger-workflow.node.condition',
      '触发器节点 - 条件分支',
      '条件分支节点的属性表单。',
      'branch',
      '分支配置',
      $fields$
      [
        {
          "field": "expression",
          "label": "预处理表达式",
          "component": "vxe-textarea",
          "props": { "placeholder": "实际分支条件可在连接线上配置", "rows": 5, "resize": "vertical" }
        },
        {
          "field": "branches",
          "label": "分支元数据",
          "component": "lc-json-editor",
          "props": {
            "dialogTitle": "编辑分支元数据",
            "jsonRootType": "array",
            "jsonValueMode": "parsed",
            "placeholder": "打开 JSON 编辑器"
          }
        }
      ]
      $fields$::jsonb,
      false,
      false
    ),
    (
      'parallel',
      'trigger-workflow.node.parallel',
      '触发器节点 - 并行分支',
      '并行分支节点的属性表单。',
      'branch',
      '并行配置',
      $fields$
      [
        {
          "field": "branches",
          "label": "分支元数据",
          "component": "lc-json-editor",
          "props": {
            "dialogTitle": "编辑并行分支元数据",
            "jsonRootType": "array",
            "jsonValueMode": "parsed",
            "placeholder": "打开 JSON 编辑器"
          }
        }
      ]
      $fields$::jsonb,
      false,
      false
    ),
    (
      'task',
      'trigger-workflow.node.task',
      '触发器节点 - 执行任务',
      '执行任务节点的属性表单。',
      null,
      null,
      '[]'::jsonb,
      true,
      true
    ),
    (
      'triggerAndWait',
      'trigger-workflow.node.trigger-and-wait',
      '触发器节点 - 触发并等待',
      '触发并等待节点的属性表单。',
      null,
      null,
      '[]'::jsonb,
      true,
      true
    ),
    (
      'batchTrigger',
      'trigger-workflow.node.batch-trigger',
      '触发器节点 - 批量触发',
      '批量触发节点的属性表单。',
      'data',
      '批量配置',
      $fields$
      [
        {
          "field": "connector",
          "label": "连接器",
          "component": "vxe-input",
          "props": { "placeholder": "postgres / http / salesforce", "clearable": true }
        },
        {
          "field": "operation",
          "label": "数据操作",
          "component": "vxe-select",
          "props": { "clearable": false },
          "options": [
            { "label": "提取", "value": "extract" },
            { "label": "写入", "value": "load" },
            { "label": "同步", "value": "sync" },
            { "label": "查询", "value": "query" },
            { "label": "更新或插入", "value": "upsert" }
          ]
        },
        { "field": "source", "label": "数据源", "component": "vxe-input", "props": { "clearable": true } },
        { "field": "target", "label": "目标位置", "component": "vxe-input", "props": { "clearable": true } },
        { "field": "batchSize", "label": "批次大小", "component": "lc-number-input", "props": { "min": 1, "step": 1, "controls": true } },
        {
          "field": "dataMapping",
          "label": "字段映射",
          "component": "lc-json-editor",
          "props": { "dialogTitle": "编辑数据字段映射", "jsonRootType": "object", "jsonValueMode": "parsed" }
        }
      ]
      $fields$::jsonb,
      true,
      true
    ),
    (
      'wait',
      'trigger-workflow.node.wait',
      '触发器节点 - 等待',
      '等待节点的属性表单。',
      'wait',
      '等待配置',
      $fields$
      [
        {
          "field": "waitMode",
          "label": "等待方式",
          "component": "vxe-select",
          "props": { "clearable": false },
          "options": [
            { "label": "等待时长", "value": "duration" },
            { "label": "指定时间", "value": "until" },
            { "label": "等待令牌", "value": "token" }
          ],
          "rules": [{ "required": true, "message": "等待方式不能为空" }]
        },
        {
          "field": "waitDuration",
          "label": "等待时长",
          "component": "vxe-input",
          "props": {
            "placeholder": "ISO 8601，例如：PT1H",
            "clearable": true,
            "visibleWhen": { "field": "waitMode", "equals": "duration" }
          }
        },
        {
          "field": "waitUntil",
          "label": "结束时间",
          "component": "vxe-input",
          "props": {
            "type": "datetime-local",
            "clearable": true,
            "visibleWhen": { "field": "waitMode", "equals": "until" }
          }
        },
        {
          "field": "waitTokenKey",
          "label": "令牌键",
          "component": "vxe-input",
          "props": {
            "placeholder": "用于恢复执行的令牌标识",
            "clearable": true,
            "visibleWhen": { "field": "waitMode", "equals": "token" }
          }
        }
      ]
      $fields$::jsonb,
      false,
      false
    ),
    (
      'dataSource',
      'trigger-workflow.node.data-source',
      '触发器节点 - 读取数据',
      '读取数据节点的属性表单。',
      'data',
      '数据配置',
      $fields$
      [
        {
          "field": "connector",
          "label": "连接器",
          "component": "vxe-input",
          "props": { "placeholder": "postgres / http / salesforce", "clearable": true },
          "rules": [{ "required": true, "message": "连接器不能为空" }]
        },
        {
          "field": "operation",
          "label": "数据操作",
          "component": "vxe-select",
          "props": { "clearable": false },
          "options": [
            { "label": "提取", "value": "extract" },
            { "label": "写入", "value": "load" },
            { "label": "同步", "value": "sync" },
            { "label": "查询", "value": "query" },
            { "label": "更新或插入", "value": "upsert" }
          ]
        },
        { "field": "source", "label": "数据源", "component": "vxe-input", "props": { "placeholder": "表、接口或对象名称", "clearable": true } },
        { "field": "target", "label": "目标位置", "component": "vxe-input", "props": { "placeholder": "目标表、接口或对象名称", "clearable": true } },
        { "field": "batchSize", "label": "批次大小", "component": "lc-number-input", "props": { "min": 1, "step": 1, "controls": true } },
        {
          "field": "dataMapping",
          "label": "字段映射",
          "component": "lc-json-editor",
          "props": { "dialogTitle": "编辑数据字段映射", "jsonRootType": "object", "jsonValueMode": "parsed" }
        }
      ]
      $fields$::jsonb,
      true,
      false
    ),
    (
      'transform',
      'trigger-workflow.node.transform',
      '触发器节点 - 转换数据',
      '转换数据节点的属性表单。',
      'transform',
      '转换配置',
      $fields$
      [
        {
          "field": "expression",
          "label": "处理表达式",
          "component": "vxe-textarea",
          "props": { "placeholder": "填写数据映射或转换表达式", "rows": 6, "resize": "vertical" }
        },
        {
          "field": "dataMapping",
          "label": "字段映射",
          "component": "lc-json-editor",
          "props": { "dialogTitle": "编辑字段映射", "jsonRootType": "object", "jsonValueMode": "parsed" }
        }
      ]
      $fields$::jsonb,
      true,
      false
    ),
    (
      'dataSink',
      'trigger-workflow.node.data-sink',
      '触发器节点 - 写入数据',
      '写入数据节点的属性表单。',
      'data',
      '数据配置',
      $fields$
      [
        {
          "field": "connector",
          "label": "连接器",
          "component": "vxe-input",
          "props": { "placeholder": "postgres / http / salesforce", "clearable": true },
          "rules": [{ "required": true, "message": "连接器不能为空" }]
        },
        {
          "field": "operation",
          "label": "数据操作",
          "component": "vxe-select",
          "props": { "clearable": false },
          "options": [
            { "label": "提取", "value": "extract" },
            { "label": "写入", "value": "load" },
            { "label": "同步", "value": "sync" },
            { "label": "查询", "value": "query" },
            { "label": "更新或插入", "value": "upsert" }
          ]
        },
        { "field": "source", "label": "数据源", "component": "vxe-input", "props": { "placeholder": "表、接口或对象名称", "clearable": true } },
        { "field": "target", "label": "目标位置", "component": "vxe-input", "props": { "placeholder": "目标表、接口或对象名称", "clearable": true } },
        { "field": "batchSize", "label": "批次大小", "component": "lc-number-input", "props": { "min": 1, "step": 1, "controls": true } },
        {
          "field": "dataMapping",
          "label": "字段映射",
          "component": "lc-json-editor",
          "props": { "dialogTitle": "编辑数据字段映射", "jsonRootType": "object", "jsonValueMode": "parsed" }
        }
      ]
      $fields$::jsonb,
      true,
      false
    ),
    (
      'agent',
      'trigger-workflow.node.agent',
      '触发器节点 - AI 智能体',
      'AI 智能体节点的属性表单。',
      'ai',
      'AI 配置',
      $fields$
      [
        {
          "field": "aiProvider",
          "label": "模型服务",
          "component": "vxe-select",
          "props": { "clearable": false },
          "options": [
            { "label": "OpenAI", "value": "openai" },
            { "label": "Anthropic", "value": "anthropic" },
            { "label": "自定义", "value": "custom" }
          ],
          "rules": [{ "required": true, "message": "模型服务不能为空" }]
        },
        {
          "field": "aiModel",
          "label": "模型名称",
          "component": "vxe-input",
          "props": { "placeholder": "例如：gpt-4.1", "clearable": true },
          "rules": [{ "required": true, "message": "模型名称不能为空" }]
        },
        {
          "field": "aiPrompt",
          "label": "系统提示词",
          "component": "vxe-textarea",
          "props": { "placeholder": "描述角色、目标、边界和输出格式", "rows": 8, "resize": "vertical" }
        },
        { "field": "aiTools", "label": "可用工具", "component": "vxe-input", "props": { "placeholder": "多个工具使用逗号分隔", "clearable": true } },
        { "field": "memoryKey", "label": "上下文记忆键", "component": "vxe-input", "props": { "placeholder": "{{payload.customerId}}", "clearable": true } },
        { "field": "aiMaxTurns", "label": "最大轮次", "component": "lc-number-input", "props": { "min": 1, "step": 1, "controls": true } },
        { "field": "requireHumanReview", "label": "需要人工复核", "component": "vxe-switch", "props": { "openLabel": "需要", "closeLabel": "不需要" } }
      ]
      $fields$::jsonb,
      true,
      false
    ),
    (
      'tool',
      'trigger-workflow.node.tool',
      '触发器节点 - 智能体工具',
      '智能体工具节点的属性表单。',
      'tool',
      '工具配置',
      $fields$
      [
        { "field": "aiTools", "label": "工具名称", "component": "vxe-input", "props": { "placeholder": "多个工具使用逗号分隔", "clearable": true } },
        { "field": "memoryKey", "label": "上下文记忆键", "component": "vxe-input", "props": { "placeholder": "{{payload.customerId}}", "clearable": true } }
      ]
      $fields$::jsonb,
      true,
      true
    ),
    (
      'memory',
      'trigger-workflow.node.memory',
      '触发器节点 - 上下文记忆',
      '上下文记忆节点的属性表单。',
      'memory',
      '记忆配置',
      $fields$
      [
        {
          "field": "memoryKey",
          "label": "记忆键",
          "component": "vxe-input",
          "props": { "placeholder": "{{payload.customerId}}", "clearable": true },
          "rules": [{ "required": true, "message": "记忆键不能为空" }]
        }
      ]
      $fields$::jsonb,
      true,
      false
    ),
    (
      'humanReview',
      'trigger-workflow.node.human-review',
      '触发器节点 - 人工复核',
      '人工复核节点的属性表单。',
      'approval',
      '复核配置',
      $fields$
      [
        {
          "field": "assigneeType",
          "label": "处理人类型",
          "component": "vxe-select",
          "props": { "clearable": false },
          "options": [
            { "label": "用户", "value": "user" },
            { "label": "角色", "value": "role" },
            { "label": "团队", "value": "team" },
            { "label": "表达式", "value": "expression" }
          ],
          "rules": [{ "required": true, "message": "处理人类型不能为空" }]
        },
        { "field": "assigneeIds", "label": "处理人标识", "component": "vxe-input", "props": { "placeholder": "多个标识使用逗号分隔", "clearable": true } },
        { "field": "approvalTimeoutSeconds", "label": "复核超时秒数", "component": "lc-number-input", "props": { "min": 1, "step": 1, "controls": true } },
        {
          "field": "onTimeout",
          "label": "超时策略",
          "component": "vxe-select",
          "props": { "clearable": false },
          "options": [
            { "label": "标记失败", "value": "fail" },
            { "label": "自动通过", "value": "autoApprove" },
            { "label": "自动驳回", "value": "autoReject" },
            { "label": "继续执行", "value": "continue" }
          ]
        }
      ]
      $fields$::jsonb,
      true,
      false
    ),
    (
      'end',
      'trigger-workflow.node.end',
      '触发器节点 - 结束',
      '结束节点的属性表单。',
      null,
      null,
      '[]'::jsonb,
      false,
      false
    )
),
resolved as (
  select
    catalog.*,
    task_fields.fields as resolved_task_fields
  from catalog
  cross join task_fields
),
definitions as (
  select
    resolved.code,
    resolved.name,
    resolved.description,
    jsonb_build_object(
      'columns', 1,
      'fields',
        common_fields.fields
        || resolved.config_fields
        || case when resolved.task_capable then resolved.resolved_task_fields else '[]'::jsonb end
        || case when resolved.task_capable then queue_retry_fields.fields else '[]'::jsonb end
        || advanced_fields.fields,
      'layout', jsonb_build_array(
        jsonb_build_object(
          'kind', 'tabs',
          'defaultKey', 'basic',
          'tabs',
            jsonb_build_array(
              jsonb_build_object(
                'key', 'basic',
                'label', '基础信息',
                'blocks', $blocks$
                [
                  { "kind": "field", "field": "id" },
                  { "kind": "field", "field": "name" },
                  { "kind": "field", "field": "description" }
                ]
                $blocks$::jsonb
              )
            )
            || case
              when resolved.config_key is null then '[]'::jsonb
              else jsonb_build_array(
                jsonb_build_object(
                  'key', resolved.config_key,
                  'label', resolved.config_label,
                  'blocks', (
                    select coalesce(
                      jsonb_agg(
                        jsonb_build_object('kind', 'field', 'field', field.value ->> 'field')
                        order by field.ordinality
                      ),
                      '[]'::jsonb
                    )
                    from jsonb_array_elements(resolved.config_fields)
                      with ordinality as field(value, ordinality)
                  )
                )
              )
            end
            || case
              when resolved.task_capable then $tabs$
                [
                  {
                    "key": "task",
                    "label": "任务配置",
                    "blocks": [
                      { "kind": "field", "field": "taskType" },
                      { "kind": "field", "field": "frontendFunction" },
                      { "kind": "field", "field": "backendFunction" },
                      { "kind": "field", "field": "procedureName" },
                      { "kind": "field", "field": "procedureSchema" },
                      { "kind": "field", "field": "taskId" },
                      { "kind": "field", "field": "taskImportPath" },
                      { "kind": "field", "field": "taskInput" },
                      { "kind": "field", "field": "outputPath" },
                      { "kind": "field", "field": "outputMapping" }
                    ]
                  },
                  {
                    "key": "execution",
                    "label": "执行策略",
                    "blocks": [
                      { "kind": "field", "field": "timeoutSeconds" },
                      { "kind": "field", "field": "failureStrategy" },
                      { "kind": "field", "field": "defaultOutput" },
                      { "kind": "field", "field": "idempotencyKey" },
                      { "kind": "field", "field": "priority" },
                      { "kind": "field", "field": "taskTags" },
                      { "kind": "field", "field": "queueName" },
                      { "kind": "field", "field": "concurrencyLimit" },
                      { "kind": "field", "field": "maxAttempts" },
                      { "kind": "field", "field": "retryFactor" },
                      { "kind": "field", "field": "retryMinTimeoutMs" },
                      { "kind": "field", "field": "retryMaxTimeoutMs" }
                    ]
                  }
                ]
                $tabs$::jsonb
              else '[]'::jsonb
            end
            || $tabs$
              [
                {
                  "key": "advanced",
                  "label": "高级配置",
                  "blocks": [
                    { "kind": "field", "field": "metadata" },
                    { "kind": "field", "field": "rawConfig" }
                  ]
                }
              ]
              $tabs$::jsonb
        )
      ),
      'actions', '[]'::jsonb
    ) as schema
  from resolved
  cross join common_fields
  cross join queue_retry_fields
  cross join advanced_fields
)
insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled
)
select
  code,
  name,
  description,
  schema,
  true
from definitions
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled
) values (
  'trigger-workflow.edge',
  '触发器工作流 - 连接配置',
  '工作流连接线及执行条件属性表单。',
  $schema$
  {
    "columns": 1,
    "fields": [
      {
        "field": "name",
        "label": "连接名称",
        "component": "vxe-input",
        "props": { "clearable": true }
      },
      {
        "field": "conditionType",
        "label": "执行条件",
        "component": "vxe-select",
        "props": { "clearable": false },
        "options": [
          { "label": "始终执行", "value": "always" },
          { "label": "字段判断", "value": "field" },
          { "label": "表达式判断", "value": "expression" }
        ]
      },
      {
        "field": "conditionField",
        "label": "字段路径",
        "component": "vxe-input",
        "props": {
          "placeholder": "例如：payload.amount",
          "clearable": true,
          "visibleWhen": { "field": "conditionType", "equals": "field" }
        }
      },
      {
        "field": "conditionOperator",
        "label": "比较方式",
        "component": "vxe-select",
        "props": {
          "clearable": false,
          "visibleWhen": { "field": "conditionType", "equals": "field" }
        },
        "options": [
          { "label": "等于", "value": "eq" },
          { "label": "不等于", "value": "ne" },
          { "label": "大于", "value": "gt" },
          { "label": "大于等于", "value": "gte" },
          { "label": "小于", "value": "lt" },
          { "label": "小于等于", "value": "lte" },
          { "label": "包含", "value": "contains" },
          { "label": "属于集合", "value": "in" }
        ]
      },
      {
        "field": "conditionValue",
        "label": "比较值",
        "component": "vxe-input",
        "props": {
          "clearable": true,
          "visibleWhen": { "field": "conditionType", "equals": "field" }
        }
      },
      {
        "field": "conditionExpression",
        "label": "条件表达式",
        "component": "vxe-textarea",
        "props": {
          "rows": 5,
          "resize": "vertical",
          "visibleWhen": { "field": "conditionType", "equals": "expression" }
        }
      }
    ],
    "layout": [
      {
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          {
            "key": "basic",
            "label": "基础信息",
            "blocks": [{ "kind": "field", "field": "name" }]
          },
          {
            "key": "condition",
            "label": "执行条件",
            "blocks": [
              { "kind": "field", "field": "conditionType" },
              { "kind": "field", "field": "conditionField" },
              { "kind": "field", "field": "conditionOperator" },
              { "kind": "field", "field": "conditionValue" },
              { "kind": "field", "field": "conditionExpression" }
            ]
          }
        ]
      }
    ],
    "actions": []
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

notify pgrst, 'reload schema';
