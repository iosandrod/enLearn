import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import {
  PLANNING_MODEL_DEFINITIONS,
  type PlanningFieldDefinition,
  type PlanningModelDefinition
} from '../src/planning-service/planning.models';
import {
  assertTransactionActive,
  unwrapMigrationTransaction
} from './planning-migration-transaction';

const MIGRATION_FILES = [
  'supabase/migrations/20260807140000_planning_service.sql',
  'supabase/migrations/20260808150000_planning_diagnostic_tables.sql',
  'supabase/migrations/20260808160000_planning_extended_models.sql',
  'supabase/migrations/20260808170000_planning_execution_runtime.sql',
  'supabase/migrations/20260810110000_unify_sales_order_status.sql',
  'supabase/migrations/20260810210000_planning_master_categories.sql',
  'supabase/migrations/20260813090000_planning_item_display_name.sql'
];

type SavedRow = Record<string, unknown> & { id: string; account_id: string };

function directProjectConnectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  const match = url.username.match(/^postgres\.([a-z0-9]+)$/i);
  if (match && url.hostname.includes('.pooler.supabase.com')) {
    url.hostname = `db.${match[1]}.supabase.co`;
    url.port = '5432';
    url.username = 'postgres';
  }
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

function smokeValue(field: PlanningFieldDefinition, model: PlanningModelDefinition, suffix: string) {
  if (field.options?.length) return field.options[0].value;
  switch (field.kind) {
    case 'number': return field.name === 'quantity' ? 2 : 1;
    case 'integer': return field.name === 'priority' || field.name === 'version_no' ? 1 : 1;
    case 'boolean': return true;
    case 'uuid': return '33333333-3333-4333-8333-333333333333';
    case 'date': return '2026-08-08';
    case 'datetime': return field.name === 'due' || field.name === 'flowdate'
      ? '2026-08-08T08:00:00Z'
      : '2026-08-01T00:00:00Z';
    case 'time': return '08:00:00';
    case 'interval': return '1 hour';
    case 'json': return {};
    case 'text': return `${model.key}-${field.name}-${suffix}`;
    default: return null;
  }
}

