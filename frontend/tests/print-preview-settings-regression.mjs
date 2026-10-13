import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [designer, panel, canvas, templateStore, topMenu, localConfig, renderer, materialGrid, prefetch, migration] = await Promise.all([
  readFile(new URL('../../packages/tldraw-vue/src/TldrawVue.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/components/VuePreviewSettingsPanel.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/components/VueCanvas.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/editor/templateStore.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/components/VueTopLeftMenu.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/print/localConfig.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/print/renderer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/print/materialGrid.ts', import.meta.url), 'utf8'),
  readFile(new URL('../utils/printDesignerLowCode.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20261012160000_print_preview_settings_form.sql', import.meta.url), 'utf8'),
]);

assert.match(designer, /id: 'previewSettings', label: '预览设置'/);
assert.match(designer, /<VuePreviewSettingsPanel/);
assert.match(panel, /PREVIEW_FORM_CODE = 'print-designer\.preview-settings'/);
assert.match(panel, /isVueMaterialShape/);
assert.match(panel, /getMaterialDataSourceFieldOptions/);
assert.match(panel, /applyWorkspaceTemplateConfig\?\.\(\{ previewSettings:/);
assert.match(canvas, /previewSettings: previewSettings\.value/);
assert.match(canvas, /hasOwnProperty\.call\(config, 'previewSettings'\)/);
assert.match(templateStore, /previewSettings\?: PrintPreviewSettings/);
assert.match(topMenu, /createLocalPrintJobConfig\(props\.editor, props\.getWorkspaceTemplateConfig\?\.\(\)/);
assert.match(localConfig, /previewSettings: workspace\?\.previewSettings/);
assert.match(renderer, /config\.previewSettings\?\.mode === 'data'/);
assert.match(materialGrid, /selectedMaterialId/);
assert.match(prefetch, /print-designer\.preview-settings/);
assert.match(migration, /"visibleWhen": \{"field": "mode", "equals": "component"\}/);
assert.match(migration, /"visibleWhen": \{"field": "mode", "equals": "data"\}/);

console.log('Print preview settings panel, persistence and pagination integration checks passed.');
