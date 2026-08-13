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
