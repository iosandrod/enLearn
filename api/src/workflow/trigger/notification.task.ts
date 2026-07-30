import { task, tasks, wait } from '@trigger.dev/sdk';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { getWorkflowEnv } from '../common/env';

export const NOTIFICATION_DISPATCH_TASK_ID = 'notification.dispatch';
export const NOTIFICATION_RETRY_DELIVERY_TASK_ID = 'notification.retryDelivery';
export const NOTIFICATION_REMIND_UNREAD_TASK_ID = 'notification.remindUnread';
export const NOTIFICATION_DIGEST_TASK_ID = 'notification.digest';
export const NOTIFICATION_CLEANUP_TASK_ID = 'notification.cleanup';

type NotificationChannel = 'inbox' | 'email' | 'sms';
type DeliveryChannel = Exclude<NotificationChannel, 'inbox'>;

type NotificationDispatchPayload = {
  eventId?: string;
  tenantId?: string;
  idempotencyKey?: string;
  event?: NotificationDispatchEventInput;
};

type NotificationDispatchEventInput = {
  tenantId?: string;
  eventType: string;
  sourceType?: string;
  sourceId?: string;
  actorId?: string;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
};

type NotificationRetryDeliveryPayload = {
  tenantId?: string;
  limit?: number;
};

type NotificationRemindUnreadPayload = {
  tenantId?: string;
  messageId: string;
  delayMinutes?: number;
};

type NotificationDigestPayload = {
  tenantId?: string;
  recipientId?: string;
  category?: string;
  limit?: number;
};

type NotificationCleanupPayload = {
  tenantId?: string;
  archiveReadOlderThanDays?: number;
  deleteDeliveryOlderThanDays?: number;
};

type NotificationEventRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  event_type: string;
  source_type: string | null;
  source_id: string | null;
  actor_id: string | null;
  payload: Record<string, unknown>;
  idempotency_key: string;
  status: 'pending' | 'processing' | 'processed' | 'failed';
};

type NotificationMessageRow = QueryResultRow & {
  id: string;
};

type NotificationTemplateRow = QueryResultRow & {
  code: string;
  title_template: string;
  content_template: string;
};

type RecipientContactRow = QueryResultRow & {
  id: string;
  email: string | null;
  phone: string | null;
};

type NotificationPreferenceRow = QueryResultRow & {
  user_id: string;
  category: string;
  inbox_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
};

type NotificationDeliveryRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  event_id: string | null;
  message_id: string | null;
  recipient_id: string;
  channel: DeliveryChannel;
  target: string | null;
  template_code: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'canceled';
  attempt_count: number;
  event_type: string | null;
  payload: Record<string, unknown> | null;
  message_title: string | null;
  message_content: string | null;
};

type DispatchMessageInput = {
  tenantId: string;
  eventId: string;
  recipientId: string;
  category: string;
  title: string;
  content: string;
  linkUrl: string | null;
  priority: string;
  sourceType: string | null;
  sourceId: string | null;
  metadata: Record<string, unknown>;
};

type DeliveryInput = {
  tenantId: string;
  eventId: string;
  messageId: string | null;
  recipientId: string;
  channel: DeliveryChannel;
  target: string;
  templateCode: string;
};

type DispatchResult = {
  eventId: string;
  status: string;
  skipped?: boolean;
  messageCount: number;
  deliveryCount: number;
  sentCount: number;
  failedCount: number;
  reminderCount: number;
};

export async function runNotificationDispatchTask(payload: NotificationDispatchPayload) {
  const pool = createNotificationPool('notification dispatch task');
  try {
    return await withClient(pool, (client) => dispatchNotification(client, payload));
  } finally {
    await pool.end();
  }
}

