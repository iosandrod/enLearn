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
    id: 'workflow.timer.fire',
    name: '旧版流程定时器',
    category: 'workflow',
    description: '兼容旧版流程定时节点的执行任务。'
  },
  {
    id: 'planning.run',
    name: '生产计划运算',
    category: 'planning',
    description: '执行生产计划求解、校验与结果写入。',
    queueNames: ['planning-supply']
  },
  {
    id: 'notification.dispatch',
    name: '通知分发',
    category: 'notification',
    description: '处理站内信、邮件和短信通知分发。'
  },
  {
    id: 'notification.retryDelivery',
    name: '通知投递重试',
    category: 'notification',
    description: '重试发送失败且满足重试条件的通知。'
  },
  {
    id: 'notification.remindUnread',
    name: '未读通知提醒',
    category: 'notification',
    description: '在指定延迟后检查并提醒未读消息。'
  },
  {
    id: 'notification.digest',
    name: '通知摘要',
    category: 'notification',
    description: '汇总通知并生成收件人摘要。'
  },
  {
    id: 'notification.cleanup',
    name: '通知数据清理',
    category: 'notification',
    description: '归档已读消息并清理历史投递记录。'
  },
  {
    id: 'frontend.command.message.loop',
    name: '前端消息循环指令',
    category: 'frontend',
    description: '按设定间隔向指定用户或 Socket 连接发送前端指令。'
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

