import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { build } from 'esbuild';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(testDirectory, '../src/runtime/mobile-form.ts');
const result = await build({
  entryPoints: [sourcePath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
});
const moduleSource = result.outputFiles[0].text;
const mobileForm = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`
);

const {
  buildMobileFormRows,
  createArrayFormRow,
  findSelectedFormOption,
  flattenFormOptions,
  formControlKind,
  normalizeArrayFormColumns,
  normalizeArrayFormRows,
  readInputEventValue,
  readStoredOptionValue,
  resolveFormOptions,
  resolveResponsiveFormColumns,
  serializeArrayFormRows,
  validateMobileFormValues,
} = mobileForm;

assert.equal(readInputEventValue({ value: 'native' }), 'native');
assert.equal(
  readInputEventValue({ target: { value: 'web' } }),
  'web',
  'Web input events should preserve the DOM target value',
);

assert.equal(
  formControlKind('lc-checkbox'),
  'boolean',
  'a single checkbox should keep a boolean form value',
);

const departmentField = {
  field: 'department',
  label: 'Department',
  component: 'vxe-select',
  optionsSourceKey: 'departments',
  optionProps: { label: 'name', value: 'id' },
};
assert.deepEqual(
  resolveFormOptions(departmentField, {
    departments: { rows: [{ id: 10, name: 'Finance' }] },
  }).map(({ label, value }) => ({ label, value })),
  [{ label: 'Finance', value: 10 }],
  'row-wrapped data sources and optionProps should be normalized',
);

const treeField = {
  field: 'category',
  label: 'Category',
  component: 'lc-cascader',
  optionProps: { label: 'title', value: 'code', children: 'nodes' },
  options: [{
    title: 'Expense',
    code: 'expense',
    nodes: [{ title: 'Travel', code: 'travel' }],
  }],
};
const treeOptions = flattenFormOptions(resolveFormOptions(treeField, {}), true);
assert.deepEqual(
  treeOptions.map(({ pathLabel, value }) => ({ pathLabel, value })),
  [{ pathLabel: 'Expense / Travel', value: 'travel' }],
  'cascader options should expose leaf paths',
);

const rawValue = { id: 7, name: 'Ada' };
const rawField = {
  field: 'owner',
  label: 'Owner',
  component: 'lc-option-select',
  options: [{ label: 'Ada', value: 7, rawValue }],
};
const rawOptions = flattenFormOptions(resolveFormOptions(rawField, {}));
assert.deepEqual(readStoredOptionValue(rawField, rawOptions[0]), rawValue);
assert.equal(findSelectedFormOption(rawField, rawOptions, { id: 7, name: 'Ada' })?.label, 'Ada');

const layoutFields = [
  { field: 'a', label: 'A', component: 'vxe-input' },
  { field: 'b', label: 'B', component: 'vxe-input' },
  { field: 'notes', label: 'Notes', component: 'vxe-textarea' },
];
assert.deepEqual(
  buildMobileFormRows(layoutFields, 2).map((row) => row.cells.map((cell) => cell.span)),
  [[1, 1], [2]],
  'wide fields should occupy a full form row',
);
assert.equal(resolveResponsiveFormColumns(3, 390), 1);
assert.equal(resolveResponsiveFormColumns(3, 720), 2);
assert.equal(resolveResponsiveFormColumns(3, 1100), 3);

const arrayField = {
  field: 'items',
  label: 'Items',
  component: 'lc-array-table',
  props: {
    valueMode: 'primitive',
    valueField: 'code',
    defaultRow: { code: 'new' },
  },
};
assert.equal(normalizeArrayFormColumns(arrayField)[0].field, 'code');
assert.deepEqual(normalizeArrayFormRows(arrayField, ['a', 'b']), [{ code: 'a' }, { code: 'b' }]);
assert.deepEqual(serializeArrayFormRows(arrayField, [{ code: 'c' }]), ['c']);
assert.deepEqual(createArrayFormRow(arrayField), { code: 'new' });

const validationSchema = {
  fields: [
    {
      field: 'name',
      label: 'Name',
      component: 'vxe-input',
      rules: [
        { required: true, message: 'required' },
        { min: 4, message: 'too short' },
      ],
    },
    {
      field: 'amount',
      label: 'Amount',
      component: 'lc-number-input',
      props: { min: 10, max: 20 },
    },
    {
      field: 'metadata',
      label: 'Metadata',
      component: 'lc-json-editor',
    },
    {
      field: 'requester',
      label: 'Requester',
      component: 'lc-sub-form',
      props: {
        schema: {
          fields: [{
            field: 'email',
            label: 'Email',
            component: 'vxe-input',
            rules: [{ required: true, message: 'required' }],
          }],
          actions: [],
        },
      },
    },
  ],
  actions: [],
};
assert.deepEqual(validateMobileFormValues(validationSchema, {
  name: 'abc',
  amount: 9,
  metadata: '{bad json}',
  requester: {},
}), {
  name: 'too short',
  amount: '不能小于 10',
  metadata: 'JSON 格式不正确',
  requester: 'Email：required',
});
assert.deepEqual(validateMobileFormValues(validationSchema, {
  name: 'valid',
  amount: 15,
  metadata: { enabled: true },
  requester: { email: 'a@example.com' },
}), {});

assert.deepEqual(validateMobileFormValues({
  fields: [{
    field: 'amount',
    label: 'Amount',
    component: 'lc-number-input',
    props: { min: 10 },
    rules: [{ min: 2, message: 'two digits' }],
  }],
  actions: [],
}, { amount: 9 }), { amount: 'two digits' }, 'rule.min should retain VXE length semantics');

const componentSource = await readFile(
  path.resolve(testDirectory, '../src/runtime/materials/mobile-form.vue'),
  'utf8',
);
assert.match(
  componentSource,
  /@click="handleAction\(action\)"/,
  'form actions must retain their regular click path',
);
assert.doesNotMatch(
  componentSource,
  /@touchend="handleAction/,
  'form actions should rely on one click path after the Web View bridge is installed',
);

const webViewSource = await readFile(
  path.resolve(testDirectory, '../src/web/hippy-web-view.ts'),
  'utf8',
);
assert.match(
  webViewSource,
  /this\.dom\.addEventListener\('click', this\.handleNativeClick\)/,
  'the Web View adapter must bridge desktop mouse clicks',
);
assert.match(
  webViewSource,
  /Date\.now\(\) - this\.lastNativeTouchEnd < 500/,
  'the Web View adapter must suppress the synthetic click after a touch tap',
);

const webEntrySource = await readFile(
  path.resolve(testDirectory, '../src/main-web.ts'),
  'utf8',
);
assert.match(
  webEntrySource,
  /View: DesktopCompatibleView/,
  'the desktop-compatible View must be registered with Hippy Web Renderer',
);

console.log('mobile-form regression checks passed');
