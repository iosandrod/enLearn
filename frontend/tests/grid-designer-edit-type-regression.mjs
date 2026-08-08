import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const designerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx',
    import.meta.url,
  ),
  'utf8',
);

for (const [label, renderer] of [
  ['文本输入 VxeInput', 'VxeInput'],
  ['数字输入 VxeNumberInput', 'VxeNumberInput'],
  ['日期选择 VxeDatePicker', 'VxeDatePicker'],
  ['下拉选择 VxeSelect', 'VxeSelect'],
  ['开关 VxeSwitch', 'VxeSwitch'],
  ['多行文本 VxeTextarea', 'VxeTextarea'],
]) {
  assert.ok(
    designerSource.includes(`{ label: '${label}', value: '${renderer}' }`),
    `${renderer} must be available as a column edit type.`,
  );
}

assert.match(
  designerSource,
  /field: 'title'[\s\S]*field: 'editType',[\s\S]*title: '编辑类型'[\s\S]*field: 'type'/,
  'The edit-type selector must appear between title and type in the column designer.',
);
assert.match(
  designerSource,
  /const currentEditType = readString\(sourceEditRender\.name\)[\s\S]*const editType = Object\.prototype\.hasOwnProperty\.call\(row, 'editType'\)[\s\S]*\? \{ \.\.\.sourceEditRender, name: editType \}[\s\S]*editRender,/,
  'Changing edit type must update the persisted VxeGrid editRender configuration.',
);
assert.match(
  designerSource,
  /column\.editType = readString\([\s\S]*column\.editRender[\s\S]*column\.editRender\.name/,
  'Advanced editRender changes must synchronize the edit-type selector.',
);
assert.match(
  designerSource,
  /const rowIndex = rows\.indexOf\(row\)[\s\S]*Object\.assign\(row, normalizeColumn\(row, rowIndex >= 0 \? rowIndex : 0\)\)[\s\S]*openColumnAdvancedDialog/,
  'Opening advanced settings must first synchronize the selected edit type into editRender.',
);
const resultNormalizer = designerSource.slice(
  designerSource.indexOf('function normalizeColumnForResult'),
  designerSource.indexOf('function normalizeRuntimeDirectives'),
);
assert.doesNotMatch(
  resultNormalizer,
  /\n\s+editType,/,
  'The designer-only editType helper must not leak into persisted grid columns.',
);
assert.match(
  resultNormalizer,
  /editRender: normalizeObjectConfig\(column\.editRender\)/,
  'The selected edit type must persist through editRender.',
);

console.log('Grid designer edit type regression test passed.');
