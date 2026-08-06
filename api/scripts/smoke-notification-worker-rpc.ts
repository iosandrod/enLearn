import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSupabaseClient } from '../src/common/utils/supabase';

type JsonRecord = Record<string, unknown>;

const DEFAULT_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const DEFAULT_RECIPIENT_ID = '90f8c866-56d2-4a0d-aa8c-e50534a97ebd';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readString).filter(Boolean) : [];
}

async function main() {
  const client = createSupabaseClient('admin');
  const accountId = process.env.NOTIFICATION_SMOKE_ACCOUNT_ID?.trim() || DEFAULT_ACCOUNT_ID;
  const recipientId = process.env.NOTIFICATION_SMOKE_RECIPIENT_ID?.trim() || DEFAULT_RECIPIENT_ID;
  const smokeId = randomUUID();
  const sourceId = `notification-rpc-smoke:${smokeId}`;
  const idempotencyKey = `notification-rpc-smoke:${smokeId}`;
  const category = 'business';
  const createdEventIds = new Set<string>();
  const createdMessageIds = new Set<string>();
  const createdDeliveryIds = new Set<string>();
  let originalPhone: unknown;
  let originalPreference: JsonRecord | null = null;
  let digestBefore: JsonRecord | null = null;

  const command = async (action: string, payload: JsonRecord) => {
    const { data, error } = await client.rpc('notification_worker_command', {
      p_action: action,
      p_payload: payload
    });
    if (error) throw new Error(`${action}: ${error.message}`);
    return data;
  };

  try {
    const { data: profile, error: profileError } = await client
      .from('users')
      .select('id,phone')
      .eq('id', recipientId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    assert.ok(profile, `Notification smoke recipient ${recipientId} does not exist in public.users.`);
    originalPhone = profile.phone;

    const { data: authUser, error: authUserError } = await client.auth.admin.getUserById(recipientId);
    if (authUserError) throw new Error(authUserError.message);
    assert.ok(authUser.user.email, 'Notification smoke recipient must have an email address.');

    const { data: preference, error: preferenceError } = await client
      .from('notification_preferences')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', recipientId)
      .eq('category', category)
      .maybeSingle();
    if (preferenceError) throw new Error(preferenceError.message);
    originalPreference = isRecord(preference) ? preference : null;

    const { error: phoneError } = await client
      .from('users')
      .update({ phone: '+15555550123' })
      .eq('id', recipientId);
    if (phoneError) throw new Error(phoneError.message);

    const { error: preferenceUpsertError } = await client
      .from('notification_preferences')
      .upsert({
        account_id: accountId,
        user_id: recipientId,
        category,
        inbox_enabled: true,
        email_enabled: true,
        sms_enabled: true,
        quiet_hours: {}
      }, { onConflict: 'account_id,user_id,category' });
    if (preferenceUpsertError) throw new Error(preferenceUpsertError.message);

    const prepared = await command('prepare_dispatch', {
      account_id: accountId,
      event: {
        account_id: accountId,
        event_type: 'business.rpc_smoke',
        source_type: 'rpc_smoke',
        source_id: sourceId,
        actor_id: recipientId,
        idempotency_key: idempotencyKey,
        payload: {
          title: 'Notification worker RPC smoke',
          content: 'Notification worker RPC transaction test.',
          recipientIds: [recipientId],
          linkUrl: '/notification-rpc-smoke',
          priority: 'normal',
          metadata: { smokeId }
        }
      }
    });
    assert.ok(isRecord(prepared));
    assert.equal(prepared.skipped, false);
    assert.equal(prepared.message_count, 1);
    assert.equal(prepared.delivery_count, 2);
    assert.ok(isRecord(prepared.event));

    const eventId = readString(prepared.event.id);
    assert.ok(eventId);
    createdEventIds.add(eventId);
    readStringArray(prepared.message_ids).forEach((id) => createdMessageIds.add(id));
    readStringArray(prepared.delivery_ids).forEach((id) => createdDeliveryIds.add(id));
    assert.equal(createdMessageIds.size, 1);
    assert.equal(createdDeliveryIds.size, 2);

    const repeated = await command('prepare_dispatch', {
      account_id: accountId,
      event_id: eventId
    });
    assert.ok(isRecord(repeated));
    assert.equal(repeated.skipped, true);

    const deliveryIds = [...createdDeliveryIds];
    const { data: deliveries, error: deliveriesError } = await client
      .from('notification_deliveries')
      .select('id,channel,status')
      .in('id', deliveryIds);
    if (deliveriesError) throw new Error(deliveriesError.message);
    assert.deepEqual(
      new Set((deliveries ?? []).map((row) => row.channel)),
      new Set(['email', 'sms'])
    );

    const emailDelivery = (deliveries ?? []).find((row) => row.channel === 'email');
    const smsDelivery = (deliveries ?? []).find((row) => row.channel === 'sms');
    assert.ok(emailDelivery);
    assert.ok(smsDelivery);

    const claimedEmail = await command('claim_delivery', { delivery_id: emailDelivery.id });
    assert.ok(isRecord(claimedEmail));
    assert.equal(claimedEmail.channel, 'email');
    assert.equal(claimedEmail.attempt_count, 1);
    assert.ok(isRecord(claimedEmail.template));
    await command('complete_delivery', {
      delivery_id: emailDelivery.id,
      provider_message_id: `smoke-email-${smokeId}`
    });

    const { data: sentDelivery, error: sentError } = await client
      .from('notification_deliveries')
      .select('status,provider_message_id,sent_at')
      .eq('id', emailDelivery.id)
      .single();
    if (sentError) throw new Error(sentError.message);
    assert.equal(sentDelivery.status, 'sent');
    assert.equal(sentDelivery.provider_message_id, `smoke-email-${smokeId}`);
    assert.ok(sentDelivery.sent_at);

    const claimedSms = await command('claim_delivery', { delivery_id: smsDelivery.id });
    assert.ok(isRecord(claimedSms));
    assert.equal(claimedSms.channel, 'sms');
    await command('fail_delivery', {
      delivery_id: smsDelivery.id,
      message: 'Intentional non-retryable smoke failure.',
      attempt_count: claimedSms.attempt_count,
      should_retry: false,
      retry_minutes: 1
    });

    const nonRetryCandidates = readStringArray(await command('retry_candidates', {
      account_id: accountId,
      limit: 100
    }));
    assert.ok(
      !nonRetryCandidates.includes(smsDelivery.id),
      'A non-retryable failed delivery must not be returned as a retry candidate.'
    );

    const claimedSmsRetry = await command('claim_delivery', { delivery_id: smsDelivery.id });
    assert.ok(isRecord(claimedSmsRetry));
    await command('fail_delivery', {
      delivery_id: smsDelivery.id,
      message: 'Intentional retryable smoke failure.',
      attempt_count: claimedSmsRetry.attempt_count,
      should_retry: true,
      retry_minutes: 1
    });
    const { error: retryDueError } = await client
      .from('notification_deliveries')
      .update({ next_retry_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', smsDelivery.id);
    if (retryDueError) throw new Error(retryDueError.message);

    const retryCandidates = readStringArray(await command('retry_candidates', {
      account_id: accountId,
      limit: 100
    }));
    assert.ok(retryCandidates.includes(smsDelivery.id));

    const messageId = [...createdMessageIds][0];
    const reminder = await command('prepare_unread_reminder', {
      account_id: accountId,
      message_id: messageId
    });
    assert.ok(isRecord(reminder));
    assert.equal(reminder.skipped, false);
    const reminderEventId = readString(reminder.event_id);
    assert.ok(reminderEventId);
    createdEventIds.add(reminderEventId);

    const digestKey = `notification-digest:${recipientId}:${new Date().toISOString().slice(0, 10)}`;
    const { data: existingDigest, error: existingDigestError } = await client
      .from('notification_events')
      .select('*')
      .eq('account_id', accountId)
      .eq('idempotency_key', digestKey)
      .maybeSingle();
    if (existingDigestError) throw new Error(existingDigestError.message);
    digestBefore = isRecord(existingDigest) ? existingDigest : null;

    const digestEvents = await command('prepare_digest', {
      account_id: accountId,
      recipient_id: recipientId,
      category,
      limit: 10
    });
    assert.ok(Array.isArray(digestEvents));
    const digestEvent = digestEvents.find(
      (row): row is JsonRecord => isRecord(row) && readString(row.account_id) === accountId
    );
    assert.ok(digestEvent);
    const digestEventId = readString(digestEvent.event_id);
    assert.ok(digestEventId);
    if (!digestBefore) createdEventIds.add(digestEventId);

    const { error: markReadError } = await client
      .from('notification_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', messageId);
    if (markReadError) throw new Error(markReadError.message);
    const skippedReminder = await command('prepare_unread_reminder', {
      account_id: accountId,
      message_id: messageId
    });
    assert.ok(isRecord(skippedReminder));
    assert.equal(skippedReminder.skipped, true);

    const cleanup = await command('cleanup', {
      account_id: accountId,
      archive_days: 365000,
      delete_days: 365000
    });
    assert.ok(isRecord(cleanup));
    assert.equal(typeof cleanup.archived_messages, 'number');
    assert.equal(typeof cleanup.deleted_deliveries, 'number');

    console.log('Notification worker RPC smoke test passed.');
  } finally {
    if (createdDeliveryIds.size) {
      await client.from('notification_deliveries').delete().in('id', [...createdDeliveryIds]);
    }
    if (createdMessageIds.size) {
      await client.from('notification_messages').delete().in('id', [...createdMessageIds]);
    }
    if (createdEventIds.size) {
      await client.from('notification_events').delete().in('id', [...createdEventIds]);
    }

    if (digestBefore) {
      const restorable = { ...digestBefore };
      delete restorable.id;
      delete restorable.created_at;
      await client.from('notification_events').update(restorable).eq('id', digestBefore.id);
    }

    if (originalPreference) {
      const restorable = { ...originalPreference };
      delete restorable.id;
      delete restorable.created_at;
      await client.from('notification_preferences').update(restorable).eq('id', originalPreference.id);
    } else {
      await client
        .from('notification_preferences')
        .delete()
        .eq('account_id', accountId)
        .eq('user_id', recipientId)
        .eq('category', category);
    }

    await client.from('users').update({ phone: originalPhone ?? null }).eq('id', recipientId);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
