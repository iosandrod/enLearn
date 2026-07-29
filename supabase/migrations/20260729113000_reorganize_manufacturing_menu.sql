-- Normalize manufacturing menu labels for the redesigned dashboard sidebar.

update public.admin_routes
set
  title = case code
    when 'lowcode-pages' then '低代码页面管理'
    when 'entity-design' then '实体设计器'
    when 'trigger-workflow-designer' then '触发器编排器'
    when 'workflow-jobs' then '作业定义'
    when 'workflow-job-runs' then '作业运行记录'
    when 'workflow-timer-jobs' then '定时器任务'
    else title
  end,
  updated_at = timezone('utc'::text, now())
where code in (
  'lowcode-pages',
  'entity-design',
  'trigger-workflow-designer',
  'workflow-jobs',
  'workflow-job-runs',
  'workflow-timer-jobs'
);
