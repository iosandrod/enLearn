import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const migrationUrl = new URL(
  '../../supabase/migrations/20260826220000_database_node_actions.sql',
  import.meta.url,
);
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('runtime/node-action-registry.ts', frameworkRoot))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const runtime = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const {
  getLowCodeNodeActionMethods,
  getLowCodeNodeTypeDefinition,
  resolveLowCodeDataSourceNodeAction,
  resolveLowCodeNodeAction,
} = runtime;

let actionIndex = 0;
const action = (overrides) => ({
  id: `action-${++actionIndex}`,
  node_type: 'form',
  node_label: '表单',
  node_icon: 'ri-survey-line',
  action_code: 'setData',
  label: '设置表单数据',
  description: '',
  source_code: 'async function main() {}',
  parameters: [],
  returns: '',
  insert_text_template:
    'await this.executeAction({ node: {{nodeId}}, method: "setData" });',
  applicable_when: {},
  is_data_source_loader: false,
  enabled: true,
  is_system: true,
  sort_order: 10,
  limits: {},
  ...overrides,
});
const actions = [
  action({}),
  action({
    node_type: 'form',
    action_code: 'loadData',
    label: '获取编辑数据',
    is_data_source_loader: true,
    applicable_when: { formType: ['edit'] },
    sort_order: 20,
  }),
  action({
    node_type: 'grid',
    node_label: '表格',
    node_icon: 'ri-table-2',
    action_code: 'loadData',
    label: '获取表格数据',
    is_data_source_loader: true,
    sort_order: 10,
  }),
  action({
    node_type: 'grid',
    node_label: '表格',
    node_icon: 'ri-table-2',
    action_code: 'reloadData',
    label: '重载表格数据',
    sort_order: 20,
  }),
  action({
    node_type: 'grid',
    node_label: '表格',
    node_icon: 'ri-table-2',
    action_code: 'disabled',
    label: '禁用动作',
    enabled: false,
    sort_order: 30,
  }),
];

assert.deepEqual(getLowCodeNodeTypeDefinition('grid', actions), {
  kind: 'grid',
  label: '表格',
  icon: 'ri-table-2',
});
assert.deepEqual(
  getLowCodeNodeActionMethods('grid', { id: 'records', kind: 'grid' }, actions)
    .map((item) => item.method),
  ['loadData', 'reloadData'],
);
assert.equal(
  resolveLowCodeNodeAction(
    'form',
    'loadData',
    { id: 'edit', kind: 'form', formType: 'create' },
    actions,
  ),
  undefined,
);
assert.equal(
  resolveLowCodeNodeAction(
    'form',
    'loadData',
    { id: 'edit', kind: 'form', formType: 'edit' },
    actions,
  )?.action_code,
  'loadData',
);
assert.equal(
  resolveLowCodeNodeAction('grid', 'loadData', { id: 'records', kind: 'grid' }, actions)
    ?.source_code,
  'async function main() {}',
);
assert.match(
  getLowCodeNodeActionMethods('grid', { id: 'records', kind: 'grid' }, actions)[0]
    .createInsertText('records'),
  /node: "records"/,
);
assert.equal(
  getLowCodeNodeActionMethods('form', { id: 'edit', kind: 'form' }, [action({
    insert_text_template: 'await this.executeAction({\\n  node: {{nodeId}},\\n  method: "setData"\\n});',
  })])[0].createInsertText('edit'),
  'await this.executeAction({\n  node: "edit",\n  method: "setData"\n});',
  'Database action templates must insert real line breaks instead of literal \\n sequences.',
);
assert.equal(
  resolveLowCodeDataSourceNodeAction(
    [{ id: 'edit', kind: 'form', formType: 'edit' }],
    'edit',
    actions,
  )?.action.action_code,
  'loadData',
  'A form without sourceKey uses its node ID as the default data-source key.',
);

const migration = await readFile(migrationUrl, 'utf8');
function extractActionSource(anchor) {
  const anchorIndex = migration.indexOf(anchor);
  assert.notEqual(anchorIndex, -1, `Missing action seed anchor: ${anchor}`);
  const sourceStart = migration.indexOf('$action$', anchorIndex);
  const sourceEnd = migration.indexOf('$action$', sourceStart + '$action$'.length);
  assert.ok(sourceStart > anchorIndex && sourceEnd > sourceStart);
  return migration.slice(sourceStart + '$action$'.length, sourceEnd).trim();
}

const setDataMain = new Function(
  `${extractActionSource("'setData',")}\nreturn main;`,
)();
let form = { id: 'record-1', name: 'Before', tags: ['old'] };
const input = { name: 'After', tags: ['new'] };
const calls = [];
const result = await setDataMain.call({
  event: { payload: { nodeAction: { options: { data: input } } } },
  $node: {
    call: async (command, payload) => {
      calls.push({ command, payload });
      assert.equal(command, 'form.patch');
      form = { ...form, ...payload.values };
      return structuredClone(form);
    },
  },
});
input.tags.push('mutated');
assert.deepEqual(result, { id: 'record-1', name: 'After', tags: ['new'] });
assert.deepEqual(form.tags, ['new']);
assert.deepEqual(calls.map((item) => item.command), ['form.patch']);

await assert.rejects(
  setDataMain.call({
    event: { payload: { nodeAction: { options: { data: [] } } } },
    $node: { call: async () => assert.fail('Invalid data must not reach the host.') },
  }),
  /data 必须是对象/,
);

for (const removedPath of [
  'runtime/node-action/form-action.ts',
  'runtime/node-action/grid-action.ts',
  'runtime/node-action/button-group-action.ts',
  'runtime/grid-node-actions.ts',
  'runtime/node-action-runtime.ts',
]) {
  await assert.rejects(access(new URL(removedPath, frameworkRoot)), { code: 'ENOENT' });
}
assert.match(migration, /create table if not exists public\.lowcode_node_actions/);
assert.match(migration, /source_code text not null/);
assert.match(migration, /action_count <> 19 or node_type_count <> 5/);
const databaseSources = [...migration.matchAll(/\$action\$\s*([\s\S]*?)\s*\$action\$/g)]
  .map((match) => match[1]);
assert.equal(databaseSources.length, 13);
for (const source of databaseSources) {
  assert.equal(typeof new Function(`${source}\nreturn main;`)(), 'function');
}

console.log('Database node action registry regression test passed.');
