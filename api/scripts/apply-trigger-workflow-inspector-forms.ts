import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionStrings = [env.DIRECT_URL, env.DATABASE_URL]
  .filter((value): value is string => Boolean(value?.trim()))
  .filter((value, index, values) => values.indexOf(value) === index);

if (!rawConnectionStrings.length) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPaths = [
  resolve(repoRoot, 'supabase/migrations/20260813130000_trigger_workflow_inspector_forms.sql'),
  resolve(repoRoot, 'supabase/migrations/20260815120000_trigger_workflow_schedule_sub_form.sql'),
  resolve(repoRoot, 'supabase/migrations/20260815130000_trigger_workflow_webhook_service_form.sql')
];

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function connect() {
  let connectionError: unknown;
  for (const rawConnectionString of rawConnectionStrings) {
    const client = new Client({
      connectionString: connectionString(rawConnectionString),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 30_000,
      keepAlive: true
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      return client;
    } catch (error) {
      connectionError = error;
      await client.end().catch(() => undefined);
    }
  }
  throw connectionError;
}

async function main() {
  const client = await connect();
  try {
    for (const migrationPath of migrationPaths) {
      await client.query(await readFile(migrationPath, 'utf8'));
    }

    const { rows: taskRows } = await client.query<{
      field_names: string[];
      tab_keys: string[];
    }>(`
      select
        array(
          select field->>'field'
          from jsonb_array_elements(schema->'fields') field
          order by field->>'field'
        ) as field_names,
        array(
          select tab->>'key'
          from jsonb_array_elements(schema->'layout'->0->'tabs') tab
        ) as tab_keys
      from public.lowcode_form_definitions
      where code = 'trigger-workflow.node.task'
    `);
    const taskResult = taskRows[0];
    const requiredFields = [
      'taskType',
      'frontendFunction',
      'backendFunction',
      'procedureName',
      'taskInput',
      'outputMapping',
      'failureStrategy',
      'priority',
      'taskTags'
    ];

    const { rows: scheduleRows } = await client.query<{
      found: boolean;
      schedule_rule_component: string;
      schedule_rule_fields: string[];
      schedule_layout_has_rule: boolean;
    }>(`
      select
        count(*) over () = 1 as found,
        coalesce((
          select field->>'component'
          from jsonb_array_elements(schema->'fields') field
          where field->>'field' = 'scheduleRule'
          limit 1
        ), '') as schedule_rule_component,
        array(
          select nested_field->>'field'
          from jsonb_array_elements(coalesce((
            select field->'props'->'schema'->'fields'
            from jsonb_array_elements(schema->'fields') field
            where field->>'field' = 'scheduleRule'
            limit 1
          ), '[]'::jsonb)) nested_field
          order by nested_field->>'field'
        ) as schedule_rule_fields,
        coalesce(
          (schema #> '{layout,0,tabs,0,blocks}')
            @> '[{"kind":"field","field":"scheduleRule"}]'::jsonb,
          false
        ) as schedule_layout_has_rule
      from public.lowcode_form_definitions
      where code = 'trigger-workflow.node.schedule'
      limit 1
    `);
    const scheduleResult = scheduleRows[0];
    const requiredScheduleFields = [
      'kind',
      'time',
      'weekday',
      'dayOfMonth',
      'intervalMinutes'
    ];

    const { rows: webhookRows } = await client.query<{
      found: boolean;
      webhook_body_component: string;
      webhook_body_fields: string[];
      webhook_layout_has_body: boolean;
    }>(`
      select
        count(*) over () = 1 as found,
        coalesce((
          select field->>'component'
          from jsonb_array_elements(schema->'fields') field
          where field->>'field' = 'webhookBody'
          limit 1
        ), '') as webhook_body_component,
        array(
          select nested_field->>'field'
          from jsonb_array_elements(coalesce((
            select field->'props'->'schema'->'fields'
            from jsonb_array_elements(schema->'fields') field
            where field->>'field' = 'webhookBody'
            limit 1
          ), '[]'::jsonb)) nested_field
          order by nested_field->>'field'
        ) as webhook_body_fields,
        coalesce(
          (schema #> '{layout,0,tabs,1,blocks}')
            @> '[{"kind":"field","field":"webhookBody"}]'::jsonb,
          false
        ) as webhook_layout_has_body
      from public.lowcode_form_definitions
      where code = 'trigger-workflow.node.webhook'
      limit 1
    `);
    const webhookResult = webhookRows[0];
    const requiredWebhookBodyFields = [
      'serviceName',
      'serviceMethod',
      'postData'
    ];

    if (
      !taskResult ||
      !requiredFields.every((field) => taskResult.field_names.includes(field)) ||
      !taskResult.tab_keys.includes('execution') ||
      !scheduleResult?.found ||
      scheduleResult.schedule_rule_component !== 'lc-sub-form' ||
      !requiredScheduleFields.every((field) =>
        scheduleResult.schedule_rule_fields.includes(field)
      ) ||
      !scheduleResult.schedule_layout_has_rule ||
      !webhookResult?.found ||
      webhookResult.webhook_body_component !== 'lc-sub-form' ||
      !requiredWebhookBodyFields.every((field) =>
        webhookResult.webhook_body_fields.includes(field)
      ) ||
      !webhookResult.webhook_layout_has_body
    ) {
      throw new Error(
        `Trigger workflow inspector verification failed: ${JSON.stringify({
          task: taskResult,
          schedule: scheduleResult,
          webhook: webhookResult
        })}`
      );
    }
    console.log(JSON.stringify({
      requiredFields,
      tabKeys: taskResult.tab_keys,
      requiredScheduleFields,
      scheduleRuleComponent: scheduleResult.schedule_rule_component,
      requiredWebhookBodyFields,
      webhookBodyComponent: webhookResult.webhook_body_component
    }));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
