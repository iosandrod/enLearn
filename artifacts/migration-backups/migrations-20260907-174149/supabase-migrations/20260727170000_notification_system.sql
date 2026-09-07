-- Trigger.dev driven notification system tables, permissions, and message center metadata.

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  event_type text not null,
  source_type text,
  source_id text,
  actor_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'failed')),
  error_message text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  processed_at timestamp with time zone,
  unique (tenant_id, idempotency_key)
);

create index if not exists idx_notification_events_status
  on public.notification_events (tenant_id, status, created_at desc);

create index if not exists idx_notification_events_type
  on public.notification_events (tenant_id, event_type, created_at desc);

drop trigger if exists set_notification_events_updated_at on public.notification_events;
create trigger set_notification_events_updated_at
before update on public.notification_events
for each row
execute function public.set_updated_at();

create table if not exists public.notification_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  event_id uuid references public.notification_events(id) on delete set null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'system'
    check (category in ('system', 'approval', 'mention', 'security', 'business')),
  channel text not null default 'inbox'
    check (channel in ('inbox')),
  title text not null,
  content text not null default '',
  link_url text,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  source_type text,
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (tenant_id, recipient_id, source_type, source_id, category)
);

create index if not exists idx_notification_messages_recipient_unread
  on public.notification_messages (tenant_id, recipient_id, read_at, created_at desc);

create index if not exists idx_notification_messages_recipient_category
  on public.notification_messages (tenant_id, recipient_id, category, created_at desc);

drop trigger if exists set_notification_messages_updated_at on public.notification_messages;
create trigger set_notification_messages_updated_at
before update on public.notification_messages
for each row
execute function public.set_updated_at();

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  event_id uuid references public.notification_events(id) on delete set null,
  message_id uuid references public.notification_messages(id) on delete set null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  target text,
  template_code text,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'canceled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  error_message text,
  next_retry_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (tenant_id, channel, event_id, recipient_id)
);

create index if not exists idx_notification_deliveries_retry
  on public.notification_deliveries (tenant_id, status, next_retry_at);

create index if not exists idx_notification_deliveries_recipient
  on public.notification_deliveries (tenant_id, recipient_id, created_at desc);

drop trigger if exists set_notification_deliveries_updated_at on public.notification_deliveries;
create trigger set_notification_deliveries_updated_at
before update on public.notification_deliveries
for each row
execute function public.set_updated_at();

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  event_type text not null,
  channel text not null check (channel in ('inbox', 'email', 'sms')),
  title_template text not null,
  content_template text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists idx_notification_templates_lookup
  on public.notification_templates (event_type, channel, status);

drop trigger if exists set_notification_templates_updated_at on public.notification_templates;
create trigger set_notification_templates_updated_at
before update on public.notification_templates
for each row
execute function public.set_updated_at();

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null
    check (category in ('system', 'approval', 'mention', 'security', 'business')),
  inbox_enabled boolean not null default true,
  email_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  quiet_hours jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (tenant_id, user_id, category)
);

create index if not exists idx_notification_preferences_user
  on public.notification_preferences (tenant_id, user_id);

drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
before update on public.notification_preferences
for each row
execute function public.set_updated_at();

alter table public.notification_events enable row level security;
alter table public.notification_messages enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_preferences enable row level security;

