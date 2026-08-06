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
    '../../../supabase/migrations/20260727090000_workflow_triggerdev_runtime.sql',
    '../../../supabase/migrations/20260806130000_workflow_publish_rpc.sql',
    '../../../supabase/migrations/20260806140000_workflow_job_rpc.sql',
    '../../../supabase/migrations/20260806150000_workflow_runtime_rpc.sql',
    '../../../supabase/migrations/20260806160000_workflow_approval_console_rpc.sql',
    '../../../supabase/migrations/20260806170000_notification_delivery_rpc.sql',
    '../../../supabase/migrations/20260806180000_lowcode_table_metadata_rpc.sql',
    '../../../supabase/migrations/20260806190000_workflow_definition_command_rpc.sql',
    '../../../supabase/migrations/20260806200000_notification_api_rpc.sql',
    '../../../supabase/migrations/20260806210000_lowcode_generated_page_rpc.sql'
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
