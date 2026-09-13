export type TriggerTaskCatalogItem = {
  id: string;
  name: string;
  category: 'workflow' | 'planning' | 'notification' | 'frontend' | 'diagnostic';
  description: string;
  queueNames?: string[];
};

export const TRIGGER_TASK_CATALOG: readonly TriggerTaskCatalogItem[] = [
  {
    id: 'workflow.instance.run',
    name: '审批流程实例执行',
    category: 'workflow',
    description: '执行审批流程实例并管理等待点。'
  },
  {
    id: 'workflow.job.run',
    name: '通用后台作业',
    category: 'workflow',
    description: '执行作业定义中的通用后台任务。'
  },
  {
    id: 'workflow.trigger-workflow.run',
    name: '触发器编排执行器',
    category: 'workflow',
    description: '执行编辑器编译的流程计划，并按任务类型分派 Job 适配器。'
  },
  {
    id: 'workflow.adapter.frontend-command',
    name: '前端指令适配器',
    category: 'frontend',
    description: '在受限脚本运行时中构建并发布前端指令。',
    queueNames: ['trigger-workflow-jobs']
  },
  {
    id: 'workflow.adapter.backend-command',
    name: '后端指令适配器',
    category: 'workflow',
    description: '在受限脚本运行时中执行已授权的后端能力。',
    queueNames: ['trigger-workflow-jobs']
  },
  {
    id: 'workflow.adapter.stored-procedure',
    name: '存储过程适配器',
    category: 'workflow',
    description: '通过 Supabase RPC 执行流程节点配置的存储过程。',
    queueNames: ['trigger-workflow-jobs']
  },
  {
    id: 'workflow.adapter.human-task',
    name: '人工任务适配器',
    category: 'workflow',
    description: '创建持久化审批任务、通知处理人并等待人工决策。',
    queueNames: ['trigger-workflow-jobs']
  },
  {
    id: 'workflow.job.scheduled',
    name: '定时作业调度器',
    category: 'workflow',
    description: '接收 Trigger.dev 调度事件并启动实际作业。'
  },
  {
    id: 'workflow.supabase.users.log',
    name: '用户数据日志任务',
    category: 'workflow',
    description: '读取并记录经过脱敏的用户数据。'
  },
  {
    id: 'simple-approval-demo',
    name: '审批等待示例',
    category: 'diagnostic',
    description: '用于验证 Trigger.dev 持久化等待点。'
  },
  {
    id: 'trigger-waitpoint-diagnostic',
    name: '等待点诊断',
    category: 'diagnostic',
    description: '诊断等待点创建、完成和恢复执行链路。'
  }
] as const;

export const TRIGGER_TASK_IDENTIFIERS = TRIGGER_TASK_CATALOG.map((task) => task.id);