export async function runLocalNotificationDispatchTask(payload: NotificationDispatchPayload) {
  const eventInput = payload.event;
  if (!eventInput) {
    return runNotificationDispatchTask(payload);
  }

  const tenantId = eventInput.tenantId?.trim() || payload.tenantId?.trim() || 'default';
  const eventType = eventInput.eventType.trim();
  const idempotencyKey = eventInput.idempotencyKey.trim();
  const eventPayload = eventInput.payload ?? {};
  if (!eventType || !idempotencyKey) {
    throw new Error('Notification eventType and idempotencyKey are required.');
  }

  const eventRows = await upsertRestRows<NotificationEventRow>(
    'notification_events',
    'tenant_id,idempotency_key',
    [
      {
        tenant_id: tenantId,
        event_type: eventType,
        source_type: eventInput.sourceType?.trim() || null,
        source_id: eventInput.sourceId?.trim() || null,
        actor_id: eventInput.actorId?.trim() || null,
        payload: eventPayload,
        idempotency_key: idempotencyKey,
        status: 'processed',
        processed_at: new Date().toISOString()
      }
    ]
  );
  const event = eventRows[0];
  if (!event) {
    throw new Error('Notification event could not be created.');
  }

  const recipientIds = readRecipientIds(eventPayload).filter(isUuid);
  if (!recipientIds.length) {
    return {
      eventId: event.id,
      status: 'processed',
      messageCount: 0,
      deliveryCount: 0,
      sentCount: 0,
      failedCount: 0,
      reminderCount: 0
    };
  }

  const template = localInboxTemplate(eventType);
  const title = renderTemplate(template.title_template, eventPayload);
  const content = renderTemplate(template.content_template, eventPayload);
  const rows = recipientIds.map((recipientId) => ({
    tenant_id: tenantId,
    event_id: event.id,
    recipient_id: recipientId,
    category: categoryForEvent(eventType),
    channel: 'inbox',
    title,
    content,
    link_url: readString(eventPayload.linkUrl ?? eventPayload.link_url) || null,
    priority: priorityForPayload(eventPayload),
    source_type: eventInput.sourceType?.trim() || null,
    source_id: eventInput.sourceId?.trim() || null,
    metadata: {
      templateCode: template.code,
      eventType,
      ...(isRecord(eventPayload.metadata) ? eventPayload.metadata : {})
    }
  }));

  const messages = await upsertRestRows<NotificationMessageRow>(
    'notification_messages',
    'tenant_id,recipient_id,source_type,source_id,category',
    rows
  );

  return {
    eventId: event.id,
    status: 'processed',
    messageCount: messages.length,
    deliveryCount: 0,
    sentCount: 0,
    failedCount: 0,
    reminderCount: 0
  };
}

export const notificationDispatchTask = task({
  id: NOTIFICATION_DISPATCH_TASK_ID,
  run: runNotificationDispatchTask
});

export const notificationRetryDeliveryTask = task({
  id: NOTIFICATION_RETRY_DELIVERY_TASK_ID,
  run: async (payload: NotificationRetryDeliveryPayload = {}) => {
    const pool = createNotificationPool('notification retry task');
    try {
      return await withClient(pool, (client) => retryDeliveries(client, payload));
    } finally {
      await pool.end();
    }
  }
});

export const notificationRemindUnreadTask = task({
  id: NOTIFICATION_REMIND_UNREAD_TASK_ID,
  run: async (payload: NotificationRemindUnreadPayload) => {
    const delayMinutes = Math.max(0, Math.floor(readNumber(payload.delayMinutes, 0)));
    if (delayMinutes > 0) {
      await wait.for({
        seconds: delayMinutes * 60,
        idempotencyKey: `notification-remind:${payload.messageId}:${delayMinutes}`
      });
    }

    const pool = createNotificationPool('notification unread reminder task');
    try {
      return await withClient(pool, (client) => remindUnreadMessage(client, payload));
    } finally {
      await pool.end();
    }
  }
});

export const notificationDigestTask = task({
  id: NOTIFICATION_DIGEST_TASK_ID,
  run: async (payload: NotificationDigestPayload = {}) => {
    const pool = createNotificationPool('notification digest task');
    try {
      return await withClient(pool, (client) => createUnreadDigest(client, payload));
    } finally {
      await pool.end();
    }
  }
});

export const notificationCleanupTask = task({
  id: NOTIFICATION_CLEANUP_TASK_ID,
  run: async (payload: NotificationCleanupPayload = {}) => {
    const pool = createNotificationPool('notification cleanup task');
    try {
      return await withClient(pool, (client) => cleanupNotifications(client, payload));
    } finally {
      await pool.end();
    }
  }
});

