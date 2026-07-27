import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DIRECT_URL or DATABASE_URL is required to apply workflow job migrations.');
  process.exit(1);
}

async function main() {
  const migrationPaths = [
    '../../../supabase/migrations/20260727043000_workflow_jobs_triggerdev.sql',
    '../../../supabase/migrations/20260727090000_workflow_triggerdev_runtime.sql'
  ].map((item) => resolve(__dirname, item));
  const client = new Client({ connectionString });

  await client.connect();
  try {
    for (const migrationPath of migrationPaths) {
      const sql = await readFile(migrationPath, 'utf8');
      await client.query(sql);
      console.log(`${migrationPath} applied`);
    }
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
