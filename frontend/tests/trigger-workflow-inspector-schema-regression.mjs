import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import ts from 'typescript';

async function readMigration(name) {
  const candidates = [
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    new URL(`../../artifacts/migration-backups/migrations-20260907-174149/supabase-migrations/${name}`, import.meta.url),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return readFile(candidate, 'utf8');
    } catch {
      // The historical baseline may be archived from the active migrations directory.
    }
  }
  throw new Error(`Unable to locate migration ${name}`);
}

const [migration, scheduleMigration, webhookMigration, parallelJoinMigration] = await Promise.all([
  readMigration('20260813130000_trigger_workflow_inspector_forms.sql'),
  readMigration('20260815120000_trigger_workflow_schedule_sub_form.sql'),
  readMigration('20260815130000_trigger_workflow_webhook_service_form.sql'),
  readMigration('20260909040000_trigger_workflow_parallel_join_inspector.sql'),
]);
const inspectorMigrations = `${migration}\n${parallelJoinMigration}`;
const designer = await readFile(
  new URL('../pages/dashboard/trigger-workflow/designer.vue', import.meta.url),
  'utf8',
);
const editor = await readFile(
  new URL('../../packages/trigger-workflow-editor/src/components/TriggerWorkflowEditor.vue', import.meta.url),
  'utf8',
);
const formDefinitionSource = await readFile(
  new URL('../utils/lowCodeFormDefinitions.ts', import.meta.url),
  'utf8',
);

