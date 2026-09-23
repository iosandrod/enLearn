import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const [designer, panel, migration, resumeMigration, extensions] = await Promise.all([
  readFile(new URL('packages/tldraw-vue/src/TldrawVue.vue', root), 'utf8'),
  readFile(new URL('packages/tldraw-vue/src/components/LowCodeFormPanel.vue', root), 'utf8'),
  readFile(new URL('supabase/migrations/20260919140000_print_designer_property_forms.sql', root), 'utf8'),
  readFile(new URL('supabase/migrations/20260922120000_print_resume_property_forms.sql', root), 'utf8'),
  readFile(new URL('packages/tldraw-vue/src/editor/extensions/defaultExtensions.ts', root), 'utf8'),
]);

const formTypes = [
  'workspace',
  'vue-box',
  'vue-text',
  'vue-image',
  'vue-line',
  'vue-arrow',
  'vue-draw',
  'vue-qr',
  'vue-barcode',
  'vue-frame',
  'vue-table',
  'vue-material',
  'vue-material-section',
  'vue-resume',
  'vue-resume-section',
  'group',
  'generic',
];

assert.match(designer, /\{ id: 'properties', label: '属性'/, 'The left navigation must expose a property tab.');
assert.match(designer, /activeDesignerTab === 'properties'[\s\S]*?<LowCodeFormPanel/, 'The property tab must render the low-code form panel.');
assert.match(panel, /resource: 'lowcode_form_definitions'/, 'Property schemas must come from lowcode_form_definitions.');
assert.match(panel, /filters: \{ code: requiredPropertyFormCodes, enabled: true \}/, 'All enabled property schemas must be loaded in one request.');
assert.match(panel, /@update:model-value="handleModelUpdate"/, 'The low-code form must write changes back to the selected node.');
assert.doesNotMatch(panel, /'vue-table': 'Table node'/, 'The table property form must not expose an English node label.');
assert.match(panel, /'vue-table': '表格节点'/, 'The table property form must expose a Chinese node label.');
assert.match(extensions, /qrExtension/, 'The QR extension must be enabled by default.');
assert.match(extensions, /barcodeExtension/, 'The barcode extension must be enabled by default.');

for (const type of formTypes) {
  const source = type.startsWith('vue-resume') ? resumeMigration : migration;
  assert.match(
    source,
    new RegExp(`'print-designer\\.property\\.${type.replaceAll('-', '\\-')}'`),
    `Missing database form definition for ${type}.`,
  );
}

const allMigrations = `${migration}\n${resumeMigration}`;

assert.equal(
  (allMigrations.match(/"label":"基本属性"/g) ?? []).length,
  formTypes.length,
  'Every property form must include a basic-properties tab.',
);
assert.equal(
  (allMigrations.match(/"label":"高级属性"/g) ?? []).length,
  formTypes.length,
  'Every property form must include an advanced-properties tab.',
);
assert.match(allMigrations, /on conflict \(code\) do update set/, 'The migration must update existing definitions safely.');

console.log('print designer property form regression tests passed');