async function dispatchNotification(
  client: PoolClient,
  payload: NotificationDispatchPayload
): Promise<DispatchResult> {
  if (!payload.eventId?.trim() && !payload.event) {
    throw new Error('eventId or event is required by notification.dispatch.');
  }

  let activeEventId = payload.eventId?.trim();
  let event: NotificationEventRow | undefined;
  let committed = false;
  const deliveryIds: string[] = [];
  const messageIds: string[] = [];

  await client.query('begin');
  try {
    activeEventId = activeEventId || await upsertEvent(client, payload.event);
    event = await readEventForUpdate(client, activeEventId, payload.tenantId);
    if (event.status === 'processed') {
      await client.query('commit');
      committed = true;
      return {
        eventId: event.id,
        status: 'processed',
        skipped: true,
        messageCount: 0,
        deliveryCount: 0,
        sentCount: 0,
        failedCount: 0,
        reminderCount: 0
      };
    }

    await client.query(
      `update public.notification_events
      set status = 'processing', error_message = null
      where id = $1`,
      [event.id]
    );

    const category = categoryForEvent(event.event_type);
    const recipientIds = readRecipientIds(event.payload).filter(isUuid);
    const contacts = await readRecipientContacts(client, recipientIds);
    const preferences = await readPreferences(client, event.tenant_id, recipientIds, category);
    const inboxTemplate = await readTemplate(client, event.event_type, 'inbox');

    let messageCount = 0;
    let deliveryCount = 0;

    for (const recipient of contacts) {
      const preference = preferences.get(recipient.id);
      let messageId: string | null = null;

      if (shouldCreateInbox(preference)) {
        const message = buildMessage(event, inboxTemplate, recipient.id);
        const result = await upsertMessage(client, message);
        const row = result.rows[0] as { id: string } | undefined;
        if (row?.id) {
          messageId = row.id;
          messageIds.push(row.id);
        }
        messageCount += result.rowCount ?? 0;
      }

      for (const channel of ['email', 'sms'] as const) {
        if (!shouldCreateDelivery(preference, channel)) continue;
        const target = targetForChannel(recipient, channel);
        if (!target) continue;

        const template = await readTemplate(client, event.event_type, channel);
        const delivery = await upsertDelivery(client, {
          tenantId: event.tenant_id,
          eventId: event.id,
          messageId,
          recipientId: recipient.id,
          channel,
          target,
          templateCode: template.code
        });
        const row = delivery.rows[0] as { id: string } | undefined;
        if (row?.id) deliveryIds.push(row.id);
        deliveryCount += delivery.rowCount ?? 0;
      }
    }

    await client.query(
      `update public.notification_events
      set status = 'processed',
          processed_at = timezone('utc'::text, now())
      where id = $1`,
      [event.id]
    );

    await client.query('commit');
    committed = true;

    const sendResult = await sendDeliveries(client, deliveryIds);
    const reminderCount = await scheduleUnreadReminders(event, messageIds);
    return {
      eventId: event.id,
      status: 'processed',
      messageCount,
      deliveryCount,
      sentCount: sendResult.sentCount,
      failedCount: sendResult.failedCount,
      reminderCount
    };
  } catch (error) {
    if (!committed) {
      await client.query('rollback');
      if (activeEventId) {
        await markEventFailed(client, activeEventId, error instanceof Error ? error.message : String(error));
      }
    }
    throw error;
  }
}

async function retryDeliveries(client: PoolClient, payload: NotificationRetryDeliveryPayload) {
  const tenantId = payload.tenantId?.trim();
  const limit = Math.min(100, Math.max(1, Math.floor(readNumber(payload.limit, 20))));
  const values: unknown[] = [limit];
  const tenantCondition = tenantId ? `and tenant_id = $${values.push(tenantId)}` : '';
  const result = await client.query<{ id: string }>(
    `select id
    from public.notification_deliveries
    where status in ('pending', 'failed')
      and (next_retry_at is null or next_retry_at <= timezone('utc'::text, now()))
      ${tenantCondition}
    order by created_at asc
    limit $1`,
    values
  );
  const deliveryIds = result.rows.map((row) => row.id);
  const sendResult = await sendDeliveries(client, deliveryIds);
  return {
    scannedCount: deliveryIds.length,
    ...sendResult
  };
}