const inspectorSource = await readFile(
  new URL('../../packages/trigger-workflow-editor/src/inspector-form.ts', import.meta.url),
  'utf8',
);
const runtimeCatalogSource = await readFile(
  new URL('../../packages/trigger-workflow-editor/src/runtime-catalog.ts', import.meta.url),
  'utf8',
);
const compiledRuntimeCatalog = ts.transpileModule(runtimeCatalogSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const runtimeCatalogUrl = `data:text/javascript;base64,${Buffer.from(compiledRuntimeCatalog).toString('base64')}`;
const compiledInspector = ts.transpileModule(inspectorSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText.replace("from './runtime-catalog'", `from '${runtimeCatalogUrl}'`);
const inspectorUrl = `data:text/javascript;base64,${Buffer.from(compiledInspector).toString('base64')}`;
const inspector = await import(inspectorUrl);
const compiledFormDefinitions = ts.transpileModule(formDefinitionSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const formDefinitionsUrl = `data:text/javascript;base64,${Buffer.from(compiledFormDefinitions).toString('base64')}`;
const formDefinitions = await import(formDefinitionsUrl);

assert.equal(inspector.triggerInspectorNodeTypes.length, 19);
assert.equal(Object.keys(inspector.triggerNodeFormSchemaCodeByType).length, 19);

for (const type of inspector.triggerInspectorNodeTypes) {
  const code = inspector.triggerNodeFormSchemaCodeByType[type];
  assert.match(code, /^[a-z][a-z0-9._-]*$/);
  assert.match(inspectorMigrations, new RegExp(`'${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
}

assert.match(parallelJoinMigration, /'trigger-workflow\.node\.parallel-join'/);
assert.match(parallelJoinMigration, /'trigger-workflow\.node\.parallel'/);
assert.match(parallelJoinMigration, /['"]field['"], 'joinKey'/);

assert.match(migration, /'trigger-workflow\.edge'/);
assert.match(migration, /on conflict \(code\) do update set/g);
assert.match(migration, /"kind": "tabs"/);
assert.match(migration, /"label": "基础信息"/);
assert.match(migration, /"label": "高级配置"/);
assert.match(webhookMigration, /'trigger-workflow\.node\.webhook'/);
assert.match(webhookMigration, /"field": "webhookPath"/);
assert.match(webhookMigration, /"field": "webhookMethod"/);
assert.match(webhookMigration, /"field": "webhookBody"/);
assert.match(webhookMigration, /"component": "lc-sub-form"/);
assert.match(webhookMigration, /"field": "serviceName"/);
assert.match(webhookMigration, /"field": "serviceMethod"/);
assert.match(webhookMigration, /"field": "postData"/);
assert.match(webhookMigration, /"value": "workflow"/);
assert.match(webhookMigration, /\/api\/service/);
assert.match(migration, /"field": "taskType"/);
assert.match(migration, /"value": "frontendCommand"/);
assert.match(migration, /"value": "backendCommand"/);
assert.match(migration, /"value": "storedProcedure"/);
assert.match(migration, /"field": "frontendFunction"/);
assert.match(migration, /"field": "backendFunction"/);
assert.match(migration, /"field": "procedureName"/);
assert.match(migration, /"component": "lc-monaco-editor"/);
assert.match(migration, /"field": "taskImportPath"/);
assert.match(migration, /"field": "taskInput"/);
assert.match(migration, /"field": "outputMapping"/);
assert.match(migration, /"field": "failureStrategy"/);
assert.match(migration, /"field": "priority"/);
assert.match(migration, /"field": "taskTags"/);
assert.match(migration, /"label": "执行策略"/);
assert.match(migration, /"field": "retryFactor"/);
assert.match(migration, /"field": "retryMinTimeoutMs"/);
assert.match(migration, /"field": "retryMaxTimeoutMs"/);
assert.match(migration, /"field": "dataMapping"/);
assert.match(migration, /"field": "aiTools"/);
assert.match(migration, /"field": "memoryKey"/);
assert.match(migration, /"field": "branches"/);
assert.match(migration, /"field": "metadata"/);

assert.match(scheduleMigration, /update public\.lowcode_form_definitions/);
assert.match(scheduleMigration, /'trigger-workflow\.node\.schedule'/);
assert.match(scheduleMigration, /"field": "scheduleRule"/);
assert.match(scheduleMigration, /"component": "lc-sub-form"/);
assert.match(scheduleMigration, /"field": "kind"/);
assert.match(scheduleMigration, /"field": "time"/);
assert.match(scheduleMigration, /"field": "weekday"/);
assert.match(scheduleMigration, /"field": "dayOfMonth"/);
assert.match(scheduleMigration, /"field": "intervalMinutes"/);
assert.match(scheduleMigration, /"field": "cron"/);
assert.match(scheduleMigration, /"label": "Cron 表达式（高级）"/);
assert.match(scheduleMigration, /"props": \{\s*"schema": \{/);
assert.doesNotMatch(
  inspectorSource,
  /enhanceScheduleFormSchema|createScheduleRuleField/,
  'The schedule sub-form must be defined by the database schema.',
);

assert.match(
  designer,
  /loadAvailableLowCodeFormDefinitions\(serviceApi, codes\)/,
  'The page must load the inspector schemas from lowcode_form_definitions.',
);
assert.match(designer, /:node-form-schemas="nodeFormSchemas"/);
assert.match(designer, /:edge-form-schema="edgeFormSchema"/);
assert.match(designer, /其余使用内置配置/);

assert.match(editor, /nodeFormSchemas\?: TriggerNodeFormSchemaOverrides/);
assert.match(editor, /resolveTriggerNodeFormSchema\(selectedNode\.value, props\.nodeFormSchemas\)/);
assert.match(editor, /resolveTriggerEdgeFormSchema\(selectedEdge\.value, props\.edgeFormSchema\)/);

assert.match(formDefinitionSource, /export async function loadAvailableLowCodeFormDefinitions/);
assert.match(formDefinitionSource, /catch \{\s*return;\s*\}/);
assert.match(
  formDefinitionSource,
  /filters: \{ code: requestedCodes, enabled: true \}/,
  'Only enabled requested definitions may be loaded.',
);

const requests = [];
const responseRows = [
  {
    id: 'valid',
    code: 'schema.valid',
    name: 'Valid',
    description: null,
    schema: {
      fields: [{ field: 'name', label: 'Name', component: 'vxe-input' }],
      actions: [],
    },
    enabled: true,
    created_at: '2026-08-13T00:00:00.000Z',
    updated_at: '2026-08-13T00:00:00.000Z',
  },
  {
    id: 'invalid',
    code: 'schema.invalid',
    name: 'Invalid',
    description: null,
    schema: { fields: [], actions: [] },
    enabled: true,
    created_at: '2026-08-13T00:00:00.000Z',
    updated_at: '2026-08-13T00:00:00.000Z',
  },
];
const serviceApi = {
  async invoke(serviceName, serviceMethod, postData) {
    requests.push({ serviceName, serviceMethod, postData });
    return responseRows;
  },
};
const available = await formDefinitions.loadAvailableLowCodeFormDefinitions(serviceApi, [
  'schema.valid',
  'schema.invalid',
  'schema.missing',
  'schema.valid',
]);
assert.deepEqual(Object.keys(available), ['schema.valid']);
assert.notEqual(available['schema.valid'].schema, responseRows[0].schema);
assert.deepEqual(requests[0], {
  serviceName: 'lowcode',
  serviceMethod: 'listItems',
  postData: {
    resource: 'lowcode_form_definitions',
    filters: {
      code: ['schema.valid', 'schema.invalid', 'schema.missing'],
      enabled: true,
    },
    limit: 3,
  },
});
await assert.rejects(
  () => formDefinitions.loadLowCodeFormDefinitions(serviceApi, ['schema.valid', 'schema.invalid']),
  /schema.invalid/,
);

console.log('Trigger workflow inspector database-schema regression passed.');
