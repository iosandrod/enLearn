import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

const [panel, editor, visualTypes, runtimeTypes, converters, renderer, migration] = await Promise.all([
  source('packages/lowcode-framework/src/visual-editor/components/right-attribute-panel/index.tsx'),
  source('packages/lowcode-framework/src/visual-editor/components/right-attribute-panel/components/hooks-editor/index.tsx'),
  source('packages/lowcode-framework/src/visual-editor/visual-editor.utils.ts'),
  source('packages/lowcode-framework/src/types/lowcode.ts'),
  source('packages/lowcode-framework/src/lowcode/visual-converters/index.ts'),
  source('packages/lowcode-framework/src/components/LowCodePageRenderer.vue'),
  source('supabase/migrations/20260824110000_lowcode_node_action_sources.sql'),
]);

assert.match(panel, /<ElTabPane label="钩子" name="hooks" lazy>/);
assert.match(panel, /<HooksEditor \/>/);
assert.match(editor, /component: 'lc-array-table'/);
assert.match(editor, /field: 'name'/);
assert.match(editor, /component: 'vxe-select'/);
assert.match(editor, /lowcode_node_action_form_method/);
assert.match(editor, /lowcode_node_action_search_form_method/);
assert.match(editor, /lowcode_node_action_grid_method/);
assert.match(editor, /lowcode_node_action_modal_method/);
assert.match(editor, /lowcode_node_action_drawer_method/);
assert.match(editor, /actionOptionSource/);
assert.match(editor, /resolveActionOptions/);
assert.match(editor, /nodeActionKindForVisualBlock/);
assert.match(editor, /field: 'script'/);
assert.match(editor, /currentBlock\.value\.hooks = normalizeHooks/);
assert.match(visualTypes, /hooks\?: LowCodeExecuteActionHook\[\]/);
assert.match(runtimeTypes, /export type LowCodeExecuteActionHook/);
assert.match(runtimeTypes, /hooks\?: LowCodeExecuteActionHook\[\]/);
assert.match(converters, /withVisualExecuteActionHooks/);
assert.match(converters, /hooks: cloneJson\(options\.block\.hooks \?\? \[\]\)/);
assert.match(renderer, /runExecuteActionHooks/);
assert.match(renderer, /runExecuteActionAfterHooks/);
assert.match(renderer, /executeScriptNodeAction\(readScriptOptionsArg\(args, 'executeAction'\), event\)/);
assert.match(migration, /'lowcode_node_action_form_method'/);
assert.match(migration, /'lowcode_node_action_search_form_method'/);
assert.match(migration, /'lowcode_node_action_grid_method'/);
assert.match(migration, /'lowcode_node_action_modal_method'/);
assert.match(migration, /'lowcode_node_action_drawer_method'/);
assert.match(migration, /'setData'/);
assert.match(migration, /'loadData'/);
assert.match(migration, /v_source_count <> 5/);
assert.match(migration, /nodeKind/);

console.log('executeAction hooks designer regression checks passed');
