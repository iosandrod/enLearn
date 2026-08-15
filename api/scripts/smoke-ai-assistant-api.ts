import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const apiBaseUrl = String(env.AI_SMOKE_API_URL ?? 'http://127.0.0.1:3002/api').replace(/\/+$/, '');
const login = String(env.AI_SMOKE_LOGIN ?? 'admin').trim();
const password = String(env.AI_SMOKE_PASSWORD ?? '').trim();
const accountId = String(
  env.AI_SMOKE_ACCOUNT_ID ?? '00000000-0000-4000-8000-000000000001'
).trim();

if (!password) throw new Error('AI_SMOKE_PASSWORD is required.');

function connectionString(raw: string) {
  const url = new URL(normalizePostgresConnectionString(raw));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

function parseSse(text: string) {
  return text
    .split(/\r?\n\r?\n/)
    .map((frame) => frame.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice(5).trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => JSON.parse(value) as Record<string, unknown>);
}

async function main() {
  const signIn = await fetch(`${apiBaseUrl}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: login, password, accountId })
  });
  assert.equal(signIn.ok, true, `Sign-in failed (${signIn.status}).`);
  const auth = await signIn.json() as Record<string, any>;
  const accessToken = String(auth.session?.access_token ?? '');
  const userId = String(auth.user?.id ?? '');
  assert.ok(accessToken, 'Sign-in did not return an access token.');
  assert.ok(userId, 'Sign-in did not return a user id.');

  const requestId = `ai-smoke-${randomUUID()}`;
  const response = await fetch(`${apiBaseUrl}/ai/runs/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Account-ID': accountId,
      'X-Request-ID': requestId
    },
    body: JSON.stringify({
      mode: 'ask',
      message: '当前页面有几个按钮？请给出明确数量和名称。',
      pageRef: { code: 'planning_item-list', route: '/dashboard/planning/item' },
      clientContext: {
        page: { title: '物料', code: 'planning_item-list' },
        dataSources: [{ key: 'planning_itemRows', tableName: 'planning_item' }],
        fields: ['name', 'display_name', 'description', 'category_id'],
        actions: ['create', 'refresh']
      },
      includeSampleData: false
    })
  });
  const body = await response.text();
  assert.equal(response.ok, true, `AI stream failed (${response.status}): ${body.slice(0, 500)}`);

  const events = parseSse(body);
  const eventTypes = events.map((event) => String(event.type ?? ''));
  const assistantAnswer = events
    .filter((event) => event.type === 'assistant.delta')
    .map((event) => String((event.payload as Record<string, unknown> | undefined)?.delta ?? ''))
    .join('');
  const provider = String((events.find((event) => event.type === 'run.created')?.payload as
    Record<string, unknown> | undefined)?.provider ?? '');
  assert.ok(eventTypes.includes('run.created'));
  assert.ok(eventTypes.includes('message.accepted'));
  assert.ok(eventTypes.includes('assistant.delta'));
  assert.ok(eventTypes.includes('done'));
  assert.equal(body.includes("Could not find the 'account_id' column"), false);
  assert.equal(provider, 'openai-compatible');
  assert.ok(assistantAnswer.length >= 20, 'The real model did not return a substantive answer.');
  assert.match(assistantAnswer, /6\s*个|六个/);
  assert.match(assistantAnswer, /新增/);
  assert.match(assistantAnswer, /刷新/);
  assert.match(assistantAnswer, /筛选/);
  assert.match(assistantAnswer, /重置/);
  assert.match(assistantAnswer, /编辑/);
  assert.match(assistantAnswer, /删除/);
  assert.equal(assistantAnswer.includes('我已结合当前页面的结构、字段、数据源和按钮进行分析'), false);

  const runCreated = events.find((event) => event.type === 'run.created');
  const conversationId = String(runCreated?.sessionId ?? runCreated?.conversationId ?? '');
  const runId = String(runCreated?.runId ?? '');
  assert.ok(conversationId, 'run.created did not include a conversation id.');
  assert.ok(runId, 'run.created did not include a run id.');

  const rawDatabaseUrl = env.DIRECT_URL || env.DATABASE_URL;
  if (!rawDatabaseUrl) throw new Error('DIRECT_URL or DATABASE_URL is required for verification.');
  const client = new Client({
    connectionString: connectionString(rawDatabaseUrl),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000
  });
  await client.connect();
  try {
    const persisted = await client.query<{
      conversation_count: string;
      message_count: string;
      run_count: string;
      tool_call_count: string;
    }>(`
      select
        (select count(*) from public.ai_conversations where id = $1 and account_id = $3 and created_by = $4)::text
          as conversation_count,
        (select count(*) from public.ai_messages where conversation_id = $1 and account_id = $3)::text
          as message_count,
        (select count(*) from public.ai_runs where id = $2 and conversation_id = $1 and account_id = $3)::text
          as run_count,
        (select count(*) from public.ai_tool_calls where run_id = $2 and account_id = $3)::text
          as tool_call_count
    `, [conversationId, runId, accountId, userId]);
    assert.equal(persisted.rows[0]?.conversation_count, '1');
    assert.ok(Number(persisted.rows[0]?.message_count ?? 0) >= 2);
    assert.equal(persisted.rows[0]?.run_count, '1');
    assert.ok(Number(persisted.rows[0]?.tool_call_count ?? 0) >= 1);

    if (String(env.AI_SMOKE_KEEP_DATA ?? '').trim() !== '1') {
      await client.query('begin');
      try {
        await client.query('delete from public.ai_conversations where id = $1', [conversationId]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    await client.end();
  }

  console.log(JSON.stringify({
    eventTypes,
    provider,
    assistantAnswer,
    persistenceVerified: true,
    cleanupVerified: String(env.AI_SMOKE_KEEP_DATA ?? '').trim() !== '1'
  }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
