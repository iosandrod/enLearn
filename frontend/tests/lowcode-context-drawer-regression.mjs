import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const bundledContext = await build({
  stdin: {
    contents: `
      export * from './packages/lowcode-framework/src/runtime/lowcode-context.ts';
      export {
        clearLowCodeScriptApis,
        registerLowCodeScriptApi,
      } from './packages/lowcode-framework/src/runtime/scripts.ts';
      export * from './packages/lowcode-framework/src/runtime/node-action-registry.ts';
    `,
    resolveDir: fileURLToPath(new URL('../..', import.meta.url)),
    sourcefile: 'lowcode-context-test-entry.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const bundledDrawer = await build({
  entryPoints: [fileURLToPath(new URL('runtime/global-drawer-core.ts', frameworkRoot))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const bundledDesignerContext = await build({
  entryPoints: [fileURLToPath(new URL('visual-editor/designer-script-context.ts', frameworkRoot))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const contextModule = await import(
  `data:text/javascript;base64,${Buffer.from(bundledContext.outputFiles[0].text).toString('base64')}`
);
const drawerModule = await import(
  `data:text/javascript;base64,${Buffer.from(bundledDrawer.outputFiles[0].text).toString('base64')}`
);
const designerContextModule = await import(
  `data:text/javascript;base64,${Buffer.from(bundledDesignerContext.outputFiles[0].text).toString('base64')}`
);
const {
  clearLowCodeScriptApis,
  createLowCodeContextCatalog,
  getLowCodeNodeActionMethods,
  registerLowCodeScriptApi,
  resolveLowCodeNodeAction,
} = contextModule;
const {
  closeAllGlobalDrawers,
  globalDrawerInstances,
  openGlobalDrawer,
} = drawerModule;
const { createDesignerScriptContextSource } = designerContextModule;

clearLowCodeScriptApis();
registerLowCodeScriptApi('records.allowed', {
  description: 'Allowed records operation',
  signature: 'this.$api.invoke("records.allowed")',
  insertText: 'await this.$api.invoke("records.allowed", {});',
  handler: () => true,
});
registerLowCodeScriptApi('records.hidden', () => true);

let nodeActionIndex = 0;
const nodeLabels = {
  form: ['表单', 'ri-survey-line'],
  searchForm: ['查询表单', 'ri-filter-3-line'],
  grid: ['表格', 'ri-table-2'],
  modal: ['弹框', 'ri-window-line'],
  drawer: ['抽屉', 'ri-layout-right-line'],
};
const createNodeAction = (nodeType, actionCode, sortOrder, overrides = {}) => ({
  id: `node-action-${++nodeActionIndex}`,
  node_type: nodeType,
  node_label: nodeLabels[nodeType][0],
  node_icon: nodeLabels[nodeType][1],
  action_code: actionCode,
  label: actionCode,
  description: '',
  source_code: 'async function main() {}',
  parameters: [],
  returns: '',
  insert_text_template:
    `await this.executeAction({ node: {{nodeId}}, method: "${actionCode}" });`,
  applicable_when: {},
  is_data_source_loader: false,
  enabled: true,
  is_system: true,
  sort_order: sortOrder,
  limits: {},
  ...overrides,
});
const formMethods = ['setData', 'validate', 'getData', 'refreshOptions', 'resetData'];
const gridMethods = [
  'loadData',
  'reloadData',
  'getChanges',
  'validate',
  'addRow',
  'deleteCurrentRow',
];
const nodeActions = [
  ...formMethods.flatMap((method, index) => [
    createNodeAction('form', method, (index + 1) * 10),
    createNodeAction('searchForm', method, (index + 1) * 10),
  ]),
  createNodeAction('form', 'loadData', 5, {
    applicable_when: { formType: ['edit'] },
    is_data_source_loader: true,
  }),
  ...gridMethods.map((method, index) => createNodeAction('grid', method, (index + 1) * 10, {
    is_data_source_loader: method === 'loadData',
  })),
  createNodeAction('modal', 'open', 10),
  createNodeAction('drawer', 'open', 10),
];

const page = {
  id: 'page-1',
  code: 'records',
  route: '/records',
  title: 'Records',
  node_actions: nodeActions,
  schema: {
    code: 'records',
    route: '/records',
    title: 'Records',
    dataSources: {
      records: { key: 'records' },
      profile: { key: 'profile' },
    },
    blocks: [
      {
        id: 'query',
        kind: 'searchForm',
        title: 'Query',
        targetSourceKey: 'records',
        schema: {
          fields: [{ field: 'keyword', label: 'Keyword', component: 'vxe-input' }],
          actions: [],
        },
      },
      {
        id: 'content',
        kind: 'tabs',
        tabs: [
          {
            key: 'main',
            label: 'Main',
            blocks: [
              {
                id: 'edit',
                kind: 'form',
                title: 'Edit',
                schema: {
                  fields: [{ field: 'name', label: 'Name', component: 'vxe-input' }],
                  actions: [],
                },
              },
              {
                id: 'records-grid',
                kind: 'grid',
                title: 'Records grid',
                sourceKey: 'records',
                tableType: 'main',
                schema: {
                  grid: { columns: [{ field: 'id', title: 'ID' }] },
                },
              },
              {
                id: 'audit-grid',
                kind: 'grid',
                title: 'Audit grid',
                sourceKey: 'auditRows',
                tableType: 'detail',
                schema: {
                  grid: {
                    columns: [
                      { field: 'changed_at', title: 'Changed at' },
                      { field: 'operator', title: 'Operator' },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    ],
    overlays: [
      {
        id: 'details-drawer',
        kind: 'drawer',
        title: 'Details drawer',
        blocks: [
          {
            id: 'details',
            kind: 'detail',
            title: 'Details',
            sourceKey: 'profile',
            fields: [{ field: 'email', label: 'Email' }],
          },
        ],
      },
    ],
  },
};

const catalog = createLowCodeContextCatalog({
  page,
  data: {
    records: [{ id: 1, name: 'Ada' }],
    profile: { email: 'ada@example.com' },
  },
  apiNames: ['records.allowed'],
  capabilities: ['api.invoke', 'form.patch', 'message.info'],
});

assert.ok(catalog.fields.some((item) =>
  item.insertText === 'this.data["records"]?.[0]?.["name"]'),
);
assert.ok(catalog.fields.some((item) =>
  item.insertText === 'this.data["profile"]?.["email"]'),
);
assert.ok(catalog.fields.some((item) =>
  item.insertText === 'this.forms["edit"]?.["name"]'),
);
assert.ok(catalog.fields.some((item) =>
  item.insertText === 'this.searches["records"]?.["keyword"]'),
);
assert.ok(catalog.fields.some((item) =>
  item.insertText === 'this.grids["records-grid"]?.currentRow?.["id"]'),
);
assert.deepEqual(
  catalog.fieldTree.map((table) => ({
    label: table.label,
    role: table.role,
    fields: table.children.map((field) => field.field),
  })),
  [
    { label: 'Records grid', role: '主表', fields: ['id', 'name'] },
    { label: 'Edit', role: '主表', fields: ['name'] },
    { label: 'Audit grid', role: '明细 Grid', fields: ['changed_at', 'operator'] },
    { label: 'Query', role: '查询表单', fields: ['keyword'] },
    { label: 'profile', role: '数据源', fields: ['email'] },
  ],
  'Field context must be organized as master tables and other grids with deduplicated fields.',
);
assert.equal(
  catalog.fieldTree[0].children.find((field) => field.field === 'id')?.entry?.insertText,
  'this.grids["records-grid"]?.currentRow?.["id"]',
  'A main Grid field must insert the Grid current-row expression.',
);
assert.deepEqual(catalog.apis.map((item) => item.label), ['records.allowed']);
assert.deepEqual(
  [...new Set(catalog.functions.map((item) => item.badge))]
    .filter((badge) => badge !== 'readonly')
    .sort(),
  ['form.patch', 'message.info'],
);
assert.ok(catalog.functions.some((item) => item.label === '读取表单'));
assert.equal(
  new Set(catalog.functions.map((item) => item.id)).size,
  catalog.functions.length,
  'Function examples must have stable unique keys even when they share a capability.',
);
assert.deepEqual(
  createLowCodeContextCatalog({ page, capabilities: [] })
    .functions.map((item) => item.label).sort(),
  ['读取数据源', '读取查询条件', '读取表单', '读取表格状态'].sort(),
  'Snapshot getters remain available when the page exposes no mutation capability.',
);
assert.deepEqual(
  createLowCodeContextCatalog({ page })
    .functions.map((item) => item.label).sort(),
  ['读取数据源', '读取查询条件', '读取表单', '读取表格状态'].sort(),
  'Missing capability policy must not advertise mutating functions.',
);
const listBuiltinFunctionCatalog = createLowCodeContextCatalog({
  page: { ...page, page_type: 'list' },
  capabilities: ['pageFunction.execute'],
});
assert.deepEqual(
  listBuiltinFunctionCatalog.functions
    .filter((item) => item.group === '内置页面函数')
    .map((item) => item.label),
  ['新增跳转到编辑页', '编辑跳转到编辑页', '删除', '审核', '反审', '关闭', '打开', '刷新', '打印', '退出'],
);
assert.equal(catalog.nodes[1].children[0].blockId, 'edit');
assert.equal(catalog.nodes[2].children[0].blockId, 'details');
assert.deepEqual(
  catalog.nodes[1].children[0].methods.map((method) => method.method),
  ['setData', 'validate', 'getData', 'refreshOptions', 'resetData'],
);
assert.deepEqual(
  catalog.nodes[1].children[1].methods.map((method) => method.method),
  ['loadData', 'reloadData', 'getChanges', 'validate', 'addRow', 'deleteCurrentRow'],
);
assert.deepEqual(catalog.nodes[2].methods.map((method) => method.method), ['open']);
assert.match(
  catalog.nodes[1].children[0].methods[0].insertText,
  /node: "edit"[\s\S]*?method: "setData"/,
);
assert.equal(
  resolveLowCodeNodeAction('grid', 'loadData', page.schema.blocks[1].tabs[0].blocks[1], nodeActions)
    ?.source_code,
  'async function main() {}',
);
assert.equal(
  resolveLowCodeNodeAction('grid', 'deleteCurrentRow', undefined, nodeActions)?.action_code,
  'deleteCurrentRow',
);
assert.equal(resolveLowCodeNodeAction('grid', 'setData', undefined, nodeActions), undefined);
assert.deepEqual(getLowCodeNodeActionMethods('text', undefined, nodeActions), []);

const duplicateNodeCatalog = createLowCodeContextCatalog({
  page: {
    ...page,
    schema: {
      ...page.schema,
      blocks: [
        { id: 'duplicate', kind: 'buttonGroup', actions: [] },
        { id: 'duplicate', kind: 'buttonGroup', actions: [] },
      ],
      overlays: [],
    },
  },
});
assert.equal(
  new Set(duplicateNodeCatalog.nodes.map((node) => node.id)).size,
  duplicateNodeCatalog.nodes.length,
  'Tree rendering keys must stay unique when page block IDs are duplicated.',
);

assert.equal(
  createLowCodeContextCatalog({ page }).apis.length,
  0,
  'Registered APIs must remain hidden until the page policy explicitly allows them.',
);
assert.equal(
  createLowCodeContextCatalog({
    page,
    apiNames: ['records.allowed'],
    capabilities: ['message.info'],
  }).apis.length,
  0,
  'API entries must remain hidden when api.invoke is not an allowed capability.',
);

const designerContext = createDesignerScriptContextSource({
  pageRecord: {
    id: 'saved-page',
    code: 'live-code',
    route: '/live-route',
    title: 'Live title',
    node_actions: nodeActions,
    schema: {
      code: 'saved-code',
      route: '/saved-route',
      title: 'Saved title',
      dataSources: { savedSource: { key: 'savedSource' } },
      scriptPolicy: {
        apiNames: ['records.allowed'],
        capabilities: ['api.invoke', 'message.info'],
      },
      blocks: [{ id: 'stale-block', kind: 'buttonGroup', actions: [] }],
      overlays: [],
    },
  },
  model: {
    pages: {},
    models: [],
    actions: {},
  },
  currentPage: {
    path: '/',
    title: 'Visual title',
    config: { bgColor: '', bgImage: '', keepAlive: false },
    blocks: [],
    overlays: [],
  },
  converted: {
    dataSources: { liveSource: { key: 'liveSource' } },
    blocks: [{ id: 'live-block', kind: 'buttonGroup', actions: [] }],
    overlays: [],
  },
});
assert.equal(designerContext.page.code, 'live-code');
assert.equal(designerContext.page.route, '/live-route');
assert.equal(designerContext.page.node_actions.length, 19);
assert.deepEqual(designerContext.apiNames, ['records.allowed']);
assert.deepEqual(designerContext.capabilities, ['api.invoke', 'message.info']);
assert.deepEqual(Object.keys(designerContext.page.schema.dataSources).sort(), [
  'liveSource',
  'savedSource',
]);
assert.equal(designerContext.page.schema.blocks[0].id, 'live-block');

const blankDesignerContext = createDesignerScriptContextSource({
  model: { pages: {}, models: [], actions: {} },
  currentPage: {
    path: '/',
    title: 'Blank',
    config: { bgColor: '', bgImage: '', keepAlive: false },
    blocks: [],
    overlays: [],
  },
  converted: { dataSources: {}, blocks: [], overlays: [] },
});
assert.deepEqual(blankDesignerContext.apiNames, []);
assert.deepEqual(blankDesignerContext.capabilities, []);

const first = openGlobalDrawer({ id: 'context', body: () => null });
const second = openGlobalDrawer({ id: 'context', body: () => null });
assert.equal(globalDrawerInstances.length, 2);
assert.notEqual(first.id, second.id);
await first.close('test-close');
assert.equal((await first.closed).action, 'test-close');
await closeAllGlobalDrawers('cleanup');
assert.equal(globalDrawerInstances.length, 0);

const [
  monacoSource,
  contextDrawerSource,
  drawerSource,
  nodeRegistrySource,
  nodeActionMigrationSource,
  hostSource,
  dialogHostSource,
  designerSource,
  simulatorSource,
  appSource,
] = await Promise.all([
  readLowCodeMaterialSource('form', 'lc-monaco-editor'),
  readFile(new URL('runtime/lowcode-context-drawer.tsx', frameworkRoot), 'utf8'),
  readFile(new URL('components/LowCodeContextDrawerPanel.vue', frameworkRoot), 'utf8'),
  readFile(new URL('runtime/node-action-registry.ts', frameworkRoot), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260826220000_database_node_actions.sql', import.meta.url), 'utf8'),
  readFile(new URL('components/GlobalDrawerHost.tsx', frameworkRoot), 'utf8'),
  readFile(new URL('components/GlobalDialogHost.tsx', frameworkRoot), 'utf8'),
  readFile(new URL('components/LowCodeVisualDesigner.vue', frameworkRoot), 'utf8'),
  readFile(new URL('visual-editor/components/simulator-editor/simulator-editor.vue', frameworkRoot), 'utf8'),
  readFile(new URL('../app.vue', import.meta.url), 'utf8'),
]);

assert.match(
  monacoSource,
  /executeEdits\('lowcode-context-drawer'[^]*?setSelection\(new Monaco\.Selection[^]*?pushUndoStop\(\)/,
  'Context entries must replace the active Monaco selection and move the cursor.',
);
assert.match(
  contextDrawerSource,
  /cloneLowCodeContextSource\(options\.source\)[^]*?createLowCodeContextCatalog\(source\)/,
  'Generic drawer callers must be isolated from later mutations to their context source.',
);
assert.match(
  monacoSource,
  /onInsert: isReadonly\.value \|\| isDisabled\.value[^]*?\? undefined/,
  'Readonly Monaco dialogs must expose context without permitting code insertion.',
);
assert.match(
  monacoSource,
  /inject\(lowCodeScriptContextProviderKey, null\)[^]*?scriptContextProvider\?\.getSource\(\)/,
  'Reusable Monaco fields must fall back to the current page context provider.',
);
assert.match(
  monacoSource,
  /lc-monaco-editor__context-trigger[^]*?@click="toggleContextDrawer"[^]*?function toggleContextDrawer\(\)[^]*?closeContextDrawer\('toggle'\)[^]*?openContextDrawer\(\)/,
  'Monaco must expose a visible control that closes and reopens the context drawer.',
);
assert.match(
  drawerSource,
  /搜索表、字段、API、函数或节点[^]*?<vxe-table[^]*?:tree-config="fieldTreeConfig"[^]*?表 \/ 字段[^]*?row\.node\.methods[^]*?row\.method\.method[^]*?methodSignature[^]*?insertNodeMethod/,
  'The reusable drawer must list and insert every method for each node.',
);
assert.match(
  nodeRegistrySource,
  /getLowCodeNodeActionMethods[^]*?actions[^]*?action\.node_type === kind[^]*?action\.action_code/,
  'The context registry must derive node methods from the API action collection.',
);
assert.match(
  nodeActionMigrationSource,
  /create table if not exists public\.lowcode_node_actions[^]*?source_code text not null/,
  'The database table must own node metadata and executable source.',
);
assert.match(
  nodeActionMigrationSource,
  /action_count <> 19 or node_type_count <> 5/,
  'The migration must validate the complete built-in database action catalog.',
);
assert.match(
  hostSource,
  /registerGlobalDrawerHost\(\)[^]*?addEventListener\('keydown', handleEscape, true\)[^]*?resize: true[^]*?zIndex: 10000/,
  'The global drawer host must coordinate nesting, Escape handling, and resizing.',
);
assert.match(
  dialogHostSource,
  /handleEscape[^]*?globalDrawerInstances\.length[^]*?closeGlobalDialog\(instance\.id[^]*?escClosable: false[^]*?onClose: \(\) => \{[^]*?if \(globalDrawerInstances\.length\) return;/,
  'Escape and close events handled by a drawer must not also close its parent script dialog.',
);
assert.match(
  designerSource,
  /:page-record="designerPageRecord"[^]*?const designerPageRecord = computed<LowCodePageRecord>[^]*?code: form\.value\.code[^]*?\.\.\.\(currentSchema \?\? \{\}\)/s,
  'The visual designer must pass live page metadata while retaining the saved script policy.',
);
assert.match(
  simulatorSource,
  /createDesignerScriptContextSource\(\{[^]*?pageRecord: props\.pageRecord[^]*?model[^]*?currentPage: page[^]*?converted/,
  'The simulator must merge the live converted page with its current page record.',
);
assert.match(
  appSource,
  /<GlobalDrawerHost\s*\/>/,
  'A root drawer host must support openGlobalDrawer outside global dialogs.',
);

clearLowCodeScriptApis();
console.log('Low-code context drawer regression test passed.');
