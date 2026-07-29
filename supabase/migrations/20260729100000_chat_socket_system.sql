-- Chat conversations, messages, membership, and realtime socket support tables.

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  type text not null default 'direct'
    check (type in ('direct', 'group', 'system')),
  title text,
  created_by uuid references auth.users(id) on delete set null,
  last_message_id uuid,
  last_message_at timestamp with time zone,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists idx_chat_conversations_tenant_last_message
  on public.chat_conversations (tenant_id, last_message_at desc nulls last, updated_at desc);

drop trigger if exists set_chat_conversations_updated_at on public.chat_conversations;
create trigger set_chat_conversations_updated_at
before update on public.chat_conversations
for each row
execute function public.set_updated_at();

create table if not exists public.chat_conversation_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  status text not null default 'active'
    check (status in ('active', 'removed', 'left')),
  muted_at timestamp with time zone,
  pinned_at timestamp with time zone,
  last_read_message_id uuid,
  last_read_at timestamp with time zone,
  joined_at timestamp with time zone not null default timezone('utc'::text, now()),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (conversation_id, user_id)
);

create index if not exists idx_chat_members_user
  on public.chat_conversation_members (tenant_id, user_id, status, pinned_at desc nulls last, updated_at desc);

create index if not exists idx_chat_members_conversation
  on public.chat_conversation_members (tenant_id, conversation_id, status);

drop trigger if exists set_chat_conversation_members_updated_at on public.chat_conversation_members;
create trigger set_chat_conversation_members_updated_at
before update on public.chat_conversation_members
for each row
execute function public.set_updated_at();

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  content text not null default '',
  message_type text not null default 'text'
    check (message_type in ('text', 'image', 'file', 'system')),
  attachment_ids uuid[] not null default array[]::uuid[],
  reply_to_id uuid references public.chat_messages(id) on delete set null,
  status text not null default 'sent'
    check (status in ('sending', 'sent', 'failed', 'edited', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  edited_at timestamp with time zone,
  deleted_at timestamp with time zone
);

alter table public.chat_messages
  add column if not exists tenant_id text not null default 'default';

alter table public.chat_messages
  add column if not exists conversation_id uuid references public.chat_conversations(id) on delete cascade;

alter table public.chat_messages
  add column if not exists attachment_ids uuid[] not null default array[]::uuid[];

alter table public.chat_messages
  add column if not exists reply_to_id uuid references public.chat_messages(id) on delete set null;

alter table public.chat_messages
  add column if not exists status text not null default 'sent';

alter table public.chat_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.chat_messages
  add column if not exists updated_at timestamp with time zone not null default timezone('utc'::text, now());

alter table public.chat_messages
  add column if not exists edited_at timestamp with time zone;

alter table public.chat_messages
  add column if not exists deleted_at timestamp with time zone;

alter table public.chat_conversations
  drop constraint if exists chat_conversations_last_message_id_fkey;

alter table public.chat_conversations
  add constraint chat_conversations_last_message_id_fkey
  foreign key (last_message_id)
  references public.chat_messages(id)
  on delete set null;

create index if not exists idx_chat_messages_conversation_created
  on public.chat_messages (tenant_id, conversation_id, created_at desc);

create index if not exists idx_chat_messages_sender
  on public.chat_messages (tenant_id, sender_id, created_at desc);

drop trigger if exists set_chat_messages_updated_at on public.chat_messages;
create trigger set_chat_messages_updated_at
before update on public.chat_messages
for each row
execute function public.set_updated_at();

create table if not exists public.chat_message_reads (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (message_id, user_id)
);

create index if not exists idx_chat_reads_conversation_user
  on public.chat_message_reads (tenant_id, conversation_id, user_id, read_at desc);

create table if not exists public.chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (message_id, user_id, reaction)
);

create index if not exists idx_chat_reactions_message
  on public.chat_message_reactions (tenant_id, message_id);

alter table public.chat_conversations enable row level security;
alter table public.chat_conversation_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_reads enable row level security;
alter table public.chat_message_reactions enable row level security;

grant select, insert, update, delete on public.chat_conversations to authenticated, service_role;
grant select, insert, update, delete on public.chat_conversation_members to authenticated, service_role;
grant select, insert, update, delete on public.chat_messages to authenticated, service_role;
grant select, insert, update, delete on public.chat_message_reads to authenticated, service_role;
grant select, insert, update, delete on public.chat_message_reactions to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_conversations'
      and policyname = 'Users can read joined chat conversations'
  ) then
    create policy "Users can read joined chat conversations"
      on public.chat_conversations
      for select
      to authenticated
      using (
        exists (
          select 1 from public.chat_conversation_members members
          where members.conversation_id = chat_conversations.id
            and members.user_id = auth.uid()
            and members.status = 'active'
        )
        or public.has_app_permission('chat.manage')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_conversation_members'
      and policyname = 'Users can read own chat memberships'
  ) then
    create policy "Users can read own chat memberships"
      on public.chat_conversation_members
      for select
      to authenticated
      using (
        user_id = auth.uid()
        or public.has_app_permission('chat.manage')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'Users can read joined chat messages'
  ) then
    create policy "Users can read joined chat messages"
      on public.chat_messages
      for select
      to authenticated
      using (
        exists (
          select 1 from public.chat_conversation_members members
          where members.conversation_id = chat_messages.conversation_id
            and members.user_id = auth.uid()
            and members.status = 'active'
        )
        or public.has_app_permission('chat.manage')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_message_reads'
      and policyname = 'Users can manage own chat reads'
  ) then
    create policy "Users can manage own chat reads"
      on public.chat_message_reads
      for all
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_message_reactions'
      and policyname = 'Users can manage own chat reactions'
  ) then
    create policy "Users can manage own chat reactions"
      on public.chat_message_reactions
      for all
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_conversations'
      and policyname = 'Permission holders can manage chat conversations'
  ) then
    create policy "Permission holders can manage chat conversations"
      on public.chat_conversations
      for all
      using (public.has_app_permission('chat.manage'))
      with check (public.has_app_permission('chat.manage'));
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
    'chat.read',
    'Read Chat',
    'Read personal chat conversations and messages.',
    'api',
    'chat',
    'read',
    'active',
    160
  ),
  (
    'chat.manage',
    'Manage Chat',
    'Manage chat conversations, members, and messages.',
    'entity',
    'chat',
    'manage',
    'active',
    170
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
join public.admin_permissions permissions on permissions.code in ('chat.read', 'chat.manage')
where roles.code = 'system_admin'
on conflict do nothing;
