import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

const [baseWidgets, visualAdapter, materialRegistry, converter, inputMaterial] = await Promise.all([
  source('packages/lowcode-framework/src/packages/base-widgets/index.ts'),
  source('packages/lowcode-framework/src/visual-editor/form-material-visual-components.tsx'),
  source('packages/lowcode-framework/src/lowcode/form-materials/index.ts'),
  source('packages/lowcode-framework/src/lowcode/visual-converters/helpers.ts'),
  source('packages/lowcode-framework/src/lowcode/form-materials/vxe-input/index.ts'),
]);
const designerSource = await source(
  'packages/lowcode-framework/src/visual-editor/components/form-designer/form-designer.service.tsx',
);

assert.match(baseWidgets, /formMaterialVisualComponents/);
assert.match(baseWidgets, /Object\.assign\(components, formMaterialVisualComponents\)/);
assert.match(visualAdapter, /LowCodeFormField/);
for (const componentKey of [
  'input',
  'picker',
  'switch',
  'checkbox',
  'radio',
  'stepper',
  'rate',
  'slider',
  'array-table',
  'sub-form',
]) {
  assert.match(visualAdapter, new RegExp(componentKey.replace('-', '\\-')));
}
assert.match(materialRegistry, /import\.meta\.glob<MaterialModule>\('\.\/\*\/index\.ts'/);
assert.match(materialRegistry, /materialMap\[key\] = material/);
assert.match(inputMaterial, /aliases: \['input'\]/);
for (const runtimeType of ['vxe-input', 'vxe-select', 'vxe-switch', 'vxe-checkbox-group', 'vxe-radio-group', 'lc-array-table', 'lc-sub-form', 'lc-stepper', 'lc-rate', 'lc-slider']) {
  assert.match(visualAdapter, new RegExp(`runtimeComponent: '${runtimeType.replace('-', '\\-')}'`));
}
assert.doesNotMatch(visualAdapter, /datetimePicker/);
assert.doesNotMatch(converter, /datetimePicker/);
assert.match(converter, /stepper: 'lc-stepper'/);
assert.match(designerSource, /function getFieldProps\(block: VisualEditorBlockData\)/);
assert.match(designerSource, /const fieldProps = getFieldProps\(block\)/);
assert.doesNotMatch(designerSource, /datetimePicker/);

for (const path of [
  'packages/lowcode-framework/src/packages/base-widgets/input/index.tsx',
  'packages/lowcode-framework/src/packages/base-widgets/picker/index.tsx',
  'packages/lowcode-framework/src/packages/base-widgets/array-table/index.tsx',
]) {
  await assert.rejects(access(new URL(path, root)), `${path} must not duplicate form-material implementations`);
}

console.log('Form material unification regression test passed.');
