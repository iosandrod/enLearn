import { task, tasks, wait } from '@trigger.dev/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../../common/utils/env';

export const NOTIFICATION_DISPATCH_TASK_ID = 'notification.dispatch';
export const NOTIFICATION_RETRY_DELIVERY_TASK_ID = 'notification.retryDelivery';
export const NOTIFICATION_REMIND_UNREAD_TASK_ID = 'notification.remindUnread';
export const NOTIFICATION_DIGEST_TASK_ID = 'notification.digest';
export const NOTIFICATION_CLEANUP_TASK_ID = 'notification.cleanup';

const NOTIFICATION_WORKER_RPC = 'notification_worker_command';
type JsonRecord = Record<string, unknown>;
type NotificationChannel = 'inbox' | 'email' | 'sms';
type DeliveryChannel = Exclude<NotificationChannel, 'inbox'>;

type NotificationDispatchPayload = {
  eventId?: string;
  tenantId: string;
  idempotencyKey?: string;
  event?: NotificationDispatchEventInput;
};

type NotificationDispatchEventInput = {
  tenantId: string;
  eventType: string;
  sourceType?: string;
  sourceId?: string;
  actorId?: string;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
};

type NotificationRetryDeliveryPayload = { tenantId: string; limit?: number };
type NotificationRemindUnreadPayload = { tenantId: string; messageId: string; delayMinutes?: number };
type NotificationDigestPayload = { tenantId: string; recipientId?: string; category?: string; limit?: number };
type NotificationCleanupPayload = {
  tenantId: string;
  archiveReadOlderThanDays?: number;
  deleteDeliveryOlderThanDays?: number;
};

type NotificationEvent = {
  id: string;
  accountId: string;
  eventType: string;
  payload: JsonRecord;
};

type ClaimedDelivery = {
  id: string;
  accountId: string;
  recipientId: string;
  channel: DeliveryChannel;
  target?: string;
  attemptCount: number;
  eventType?: string;
  payload: JsonRecord;
  messageTitle?: string;
  messageContent?: string;
  template: { code: string; titleTemplate: string; contentTemplate: string };
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
  return dispatchNotification(createNotificationClient('notification dispatch task'), payload);
}

export const notificationDispatchTask = task({
  id: NOTIFICATION_DISPATCH_TASK_ID,
  run: runNotificationDispatchTask
});

export const notificationRetryDeliveryTask = task({
  id: NOTIFICATION_RETRY_DELIVERY_TASK_ID,
  run: async (payload: NotificationRetryDeliveryPayload) => {
    const client = createNotificationClient('notification retry task');
    const ids = readStringArray(await command(client, 'retry_candidates', {
      account_id: readOptionalAccountId(payload.tenantId),
      limit: Math.min(100, Math.max(1, Math.floor(readNumber(payload.limit, 20))))
    }));
    return { scannedCount: ids.length, ...(await sendDeliveries(client, ids)) };
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
    const client = createNotificationClient('notification unread reminder task');
    const prepared = assertRecord(await command(client, 'prepare_unread_reminder', {
      account_id: readOptionalAccountId(payload.tenantId),
      message_id: payload.messageId
    }));
    if (prepared.skipped === true) return { messageId: payload.messageId, skipped: true };
    return dispatchNotification(client, {
      tenantId: readString(prepared.account_id),
      eventId: readString(prepared.event_id)
    });
  }
});

export const notificationDigestTask = task({
  id: NOTIFICATION_DIGEST_TASK_ID,
  run: async (payload: NotificationDigestPayload) => {
    const client = createNotificationClient('notification digest task');
    const events = readRecordArray(await command(client, 'prepare_digest', {
      account_id: requireTenantId(payload.tenantId),
      recipient_id: readString(payload.recipientId) || null,
      category: readString(payload.category) || null,
      limit: Math.min(200, Math.max(1, Math.floor(readNumber(payload.limit, 50))))
    }));
    for (const event of events) {
      await dispatchNotification(client, {
        tenantId: readString(event.account_id),
        eventId: readString(event.event_id)
      });
    }
    return { digestCount: events.length };
  }
});

