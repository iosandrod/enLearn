import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSupabaseClient } from '../src/common/utils/supabase';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main() {
  const client = createSupabaseClient('admin');
  const accountId = '00000000-0000-4000-8000-000000000001';
  const recipientId = '90f8c866-56d2-4a0d-aa8c-e50534a97ebd';
  const noticeId = `notification-api-smoke:${randomUUID()}`;
  let eventId = '';
  let messageId = '';

  const command = async (action: string, payload: JsonRecord) => {
    const { data, error } = await client.rpc('notification_api_command', {
      p_action: action,
      p_payload: payload
    });
    if (error) throw new Error(`${action}: ${error.message}`);
    return data;
  };

  try {
    const created = await command('create_system_notice', {
      account_id: accountId,
      actor_id: recipientId,
      notice_id: noticeId,
      title: 'Notification API RPC smoke',
      content: 'Atomic event and message creation.',
      priority: 'normal',
      metadata: { smoke: true },
      recipient_ids: [recipientId],
      event_payload: { recipientIds: [recipientId] }
    });
    assert.ok(isRecord(created));
    assert.ok(isRecord(created.event));
    assert.ok(Array.isArray(created.messages));
    assert.equal(created.messages.length, 1);
    eventId = String(created.event.id);
    assert.ok(isRecord(created.messages[0]));
    messageId = String(created.messages[0].id);

    const marked = await command('mark_read', {
      account_id: accountId,
      recipient_id: recipientId,
      ids: [messageId],
      category: 'system'
    });
    assert.ok(Array.isArray(marked));
    assert.equal(marked.length, 1);
    assert.ok(isRecord(marked[0]));
    assert.ok(marked[0].read_at);

    console.log('Notification API RPC smoke test passed.');
  } finally {
    if (messageId) await client.from('notification_messages').delete().eq('id', messageId);
    if (eventId) await client.from('notification_events').delete().eq('id', eventId);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
