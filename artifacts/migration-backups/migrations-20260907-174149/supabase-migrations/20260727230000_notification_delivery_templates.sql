-- Channel templates used by delivery, unread reminder, and digest tasks.

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
    'system_notice_email',
    'System notice email template',
    'system.notice.created',
    'email',
    '{{title}}',
    '{{content}}',
    'active'
  ),
  (
    'system_notice_sms',
    'System notice sms template',
    'system.notice.created',
    'sms',
    '{{title}}',
    '{{content}}',
    'active'
  ),
  (
    'approval_task_created_email',
    'Approval task created email template',
    'approval.task.created',
    'email',
    'New approval task: {{title}}',
    'Please handle this approval task in time.',
    'active'
  ),
  (
    'approval_task_created_sms',
    'Approval task created sms template',
    'approval.task.created',
    'sms',
    'New approval task: {{title}}',
    'Please handle it in time.',
    'active'
  ),
  (
    'approval_cc_created_email',
    'Approval cc created email template',
    'approval.cc.created',
    'email',
    'New approval cc: {{title}}',
    'You received an approval cc notification.',
    'active'
  ),
  (
    'approval_task_completed_email',
    'Approval task completed email template',
    'approval.task.completed',
    'email',
    'Approval completed: {{title}}',
    'The approval task has been completed. {{comment}}',
    'active'
  ),
  (
    'approval_task_rejected_email',
    'Approval task rejected email template',
    'approval.task.rejected',
    'email',
    'Approval rejected: {{title}}',
    'The approval task was rejected. {{comment}}',
    'active'
  ),
  (
    'approval_task_rejected_sms',
    'Approval task rejected sms template',
    'approval.task.rejected',
    'sms',
    'Approval rejected: {{title}}',
    '{{comment}}',
    'active'
  ),
  (
    'approval_task_transferred_email',
    'Approval task transferred email template',
    'approval.task.transferred',
    'email',
    'Approval transferred: {{title}}',
    'An approval task has been transferred to you. {{comment}}',
    'active'
  ),
  (
    'approval_task_add_signed_email',
    'Approval task add-signed email template',
    'approval.task.add_signed',
    'email',
    'New add-sign approval: {{title}}',
    'You received an add-sign approval task. {{comment}}',
    'active'
  ),
  (
    'notification_unread_reminder_inbox',
    'Unread reminder inbox template',
    'notification.unread.reminder',
    'inbox',
    'Unread reminder: {{title}}',
    '{{content}}',
    'active'
  ),
  (
    'notification_unread_reminder_email',
    'Unread reminder email template',
    'notification.unread.reminder',
    'email',
    'Unread reminder: {{title}}',
    '{{content}}',
    'active'
  ),
  (
    'notification_digest_inbox',
    'Notification digest inbox template',
    'notification.digest.created',
    'inbox',
    '{{title}}',
    '{{content}}',
    'active'
  ),
  (
    'notification_digest_email',
    'Notification digest email template',
    'notification.digest.created',
    'email',
    '{{title}}',
    '{{content}}',
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

insert into public.admin_routes (
  code,
  title,
  path,
  route_type,
  icon,
  page_code,
  permission_code,
  visible,
  keep_alive,
  layout,
  status,
  sort_order,
  metadata
) values (
  'notification-deliveries',
  '投递记录',
  '/dashboard/notification-deliveries',
  'page',
  'mail-send',
  null,
  'notification.deliveries.manage',
  true,
  true,
  'dashboard',
  'active',
  26,
  '{"group": "notification", "module": "notification", "pageKind": "operations"}'::jsonb
)
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  route_type = excluded.route_type,
  icon = excluded.icon,
  page_code = excluded.page_code,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());