export const notificationCleanupTask = task({
  id: NOTIFICATION_CLEANUP_TASK_ID,
  run: async (payload: NotificationCleanupPayload) => {
    const client = createNotificationClient('notification cleanup task');
    const result = assertRecord(await command(client, 'cleanup', {
      account_id: requireTenantId(payload.tenantId),
      archive_days: Math.max(1, Math.floor(readNumber(payload.archiveReadOlderThanDays, 90))),
      delete_days: Math.max(1, Math.floor(readNumber(payload.deleteDeliveryOlderThanDays, 180)))
    }));
    return {
      archivedMessages: readNumber(result.archived_messages, 0),
      deletedDeliveries: readNumber(result.deleted_deliveries, 0)
    };
  }
});

async function dispatchNotification(
  client: SupabaseClient,
  payload: NotificationDispatchPayload
): Promise<DispatchResult> {
  if (!payload.eventId?.trim() && !payload.event) {
    throw new Error('eventId or event is required by notification.dispatch.');
  }
  const accountId = payload.tenantId ? requireTenantId(payload.tenantId) : requireTenantId(payload.event?.tenantId);
  let eventId = payload.eventId?.trim();
  try {
    const prepared = assertRecord(await command(client, 'prepare_dispatch', {
      account_id: accountId,
      event_id: eventId || null,
      event: payload.event ? {
        account_id: requireTenantId(payload.event.tenantId),
        event_type: payload.event.eventType,
        source_type: payload.event.sourceType ?? null,
        source_id: payload.event.sourceId ?? null,
        actor_id: payload.event.actorId ?? null,
        payload: payload.event.payload ?? {},
        idempotency_key: payload.event.idempotencyKey
      } : null
    }));
    const event = mapEvent(assertRecord(prepared.event));
    eventId = event.id;
    if (prepared.skipped === true) {
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
    const deliveryIds = readStringArray(prepared.delivery_ids);
    const messageIds = readStringArray(prepared.message_ids);
    const sendResult = await sendDeliveries(client, deliveryIds);
    const reminderCount = await scheduleUnreadReminders(event, messageIds);
    return {
      eventId: event.id,
      status: 'processed',
      messageCount: readNumber(prepared.message_count, 0),
      deliveryCount: readNumber(prepared.delivery_count, 0),
      sentCount: sendResult.sentCount,
      failedCount: sendResult.failedCount,
      reminderCount
    };
  } catch (error) {
    if (eventId) {
      await command(client, 'mark_event_failed', {
        event_id: eventId,
        message: error instanceof Error ? error.message : String(error)
      }).catch(() => undefined);
    }
    throw error;
  }
}

async function sendDeliveries(client: SupabaseClient, deliveryIds: string[]) {
  let sentCount = 0;
  let failedCount = 0;
  for (const deliveryId of [...new Set(deliveryIds)]) {
    const result = await sendDelivery(client, deliveryId);
    if (result.status === 'sent') sentCount += 1;
    if (result.status === 'failed') failedCount += 1;
  }
  return { sentCount, failedCount };
}

async function sendDelivery(client: SupabaseClient, deliveryId: string) {
  const raw = await command(client, 'claim_delivery', { delivery_id: deliveryId });
  if (!raw) return { status: 'skipped' as const };
  const delivery = mapDelivery(assertRecord(raw));
  if (!delivery.target) {
    await markDeliveryFailed(client, delivery, 'Delivery target is empty.');
    return { status: 'failed' as const };
  }
  try {
    const message = {
      deliveryId: delivery.id,
      tenantId: delivery.accountId,
      recipientId: delivery.recipientId,
      channel: delivery.channel,
      target: delivery.target,
      title: renderTemplate(delivery.template.titleTemplate, {
        ...delivery.payload,
        title: readString(delivery.payload.title) || delivery.messageTitle || ''
      }),
      content: renderTemplate(delivery.template.contentTemplate, {
        ...delivery.payload,
        content: readString(delivery.payload.content) || delivery.messageContent || ''
      })
    };
    const providerMessageId = await sendWithProvider(delivery.channel, message);
    await command(client, 'complete_delivery', {
      delivery_id: delivery.id,
      provider_message_id: providerMessageId
    });
    return { status: 'sent' as const };
  } catch (error) {
    await markDeliveryFailed(
      client,
      delivery,
      error instanceof Error ? error.message : String(error)
    );
    return { status: 'failed' as const };
  }
}

async function markDeliveryFailed(
  client: SupabaseClient,
  delivery: ClaimedDelivery,
  message: string
) {
  const maxAttempts = Math.max(1, Math.floor(readNumber(process.env.NOTIFICATION_MAX_DELIVERY_ATTEMPTS, 5)));
  const shouldRetry = delivery.attemptCount < maxAttempts;
  const retryMinutes = Math.min(1440, Math.max(1, Math.pow(2, Math.max(0, delivery.attemptCount - 1))));
  await command(client, 'fail_delivery', {
    delivery_id: delivery.id,
    message,
    attempt_count: delivery.attemptCount,
    should_retry: shouldRetry,
    retry_minutes: retryMinutes
  });
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
  if (!webhookUrl?.trim()) return `local-${channel}-${message.deliveryId}`;
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
    const parsed = JSON.parse(body) as JsonRecord;
    return readString(parsed.id ?? parsed.messageId ?? parsed.providerMessageId) || `${channel}-${message.deliveryId}`;
  } catch {
    return body.slice(0, 200);
  }
}

