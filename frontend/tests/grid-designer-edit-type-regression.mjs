import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

const designerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx',
    import.meta.url,
  ),
  'utf8',
);
const arrayTableSource = await readLowCodeMaterialSource('form', 'lc-array-table');
const [migrationSource, formMigrationSource] = await Promise.all([
  readFile(
    new URL(
      '../../supabase/migrations/20260811100000_grid_column_edit_type_options.sql',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL('../../supabase/migrations/20260826130000_grid_designer_form_schemas.sql', import.meta.url),
    'utf8',
  ),
]);

assert.doesNotMatch(
  designerSource,
  /columnEditTypeOptions/,
  'Edit renderer choices must not remain hardcoded in the grid designer.',
);
assert.match(
  formMigrationSource,
  /"field": "editType"[\s\S]*"optionsCode": "grid_column_edit_type"/,
  'The database form schema must reference the dropdown source code.',
);
assert.match(
  formMigrationSource,
  /"field": "editType", "title": "编辑类型", "component": "vxe-select"[\s\S]*?"optionsCode": "grid_column_edit_type"/,
  'The edit-type array-table column must resolve its choices through optionsCode.',
);
assert.match(
  arrayTableSource,
  /optionsCode\?: string;[\s\S]*lowCodeOptionSourceRegistry\.subscribe\([\s\S]*resolveColumnOptions/,
  'Array-table select columns must use the shared option-source registry.',
);

for (const renderer of [
  '',
  'VxeInput',
  'VxeNumberInput',
  'VxeDatePicker',
  'VxeSelect',
  'VxeSwitch',
  'VxeTextarea',
]) {
  assert.ok(
    migrationSource.includes(`'${renderer}'`),
    `${renderer || 'the disabled choice'} must be seeded in the database.`,
  );
}
assert.match(
  migrationSource,
  /on conflict \(source_code, value\) do update set[\s\S]*delete from public\.system_option_items[\s\S]*value not in/,
  'The migration must idempotently upsert the authoritative edit-type list and remove stale items.',
);

assert.match(
  formMigrationSource,
  /"field": "title"[\s\S]*"field": "editType", "title": "编辑类型"[\s\S]*"field": "type"/,
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