async function remindUnreadMessage(client: PoolClient, payload: NotificationRemindUnreadPayload) {
  const result = await client.query<{
    id: string;
    tenant_id: string;
    recipient_id: string;
    title: string;
    link_url: string | null;
    read_at: Date | null;
    archived_at: Date | null;
  }>(
    `select id, tenant_id, recipient_id, title, link_url, read_at, archived_at
    from public.notification_messages
    where id = $1
      and ($2::text is null or tenant_id = $2::text)`,
    [payload.messageId, payload.tenantId?.trim() || null]
  );
  const message = result.rows[0];
  if (!message || message.read_at || message.archived_at) {
    return {
      messageId: payload.messageId,
      skipped: true
    };
  }

  const eventId = await upsertEvent(client, {
    tenantId: message.tenant_id,
    eventType: 'notification.unread.reminder',
    sourceType: 'notification_message',
    sourceId: message.id,
    payload: {
      title: message.title,
      content: 'You still have an unread notification.',
      linkUrl: message.link_url,
      recipientIds: [message.recipient_id],
      priority: 'normal'
    },
    idempotencyKey: `notification-message:${message.id}:unread-reminder`
  });

  return dispatchNotification(client, {
    tenantId: message.tenant_id,
    eventId
  });
}

async function createUnreadDigest(client: PoolClient, payload: NotificationDigestPayload) {
  const tenantId = payload.tenantId?.trim() || 'default';
  const limit = Math.min(200, Math.max(1, Math.floor(readNumber(payload.limit, 50))));
  const values: unknown[] = [tenantId, limit];
  const recipientCondition = payload.recipientId?.trim() ? `and recipient_id = $${values.push(payload.recipientId.trim())}` : '';
  const categoryCondition = payload.category?.trim() ? `and category = $${values.push(payload.category.trim())}` : '';

  const result = await client.query<{
    recipient_id: string;
    total: string;
  }>(
    `select recipient_id::text, count(*)::text as total
    from public.notification_messages
    where tenant_id = $1
      and read_at is null
      and archived_at is null
      ${recipientCondition}
      ${categoryCondition}
    group by recipient_id
    order by count(*) desc
    limit $2`,
    values
  );

  let digestCount = 0;
  for (const row of result.rows) {
    const eventId = await upsertEvent(client, {
      tenantId,
      eventType: 'notification.digest.created',
      sourceType: 'notification_digest',
      sourceId: `${row.recipient_id}:${new Date().toISOString().slice(0, 10)}`,
      payload: {
        title: 'Unread notification digest',
        content: `You have ${row.total} unread notifications.`,
        recipientIds: [row.recipient_id],
        priority: 'low',
        metadata: {
          unreadTotal: Number(row.total)
        }
      },
      idempotencyKey: `notification-digest:${row.recipient_id}:${new Date().toISOString().slice(0, 10)}`
    });
    await dispatchNotification(client, { tenantId, eventId });
    digestCount += 1;
  }

  return {
    digestCount
  };
}

async function cleanupNotifications(client: PoolClient, payload: NotificationCleanupPayload) {
  const tenantId = payload.tenantId?.trim() || 'default';
  const archiveReadOlderThanDays = Math.max(1, Math.floor(readNumber(payload.archiveReadOlderThanDays, 90)));
  const deleteDeliveryOlderThanDays = Math.max(1, Math.floor(readNumber(payload.deleteDeliveryOlderThanDays, 180)));

  const archived = await client.query(
    `update public.notification_messages
    set archived_at = coalesce(archived_at, timezone('utc'::text, now()))
    where tenant_id = $1
      and read_at is not null
      and archived_at is null
      and read_at < timezone('utc'::text, now()) - ($2::int * interval '1 day')`,
    [tenantId, archiveReadOlderThanDays]
  );

  const deletedDeliveries = await client.query(
    `delete from public.notification_deliveries
    where tenant_id = $1
      and status in ('sent', 'canceled')
      and created_at < timezone('utc'::text, now()) - ($2::int * interval '1 day')`,
    [tenantId, deleteDeliveryOlderThanDays]
  );

  return {
    archivedMessages: archived.rowCount ?? 0,
    deletedDeliveries: deletedDeliveries.rowCount ?? 0
  };
}

