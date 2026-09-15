import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const LEGACY_TASK_ID = 'workflow.instance.run';
const env = getEnv();
const source = env.DIRECT_URL ?? env.DATABASE_URL;

if (!source) throw new Error('DIRECT_URL or DATABASE_URL is required.');

const url = new URL(normalizePostgresConnectionString(source));
url.searchParams.delete('pgbouncer');
url.searchParams.delete('sslmode');
url.searchParams.delete('uselibpqcompat');

const client = new Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30_000
});

async function main() {
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`
      create temporary table legacy_workflow_instances on commit drop as
      select id
      from public.wf_process_instance
      where trigger_task_id = $1
    `, [LEGACY_TASK_ID]);

    const count = await client.query<{ count: string }>(
      'select count(*)::text as count from legacy_workflow_instances'
    );
    const instanceCount = Number(count.rows[0]?.count ?? 0);
    console.log(`Legacy workflow instances selected: ${instanceCount}`);

    const statements = [
      ['wf_execution_event', `delete from public.wf_execution_event where process_instance_id in (select id from legacy_workflow_instances)`],
      ['wf_history_event', `delete from public.wf_history_event where process_instance_id in (select id from legacy_workflow_instances)`],
      ['wf_variable', `delete from public.wf_variable where process_instance_id in (select id from legacy_workflow_instances)`],
      ['wf_execution_token', `delete from public.wf_execution_token where process_instance_id in (select id from legacy_workflow_instances)`],
      ['wf_task_candidate', `delete from public.wf_task_candidate where task_id in (select id from public.wf_task where process_instance_id in (select id from legacy_workflow_instances))`],
      ['wf_task', `delete from public.wf_task where process_instance_id in (select id from legacy_workflow_instances)`],
      ['wf_node_instance', `delete from public.wf_node_instance where process_instance_id in (select id from legacy_workflow_instances)`],
      ['wf_cc', `delete from public.wf_cc where process_instance_id in (select id from legacy_workflow_instances)`],
      ['wf_comment', `delete from public.wf_comment where process_instance_id in (select id from legacy_workflow_instances)`],
      ['wf_document_binding', `delete from public.wf_document_binding where process_instance_id in (select id from legacy_workflow_instances)`],
      ['wf_timer_job', `delete from public.wf_timer_job where process_instance_id in (select id from legacy_workflow_instances)`],
      ['wf_job_run', `delete from public.wf_job_run where input->>'instanceId' in (select id::text from legacy_workflow_instances) or input->>'instance_id' in (select id::text from legacy_workflow_instances)`],
      ['wf_process_instance', `delete from public.wf_process_instance where id in (select id from legacy_workflow_instances)`]
    ] as const;

    for (const [table, statement] of statements) {
      const exists = await client.query<{ present: boolean }>(
        'select to_regclass($1) is not null as present',
        [`public.${table}`]
      );
      if (!exists.rows[0]?.present) {
        console.log(`${table}: skipped (table not present)`);
        continue;
      }
      const result = await client.query(statement);
      console.log(`${table}: ${result.rowCount ?? 0}`);
    }

    await client.query('commit');
    console.log('Legacy workflow runtime data deleted.');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
