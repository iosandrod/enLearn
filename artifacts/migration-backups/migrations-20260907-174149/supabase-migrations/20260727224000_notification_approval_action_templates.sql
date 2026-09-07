-- Inbox templates for workflow approval action notifications.

insert into public.notification_templates (
  code,
  name,
  event_type,
  channel,
  title_template,
  content_template,
  status
) values
  (
    'approval_task_completed_inbox',
    'Approval task completed inbox template',
    'approval.task.completed',
    'inbox',
    '审批已通过：{{title}}',
    '审批人已完成处理。{{comment}}',
    'active'
  ),
  (
    'approval_task_rejected_inbox',
    'Approval task rejected inbox template',
    'approval.task.rejected',
    'inbox',
    '审批已驳回：{{title}}',
    '审批任务被驳回。{{comment}}',
    'active'
  ),
  (
    'approval_task_transferred_inbox',
    'Approval task transferred inbox template',
    'approval.task.transferred',
    'inbox',
    '审批已转交：{{title}}',
    '有一条审批任务转交给你，请及时处理。{{comment}}',
    'active'
  ),
  (
    'approval_task_add_signed_inbox',
    'Approval task add-signed inbox template',
    'approval.task.add_signed',
    'inbox',
    '新的加签审批：{{title}}',
    '你收到一条加签审批任务，请及时处理。{{comment}}',
    'active'
  )
on conflict (code) do update set
  name = excluded.name,
  event_type = excluded.event_type,
  channel = excluded.channel,
  title_template = excluded.title_template,
  content_template = excluded.content_template,
  status = excluded.status,
  updated_at = timezone('utc'::text, now());