async function upsertEvent(
  client: PoolClient,
  input: NotificationDispatchEventInput | undefined
) {
  if (!input) {
    throw new Error('Notification event input is required.');
  }

  const tenantId = input.tenantId?.trim() || 'default';
  const eventType = input.eventType.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!eventType || !idempotencyKey) {
    throw new Error('Notification eventType and idempotencyKey are required.');
  }

  const result = await client.query<{ id: string }>(
    `insert into public.notification_events (
      tenant_id, event_type, source_type, source_id, actor_id, payload,
      idempotency_key, status
    ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, 'pending')
    on conflict (tenant_id, idempotency_key)
    do update set
      event_type = excluded.event_type,
      source_type = excluded.source_type,
      source_id = excluded.source_id,
      actor_id = excluded.actor_id,
      payload = excluded.payload
    returning id`,
    [
      tenantId,
      eventType,
      input.sourceType?.trim() || null,
      input.sourceId?.trim() || null,
      input.actorId?.trim() || null,
      JSON.stringify(input.payload ?? {}),
      idempotencyKey
    ]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Notification event could not be created.');
  }
  return row.id;
}

async function readEventForUpdate(
  client: PoolClient,
  eventId: string,
  tenantId: string | undefined
) {
  const values: unknown[] = [eventId];
  const normalizedTenantId = tenantId?.trim();
  const tenantCondition = normalizedTenantId ? `and tenant_id = $${values.push(normalizedTenantId)}` : '';

  const result = await client.query<NotificationEventRow>(
    `select *
    from public.notification_events
    where id = $1 ${tenantCondition}
    for update`,
    values
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Notification event not found.');
  }

  return {
    ...row,
    payload: row.payload ?? {}
  };
}

async function readTemplate(client: PoolClient, eventType: string, channel: NotificationChannel) {
  const result = await client.query<NotificationTemplateRow>(
    `select code, title_template, content_template
    from public.notification_templates
    where event_type = $1
      and channel = $2
      and status = 'active'
    order by updated_at desc
    limit 1`,
    [eventType, channel]
  );

  return result.rows[0] ?? fallbackTemplate(channel);
}

async function readRecipientContacts(client: PoolClient, recipientIds: string[]) {
  if (!recipientIds.length) return [] as RecipientContactRow[];
  const result = await client.query<RecipientContactRow>(
    `select users.id::text as id,
            auth_users.email::text as email,
            users.phone::text as phone
    from public.users users
    left join auth.users auth_users on auth_users.id = users.id
    where users.id = any($1::uuid[])`,
    [recipientIds]
  );
  return result.rows;
}

async function readPreferences(
  client: PoolClient,
  tenantId: string,
  recipientIds: string[],
  category: string
) {
  const preferences = new Map<string, NotificationPreferenceRow>();
  if (!recipientIds.length) return preferences;

  const result = await client.query<NotificationPreferenceRow>(
    `select user_id::text, category, inbox_enabled, email_enabled, sms_enabled
    from public.notification_preferences
    where tenant_id = $1
      and category = $2
      and user_id = any($3::uuid[])`,
    [tenantId, category, recipientIds]
  );

  for (const row of result.rows) {
    preferences.set(row.user_id, row);
  }
  return preferences;
}

function buildMessage(
  event: NotificationEventRow,
  template: NotificationTemplateRow,
  recipientId: string
): DispatchMessageInput {
  const payload = event.payload ?? {};
  return {
    tenantId: event.tenant_id,
    eventId: event.id,
    recipientId,
    category: categoryForEvent(event.event_type),
    title: renderTemplate(template.title_template, payload),
    content: renderTemplate(template.content_template, payload),
    linkUrl: readString(payload.linkUrl ?? payload.link_url) || null,
    priority: priorityForPayload(payload),
    sourceType: event.source_type,
    sourceId: event.source_id,
    metadata: {
      templateCode: template.code,
      eventType: event.event_type,
      ...(isRecord(payload.metadata) ? payload.metadata : {})
    }
  };
}