grant select, insert, update, delete on public.notification_events to authenticated, service_role;
grant select, insert, update, delete on public.notification_messages to authenticated, service_role;
grant select, insert, update, delete on public.notification_deliveries to authenticated, service_role;
grant select, insert, update, delete on public.notification_templates to authenticated, service_role;
grant select, insert, update, delete on public.notification_preferences to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_messages'
      and policyname = 'Users can read own notification messages'
  ) then
    create policy "Users can read own notification messages"
      on public.notification_messages
      for select
      to authenticated
      using (
        recipient_id = auth.uid()
        or public.has_app_permission('notification.messages.manage')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_messages'
      and policyname = 'Users can update own notification read state'
  ) then
    create policy "Users can update own notification read state"
      on public.notification_messages
      for update
      to authenticated
      using (recipient_id = auth.uid())
      with check (recipient_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_messages'
      and policyname = 'Permission holders can manage notification messages'
  ) then
    create policy "Permission holders can manage notification messages"
      on public.notification_messages
      for all
      using (public.has_app_permission('notification.messages.manage'))
      with check (public.has_app_permission('notification.messages.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_preferences'
      and policyname = 'Users can manage own notification preferences'
  ) then
    create policy "Users can manage own notification preferences"
      on public.notification_preferences
      for all
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_preferences'
      and policyname = 'Permission holders can manage notification preferences'
  ) then
    create policy "Permission holders can manage notification preferences"
      on public.notification_preferences
      for all
      using (public.has_app_permission('notification.messages.manage'))
      with check (public.has_app_permission('notification.messages.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_events'
      and policyname = 'Permission holders can manage notification events'
  ) then
    create policy "Permission holders can manage notification events"
      on public.notification_events
      for all
      using (public.has_app_permission('notification.messages.manage'))
      with check (public.has_app_permission('notification.messages.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_deliveries'
      and policyname = 'Permission holders can manage notification deliveries'
  ) then
    create policy "Permission holders can manage notification deliveries"
      on public.notification_deliveries
      for all
      using (public.has_app_permission('notification.deliveries.manage'))
      with check (public.has_app_permission('notification.deliveries.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_templates'
      and policyname = 'Permission holders can manage notification templates'
  ) then
    create policy "Permission holders can manage notification templates"
      on public.notification_templates
      for all
      using (public.has_app_permission('notification.templates.manage'))
      with check (public.has_app_permission('notification.templates.manage'));
  end if;
end $$;

insert into public.admin_permissions (
  code,
  name,
  description,
  resource_type,
  resource_key,
  action_code,
  status,
  sort_order
) values
  (
    'notification.messages.read',
    'Read Notification Messages',
    'Read personal notification messages and unread counters.',
    'api',
    'notification_messages',
    'read',
    'active',
    110
  ),
  (
    'notification.messages.manage',
    'Manage Notification Messages',
    'Manage notification message records.',
    'entity',
    'notification_messages',
    'manage',
    'active',
    120
  ),
  (
    'notification.notices.manage',
    'Manage System Notices',
    'Create and dispatch system notification notices.',
    'api',
    'notification_notices',
    'manage',
    'active',
    130
  ),
  (
    'notification.templates.manage',
    'Manage Notification Templates',
    'Create and update notification templates.',
    'entity',
    'notification_templates',
    'manage',
    'active',
    140
  ),
  (
    'notification.deliveries.manage',
    'Manage Notification Deliveries',
    'Inspect and retry notification delivery records.',
    'entity',
    'notification_deliveries',
    'manage',
    'active',
    150
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  resource_key = excluded.resource_key,
  action_code = excluded.action_code,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions on permissions.code in (
  'notification.messages.read',
  'notification.messages.manage',
  'notification.notices.manage',
  'notification.templates.manage',
  'notification.deliveries.manage'
)
where roles.code = 'system_admin'
on conflict do nothing;

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
    'system_notice_inbox',
    'System notice inbox template',
    'system.notice.created',
    'inbox',
    '{{title}}',
    '{{content}}',
    'active'
  ),
  (
    'approval_task_created_inbox',
    'Approval task created inbox template',
    'approval.task.created',
    'inbox',
    '新的审批待办：{{title}}',
    '请及时处理审批任务。',
    'active'
  ),
  (
    'approval_cc_created_inbox',
    'Approval cc created inbox template',
    'approval.cc.created',
    'inbox',
    '新的审批抄送：{{title}}',
    '你收到一条审批抄送。',
    'active'
  ),
  (
    'mention_created_inbox',
    'Mention created inbox template',
    'mention.created',
    'inbox',
    '{{actorName}} @了你',
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

insert into public.lowcode_pages (
  code,
  route,
  title,
  description,
  layout,
  status,
  keep_alive,
  schema
) values (
  'notification-message-center',
  '/dashboard/messages',
  '消息中心',
  '统一查看系统提醒、审批通知和 @ 提醒。',
  'dashboard',
  'published',
  true,
  $json$
  {
    "code": "notification-message-center",
    "route": "/dashboard/messages",
    "title": "消息中心",
    "description": "统一查看系统提醒、审批通知和 @ 提醒。",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "messages": {
        "key": "messages",
        "label": "消息列表",
        "serviceName": "notification",
        "serviceMethod": "listMessages"
      }
    },
    "blocks": [
      {
        "id": "message-toolbar",
        "kind": "toolbar",
        "title": "消息中心",
        "description": "查看站内信、审批提醒和系统通知。",
        "actions": [
          {
            "code": "refresh",
            "label": "刷新",
            "type": "button"
          }
        ]
      },
      {
        "id": "message-search",
        "kind": "searchForm",
        "title": "筛选",
        "description": "按分类和未读状态筛选消息。",
        "targetSourceKey": "messages",
        "initialValues": {
          "category": "",
          "unread_only": false
        },
        "schema": {
          "columns": 3,
          "fields": [
            {
              "field": "category",
              "label": "分类",
              "component": "vxe-select",
              "props": {
                "clearable": true,
                "placeholder": "全部"
              },
              "options": [
                { "label": "系统提醒", "value": "system" },
                { "label": "审批通知", "value": "approval" },
                { "label": "@提醒", "value": "mention" },
                { "label": "安全提醒", "value": "security" },
                { "label": "业务通知", "value": "business" }
              ]
            },
            {
              "field": "priority",
              "label": "优先级",
              "component": "vxe-select",
              "props": {
                "clearable": true,
                "placeholder": "全部"
              },
              "options": [
                { "label": "低", "value": "low" },
                { "label": "普通", "value": "normal" },
                { "label": "高", "value": "high" },
                { "label": "紧急", "value": "urgent" }
              ]
            },
            {
              "field": "unread_only",
              "label": "仅未读",
              "component": "vxe-switch"
            }
          ],
          "actions": [
            { "code": "submit", "label": "筛选", "type": "submit", "status": "primary" },
            { "code": "reset", "label": "重置", "type": "reset" }
          ]
        }
      },
      {
        "id": "message-grid",
        "kind": "grid",
        "title": "消息列表",
        "description": "消息内容由 notification.listMessages 提供。",
        "sourceKey": "messages",
        "schema": {
          "rowActions": {
            "edit": false,
            "delete": false
          },
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "rowConfig": {
              "keyField": "id"
            },
            "columns": [
              {
                "field": "read_status",
                "title": "状态",
                "width": 90,
                "align": "center"
              },
              {
                "field": "category_label",
                "title": "分类",
                "width": 120
              },
              {
                "field": "title",
                "title": "标题",
                "minWidth": 220
              },
              {
                "field": "content",
                "title": "内容",
                "minWidth": 300
              },
              {
                "field": "priority_label",
                "title": "优先级",
                "width": 100,
                "align": "center"
              },
              {
                "field": "created_at",
                "title": "创建时间",
                "minWidth": 180,
                "formatter": {
                  "type": "datetime",
                  "locale": "zh-CN"
                }
              }
            ]
          }
        }
      }
    ]
  }
  $json$::jsonb
)
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
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
  'notification-message-center',
  '消息中心',
  '/dashboard/messages',
  'page',
  'notification',
  'notification-message-center',
  null,
  true,
  true,
  'dashboard',
  'active',
  25,
  '{"group": "notification", "module": "notification", "pageKind": "list"}'::jsonb
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
