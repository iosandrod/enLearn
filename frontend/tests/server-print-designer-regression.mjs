import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const designer = readFileSync(new URL('../pages/dashboard/advanced/print-designer.vue', import.meta.url), 'utf8');
const topMenu = readFileSync(new URL('../../packages/tldraw-vue/src/components/VueTopLeftMenu.vue', import.meta.url), 'utf8');
const tldraw = readFileSync(new URL('../../packages/tldraw-vue/src/TldrawVue.vue', import.meta.url), 'utf8');
const exportComposable = readFileSync(new URL('../composables/usePrintDesignerExport.ts', import.meta.url), 'utf8');

assert.match(designer, /id: 'print\.preview'[\s\S]*?runServerPreview/);
assert.match(designer, /id: 'print\.print'[\s\S]*?runServerExport/);
assert.match(designer, /printDesignerExport\.createInput/);
assert.match(designer, /printDesignerExport\.exportFile/);
assert.match(topMenu, /props\.runCommand\('print\.preview'\)/);
assert.match(topMenu, /props\.runCommand\('print\.print'\)/);
assert.match(tldraw, /:run-command="runCommand"/);
assert.match(exportComposable, /editor\.getPages\(\)/);
assert.match(exportComposable, /getSvgString/);
assert.match(exportComposable, /data-print-page/);

console.log('server print designer integration regression passed');
