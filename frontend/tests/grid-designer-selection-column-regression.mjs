import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const designerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx',
    import.meta.url,
  ),
  'utf8',
);

assert.match(
  designerSource,
  /key: 'form-settings'[\s\S]*label: '表单设置'[\s\S]*formSettingsBlockId/,
  'Table information design must expose a form settings tab.',
);
assert.match(
  designerSource,
  /field: 'selectionColumnType'[\s\S]*label: '选择列'[\s\S]*selectionColumnTypeOptions/,
  'Form settings must expose a selection-column control.',
);
assert.match(
  designerSource,
  /\{ label: '关闭', value: '' \}[\s\S]*\{ label: '复选', value: 'checkbox' \}[\s\S]*\{ label: '单选', value: 'radio' \}/,
  'The selection-column control must support disabled, checkbox, and radio modes.',
);
assert.match(
  designerSource,
  /function applyFormSettingsToColumns[\s\S]*columns\.filter\(\(column\) => !isSelectionColumn\(column\)\)[\s\S]*type: selectionColumnType[\s\S]*field: ''[\s\S]*title: ''/,
  'Form settings must create a standard fieldless VXE selection column and replace any previous selection mode.',
);
assert.match(
  designerSource,
  /const isFieldlessSelectionColumn = type === 'checkbox' \|\| type === 'radio'[\s\S]*field: isFieldlessSelectionColumn[\s\S]*title: isFieldlessSelectionColumn/,
  'Selection columns must remain fieldless when existing columns are normalized.',
);
assert.match(
  designerSource,
  /event\.blockId === formSettingsBlockId[\s\S]*Object\.assign\(state\.formSettings, values\)[\s\S]*syncColumnsFromFormSettings\(\)[\s\S]*columnModel\.columns = state\.columns/,
  'Changing form settings must immediately synchronize the column designer model.',
);
assert.match(
  designerSource,
  /const syncColumnsFromRows[\s\S]*resetReactiveObject\(state\.formSettings, createFormSettings\(state\.columns\)\)[\s\S]*resetReactiveObject\([\s\S]*formSettingsModel/,
  'Manual checkbox or radio columns must synchronize back into form settings.',
);
assert.match(
  designerSource,
  /formSettings: createFormSettings\(initialColumns\)[\s\S]*resetReactiveObject\(state\.formSettings, createFormSettings\(state\.columns\)\)/,
  'Existing checkbox and radio columns must hydrate the form setting whenever the designer opens.',
);

console.log('Grid designer selection column regression test passed.');
