import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main() {
  const source = await readFile(
    resolve(process.cwd(), '..', 'supabase', 'migrations', '20260813150000_ai_assistant.sql'),
    'utf8'
  );

  assert.match(source, /content_hash text not null/, 'proposals must persist an immutable content hash');
  assert.match(
    source,
    /create table if not exists public\.ai_conversations/,
    'assistant conversations must use the canonical table'
  );
  assert.match(
    source,
    /create table if not exists public\.ai_messages/,
    'assistant messages must use the canonical table'
  );
  assert.doesNotMatch(
    source,
    /create table if not exists public\.ai_assistant_(?:conversations|messages)/,
    'temporary assistant tables must never be recreated'
  );
  assert.match(source, /column_name = 'user_id'/, 'legacy conversation schemas must be detected');
  assert.match(
    source,
    /Refusing to remove legacy AI tables/,
    'legacy relation cleanup must reject unknown dependent tables'
  );
  assert.match(
    source,
    /Refusing to remove temporary AI conversations/,
    'temporary conversation rows must be verified before table removal'
  );
  assert.match(
    source,
    /Refusing to remove temporary AI messages/,
    'temporary message rows must be verified before table removal'
  );
  assert.match(source, /drop table if exists public\.ai_scenarios/, 'legacy AI practice tables must be removed');
  assert.match(
    source,
    /delete from public\.entity_design_tables/,
    'retired English-table designer metadata must be removed'
  );
  assert.match(
    source,
    /when 'ai_conversations' then 'AI 助手会话'/,
    'canonical AI table comments must be replaced'
  );
  assert.match(
    source,
    /when 'chat_messages' then '统一保存账套会话中的文本、附件、回复和状态/,
    'current chat comments must not retain course-chat wording'
  );
  assert.match(source, /drop column if exists english_level/, 'legacy English profile fields must be removed');
  assert.match(source, /drop column if exists session_id/, 'legacy chat fields must be removed');
  assert.match(
    source,
    /alter column conversation_id set not null/,
    'current chat messages must require a conversation'
  );
  assert.match(
    source,
    /check \(message_type in \('text', 'image', 'file', 'system'\)\)/,
    'legacy audio chat messages must not remain valid'
  );
  assert.match(
    source,
    /foreign key \(sender_id\) references auth\.users\(id\) on delete set null/,
    'current chat sender retention must survive user deletion'
  );
  assert.match(source, /notify pgrst, 'reload schema'/, 'PostgREST must reload its schema cache');
  assert.match(
    source,
    /apply_ai_page_proposal\(\s*p_proposal_id uuid,\s*p_content_hash text/s,
    'atomic apply must require the server-computed hash'
  );
  assert.match(source, /v_proposal\.content_hash <> p_content_hash/, 'tampered proposals must be rejected');
  assert.match(source, /v_page\.schema is distinct from v_proposal\.base_schema/, 'concurrent page edits must conflict');
  assert.match(source, /has_account_permission\(v_proposal\.account_id, 'ai\.page\.apply'\)/);
  assert.match(source, /has_account_permission\(v_proposal\.account_id, 'lowcode\.pages\.manage'\)/);
  assert.match(source, /set search_path = pg_catalog, public\s+as \$\$/);
  assert.doesNotMatch(
    source,
    /set search_path = pg_catalog, public, basejump, auth/,
    'security-definer functions must not trust writable schemas in search_path'
  );
  assert.match(source, /cleanup_ai_assistant_data/, 'AI data retention must have an explicit cleanup contract');

  console.log('AI assistant migration contract tests passed');
}

void main();
