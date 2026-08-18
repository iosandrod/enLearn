import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const readFrameworkSource = (path) => readFile(new URL(path, frameworkRoot), 'utf8');

const [
  formPropsSource,
  editFormPropsSource,
  materialPropsSource,
  runtimeToVisualSource,
  formTypesSource,
  migrationSource,
  applyMigrationSource,
] = await Promise.all([
  readFrameworkSource('packages/container-component/form/compProps.ts'),
  readFrameworkSource('packages/business-component/lowcode-edit-form/index.tsx'),
  readFrameworkSource('visual-editor/material-prop-forms/materials/page-blocks.ts'),
  readFrameworkSource('lowcode/visual-converters/index.ts'),
  readFrameworkSource('types/lowcode.ts'),
  readFile(
    new URL('../../supabase/migrations/20260811130000_form_type_property.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../../api/scripts/apply-form-type-property.ts', import.meta.url),
    'utf8',
  ),
]);

assert.match(formPropsSource, /formType:\s*createEditorSelectProp\(/);
assert.match(formPropsSource, /label:\s*'表单类型'/);
assert.match(formPropsSource, /formType:[\s\S]*?defaultValue:\s*'default'/);
assert.match(editFormPropsSource, /formType:\s*createEditorSelectProp\(/);
assert.match(editFormPropsSource, /formType:[\s\S]*?defaultValue:\s*'edit'/);
for (const value of ['edit', 'search', 'default']) {
  assert.match(
    formPropsSource,
    new RegExp(`value: '${value}'`),
    `The form type selector must include ${value}.`,
  );
}

assert.match(materialPropsSource, /field:\s*'formType'[\s\S]*?component:\s*'lc-option-select'/);
assert.match(materialPropsSource, /componentKey:\s*'lowcode-edit-form'[\s\S]*?field:\s*'formType'[\s\S]*?defaultValue:\s*'edit'/);
assert.match(runtimeToVisualSource, /formType:[\s\S]*?block\.formType === 'edit'[\s\S]*?block\.formType === 'search'[\s\S]*?block\.formType === 'default'/);
assert.match(formTypesSource, /formType\?: 'edit' \| 'search' \| 'default'/);
assert.match(migrationSource, /where code = 'material-prop\.form'/);
assert.match(migrationSource, /where code = 'material-prop\.lowcode-edit-form'/);
assert.match(migrationSource, /"field":"formType"/);
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