async function upsertMessage(client: PoolClient, message: DispatchMessageInput) {
  return client.query(
    `insert into public.notification_messages (
      tenant_id, event_id, recipient_id, category, channel, title, content,
      link_url, priority, source_type, source_id, metadata
    ) values ($1, $2, $3, $4, 'inbox', $5, $6, $7, $8, $9, $10, $11::jsonb)
    on conflict (tenant_id, recipient_id, source_type, source_id, category)
    do update set
      event_id = excluded.event_id,
      title = excluded.title,
      content = excluded.content,
      link_url = excluded.link_url,
      priority = excluded.priority,
      metadata = notification_messages.metadata || excluded.metadata
    returning id`,
    [
      message.tenantId,
      message.eventId,
      message.recipientId,
      message.category,
      message.title,
      message.content,
      message.linkUrl,
      message.priority,
      message.sourceType,
      message.sourceId,
      JSON.stringify(message.metadata)
    ]
  );
}

async function upsertDelivery(client: PoolClient, input: DeliveryInput) {
  return client.query(
    `insert into public.notification_deliveries (
      tenant_id, event_id, message_id, recipient_id, channel, target,
      template_code, status
    ) values ($1, $2, $3, $4, $5, $6, $7, 'pending')
    on conflict (tenant_id, channel, event_id, recipient_id)
    do update set
      message_id = coalesce(excluded.message_id, notification_deliveries.message_id),
      target = excluded.target,
      template_code = excluded.template_code,
      status = case
        when notification_deliveries.status = 'sent' then notification_deliveries.status
        else excluded.status
      end,
      next_retry_at = null,
      updated_at = timezone('utc'::text, now())
    returning id`,
    [
      input.tenantId,
      input.eventId,
      input.messageId,
      input.recipientId,
      input.channel,
      input.target,
      input.templateCode
    ]
  );
}

async function sendDeliveries(client: PoolClient, deliveryIds: string[]) {
  let sentCount = 0;
  let failedCount = 0;
  for (const deliveryId of [...new Set(deliveryIds)]) {
    const result = await sendDelivery(client, deliveryId);
    if (result.status === 'sent') sentCount += 1;
    if (result.status === 'failed') failedCount += 1;
  }
  return { sentCount, failedCount };
}

async function sendDelivery(client: PoolClient, deliveryId: string) {
  const delivery = await claimDeliveryForSending(client, deliveryId);
  if (!delivery) return { status: 'skipped' as const };
  if (!delivery.target) {
    await markDeliveryFailed(client, delivery.id, 'Delivery target is empty.', delivery.attempt_count);
    return { status: 'failed' as const };
  }

  try {
    const payload = delivery.payload ?? {};
    const template = delivery.event_type
      ? await readTemplate(client, delivery.event_type, delivery.channel)
      : fallbackTemplate(delivery.channel);
    const message = {
      deliveryId: delivery.id,
      tenantId: delivery.tenant_id,
      recipientId: delivery.recipient_id,
      channel: delivery.channel,
      target: delivery.target,
      title: renderTemplate(template.title_template, {
        ...payload,
        title: readString(payload.title) || delivery.message_title || ''
      }),
      content: renderTemplate(template.content_template, {
        ...payload,
        content: readString(payload.content) || delivery.message_content || ''
      })
    };
    const providerMessageId = await sendWithProvider(delivery.channel, message);
    await client.query(
      `update public.notification_deliveries
      set status = 'sent',
          provider_message_id = $2,
          error_message = null,
          next_retry_at = null,
          sent_at = timezone('utc'::text, now()),
          updated_at = timezone('utc'::text, now())
      where id = $1`,
      [delivery.id, providerMessageId]
    );
    return { status: 'sent' as const };
  } catch (error) {
    await markDeliveryFailed(
      client,
      delivery.id,
      error instanceof Error ? error.message : String(error),
      delivery.attempt_count
    );
    return { status: 'failed' as const };
  }
}