async function scheduleUnreadReminders(event: NotificationEvent, messageIds: string[]) {
  const minutes = readReminderMinutes(event.payload);
  if (minutes <= 0) return 0;
  let reminderCount = 0;
  for (const messageId of messageIds) {
    try {
      await tasks.trigger(
        NOTIFICATION_REMIND_UNREAD_TASK_ID,
        { tenantId: event.accountId, messageId, delayMinutes: minutes },
        {
          idempotencyKey: `notification-remind:${messageId}:${minutes}`,
          tags: [
            `tenant:${event.accountId}`,
            `notification-message:${messageId}`,
            'notification:unread-reminder'
          ]
        }
      );
      reminderCount += 1;
    } catch {
      // Primary dispatch is already durable; reminder scheduling is best effort.
    }
  }
  return reminderCount;
}

async function command(client: SupabaseClient, action: string, payload: JsonRecord) {
  const { data, error } = await client.rpc(NOTIFICATION_WORKER_RPC, {
    p_action: action,
    p_payload: payload
  });
  if (error) throw new Error(error.message);
  return data;
}

function createNotificationClient(taskName: string) {
  const env = getEnv();
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_PROJECT_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim()) {
    throw new Error(`SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required by ${taskName}.`);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function mapEvent(row: JsonRecord): NotificationEvent {
  return {
    id: readString(row.id),
    accountId: readString(row.account_id),
    eventType: readString(row.event_type),
    payload: isRecord(row.payload) ? row.payload : {}
  };
}

function mapDelivery(row: JsonRecord): ClaimedDelivery {
  const template = isRecord(row.template) ? row.template : {};
  return {
    id: readString(row.id),
    accountId: readString(row.account_id),
    recipientId: readString(row.recipient_id),
    channel: row.channel as DeliveryChannel,
    target: readString(row.target) || undefined,
    attemptCount: readNumber(row.attempt_count, 1),
    eventType: readString(row.event_type) || undefined,
    payload: isRecord(row.payload) ? row.payload : {},
    messageTitle: readString(row.message_title) || undefined,
    messageContent: readString(row.message_content) || undefined,
    template: {
      code: readString(template.code),
      titleTemplate: readString(template.title_template) || '{{title}}',
      contentTemplate: readString(template.content_template) || '{{content}}'
    }
  };
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

function readReminderMinutes(payload: Record<string, unknown>) {
  const explicit = readNumber(payload.remindAfterMinutes ?? payload.remind_after_minutes, 0);
  if (explicit > 0) return explicit;
  return readString(payload.priority) === 'urgent' ? 10 : 0;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalAccountId(value: unknown) {
  const accountId = readString(value);
  return accountId ? requireTenantId(accountId) : null;
}

function requireTenantId(value: unknown) {
  const tenantId = readString(value);
  if (!isUuid(tenantId)) {
    throw new Error('Notification task requires a valid account-set tenantId.');
  }
  return tenantId;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown) {
  if (!isRecord(value)) throw new Error('Notification worker RPC returned an invalid object.');
  return value;
}

function readRecordArray(value: unknown) {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error('Notification worker RPC returned an invalid list.');
  }
  return value;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readString).filter(Boolean) : [];
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
