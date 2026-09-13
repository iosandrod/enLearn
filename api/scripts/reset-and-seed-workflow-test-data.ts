import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { assertValidTriggerWorkflow } from '../../packages/trigger-workflow-editor/src/schema/validate';
import type { TriggerWorkflowModel } from '../../packages/trigger-workflow-editor/src/schema/types';
import { compileTriggerWorkflowCanonical } from '../../packages/trigger-workflow-editor/src/compiler/canonical';
import { buildTriggerWorkflowJob } from '../../packages/trigger-workflow-editor/src/job-adapters';

const DOCUMENT_TYPE = 'trigger-workflow';
const DEFAULT_ACCOUNT_CODE = '001';

type Account = { id: string; code: string; name: string };

/**
 * Destructive, repeatable workflow fixture reset. It only touches tables whose
 * names are part of the workflow runtime and leaves accounts/users untouched.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun && process.env.WORKFLOW_DB_ALLOW_RESET !== '1') {
    throw new Error('Refusing to modify the database. Set WORKFLOW_DB_ALLOW_RESET=1 for the selected target.');
  }

  const env = getEnv();
  const accountCode = readArgument('--account-code') ?? env.WORKFLOW_TEST_ACCOUNT_CODE?.trim() ?? DEFAULT_ACCOUNT_CODE;
  const client = await connect(env);

  try {
    const accountResult = await client.query<Account>(
      `select id, code, name from basejump.accounts where code = $1 order by created_at, id limit 1`,
      [accountCode]
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error(`Account code "${accountCode}" was not found.`);

    if (dryRun) {
      const tables = await client.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public' and table_name like 'wf_%' order by table_name`);
      const counts: Record<string, number> = {};
      for (const row of tables.rows) {
        const table = row.table_name;
        try {
          counts[table] = Number((await client.query<{ n: string }>(`select count(*)::text n from public.${table}`)).rows[0]?.n ?? 0);
        } catch { counts[table] = -1; }
      }
      const columns = await client.query<{ table_name: string; column_name: string }>(`select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name like 'wf_%' order by table_name, ordinal_position`);
      console.log(JSON.stringify({ account, tables: tables.rows.map((row) => row.table_name), counts, columns: columns.rows }, null, 2));
      return;
    }

    const models = createCoverageWorkflows();
    for (const model of models) assertValidTriggerWorkflow(model);

    await client.query('begin');
    try {
      // Child/runtime rows first. Cascades cover most relationships, while the
      // explicit deletes also handle installations with older FK definitions.
      await deleteWorkflowRows(client, account.id);

      const inserted: Array<{ id: string; code: string; definitionId?: string }> = [];
      for (const model of models) {
        const modelResult = await client.query<{ id: string }>(
          `insert into public.wf_model (account_id, code, name, document_type, status, current_version, draft_schema)
           values ($1, $2, $3, $4, 'draft', 0, $5::jsonb) returning id`,
          [account.id, model.code, model.name, DOCUMENT_TYPE, JSON.stringify(model)]
        );
        const modelId = modelResult.rows[0].id;
        const canonical = compileTriggerWorkflowCanonical(model);
        const versionId = (await client.query<{ id: string }>(
          `insert into public.wf_model_version (model_id, version, schema, remark)
           values ($1, 1, $2::jsonb, $3) returning id`,
          [modelId, JSON.stringify({ ...model, canonical }), 'coverage fixture']
        )).rows[0].id;
        const definition = await client.query<{ id: string }>(
          `insert into public.wf_process_definition
             (account_id, model_id, model_version_id, code, name, version, document_type, schema, status, published_at)
           values ($1, $2, $3, $4, $5, 1, $6, $7::jsonb, 'active', timezone('utc', now())) returning id`,
          [account.id, modelId, versionId, model.code, model.name, DOCUMENT_TYPE, JSON.stringify({ ...model, canonical })]
        );
        await client.query(
          `update public.wf_model set status = 'published', current_version = 1, updated_at = timezone('utc', now()) where id = $1`,
          [modelId]
        );
        for (const node of model.nodes) {
          await client.query(
            `insert into public.wf_node_definition (id, definition_id, node_id, node_type, name, config)
             values ($1, $2, $3, $4, $5, $6::jsonb)`,
            [randomUUID(), definition.rows[0].id, node.id, node.type, node.name, JSON.stringify(node.config ?? {})]
          );
        }
        for (const workflowEdge of model.edges) {
          await client.query(
            `insert into public.wf_edge_definition (id, definition_id, edge_id, source_node_id, target_node_id, condition, priority)
             values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
            [randomUUID(), definition.rows[0].id, workflowEdge.id, workflowEdge.source, workflowEdge.target, JSON.stringify(workflowEdge.condition ?? { type: 'always' }), 0]
          );
        }
        if (model.code === 'coverage_schedule_and_external_adapters') {
          const job = buildTriggerWorkflowJob({ ...model, id: modelId });
          await client.query(
            `insert into public.wf_job
              (account_id, code, name, type, status, trigger_task_id, cron_expr, timezone, payload, retry_policy, timeout_seconds, concurrency_key)
             values ($1, $2, $3, 'cron', 'draft', $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)`,
            [account.id, job.code, job.name, job.triggerTaskId, job.cronExpr, job.timezone, JSON.stringify(job.payload), JSON.stringify(job.retryPolicy), job.timeoutSeconds, job.concurrencyKey]
          );
        }
        inserted.push({ id: modelId, code: model.code, definitionId: definition.rows[0].id });
      }
      await client.query('commit');

      const counts = await getCounts(client, account.id);
      assert.equal(counts.models, models.length);
      assert.equal(counts.definitions, models.length);
      console.log(JSON.stringify({ account, documentType: DOCUMENT_TYPE, workflows: inserted, counts }, null, 2));
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } finally {
    await client.end();
  }
}

function createCoverageWorkflows(): TriggerWorkflowModel[] {
  const pos = (x: number, y: number) => ({ x, y });
  const edge = (source: string, target: string, condition?: TriggerWorkflowModel['edges'][number]['condition']) => ({
    id: `e_${source}_${target}`, source, target, ...(condition ? { condition } : {})
  });
  const task = (id: string, name: string, type: 'registeredTask' | 'frontendCommand' = 'registeredTask') => ({
    id, type: 'task' as const, name, position: pos(220, 160), config: { task: type === 'registeredTask'
      ? { type, id: 'notification.dispatch', input: { source: 'coverage' }, outputPath: `outputs.${id}` }
      : { type, frontendFunction: 'async () => ({ code: \'message.show\', params: { message: \'coverage\' } })', outputPath: `outputs.${id}` } }
  });
  const end = (id = 'end') => ({ id, type: 'end' as const, name: '结束', position: pos(500, 900) });

  const core: TriggerWorkflowModel = {
    schemaVersion: 1, code: 'coverage_all_nodes_and_branches', name: '覆盖：节点、条件与并行分支', kind: 'custom',
    nodes: [
      { id: 'start', type: 'start', name: '手动入口', position: pos(500, 20) },
      { id: 'condition', type: 'condition', name: '条件分支', position: pos(500, 100), config: { branches: [{ label: '通过', condition: { type: 'field', field: 'payload.approved', operator: 'eq', value: true } }, { label: '其他', condition: { type: 'always' } }] } },
      task('task_registered', '注册任务'), task('task_frontend', '前端指令', 'frontendCommand'),
      { id: 'parallel', type: 'parallel', name: '并行 Fork', position: pos(500, 250), config: { metadata: { joinKey: 'coverage-join' } } },
      { id: 'branch_wait', type: 'wait', name: '等待分支', position: pos(220, 350), config: { wait: { mode: 'duration', duration: 'PT0S' } } },
      { id: 'branch_data_source', type: 'dataSource', name: '数据源', position: pos(400, 350), config: { data: { connector: 'supabase', operation: 'query', source: 'coverage' } } },
      { id: 'branch_transform', type: 'transform', name: '转换', position: pos(600, 350), config: { expression: 'return { transformed: true };' } },
      { id: 'branch_data_sink', type: 'dataSink', name: '数据汇', position: pos(800, 350), config: { data: { connector: 'supabase', operation: 'upsert', target: 'coverage' } } },
      { id: 'join', type: 'parallelJoin', name: '并行 Join', position: pos(500, 500), config: { metadata: { joinKey: 'coverage-join' } } },
      { id: 'agent', type: 'agent', name: 'Agent', position: pos(500, 600), config: { ai: { model: 'coverage-model', prompt: 'coverage' } } },
      { id: 'tool', type: 'tool', name: 'Tool', position: pos(500, 680), config: { task: { type: 'registeredTask', id: 'notification.dispatch', input: { tool: 'coverage' } } } },
      { id: 'memory', type: 'memory', name: 'Memory', position: pos(500, 760), config: { task: { type: 'registeredTask', id: 'notification.dispatch', input: { memory: 'coverage' } } } },
      { id: 'batch', type: 'batchTrigger', name: '批量触发', position: pos(500, 840), config: { task: { type: 'registeredTask', id: 'notification.dispatch', input: { source: 'coverage-batch' } } } },
      end()
    ],
    edges: [edge('start', 'condition'), edge('condition', 'task_registered', { type: 'field', field: 'payload.approved', operator: 'eq', value: true }), edge('condition', 'task_frontend', { type: 'always' }), edge('task_registered', 'parallel'), edge('task_frontend', 'parallel'), edge('parallel', 'branch_wait'), edge('parallel', 'branch_data_source'), edge('parallel', 'branch_transform'), edge('parallel', 'branch_data_sink'), edge('branch_wait', 'join'), edge('branch_data_source', 'join'), edge('branch_transform', 'join'), edge('branch_data_sink', 'join'), edge('join', 'agent'), edge('agent', 'tool'), edge('tool', 'memory'), edge('memory', 'batch'), edge('batch', 'end')]
  };

  const human: TriggerWorkflowModel = {
    schemaVersion: 1, code: 'coverage_human_completion_policies', name: '覆盖：人工任一、全部、比例与超时', kind: 'approval',
    nodes: [
      { id: 'start', type: 'start', name: '手动入口' },
      { id: 'any', type: 'manualApproval', name: '任一人审批', config: { approval: { assigneeType: 'user', assigneeIds: ['coverage-user-a', 'coverage-user-b'], timeoutSeconds: 3600, onTimeout: 'autoReject', completionStrategy: 'any' } } },
      { id: 'all', type: 'humanReview', name: '全部会签', config: { approval: { assigneeType: 'role', assigneeIds: ['coverage-reviewers'], timeoutSeconds: 3600, onTimeout: 'fail', completionStrategy: 'all' } } },
      { id: 'ratio', type: 'manualApproval', name: '比例审批', config: { approval: { assigneeType: 'team', assigneeIds: ['coverage-team'], timeoutSeconds: 3600, onTimeout: 'continue', completionStrategy: 'ratio', passRatio: 0.66 } } },
      { id: 'timer', type: 'wait', name: '等待恢复', config: { wait: { mode: 'duration', duration: 'PT0S' } } }, end()
    ], edges: [edge('start', 'any'), edge('any', 'all'), edge('all', 'ratio'), edge('ratio', 'timer'), edge('timer', 'end')]
  };

  const scheduled: TriggerWorkflowModel = {
    schemaVersion: 1, code: 'coverage_schedule_and_external_adapters', name: '覆盖：定时、外部任务与等待', kind: 'dataSync',
    nodes: [
      { id: 'schedule', type: 'schedule', name: '定时入口', config: { schedule: { cron: '0 * * * *', timezone: 'Asia/Shanghai' } } },
      { id: 'trigger_wait', type: 'triggerAndWait', name: '外部任务等待', config: { task: { type: 'registeredTask', id: 'notification.dispatch', input: { source: 'coverage' } } } },
      end()
    ], edges: [edge('schedule', 'trigger_wait'), edge('trigger_wait', 'end')]
  };

  const webhook: TriggerWorkflowModel = {
    schemaVersion: 1, code: 'coverage_webhook_connector', name: '覆盖：Webhook 与连接器', kind: 'custom',
    nodes: [
      { id: 'webhook', type: 'webhook', name: 'Webhook 入口', config: { webhook: { path: '/workflow-coverage/webhook', method: 'POST' } } },
      { id: 'source', type: 'dataSource', name: '读取输入', config: { data: { connector: 'supabase', operation: 'extract', source: 'payload' } } },
      { id: 'sink', type: 'dataSink', name: '写入结果', config: { data: { connector: 'supabase', operation: 'load', target: 'coverage' } } }, end()
    ], edges: [edge('webhook', 'source'), edge('source', 'sink'), edge('sink', 'end')]
  };
  return [core, human, scheduled, webhook];
}

async function getCounts(client: Client, accountId: string) {
  const result: Record<string, number> = {};
  for (const [key, table] of Object.entries({ models: 'wf_model', versions: 'wf_model_version', definitions: 'wf_process_definition', instances: 'wf_process_instance', jobs: 'wf_job', runs: 'wf_job_run' })) {
    const where = table === 'wf_model_version' ? `where model_id in (select id from public.wf_model where account_id = $1)` : `where account_id = $1`;
    result[key] = (await client.query<{ n: number }>(`select count(*)::int n from public.${table} ${where}`, [accountId])).rows[0]?.n ?? 0;
  }
  return result;
}

async function deleteWorkflowRows(client: Client, accountId: string) {
  const exists = async (table: string) => Boolean((await client.query<{ present: boolean }>(`select to_regclass($1) is not null present`, [`public.${table}`])).rows[0]?.present);
  const statements: Array<[string, string[]]> = [
    ['wf_execution_event', ['process_instance_id in (select id from public.wf_process_instance where account_id = $1)']],
    ['wf_history_event', ['process_instance_id in (select id from public.wf_process_instance where account_id = $1)']],
    ['wf_variable', ['process_instance_id in (select id from public.wf_process_instance where account_id = $1)']],
    ['wf_execution_token', ['process_instance_id in (select id from public.wf_process_instance where account_id = $1)']],
    ['wf_task_candidate', ['task_id in (select id from public.wf_task where account_id = $1)']],
    ['wf_task', ['account_id = $1']],
    ['wf_node_instance', ['process_instance_id in (select id from public.wf_process_instance where account_id = $1)']],
    ['wf_cc', ['process_instance_id in (select id from public.wf_process_instance where account_id = $1)']],
    ['wf_comment', ['process_instance_id in (select id from public.wf_process_instance where account_id = $1)']],
    ['wf_document_binding', ['process_instance_id in (select id from public.wf_process_instance where account_id = $1)']],
    ['wf_timer_job', ['process_instance_id in (select id from public.wf_process_instance where account_id = $1)']],
    ['wf_job_run', ['account_id = $1']],
    ['wf_job', ['account_id = $1']],
    ['wf_edge_definition', ['definition_id in (select id from public.wf_process_definition where account_id = $1)']],
    ['wf_node_definition', ['definition_id in (select id from public.wf_process_definition where account_id = $1)']],
    ['wf_process_instance', ['account_id = $1']],
    ['wf_process_definition', ['account_id = $1']],
    ['wf_model_version', ['model_id in (select id from public.wf_model where account_id = $1)']],
    ['wf_model', ['account_id = $1']]
  ];
  for (const [table, predicates] of statements) {
    if (await exists(table)) await client.query(`delete from public.${table} where ${predicates.join(' and ')}`, [accountId]);
  }
}

async function connect(env: Record<string, string | undefined>) {
  const source = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!source) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const url = new URL(normalizePostgresConnectionString(source));
  url.searchParams.delete('pgbouncer'); url.searchParams.delete('sslmode'); url.searchParams.delete('uselibpqcompat');
  const client = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
  await client.connect();
  return client;
}

function readArgument(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim();
}

void main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
