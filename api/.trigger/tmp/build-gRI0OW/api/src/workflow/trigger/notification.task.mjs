import {
  isTransientPostgresError,
  retryTransientPostgresOperation
} from "../../../../chunk-EGIQ65LU.mjs";
import {
  Pool
} from "../../../../chunk-OV5RCJTK.mjs";
import {
  task,
  tasks,
  wait
} from "../../../../chunk-ELK4KT3A.mjs";
import "../../../../chunk-JAUVKWWZ.mjs";
import "../../../../chunk-RD3PYEXF.mjs";
import "../../../../chunk-3YJ5QEIB.mjs";
import "../../../../chunk-LL72OHMD.mjs";
import "../../../../chunk-4N4XZL7H.mjs";
import {
  __name,
  init_esm
} from "../../../../chunk-VDUEJNM7.mjs";

// src/workflow/trigger/notification.task.ts
init_esm();
var NOTIFICATION_DISPATCH_TASK_ID = "notification.dispatch";
var NOTIFICATION_RETRY_DELIVERY_TASK_ID = "notification.retryDelivery";
var NOTIFICATION_REMIND_UNREAD_TASK_ID = "notification.remindUnread";
var NOTIFICATION_DIGEST_TASK_ID = "notification.digest";
var NOTIFICATION_CLEANUP_TASK_ID = "notification.cleanup";
async function runNotificationDispatchTask(payload) {
  const pool = createNotificationPool("notification dispatch task");
  try {
    return await withClient(pool, (client) => dispatchNotification(client, payload));
  } finally {
    await pool.end();
  }
}
__name(runNotificationDispatchTask, "runNotificationDispatchTask");
var notificationDispatchTask = task({
  id: NOTIFICATION_DISPATCH_TASK_ID,
  run: runNotificationDispatchTask
});
var notificationRetryDeliveryTask = task({
  id: NOTIFICATION_RETRY_DELIVERY_TASK_ID,
  run: /* @__PURE__ */ __name(async (payload) => {
    const pool = createNotificationPool("notification retry task");
    try {
      return await withClient(pool, (client) => retryDeliveries(client, payload));
    } finally {
      await pool.end();
    }
  }, "run")
});
var notificationRemindUnreadTask = task({
  id: NOTIFICATION_REMIND_UNREAD_TASK_ID,
  run: /* @__PURE__ */ __name(async (payload) => {
    const delayMinutes = Math.max(0, Math.floor(readNumber(payload.delayMinutes, 0)));
    if (delayMinutes > 0) {
      await wait.for({
        seconds: delayMinutes * 60,
        idempotencyKey: `notification-remind:${payload.messageId}:${delayMinutes}`
      });
    }
    const pool = createNotificationPool("notification unread reminder task");
    try {
      return await withClient(pool, (client) => remindUnreadMessage(client, payload));
    } finally {
      await pool.end();
    }
  }, "run")
});
var notificationDigestTask = task({
  id: NOTIFICATION_DIGEST_TASK_ID,
  run: /* @__PURE__ */ __name(async (payload) => {
    const pool = createNotificationPool("notification digest task");
    try {
      return await withClient(pool, (client) => createUnreadDigest(client, payload));
    } finally {
      await pool.end();
    }
  }, "run")
});
var notificationCleanupTask = task({
  id: NOTIFICATION_CLEANUP_TASK_ID,
  run: /* @__PURE__ */ __name(async (payload) => {
    const pool = createNotificationPool("notification cleanup task");
    try {
      return await withClient(pool, (client) => cleanupNotifications(client, payload));
    } finally {
      await pool.end();
    }
  }, "run")
});
async function dispatchNotification(client, payload) {
  if (!payload.eventId?.trim() && !payload.event) {
    throw new Error("eventId or event is required by notification.dispatch.");
  }
  let activeEventId = payload.eventId?.trim();
  let event;
  let committed = false;
  const deliveryIds = [];
  const messageIds = [];
  await client.query("begin");
  try {
    activeEventId = activeEventId || await upsertEvent(client, payload.event);
    event = await readEventForUpdate(client, activeEventId, payload.tenantId);
    if (event.status === "processed") {
      await client.query("commit");
      committed = true;
      return {
        eventId: event.id,
        status: "processed",
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
    const contacts = await readRecipientContacts(client, event.tenant_id, recipientIds);
    const preferences = await readPreferences(client, event.tenant_id, recipientIds, category);
    const inboxTemplate = await readTemplate(client, event.event_type, "inbox");
    let messageCount = 0;
    let deliveryCount = 0;
    for (const recipient of contacts) {
      const preference = preferences.get(recipient.id);
      let messageId = null;
      if (shouldCreateInbox(preference)) {
        const message = buildMessage(event, inboxTemplate, recipient.id);
        const result = await upsertMessage(client, message);
        const row = result.rows[0];
        if (row?.id) {
          messageId = row.id;
          messageIds.push(row.id);
        }
        messageCount += result.rowCount ?? 0;
      }
      for (const channel of ["email", "sms"]) {
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
        const row = delivery.rows[0];
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
    await client.query("commit");
    committed = true;
    const sendResult = await sendDeliveries(client, deliveryIds);
    const reminderCount = await scheduleUnreadReminders(event, messageIds);
    return {
      eventId: event.id,
      status: "processed",
      messageCount,
      deliveryCount,
      sentCount: sendResult.sentCount,
      failedCount: sendResult.failedCount,
      reminderCount
    };
  } catch (error) {
    if (!committed) {
      await client.query("rollback");
      if (activeEventId) {
        await markEventFailed(client, activeEventId, error instanceof Error ? error.message : String(error));
      }
    }
    throw error;
  }
}
__name(dispatchNotification, "dispatchNotification");
async function retryDeliveries(client, payload) {
  const tenantId = payload.tenantId?.trim();
  const limit = Math.min(100, Math.max(1, Math.floor(readNumber(payload.limit, 20))));
  const values = [limit];
  const tenantCondition = tenantId ? `and tenant_id = $${values.push(tenantId)}` : "";
  const result = await client.query(
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
__name(retryDeliveries, "retryDeliveries");
async function remindUnreadMessage(client, payload) {
  const result = await client.query(
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
    eventType: "notification.unread.reminder",
    sourceType: "notification_message",
    sourceId: message.id,
    payload: {
      title: message.title,
      content: "You still have an unread notification.",
      linkUrl: message.link_url,
      recipientIds: [message.recipient_id],
      priority: "normal"
    },
    idempotencyKey: `notification-message:${message.id}:unread-reminder`
  });
  return dispatchNotification(client, {
    tenantId: message.tenant_id,
    eventId
  });
}
__name(remindUnreadMessage, "remindUnreadMessage");
async function createUnreadDigest(client, payload) {
  const tenantId = requireTenantId(payload.tenantId);
  const limit = Math.min(200, Math.max(1, Math.floor(readNumber(payload.limit, 50))));
  const values = [tenantId, limit];
  const recipientCondition = payload.recipientId?.trim() ? `and recipient_id = $${values.push(payload.recipientId.trim())}` : "";
  const categoryCondition = payload.category?.trim() ? `and category = $${values.push(payload.category.trim())}` : "";
  const result = await client.query(
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
      eventType: "notification.digest.created",
      sourceType: "notification_digest",
      sourceId: `${row.recipient_id}:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`,
      payload: {
        title: "Unread notification digest",
        content: `You have ${row.total} unread notifications.`,
        recipientIds: [row.recipient_id],
        priority: "low",
        metadata: {
          unreadTotal: Number(row.total)
        }
      },
      idempotencyKey: `notification-digest:${row.recipient_id}:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`
    });
    await dispatchNotification(client, { tenantId, eventId });
    digestCount += 1;
  }
  return {
    digestCount
  };
}
__name(createUnreadDigest, "createUnreadDigest");
async function cleanupNotifications(client, payload) {
  const tenantId = requireTenantId(payload.tenantId);
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
__name(cleanupNotifications, "cleanupNotifications");
async function upsertEvent(client, input) {
  if (!input) {
    throw new Error("Notification event input is required.");
  }
  const tenantId = requireTenantId(input.tenantId);
  const eventType = input.eventType.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!eventType || !idempotencyKey) {
    throw new Error("Notification eventType and idempotencyKey are required.");
  }
  const result = await client.query(
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
    throw new Error("Notification event could not be created.");
  }
  return row.id;
}
__name(upsertEvent, "upsertEvent");
async function readEventForUpdate(client, eventId, tenantId) {
  const values = [eventId];
  const normalizedTenantId = tenantId?.trim();
  const tenantCondition = normalizedTenantId ? `and tenant_id = $${values.push(normalizedTenantId)}` : "";
  const result = await client.query(
    `select *
    from public.notification_events
    where id = $1 ${tenantCondition}
    for update`,
    values
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Notification event not found.");
  }
  return {
    ...row,
    payload: row.payload ?? {}
  };
}
__name(readEventForUpdate, "readEventForUpdate");
async function readTemplate(client, eventType, channel) {
  const result = await client.query(
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
__name(readTemplate, "readTemplate");
async function readRecipientContacts(client, tenantId, recipientIds) {
  if (!recipientIds.length) return [];
  const result = await client.query(
    `select users.id::text as id,
            auth_users.email::text as email,
            users.phone::text as phone
    from public.users users
    join basejump.account_user memberships
      on memberships.user_id = users.id
     and memberships.account_id = $1::uuid
    join basejump.accounts accounts
      on accounts.id = memberships.account_id
     and accounts.status = 'active'
    left join auth.users auth_users on auth_users.id = users.id
    where users.id = any($2::uuid[])`,
    [tenantId, recipientIds]
  );
  return result.rows;
}
__name(readRecipientContacts, "readRecipientContacts");
async function readPreferences(client, tenantId, recipientIds, category) {
  const preferences = /* @__PURE__ */ new Map();
  if (!recipientIds.length) return preferences;
  const result = await client.query(
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
__name(readPreferences, "readPreferences");
function buildMessage(event, template, recipientId) {
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
      ...isRecord(payload.metadata) ? payload.metadata : {}
    }
  };
}
__name(buildMessage, "buildMessage");
async function upsertMessage(client, message) {
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
__name(upsertMessage, "upsertMessage");
async function upsertDelivery(client, input) {
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
__name(upsertDelivery, "upsertDelivery");
async function sendDeliveries(client, deliveryIds) {
  let sentCount = 0;
  let failedCount = 0;
  for (const deliveryId of [...new Set(deliveryIds)]) {
    const result = await sendDelivery(client, deliveryId);
    if (result.status === "sent") sentCount += 1;
    if (result.status === "failed") failedCount += 1;
  }
  return { sentCount, failedCount };
}
__name(sendDeliveries, "sendDeliveries");
async function sendDelivery(client, deliveryId) {
  const delivery = await claimDeliveryForSending(client, deliveryId);
  if (!delivery) return { status: "skipped" };
  if (!delivery.target) {
    await markDeliveryFailed(client, delivery.id, "Delivery target is empty.", delivery.attempt_count);
    return { status: "failed" };
  }
  try {
    const payload = delivery.payload ?? {};
    const template = delivery.event_type ? await readTemplate(client, delivery.event_type, delivery.channel) : fallbackTemplate(delivery.channel);
    const message = {
      deliveryId: delivery.id,
      tenantId: delivery.tenant_id,
      recipientId: delivery.recipient_id,
      channel: delivery.channel,
      target: delivery.target,
      title: renderTemplate(template.title_template, {
        ...payload,
        title: readString(payload.title) || delivery.message_title || ""
      }),
      content: renderTemplate(template.content_template, {
        ...payload,
        content: readString(payload.content) || delivery.message_content || ""
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
    return { status: "sent" };
  } catch (error) {
    await markDeliveryFailed(
      client,
      delivery.id,
      error instanceof Error ? error.message : String(error),
      delivery.attempt_count
    );
    return { status: "failed" };
  }
}
__name(sendDelivery, "sendDelivery");
async function claimDeliveryForSending(client, deliveryId) {
  await client.query("begin");
  try {
    const result = await client.query(
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
      await client.query("commit");
      return void 0;
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
    await client.query("commit");
    return {
      ...row,
      attempt_count: nextAttempt
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
__name(claimDeliveryForSending, "claimDeliveryForSending");
async function markDeliveryFailed(client, deliveryId, message, attemptCount) {
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
    [deliveryId, message.slice(0, 1e3), shouldRetry, retryDelayMinutes]
  );
}
__name(markDeliveryFailed, "markDeliveryFailed");
async function sendWithProvider(channel, message) {
  const webhookUrl = channel === "email" ? process.env.NOTIFICATION_EMAIL_WEBHOOK_URL : process.env.NOTIFICATION_SMS_WEBHOOK_URL;
  if (!webhookUrl?.trim()) {
    return `local-${channel}-${message.deliveryId}`;
  }
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...process.env.NOTIFICATION_PROVIDER_TOKEN ? { authorization: `Bearer ${process.env.NOTIFICATION_PROVIDER_TOKEN}` } : {}
    },
    body: JSON.stringify(message)
  });
  if (!response.ok) {
    throw new Error(`Notification ${channel} provider failed with HTTP ${response.status}.`);
  }
  const body = await response.text();
  if (!body) return `${channel}-${message.deliveryId}`;
  try {
    const parsed = JSON.parse(body);
    return readString(parsed.id ?? parsed.messageId ?? parsed.providerMessageId) || `${channel}-${message.deliveryId}`;
  } catch {
    return body.slice(0, 200);
  }
}
__name(sendWithProvider, "sendWithProvider");
async function scheduleUnreadReminders(event, messageIds) {
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
            "notification:unread-reminder"
          ]
        }
      );
      reminderCount += 1;
    } catch {
    }
  }
  return reminderCount;
}
__name(scheduleUnreadReminders, "scheduleUnreadReminders");
async function markEventFailed(client, eventId, message) {
  await client.query(
    `update public.notification_events
    set status = 'failed', error_message = $2
    where id = $1`,
    [eventId, message.slice(0, 1e3)]
  );
}
__name(markEventFailed, "markEventFailed");
function createNotificationPool(taskName) {
  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error(`DIRECT_URL or DATABASE_URL is required by the ${taskName}.`);
  }
  const pool = new Pool({
    connectionString,
    max: 2,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5e3,
    idleTimeoutMillis: 3e4,
    connectionTimeoutMillis: 3e4
  });
  pool.on("error", (error) => {
    console.warn(`[notification-task] Postgres idle client error: ${error.message}`);
  });
  return pool;
}
__name(createNotificationPool, "createNotificationPool");
async function withClient(pool, callback) {
  const client = await retryTransientPostgresOperation(() => pool.connect());
  let failure;
  try {
    return await callback(client);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    client.release(isTransientPostgresError(failure) ? true : void 0);
  }
}
__name(withClient, "withClient");
function readRecipientIds(payload) {
  const direct = payload.recipientIds ?? payload.recipient_ids ?? payload.userIds ?? payload.user_ids;
  if (!Array.isArray(direct)) return [];
  return [
    ...new Set(
      direct.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    )
  ];
}
__name(readRecipientIds, "readRecipientIds");
function renderTemplate(template, payload) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    const value = readPath(payload, key);
    return value === void 0 || value === null ? "" : String(value);
  });
}
__name(renderTemplate, "renderTemplate");
function readPath(value, path) {
  return path.split(".").reduce((current, key) => {
    if (!isRecord(current)) return void 0;
    return current[key];
  }, value);
}
__name(readPath, "readPath");
function categoryForEvent(eventType) {
  if (eventType.startsWith("approval.")) return "approval";
  if (eventType.startsWith("mention.")) return "mention";
  if (eventType.startsWith("security.")) return "security";
  if (eventType.startsWith("business.")) return "business";
  return "system";
}
__name(categoryForEvent, "categoryForEvent");
function priorityForPayload(payload) {
  const priority = readString(payload.priority);
  return ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal";
}
__name(priorityForPayload, "priorityForPayload");
function readReminderMinutes(payload) {
  const explicit = readNumber(payload.remindAfterMinutes ?? payload.remind_after_minutes, 0);
  if (explicit > 0) return explicit;
  return priorityForPayload(payload) === "urgent" ? 10 : 0;
}
__name(readReminderMinutes, "readReminderMinutes");
function shouldCreateInbox(preference) {
  return preference?.inbox_enabled !== false;
}
__name(shouldCreateInbox, "shouldCreateInbox");
function shouldCreateDelivery(preference, channel) {
  if (channel === "email") return preference?.email_enabled === true;
  return preference?.sms_enabled === true;
}
__name(shouldCreateDelivery, "shouldCreateDelivery");
function targetForChannel(recipient, channel) {
  return channel === "email" ? readString(recipient.email) : readString(recipient.phone);
}
__name(targetForChannel, "targetForChannel");
function fallbackTemplate(channel) {
  if (channel === "email") {
    return {
      code: "fallback_email",
      title_template: "{{title}}",
      content_template: "{{content}}"
    };
  }
  if (channel === "sms") {
    return {
      code: "fallback_sms",
      title_template: "{{title}}",
      content_template: "{{content}}"
    };
  }
  return {
    code: "fallback_inbox",
    title_template: "{{title}}",
    content_template: "{{content}}"
  };
}
__name(fallbackTemplate, "fallbackTemplate");
function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}
__name(readString, "readString");
function requireTenantId(value) {
  const tenantId = readString(value);
  if (!isUuid(tenantId)) {
    throw new Error("Notification task requires a valid account-set tenantId.");
  }
  return tenantId;
}
__name(requireTenantId, "requireTenantId");
function readNumber(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
__name(readNumber, "readNumber");
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
__name(isRecord, "isRecord");
function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
__name(isUuid, "isUuid");
export {
  NOTIFICATION_CLEANUP_TASK_ID,
  NOTIFICATION_DIGEST_TASK_ID,
  NOTIFICATION_DISPATCH_TASK_ID,
  NOTIFICATION_REMIND_UNREAD_TASK_ID,
  NOTIFICATION_RETRY_DELIVERY_TASK_ID,
  notificationCleanupTask,
  notificationDigestTask,
  notificationDispatchTask,
  notificationRemindUnreadTask,
  notificationRetryDeliveryTask,
  runNotificationDispatchTask
};
//# sourceMappingURL=notification.task.mjs.map