async function claimDeliveryForSending(client: PoolClient, deliveryId: string) {
  await client.query('begin');
  try {
    const result = await client.query<NotificationDeliveryRow>(
      `select deliveries.*,
              events.event_type,
              events.payload,
              messages.title as message_title,
              messages.content as message_content
      from public.notification_deliveries deliveries
      left join public.notification_events events on events.id = deliveries.event_id
      left join public.notification_messages messages on messages.id = deliveries.message_id
      where deliveries.id = $1
        and deliveries.status in ('pending', 'failed')
      for update of deliveries skip locked`,
      [deliveryId]
    );
    const row = result.rows[0];
    if (!row) {
      await client.query('commit');
      return undefined;
    }

    const nextAttempt = Number(row.attempt_count ?? 0) + 1;
    await client.query(
      `update public.notification_deliveries
      set status = 'sending',
          attempt_count = $2,
          error_message = null,
          updated_at = timezone('utc'::text, now())
      where id = $1`,
      [row.id, nextAttempt]
    );
    await client.query('commit');
    return {
      ...row,
      attempt_count: nextAttempt
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function markDeliveryFailed(
  client: PoolClient,
  deliveryId: string,
  message: string,
  attemptCount: number
) {
  const maxAttempts = Math.max(1, Math.floor(readNumber(process.env.NOTIFICATION_MAX_DELIVERY_ATTEMPTS, 5)));
  const shouldRetry = attemptCount < maxAttempts;
  const retryDelayMinutes = Math.min(24 * 60, Math.max(1, Math.pow(2, Math.max(0, attemptCount - 1))));
  await client.query(
    `update public.notification_deliveries
    set status = 'failed',
        error_message = $2,
        next_retry_at = case
          when $3::boolean then timezone('utc'::text, now()) + ($4::int * interval '1 minute')
          else null
        end,
        updated_at = timezone('utc'::text, now())
    where id = $1`,
    [deliveryId, message.slice(0, 1000), shouldRetry, retryDelayMinutes]
  );
}

async function sendWithProvider(
  channel: DeliveryChannel,
  message: {
    deliveryId: string;
    tenantId: string;
    recipientId: string;
    channel: DeliveryChannel;
    target: string;
    title: string;
    content: string;
  }
) {
  const webhookUrl = channel === 'email'
    ? process.env.NOTIFICATION_EMAIL_WEBHOOK_URL
    : process.env.NOTIFICATION_SMS_WEBHOOK_URL;
  if (!webhookUrl?.trim()) {
    return `local-${channel}-${message.deliveryId}`;
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.NOTIFICATION_PROVIDER_TOKEN
        ? { authorization: `Bearer ${process.env.NOTIFICATION_PROVIDER_TOKEN}` }
        : {})
    },
    body: JSON.stringify(message)
  });
  if (!response.ok) {
    throw new Error(`Notification ${channel} provider failed with HTTP ${response.status}.`);
  }

  const body = await response.text();
  if (!body) return `${channel}-${message.deliveryId}`;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return readString(parsed.id ?? parsed.messageId ?? parsed.providerMessageId) || `${channel}-${message.deliveryId}`;
  } catch {
    return body.slice(0, 200);
  }
}

async function scheduleUnreadReminders(event: NotificationEventRow, messageIds: string[]) {
  const minutes = readReminderMinutes(event.payload);
  if (minutes <= 0) return 0;

  let reminderCount = 0;
  for (const messageId of messageIds) {
    try {
      await tasks.trigger(
        NOTIFICATION_REMIND_UNREAD_TASK_ID,
        {
          tenantId: event.tenant_id,
          messageId,
          delayMinutes: minutes
        },
        {
          idempotencyKey: `notification-remind:${messageId}:${minutes}`,
          tags: [
            `tenant:${event.tenant_id}`,
            `notification-message:${messageId}`,
            'notification:unread-reminder'
          ]
        }
      );
      reminderCount += 1;
    } catch {
      // Dispatch has already persisted the primary message; reminder scheduling is best effort.
    }
  }
  return reminderCount;
}

async function markEventFailed(client: PoolClient, eventId: string, message: string) {
  await client.query(
    `update public.notification_events
    set status = 'failed', error_message = $2
    where id = $1`,
    [eventId, message.slice(0, 1000)]
  );
}

function createNotificationPool(taskName: string) {
  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error(`DIRECT_URL or DATABASE_URL is required by the ${taskName}.`);
  }
  return new Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
}

