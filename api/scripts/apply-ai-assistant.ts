import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionStrings = [env.DATABASE_URL, env.DIRECT_URL]
  .filter((value): value is string => Boolean(value?.trim()));

if (!rawConnectionStrings.length) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260813150000_ai_assistant.sql'
);

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function apply(value: string) {
  const client = new Client({
    connectionString: connectionString(value),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000
  });
  client.on('error', () => undefined);
  await client.connect();

  try {
    await client.query('begin');
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query<{
      conversations: string | null;
      messages: string | null;
      account_id_exists: boolean;
      legacy_conversation_columns: boolean;
      legacy_message_columns: boolean;
      temporary_tables_exist: boolean;
      legacy_tables_exist: boolean;
      legacy_profile_columns_exist: boolean;
      legacy_chat_columns_exist: boolean;
      current_chat_schema_invalid: boolean;
      legacy_roles_exist: boolean;
      legacy_entity_metadata_exists: boolean;
      legacy_table_comments_exist: boolean;
    }>(`
      select
        to_regclass('public.ai_conversations')::text as conversations,
        to_regclass('public.ai_messages')::text as messages,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'ai_conversations'
            and column_name = 'account_id'
        ) as account_id_exists,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'ai_conversations'
            and column_name in ('user_id', 'scenario_id', 'score', 'feedback', 'started_at', 'ended_at')
        ) as legacy_conversation_columns,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'ai_messages'
            and column_name in ('audio_url', 'pronunciation_score', 'grammar_feedback', 'vocabulary_feedback')
        ) as legacy_message_columns,
        to_regclass('public.ai_assistant_conversations') is not null
          or to_regclass('public.ai_assistant_messages') is not null as temporary_tables_exist,
        exists (
          select 1
          from unnest(array[
            'lead_events', 'courses', 'course_sections', 'lessons',
            'course_enrollments', 'lesson_progress', 'ai_scenarios',
            'speech_assessments', 'teachers', 'chat_sessions', 'campuses',
            'trial_classes', 'trial_bookings', 'consultant_tasks', 'conversion_records'
          ]) as legacy(table_name)
          where to_regclass('public.' || legacy.table_name) is not null
        ) as legacy_tables_exist,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'users'
            and column_name in (
              'city', 'english_level', 'learning_goal', 'source_channel',
              'lead_status', 'assigned_consultant_id'
            )
        ) as legacy_profile_columns_exist,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'chat_messages'
            and column_name in ('session_id', 'media_url', 'read_at')
        ) as legacy_chat_columns_exist,
        exists (
          select 1
          from information_schema.columns columns
          where columns.table_schema = 'public'
            and columns.table_name = 'chat_messages'
            and (
              (columns.column_name in ('content', 'conversation_id') and columns.is_nullable = 'YES')
              or (columns.column_name = 'sender_id' and columns.is_nullable = 'NO')
            )
        ) or exists (
          select 1
          from pg_constraint constraints
          where constraints.conrelid = 'public.chat_messages'::regclass
            and constraints.conname = 'chat_messages_message_type_check'
            and pg_get_constraintdef(constraints.oid) like '%audio%'
        ) as current_chat_schema_invalid,
        exists (
          select 1 from public.admin_roles
          where code in ('consultant_manager', 'teaching_manager')
        ) as legacy_roles_exist,
        exists (
          select 1
          from public.entity_design_tables tables
          where tables.schema_name = 'public'
            and tables.table_name = any(array[
              'lead_events', 'courses', 'course_sections', 'lessons',
              'course_enrollments', 'lesson_progress', 'ai_scenarios',
              'speech_assessments', 'teachers', 'chat_sessions', 'campuses',
              'trial_classes', 'trial_bookings', 'consultant_tasks', 'conversion_records'
            ])
        ) as legacy_entity_metadata_exists,
        exists (
          select 1
          from pg_class classes
          join pg_namespace namespaces on namespaces.oid = classes.relnamespace
          where namespaces.nspname = 'public'
            and classes.relname in ('ai_conversations', 'ai_messages', 'chat_messages', 'users')
            and coalesce(obj_description(classes.oid, 'pg_class'), '') ~
              '(AI 练习|口语训练|课程聊天|学习目标|线索状态|顾问分配)'
        ) as legacy_table_comments_exist
    `);
    const result = rows[0];
    assert.equal(result?.conversations, 'ai_conversations');
    assert.equal(result?.messages, 'ai_messages');
    assert.equal(result?.account_id_exists, true);
    assert.equal(result?.legacy_conversation_columns, false);
    assert.equal(result?.legacy_message_columns, false);
    assert.equal(result?.temporary_tables_exist, false);
    assert.equal(result?.legacy_tables_exist, false);
    assert.equal(result?.legacy_profile_columns_exist, false);
    assert.equal(result?.legacy_chat_columns_exist, false);
    assert.equal(result?.current_chat_schema_invalid, false);
    assert.equal(result?.legacy_roles_exist, false);
    assert.equal(result?.legacy_entity_metadata_exists, false);
    assert.equal(result?.legacy_table_comments_exist, false);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  let lastError: unknown;
  for (const value of [...new Set(rawConnectionStrings)]) {
    try {
      const result = await apply(value);
      console.log(JSON.stringify({ ...result, applied: true }));
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
