import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, controller, runtime, materialState] = await Promise.all([
  readFile(new URL('../../supabase/migrations/20260924010000_print_template_get_template_info_node_action.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/lowcode-framework/src/runtime/material-controller-registry.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/lowcode-framework/src/runtime/lowcode-page-script-runtime.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260923220000_print_template_material_state.sql', import.meta.url), 'utf8'),
]);

assert.match(migration, /'labelDesigner'[\s\S]*'getTemplateInfo'/);
assert.match(migration, /material\.getTemplateInfo/);
assert.match(migration, /on conflict \(node_type, action_code\) do update/);
assert.match(controller, /getTemplateInfo\?:/);
assert.match(runtime, /case 'material\.getTemplateInfo':[\s\S]*executeLowCodeMaterialRuntimeAction\(block\.id, 'getTemplateInfo'\)/);
assert.match(materialState, /getTemplateInfo: \(\) =>/);

console.log('Print template getTemplateInfo node action regression test passed.');
