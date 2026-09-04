import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

const [
  arrayTableSource,
  initialMaterialMigration,
  initialGridDesignerMigration,
  repairMigration,
] = await Promise.all([
  readLowCodeMaterialSource('form', 'lc-array-table'),
  readFile(
    new URL('../../supabase/migrations/20260819100000_database_only_material_property_forms.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../../supabase/migrations/20260826130000_grid_designer_form_schemas.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../../supabase/migrations/20260829120000_array_table_drag_configuration.sql', import.meta.url),
    'utf8',
  ),
]);

assert.match(
  arrayTableSource,
  /const rowDragConfig = computed\(\(\) => \{[\s\S]*trigger === 'row' \? 'row' : 'cell'/,
  'Array tables must use VXE’s cell trigger for the dedicated drag-sort column by default.',
);
assert.match(
  arrayTableSource,
  /if \(rowDraggable\.value\) \{[\s\S]*config\.rowDragConfig = rowDragConfig\.value;/,
  'Array-table runtime must preserve the database-provided drag configuration.',
);
assert.match(
  initialGridDesignerMigration,
  /"rowDraggable": true,[\s\S]*"rowDragConfig": \{[\s\S]*"trigger": "cell"/,
  'New grid-designer definitions must persist the drag trigger in their database schema.',
);
const arrayTableDefinitionMatch = initialMaterialMigration.match(
  /\('material-prop\.array-table'[^$]*\$schema\$(\{.*?\})\$schema\$::jsonb/,
);
assert.ok(arrayTableDefinitionMatch, 'The array-table material must have a database property definition.');
const arrayTableDefinition = JSON.parse(arrayTableDefinitionMatch[1]);
assert.equal(
  arrayTableDefinition.fields.find((field) => field.field === 'rowDraggable')?.component,
  'vxe-switch',
  'Array-table input nodes must expose a persisted drag-sort switch.',
);
assert.deepEqual(
  arrayTableDefinition.fields.find((field) => field.field === 'rowDragConfig')?.defaultValue,
  {
    trigger: 'cell',
    showIcon: true,
    animation: true,
    showGuidesStatus: true,
    showDragTip: true,
  },
  'Array-table input nodes must persist their VXE drag configuration.',
);
assert.ok(
  arrayTableDefinition.layout[0].tabs.some((tab) => tab.key === 'drag'),
  'Array-table property forms must show a drag-sort configuration tab.',
);
assert.match(
  repairMigration,
  /code = 'grid-designer'[\s\S]*'rowDraggable', true,[\s\S]*'trigger', 'cell'/,
  'The repair migration must restore drag sorting for existing grid-designer definitions.',
);
assert.match(
  repairMigration,
  /code = 'material-prop\.array-table'/,
  'The repair migration must target the database-backed array-table property form.',
);
assert.match(
  repairMigration,
  /'field', 'rowDraggable'[\s\S]*'field', 'rowDragConfig'[\s\S]*'label', '拖拽排序'/,
  'Array-table input nodes must expose their persisted drag controls in the database property form.',
);
assert.match(
  repairMigration,
  /jsonb_array_elements\(drag_fields\.fields\)[\s\S]*where not exists[\s\S]*existing_field\.value ->> 'field' = candidate\.value ->> 'field'/,
  'The repair migration must add only missing array-table drag fields.',
);

console.log('Array-table drag configuration regression test passed.');
