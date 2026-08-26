import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

const [panel, editor, visualTypes, runtimeTypes, converters, nodeActionRuntime, migration] = await Promise.all([
  source('packages/lowcode-framework/src/visual-editor/components/right-attribute-panel/index.tsx'),
  source('packages/lowcode-framework/src/visual-editor/components/right-attribute-panel/components/hooks-editor/index.tsx'),
  source('packages/lowcode-framework/src/visual-editor/visual-editor.utils.ts'),
  source('packages/lowcode-framework/src/types/lowcode.ts'),
  source('packages/lowcode-framework/src/lowcode/visual-converters/index.ts'),
  source('packages/lowcode-framework/src/runtime/lowcode-page-script-runtime.ts'),
  source('supabase/migrations/20260826220000_database_node_actions.sql'),
]);

assert.match(panel, /<ElTabPane label="钩子" name="hooks" lazy>/);
assert.match(panel, /<HooksEditor \/>/);
assert.match(editor, /component: 'lc-array-table'/);
assert.match(editor, /field: 'name'/);
assert.match(editor, /component: 'vxe-select'/);
assert.match(editor, /host\.getServiceApi\(\)\.invoke<unknown\[]>/);
assert.match(editor, /resource: 'lowcode_node_actions'/);
assert.match(editor, /filters: \{ enabled: true \}/);
assert.match(editor, /resolveActionOptions/);
assert.match(editor, /nodeActionKindForVisualBlock/);
assert.match(editor, /option\.node_type/);
assert.match(editor, /option\.action_code/);
assert.match(editor, /field: 'script'/);
assert.match(editor, /currentBlock\.value\.hooks = normalizeHooks/);
assert.match(visualTypes, /hooks\?: LowCodeExecuteActionHook\[\]/);
assert.match(runtimeTypes, /export type LowCodeExecuteActionHook/);
assert.match(runtimeTypes, /hooks\?: LowCodeExecuteActionHook\[\]/);
assert.match(converters, /withVisualExecuteActionHooks/);
assert.match(converters, /hooks: cloneJson\(options\.block\.hooks \?\? \[\]\)/);
assert.match(nodeActionRuntime, /props\.page\.node_actions/);
assert.match(nodeActionRuntime, /script: action\.source_code/);
assert.match(nodeActionRuntime, /request\.name === 'node\.runtime'/);
assert.match(migration, /delete from public\.system_option_items/);
assert.match(migration, /delete from public\.system_option_sources/);
assert.match(migration, /create table if not exists public\.lowcode_node_actions/);
assert.match(migration, /'setData'/);
assert.match(migration, /'loadData'/);
assert.match(migration, /action_count <> 19 or node_type_count <> 5/);

console.log('executeAction hooks designer regression checks passed');
