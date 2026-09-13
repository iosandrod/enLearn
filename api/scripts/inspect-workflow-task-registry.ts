import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const source = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!source) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const client = new Client({
    connectionString: normalizePostgresConnectionString(source),
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    const tasks = await client.query(
      `select service_name, command_code, name, task_type, status, version
         from public.wf_task_registry
        order by service_name, command_code`
    );
    const models = await client.query(
      `select id, code, name, draft_schema
         from public.wf_model
        where id = $1 or code = $2`,
      ['fa907f3c-b467-43d9-b7ad-32a68d847373', 'trigger_workflow_mtvme7r9']
    );
    const optionSource = await client.query(
      `select code, source_type, source_config
         from public.system_option_sources
        where code = 'workflow_backend_command'`
    );
    const optionRows = await client.query(
      `select id, account_id, service_name, code, value, label, task_type, status
         from public.workflow_backend_command_options
        order by label`
    );
    const formDefinitions = await client.query(
      `select code, schema->'fields' as fields
         from public.lowcode_form_definitions
        where code in (
          'trigger-workflow.node.task',
          'trigger-workflow.node.trigger-and-wait',
          'trigger-workflow.node.batch-trigger'
        )
        order by code`
    );
    console.log(JSON.stringify({
      tasks: tasks.rows,
      optionSource: optionSource.rows,
      optionRows: optionRows.rows,
      formDefinitions: formDefinitions.rows,
      models: models.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        taskRefs: Array.isArray(row.draft_schema?.nodes)
          ? row.draft_schema.nodes.flatMap((node: any) => node?.config?.task
            ? [{ nodeId: node.id, ...node.config.task }]
            : [])
          : []
      }))
    }, null, 2));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
