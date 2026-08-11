import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const readFrameworkSource = (path) => readFile(new URL(path, frameworkRoot), 'utf8');

const [
  formPropsSource,
  materialPropsSource,
  runtimeToVisualSource,
  formTypesSource,
  migrationSource,
] = await Promise.all([
  readFrameworkSource('packages/container-component/form/compProps.ts'),
  readFrameworkSource('visual-editor/material-prop-forms/materials/page-blocks.ts'),
  readFrameworkSource('lowcode/visual-converters/index.ts'),
  readFrameworkSource('types/lowcode.ts'),
  readFile(
    new URL('../../supabase/migrations/20260811130000_form_type_property.sql', import.meta.url),
    'utf8',
  ),
]);

assert.match(formPropsSource, /formType:\s*createEditorSelectProp\(/);
assert.match(formPropsSource, /label:\s*'表单类型'/);
for (const value of ['edit', 'search', 'default']) {
  assert.match(
    formPropsSource,
    new RegExp(`value: '${value}'`),
    `The form type selector must include ${value}.`,
  );
}

assert.match(materialPropsSource, /field:\s*'formType'[\s\S]*?component:\s*'lc-option-select'/);
assert.match(materialPropsSource, /field:\s*'formType'[\s\S]*?defaultValue:\s*'default'/);
assert.match(runtimeToVisualSource, /formType:[\s\S]*?block\.formType === 'edit'[\s\S]*?block\.formType === 'search'[\s\S]*?block\.formType === 'default'/);
assert.match(formTypesSource, /formType\?: 'edit' \| 'search' \| 'default'/);
assert.match(migrationSource, /where code = 'material-prop\.form'/);
assert.match(migrationSource, /"field":"formType"/);

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
assert.equal(convertForm('unsupported').formType, 'default');

console.log('Form type property regression test passed.');
