import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getWorkflowEnv } from '../src/common/env';

const env = getWorkflowEnv();
const connectionStrings = [...new Set([env.DIRECT_URL, env.DATABASE_URL].filter(Boolean))] as string[];

if (!connectionStrings.length) {
  console.error('DIRECT_URL or DATABASE_URL is required to apply workflow job migrations.');
  process.exit(1);
}

async function main() {
  const migrationPaths = [
    '../../../supabase/migrations/20260726070000_workflow_definitions.sql',
    '../../../supabase/migrations/20260726073000_workflow_runtime.sql',
    '../../../supabase/migrations/20260726080000_workflow_task_center.sql',
    '../../../supabase/migrations/20260727043000_workflow_jobs_triggerdev.sql',
    '../../../supabase/migrations/20260727090000_workflow_triggerdev_runtime.sql'
  ].map((item) => resolve(__dirname, item));
  for (const [connectionIndex, connectionString] of connectionStrings.entries()) {
    const client = new Client({ connectionString });

    await client.connect();
    try {
      for (const migrationPath of migrationPaths) {
        const sql = await readFile(migrationPath, 'utf8');
        await client.query(sql);
        console.log(`[workflow database ${connectionIndex + 1}/${connectionStrings.length}] ${migrationPath} applied`);
      }
    } finally {
      await client.end();
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