async function upsertRestRows<T extends Record<string, unknown>>(
  table: string,
  onConflict: string,
  rows: Record<string, unknown>[]
) {
  if (!rows.length) return [] as T[];

  const env = getWorkflowEnv();
  const supabaseUrl =
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_PROJECT_URL;
  const supabaseKey =
    env.SUPABASE_SERVICE_ROLE_KEY ??
    env.SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl?.trim() || !supabaseKey?.trim()) {
    throw new Error('Supabase URL and key are required by local notification dispatch.');
  }

  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(rows)
    }
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase REST upsert failed for ${table}: HTTP ${response.status} ${body}`);
  }
  if (!body) return [] as T[];

  const parsed = JSON.parse(body) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : [] as T[];
}

function localInboxTemplate(eventType: string): NotificationTemplateRow {
  if (eventType === 'approval.task.created') {
    return {
      code: 'approval_task_created_local_inbox',
      title_template: '新的审批待办：{{title}}',
      content_template: '请及时处理审批任务。'
    };
  }
  if (eventType === 'approval.task.completed') {
    return {
      code: 'approval_task_completed_local_inbox',
      title_template: '审批已通过：{{title}}',
      content_template: '审批人已完成处理。{{comment}}'
    };
  }
  if (eventType === 'approval.task.rejected') {
    return {
      code: 'approval_task_rejected_local_inbox',
      title_template: '审批已驳回：{{title}}',
      content_template: '审批任务已被驳回。{{comment}}'
    };
  }
  if (eventType === 'approval.task.transferred') {
    return {
      code: 'approval_task_transferred_local_inbox',
      title_template: '审批已转交：{{title}}',
      content_template: '有一条审批任务转交给你，请及时处理。{{comment}}'
    };
  }
  if (eventType === 'approval.task.add_signed') {
    return {
      code: 'approval_task_add_signed_local_inbox',
      title_template: '新的加签审批：{{title}}',
      content_template: '你收到一条加签审批任务，请及时处理。{{comment}}'
    };
  }

  return fallbackTemplate('inbox');
}

async function withClient<T>(pool: Pool, callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function readRecipientIds(payload: Record<string, unknown>) {
  const direct = payload.recipientIds ?? payload.recipient_ids ?? payload.userIds ?? payload.user_ids;
  if (!Array.isArray(direct)) return [] as string[];
  return [
    ...new Set(
      direct
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )
  ];
}

function renderTemplate(template: string, payload: Record<string, unknown>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = readPath(payload, key);
    return value === undefined || value === null ? '' : String(value);
  });
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, value);
}

function categoryForEvent(eventType: string) {
  if (eventType.startsWith('approval.')) return 'approval';
  if (eventType.startsWith('mention.')) return 'mention';
  if (eventType.startsWith('security.')) return 'security';
  if (eventType.startsWith('business.')) return 'business';
  return 'system';
}

function priorityForPayload(payload: Record<string, unknown>) {
  const priority = readString(payload.priority);
  return ['low', 'normal', 'high', 'urgent'].includes(priority) ? priority : 'normal';
}

function readReminderMinutes(payload: Record<string, unknown>) {
  const explicit = readNumber(payload.remindAfterMinutes ?? payload.remind_after_minutes, 0);
  if (explicit > 0) return explicit;
  return priorityForPayload(payload) === 'urgent' ? 10 : 0;
}

function shouldCreateInbox(preference: NotificationPreferenceRow | undefined) {
  return preference?.inbox_enabled !== false;
}

function shouldCreateDelivery(
  preference: NotificationPreferenceRow | undefined,
  channel: DeliveryChannel
) {
  if (channel === 'email') return preference?.email_enabled === true;
  return preference?.sms_enabled === true;
}

function targetForChannel(recipient: RecipientContactRow, channel: DeliveryChannel) {
  return channel === 'email'
    ? readString(recipient.email)
    : readString(recipient.phone);
}

function fallbackTemplate(channel: NotificationChannel): NotificationTemplateRow {
  if (channel === 'email') {
    return {
      code: 'fallback_email',
      title_template: '{{title}}',
      content_template: '{{content}}'
    };
  }
  if (channel === 'sms') {
    return {
      code: 'fallback_sms',
      title_template: '{{title}}',
      content_template: '{{content}}'
    };
  }
  return {
    code: 'fallback_inbox',
    title_template: '{{title}}',
    content_template: '{{content}}'
  };
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
