import assert from 'node:assert/strict';

import { createSupabaseClient } from '../src/common/utils/supabase';

type JsonRecord = Record<string, unknown>;

const apiUrl = (process.env.API_URL ?? 'http://localhost:3002').replace(/\/$/, '');
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(readMessage).filter(Boolean).join(' ');
  if (!isRecord(value)) return '';
  return [value.message, value.error, value.statusMessage]
    .map(readMessage)
    .filter(Boolean)
    .join(' ');
}

async function post(path: string, body: JsonRecord, token?: string, accountId?: string) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(accountId ? { 'x-account-id': accountId } : {})
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  return { response, payload };
}

async function createUser(admin: ReturnType<typeof createSupabaseClient>, label: string) {
  const email = `chat-tx-${label}-${suffix}@example.test`;
  const password = `ChatTx-${label}-${suffix}-A9!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error;
  return { id: created.data.user.id, email, password };
}

async function main() {
  const admin = createSupabaseClient('admin');
  const userIds: string[] = [];
  const conversationIds: string[] = [];

  try {
    const owner = await createUser(admin, 'owner');
    const member = await createUser(admin, 'member');
    const outsider = await createUser(admin, 'outsider');
    userIds.push(owner.id, member.id, outsider.id);

    const ownerAccess = await admin.rpc('prepare_api_smoke_test_access', {
      p_user_id: owner.id,
      p_permission_code: null
    });
    if (ownerAccess.error) throw ownerAccess.error;
    const accountId = String((ownerAccess.data as JsonRecord).account_id ?? '');
    assert.ok(accountId);
    const memberAccess = await admin.rpc('prepare_api_smoke_test_access', {
      p_user_id: member.id,
      p_permission_code: null
    });
    if (memberAccess.error) throw memberAccess.error;
    assert.equal((memberAccess.data as JsonRecord).account_id, accountId);

    const signedIn = await post('/api/auth/signin', {
      email: owner.email,
      password: owner.password
    });
    if (!signedIn.response.ok || !isRecord(signedIn.payload)) {
      throw new Error(readMessage(signedIn.payload) || 'Could not sign in chat smoke owner.');
    }
    const session = isRecord(signedIn.payload.session) ? signedIn.payload.session : {};
    const token = typeof session.access_token === 'string' ? session.access_token : '';
    assert.ok(token);

    const saved = await post('/api/service', {
      serviceName: 'chat',
      serviceMethod: 'createGroupConversation',
      postData: {
        title: `Chat transaction ${suffix}`,
        memberIds: [member.id]
      }
    }, token, accountId);
    if (!saved.response.ok || !isRecord(saved.payload)) {
      throw new Error(readMessage(saved.payload) || 'Chat transaction create failed.');
    }
    const conversation = isRecord(saved.payload.data) ? saved.payload.data : saved.payload;
    const conversationId = String(conversation.id ?? '');
    assert.ok(conversationId);
    conversationIds.push(conversationId);
    const memberships = await admin
      .from('chat_conversation_members')
      .select('user_id, role')
      .eq('conversation_id', conversationId)
      .order('role');
    if (memberships.error) throw memberships.error;
    assert.deepEqual(
      new Set((memberships.data ?? []).map((row) => row.user_id)),
      new Set([owner.id, member.id])
    );

    const failed = await post('/api/service', {
      serviceName: 'chat',
      serviceMethod: 'createGroupConversation',
      postData: {
        title: `Chat rollback ${suffix}`,
        memberIds: [outsider.id]
      }
    }, token, accountId);
    assert.equal(failed.response.ok, false);
    assert.match(readMessage(failed.payload), /active account set|chat participant/i);
    const rollbackRows = await admin
      .from('chat_conversations')
      .select('id')
      .eq('title', `Chat rollback ${suffix}`);
    if (rollbackRows.error) throw rollbackRows.error;
    assert.deepEqual(rollbackRows.data, []);

    console.log('Chat conversation/member transaction smoke test passed.');
  } finally {
    if (conversationIds.length) {
      await admin.from('chat_conversations').delete().in('id', conversationIds);
    }
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
