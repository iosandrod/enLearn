import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const readFrameworkSource = (path) => readFile(new URL(path, frameworkRoot), 'utf8');

const [
  runtimeToVisualSource,
  formTypesSource,
  databaseOnlyMigrationSource,
  applyMigrationSource,
] = await Promise.all([
  readFrameworkSource('lowcode/visual-converters/index.ts'),
  readFrameworkSource('types/lowcode.ts'),
  readFile(
    new URL('../../supabase/migrations/20260819100000_database_only_material_property_forms.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../../api/scripts/apply-form-type-property.ts', import.meta.url),
    'utf8',
  ),
]);

for (const [componentKey, expectedDefault] of [['lowcode-edit-form', 'edit']]) {
  const match = databaseOnlyMigrationSource.match(
    new RegExp(`\\('material-prop\\.${componentKey}'[^$]*\\$schema\\$(\\{.*?\\})\\$schema\\$::jsonb`),
  );
  assert.ok(match, `missing database schema for ${componentKey}`);
  const definition = JSON.parse(match[1]);
  const formType = definition.fields.find((field) => field.field === 'formType');
  assert.equal(formType?.component, 'lc-option-select');
  assert.equal(formType?.defaultValue, expectedDefault);
  assert.deepEqual(formType.options.map((option) => option.rawValue), ['edit', 'search', 'default']);
}
assert.match(runtimeToVisualSource, /formType:[\s\S]*?block\.formType === 'edit'[\s\S]*?block\.formType === 'search'[\s\S]*?block\.formType === 'default'/);
assert.match(formTypesSource, /formType\?: 'edit' \| 'search' \| 'default'/);
assert.match(databaseOnlyMigrationSource, /'material-prop\.form'/);
assert.match(databaseOnlyMigrationSource, /'material-prop\.lowcode-edit-form'/);
assert.match(databaseOnlyMigrationSource, /"field":"formType"/);
assert.match(applyMigrationSource, /20260811130000_form_type_property\.sql/);
assert.match(applyMigrationSource, /20260817090000_repair_form_property_tabs\.sql/);
assert.match(applyMigrationSource, /for \(const migrationPath of migrationPaths\)/);

const bundledConverter = await build({
  entryPoints: [
    fileURLToPath(
      new URL('lowcode/visual-converters/lowcode-edit-form/index.ts', frameworkRoot),
    ),
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const converterModule = await import(
  `data:text/javascript;base64,${Buffer.from(bundledConverter.outputFiles[0].text).toString('base64')}`
);
const converter = converterModule.default;

function convertForm(formType) {
  const dataSources = {};
  const block = converter.toRuntimeBlock({
    _vid: 'form-type-test',
    componentKey: 'form',
    type: 'form',
    label: 'Form',
    moduleName: 'businessComponents',
    focus: false,
    styles: {},
    layout: {},
    hasResize: false,
    draggable: true,
    showStyleConfig: true,
    animations: [],
    actions: [],
    events: [],
    model: {},
    props: {
      blockId: 'order-form',
      formType,
      title: 'Order',
      fields: [{ field: 'doc_no', label: '订单号', component: 'vxe-input' }],
      formActions: [],
    },
  }, {
    dataSources,
    convertBlocks: () => [],
    convertOverlays: () => [],
  });

  return block;
}

for (const formType of ['edit', 'search', 'default']) {
  assert.equal(convertForm(formType).formType, formType);
}
assert.equal(convertForm('unsupported').formType, 'edit');
assert.equal(convertForm(undefined).formType, 'edit');

console.log('Form type property regression test passed.');
