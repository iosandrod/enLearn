import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const [topMenu, designer, migration] = await Promise.all([
  readFile(new URL('packages/tldraw-vue/src/components/VueTopLeftMenu.vue', root), 'utf8'),
  readFile(new URL('packages/tldraw-vue/src/TldrawVue.vue', root), 'utf8'),
  readFile(new URL('supabase/migrations/20260923150000_print_preview_node_action.sql', root), 'utf8'),
]);

assert.match(topMenu, /defineExpose\(\{[\s\S]*?previewPrint,[\s\S]*?printCurrentPage,[\s\S]*?\}\)/);
assert.match(designer, /topMenuRef[\s\S]*?previewPrint\(\): Promise<void>/);
assert.match(designer, /defineExpose\(\{[\s\S]*?previewPrint,[\s\S]*?printCurrentPage,[\s\S]*?\}\)/);
assert.match(migration, /label-preview/);
assert.match(migration, /method: 'preview'/);
assert.match(migration, /this\.executeAction/);
assert.match(migration, /instance\?\.previewPrint/);
assert.match(migration, /lowcode:print\.preview/);

console.log('print preview node action regression test passed.');
