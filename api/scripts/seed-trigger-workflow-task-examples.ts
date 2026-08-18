import assert from 'node:assert/strict';
import { Client } from 'pg';
import { createTriggerWorkflowTaskExamples } from '../../packages/trigger-workflow-editor/src/examples/task-examples';
import { assertValidTriggerWorkflow } from '../../packages/trigger-workflow-editor/src/schema/validate';
import type { TriggerWorkflowModel } from '../../packages/trigger-workflow-editor/src/schema/types';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const DOCUMENT_TYPE = 'trigger-workflow';
const DEFAULT_ACCOUNT_CODE = '001';

type StoredWorkflowRow = {
  id: string;
  code: string;
  name: string;
  document_type: string | null;
  draft_schema: unknown;
};

async function main() {
  const env = getEnv();
  const accountCode = readArgument('--account-code')
    ?? env.TRIGGER_WORKFLOW_EXAMPLE_ACCOUNT_CODE?.trim()
    ?? DEFAULT_ACCOUNT_CODE;
  const replaceExisting = process.argv.includes('--replace');
  const client = await connect(env);

  try {
    const accountResult = await client.query<{ id: string; code: string; name: string }>(
      `select id, code, name
       from basejump.accounts
       where code = $1
       order by created_at, id
       limit 1`,
      [accountCode]
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error(`Account code "${accountCode}" was not found.`);

    const examples = createTriggerWorkflowTaskExamples();
    examples.forEach((example) => assertValidTriggerWorkflow(example));

    const created: string[] = [];
    const replaced: string[] = [];
    const skipped: string[] = [];

    await client.query('begin');
    try {
      for (const example of examples) {
        const schema = { ...example, documentType: DOCUMENT_TYPE };
        const result = replaceExisting
          ? await client.query<{ code: string; inserted: boolean }>(
              `insert into public.wf_model (
                 account_id, code, name, document_type, status, current_version, draft_schema
               ) values ($1, $2, $3, $4, 'draft', 0, $5::jsonb)
               on conflict (account_id, code) do update set
                 name = excluded.name,
                 document_type = excluded.document_type,
                 draft_schema = excluded.draft_schema,
                 updated_at = timezone('utc'::text, now())
               returning code, (xmax = 0) as inserted`,
              [account.id, example.code, example.name, DOCUMENT_TYPE, JSON.stringify(schema)]
            )
          : await client.query<{ code: string; inserted: boolean }>(
              `insert into public.wf_model (
                 account_id, code, name, document_type, status, current_version, draft_schema
               ) values ($1, $2, $3, $4, 'draft', 0, $5::jsonb)
               on conflict (account_id, code) do nothing
               returning code, true as inserted`,
              [account.id, example.code, example.name, DOCUMENT_TYPE, JSON.stringify(schema)]
            );

        if (!result.rows.length) {
          const conflict = await client.query<{ document_type: string | null }>(
            `select document_type
             from public.wf_model
             where account_id = $1 and code = $2`,
            [account.id, example.code]
          );
          if (conflict.rows[0]?.document_type !== DOCUMENT_TYPE) {
            throw new Error(
              `Workflow code "${example.code}" already belongs to document type "${conflict.rows[0]?.document_type ?? ''}".`
            );
          }
          skipped.push(example.code);
        } else if (replaceExisting && result.rows[0]?.inserted === false) {
          replaced.push(example.code);
        } else {
          created.push(example.code);
        }
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }

    const stored = await client.query<StoredWorkflowRow>(
      `select id, code, name, document_type, draft_schema
       from public.wf_model
       where account_id = $1 and code = any($2::text[])
       order by code`,
      [account.id, examples.map((example) => example.code)]
    );
    assert.equal(stored.rows.length, examples.length, 'Not all task examples were saved.');
    for (const row of stored.rows) {
      assert.equal(row.document_type, DOCUMENT_TYPE);
      assertValidTriggerWorkflow(row.draft_schema as TriggerWorkflowModel);
    }

    console.log(JSON.stringify({
      account,
      table: 'public.wf_model',
      documentType: DOCUMENT_TYPE,
      created,
      replaced,
      skipped,
      rows: stored.rows.map(({ id, code, name }) => ({ id, code, name }))
    }, null, 2));
  } finally {
    await client.end();
  }
}

async function connect(env: Record<string, string | undefined>) {
  const candidates = [env.DIRECT_URL, env.DATABASE_URL]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
  if (!candidates.length) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  let lastError: unknown;
  for (const candidate of candidates) {
    const client = new Client({
      connectionString: cleanConnectionString(candidate),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 30_000,
      keepAlive: true
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
    }
  }
  throw lastError;
}

function cleanConnectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

function readArgument(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
