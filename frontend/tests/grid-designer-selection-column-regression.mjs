import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [designerSource, migrationSource] = await Promise.all([
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL('../../supabase/migrations/20260826130000_grid_designer_form_schemas.sql', import.meta.url),
    'utf8',
  ),
]);

assert.match(
  migrationSource,
  /"key": "form-settings", "label": "表单设置"[\s\S]*"field": "grid-designer-form-settings"/,
  'The database tab layout must expose form settings.',
);
assert.match(
  migrationSource,
  /"field": "selectionColumnType", "label": "选择列", "component": "vxe-select"/,
  'The database form settings must expose a selection-column control.',
);
assert.match(
  migrationSource,
  /\{ "label": "关闭", "value": "" \}[\s\S]*\{ "label": "复选", "value": "checkbox" \}[\s\S]*\{ "label": "单选", "value": "radio" \}/,
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
  /sectionCode === gridDesignerFormCodes\.formSettings[\s\S]*Object\.assign\(state\.formSettings, sectionValues\)[\s\S]*syncColumnsFromFormSettings\(\)[\s\S]*columnModel\.columns = state\.columns/,
  'Changing form settings must immediately synchronize the column designer model.',
);
assert.match(
  designerSource,
  /const syncColumnsFromRows[\s\S]*resetReactiveObject\(state\.formSettings, createFormSettings\(state\.columns\)\)[\s\S]*formSettingsModel[\s\S]*resetReactiveObject\(/,
  'Manual checkbox or radio columns must synchronize back into form settings.',
);
assert.match(
  designerSource,
  /formSettings: createFormSettings\(initialColumns\)[\s\S]*resetReactiveObject\(state\.formSettings, createFormSettings\(state\.columns\)\)/,
  'Existing checkbox and radio columns must hydrate the form setting whenever the designer opens.',
);

console.log('Grid designer selection column regression test passed.');