function rowInput(
  model: PlanningModelDefinition,
  saved: Map<string, SavedRow>,
  suffix: string
) {
  const data: Record<string, unknown> = {};
  for (const field of model.fields) {
    if (field.readOnly) continue;
    if (field.kind === 'relation') {
      if (field.required) {
        const related = field.relation ? saved.get(field.relation) : undefined;
        if (!related) throw new Error(`${model.key}.${field.name} requires unsaved relation ${field.relation}.`);
        data[field.name] = related.id;
      }
      continue;
    }
    if (field.required || model.businessKey === field.name) {
      data[field.name] = smokeValue(field, model, suffix);
    }
  }

  // Exercise representative optional types and relations while keeping the fixture graph minimal.
  if (model.key === 'planning_calendar') data.description = 'Planning CRUD smoke seed';
  if (model.key === 'planning_calendarbucket') {
    data.startdate = '2026-08-01T00:00:00Z';
    data.enddate = '2026-08-31T23:59:59Z';
    data.starttime = '08:00:00';
    data.endtime = '17:00:00';
  }
  if (model.key === 'planning_location') data.available_id = saved.get('planning_calendar')?.id;
  if (model.key === 'planning_supplier') data.available_id = saved.get('planning_calendar')?.id;
  if (model.key === 'planning_itemsupplier') data.location_id = saved.get('planning_location')?.id;
  if (model.key === 'planning_buffer') data.batch = '';
  if (model.key === 'planning_resource') {
    data.location_id = saved.get('planning_location')?.id;
    data.setupmatrix_id = saved.get('planning_setupmatrix')?.id;
  }
  if (model.key === 'planning_setuprule') data.resource_id = saved.get('planning_resource')?.id;
  if (model.key === 'planning_operation') {
    data.item_id = saved.get('planning_item')?.id;
    data.duration = '1 hour';
  }
  if (model.key === 'planning_operationmaterial') data.location_id = saved.get('planning_location')?.id;
  if (model.key === 'planning_suboperation') {
    // The single standard operation cannot be its own child. A dedicated child is inserted below.
    data.suboperation_id = saved.get('planning_operation_child')?.id;
  }
  if (model.key === 'planning_operation_dependency') {
    data.blockedby_id = saved.get('planning_operation_predecessor')?.id;
  }
  if (model.key === 'planning_demand') data.operation_id = saved.get('planning_operation')?.id;
  if (model.key === 'planning_operationplan') {
    data.operation_id = saved.get('planning_operation')?.id;
    data.item_id = saved.get('planning_item')?.id;
    data.location_id = saved.get('planning_location')?.id;
    data.demand_id = saved.get('planning_demand')?.id;
    data.startdate = '2026-08-08T08:00:00Z';
    data.enddate = '2026-08-08T09:00:00Z';
  }
  if (model.key === 'planning_forecastplan') {
    data.forecast_id = saved.get('planning_forecast')?.id;
    data.enddate = '2026-09-01T00:00:00Z';
  }
  if (model.key === 'planning_problem') data.run_id = saved.get('planning_run')?.id;
  if (model.key === 'planning_constraint') {
    data.run_id = saved.get('planning_run')?.id;
    data.demand_id = saved.get('planning_demand')?.id;
    data.forecast_id = saved.get('planning_forecast')?.id;
    data.item_id = saved.get('planning_item')?.id;
  }
  if (model.key === 'planning_resourceplan') data.run_id = saved.get('planning_run')?.id;
  if (model.key === 'planning_run') {
    data.submitted = '2026-08-08T08:00:00Z';
    data.arguments = {};
  }
  if (model.key === 'planning_schedule') {
    data.name = `planning-schedule-${suffix}`;
    data.data = {};
    data.enabled = false;
  }
  if (model.key === 'planning_export') {
    data.name = `planning-export-${suffix}.csv`;
    data.report = 'planning.problem';
  }
  if (model.key === 'planning_scenario') data.name = `scenario-${suffix}`;
  if (model.key === 'planning_bucketdetail') data.enddate = '2026-09-01T00:00:00Z';
  if (model.key === 'planning_attribute') {
    data.model = 'item';
    data.name = `smoke_${suffix.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
  }
  if (model.key === 'planning_archive_manager') {
    data.snapshot_date = '2026-08-08T08:00:00Z';
    data.total_records = 3;
    data.buffer_records = 1;
    data.demand_records = 1;
    data.operationplan_records = 1;
  }
  if (model.key === 'planning_source_mapping') {
    data.source_system = 'smoke';
    data.entity_type = 'item';
    data.source_key = `item-${suffix}`;
    data.item_id = saved.get('planning_item')?.id;
  }
  if (model.key === 'planning_plan_version') {
    data.code = `PLAN-${suffix}`;
    data.name = `Planning smoke ${suffix}`;
    data.scenario_id = saved.get('planning_scenario')?.id;
  }
  if (model.key === 'planning_demand_sync_state') {
    data.source_system = 'smoke';
    data.source_key = `line-${suffix}`;
    data.source_order_id = '11111111-1111-4111-8111-111111111111';
    data.source_line_id = '22222222-2222-4222-8222-222222222222';
    data.source_doc_no = `SO-${suffix}`;
    data.source_line_no = '10';
    data.demand_id = saved.get('planning_demand')?.id;
  }
  return data;
}

async function executeCrud(
  client: Client,
  action: 'create' | 'update' | 'delete',
  resource: string,
  accountId: string,
  payload: Record<string, unknown>
) {
  const result = await client.query<{ result: unknown }>(`
    select public.execute_dynamic_crud(
      $1::text,
      $2::text,
      jsonb_build_object(
        'resource_name', $2::text,
        'config_hash', registry.config_hash,
        'resources', registry.config->'resources',
        'detail_relations', '{}'::jsonb,
        'after_save_relations', '{}'::jsonb
      ),
      $3::jsonb,
      $4::uuid
    ) as result
    from public.dynamic_crud_resource_registry registry
    where registry.resource_name = $2::text
      and registry.table_name = $2::text
  `, [action, resource, JSON.stringify(payload), accountId]);
  if (!result.rows.length) throw new Error(`Dynamic CRUD registry is missing ${resource}.`);
  return result.rows[0].result;
}

async function createRow(
  client: Client,
  resource: string,
  accountId: string,
  data: Record<string, unknown>
) {
  const result = await executeCrud(client, 'create', resource, accountId, {
    items: [{ data }], actor_user_id: null
  }) as SavedRow;
  if (!result?.id || result.account_id !== accountId) {
    throw new Error(`Create failed for ${resource}: ${JSON.stringify(result)}`);
  }
  return result;
}

async function main() {
  const env = getEnv();
  const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = (await Promise.all(
    MIGRATION_FILES.map(async (file) => unwrapMigrationTransaction(
      await readFile(resolve(repoRoot, file), 'utf8')
    ))
  )).join('\n\n');
  const client = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query('begin');
    if (process.env.PLANNING_SMOKE_SKIP_MIGRATION !== '1') await client.query(migration);
    await assertTransactionActive(client);

    const accountRows = await client.query<{ id: string }>(`
      select id from basejump.accounts where status = 'active' order by created_at, id limit 2
    `);
    const firstAccount = accountRows.rows[0]?.id;
    if (!firstAccount) throw new Error('An active account set is required for the CRUD smoke test.');
    let secondAccount = accountRows.rows[1]?.id;
    if (!secondAccount) {
      const owner = await client.query<{ id: string }>('select id from auth.users order by created_at, id limit 1');
      if (!owner.rows[0]?.id) throw new Error('An auth user is required to create a temporary account set.');
      const inserted = await client.query<{ id: string }>(`
        insert into basejump.accounts (primary_owner_user_id, name, slug, personal_account, code, status)
        values ($1, 'Planning smoke account', 'planning-smoke-account', false, 'PLNSMOKE', 'active')
        returning id
      `, [owner.rows[0].id]);
      secondAccount = inserted.rows[0].id;
    }

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const saved = new Map<string, SavedRow>();
    let created = 0;

    for (const model of PLANNING_MODEL_DEFINITIONS) {
      if (model.access === 'view') {
        continue;
      }
      if (model.key === 'planning_suboperation' || model.key === 'planning_operation_dependency') {
        const operation = PLANNING_MODEL_DEFINITIONS.find((candidate) => candidate.key === 'planning_operation');
        if (!operation) throw new Error('Planning operation definition is missing.');
        const alias = model.key === 'planning_suboperation'
          ? 'planning_operation_child'
          : 'planning_operation_predecessor';
        if (!saved.has(alias)) {
          if (model.key === 'planning_suboperation') {
            const parent = saved.get('planning_operation');
            if (!parent) throw new Error('Planning operation fixture is missing.');
            await executeCrud(client, 'update', operation.key, firstAccount, {
              data: { type: 'routing' },
              selector: { id: parent.id },
              return_single: true
            });
          }
          const extraOperation = await createRow(client, operation.key, firstAccount, {
            ...rowInput(operation, saved, `${suffix}-${alias}`),
            name: `${alias}-${suffix}`
          });
          saved.set(alias, extraOperation);
          created += 1;
        }
      }
      const row = await createRow(client, model.key, firstAccount, rowInput(model, saved, suffix));
      saved.set(model.key, row);
      created += 1;
    }

    const readOnlyFixtures: Record<string, Record<string, unknown>> = {
      planning_problem: {
        entity: 'demand', owner: `problem-${suffix}`, name: 'late', description: 'Smoke problem',
        startdate: '2026-08-08T08:00:00Z', enddate: '2026-08-08T09:00:00Z'
      },
      planning_constraint: {
        demand_id: saved.get('planning_demand')?.id,
        item_id: saved.get('planning_item')?.id,
        entity: 'demand', owner: `constraint-${suffix}`, name: 'material', description: 'Smoke constraint',
        startdate: '2026-08-08T08:00:00Z', enddate: '2026-08-08T09:00:00Z'
      },
      planning_resourceplan: {
        resource_id: saved.get('planning_resource')?.id,
        startdate: '2026-08-08T08:00:00Z', available: 8, load: 4, free: 4
      },
      planning_run: {
        name: `readonly-run-${suffix}`, submitted: '2026-08-08T08:00:00Z', arguments: {}, status: 'queued'
      },
      planning_archive_manager: {
        snapshot_date: '2026-08-08T08:00:00Z', total_records: 0,
        buffer_records: 0, demand_records: 0, operationplan_records: 0
      },
      planning_archived_buffer: {
        snapshot_id: null, item: `item-${suffix}`, location: `location-${suffix}`
      },
      planning_archived_demand: {
        snapshot_id: null, name: `demand-${suffix}`, item: `item-${suffix}`,
        location: `location-${suffix}`, customer: `customer-${suffix}`,
        due: '2026-08-08T08:00:00Z', priority: 10, quantity: 1
      },
      planning_archived_operationplan: {
        snapshot_id: null, reference: `operationplan-${suffix}`, type: 'MO', quantity: 1, item: `item-${suffix}`
      },
      planning_demand_sync_state: {
        source_type: 'sales_order_line', source_system: 'smoke', source_key: `line-${suffix}`,
        source_order_id: '11111111-1111-4111-8111-111111111111',
        source_line_id: '22222222-2222-4222-8222-222222222222',
        source_doc_no: `SO-${suffix}`, source_line_no: '10',
        demand_id: saved.get('planning_demand')?.id, status: 'pending'
      }
    };
    for (const model of PLANNING_MODEL_DEFINITIONS.filter((candidate) => candidate.access === 'view')) {
      const viewData = { ...readOnlyFixtures[model.key] };
      if (model.key.startsWith('planning_archived_')) {
        viewData.snapshot_id = saved.get('planning_archive_manager')?.id;
      }
      const insertFields = Object.keys(viewData).filter((field) => viewData[field] !== undefined);
      const row = await client.query<SavedRow>(`
        insert into public.${model.key} (account_id${insertFields.length ? `, ${insertFields.map((field) => `"${field}"`).join(', ')}` : ''})
        values ($1${insertFields.length ? `, ${insertFields.map((_field, index) => `$${index + 2}`).join(', ')}` : ''})
        returning *
      `, [firstAccount, ...insertFields.map((field) => viewData[field])]);
      saved.set(model.key, row.rows[0]);
      created += 1;
    }

    if (saved.size !== PLANNING_MODEL_DEFINITIONS.length + 2) {
      throw new Error(`Not all planning fixtures were created: ${saved.size}.`);
    }

    const firstCalendar = saved.get('planning_calendar');
    if (!firstCalendar) throw new Error('Calendar fixture is missing.');
    const sameName = String(firstCalendar.name);
    const secondCalendar = await createRow(client, 'planning_calendar', secondAccount, { name: sameName });
    created += 1;
    if (secondCalendar.name !== sameName) throw new Error('Same business key across accounts failed.');

    const updated = await executeCrud(client, 'update', 'planning_calendar', firstAccount, {
      data: { description: 'CRUD smoke updated' },
      selector: { id: firstCalendar.id },
      return_single: true
    }) as SavedRow;
    if (updated?.description !== 'CRUD smoke updated') {
      throw new Error(`Update smoke test failed: ${JSON.stringify(updated)}`);
    }

    const crossAccountUpdate = await executeCrud(client, 'update', 'planning_calendar', firstAccount, {
      data: { description: 'must not update' },
      selector: { id: secondCalendar.id },
      return_single: true
    });
    if (crossAccountUpdate !== null) {
      throw new Error(`Cross-account update was not isolated: ${JSON.stringify(crossAccountUpdate)}`);
    }

    const deleted = await executeCrud(client, 'delete', 'planning_calendar', secondAccount, {
      selector: { id: secondCalendar.id }
    }) as Array<{ id: string }>;
    if (deleted?.[0]?.id !== secondCalendar.id) {
      throw new Error(`Delete smoke test failed: ${JSON.stringify(deleted)}`);
    }

    const child = saved.get('planning_operation_child');
    const parent = saved.get('planning_operation');
    if (!child || !parent) throw new Error('Suboperation fixtures are missing.');
    const synced = await client.query<{ owner_id: string | null; item_id: string | null }>(`
      select owner_id, item_id from public.planning_operation where account_id = $1 and id = $2
    `, [firstAccount, child.id]);
    if (synced.rows[0]?.owner_id !== parent.id || synced.rows[0]?.item_id !== null) {
      throw new Error(`Suboperation synchronization failed: ${JSON.stringify(synced.rows[0])}`);
    }

    const modelCounts = await client.query<{ table_name: string; row_count: string }>(`
      select table_name, (xpath('/row/count/text()', query_to_xml(
        format('select count(*) as count from public.%I where account_id = %L', table_name, $1::uuid),
        false, true, ''
      )))[1]::text::bigint::text as row_count
      from information_schema.tables
      where table_schema = 'public' and table_name = any($2::text[])
      order by table_name
    `, [firstAccount, PLANNING_MODEL_DEFINITIONS.map((model) => model.key)]);
    const missingRows = modelCounts.rows.filter((entry) => Number(entry.row_count) < 1);
    if (modelCounts.rows.length !== PLANNING_MODEL_DEFINITIONS.length || missingRows.length) {
      throw new Error(`One or more planning tables were not exercised: ${JSON.stringify(missingRows)}`);
    }

    await assertTransactionActive(client);
    await client.query('rollback');
    console.log(JSON.stringify({
      models_exercised: PLANNING_MODEL_DEFINITIONS.length,
      create: created,
      update: 1,
      delete: 1,
      cross_account_update_rows: 0,
      suboperation_sync: 'verified',
      transaction: 'verified rollback'
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
