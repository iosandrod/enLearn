import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (relative) => readFile(new URL(relative, import.meta.url), 'utf8');
const [mode, template, extensions, designer, header] = await Promise.all([
  read('../../packages/tldraw-vue/src/presentation.ts'),
  read('../../packages/tldraw-vue/src/editor/templateStore.ts'),
  read('../../packages/tldraw-vue/src/editor/extensions/defaultExtensions.ts'),
  read('../../packages/tldraw-vue/src/TldrawVue.vue'),
  read('../components/PrintDesignerHeader.vue'),
]);

assert.match(mode, /DesignerMode\s*=\s*'print'\s*\|\s*'presentation'\s*\|\s*'bi'/);
assert.equal((template.match(/'bi'/g) ?? []).length, 2, 'workspace and metadata validation must accept BI mode');
assert.match(extensions, /echartsExtension/);
assert.match(designer, /ordinaryToolbarTools[\s\S]*echartsToolbarTools/);
assert.match(designer, /activeDesignerTab === 'echarts' && designerMode === 'bi'/);
assert.match(designer, /config\.designerMode === 'print' \|\| config\.designerMode === 'presentation' \|\| config\.designerMode === 'bi'/);
assert.match(header, /changeDesignerMode\('bi'\)/);
assert.match(header, /mode === 'print' \|\| mode === 'presentation' \|\| mode === 'bi'/);

console.log('BI designer mode regression test passed.');
