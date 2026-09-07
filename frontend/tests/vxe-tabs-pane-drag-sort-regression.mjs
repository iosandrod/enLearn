import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

const [arrayTableSource, tabsDefinitionSource, dragSortMigration] = await Promise.all([
  readLowCodeMaterialSource('form', 'lc-array-table'),
  readFile(
    new URL(
      '../../supabase/migrations/20260819100000_database_only_material_property_forms.sql',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../supabase/migrations/20260906120000_vxe_tabs_pane_drag_sort.sql',
      import.meta.url,
    ),
    'utf8',
  ),
]);

assert.match(
  tabsDefinitionSource,
  /\('material-prop\.vxe-tabs'[\s\S]*?"field":"panes"[\s\S]*?"component":"lc-array-table"/,
  'The VXE tabs property form must expose its pane list through an array table.',
);
assert.match(
  dragSortMigration,
  /where code = 'material-prop\.vxe-tabs'/,
  'The drag-sort migration must target only the VXE tabs property form.',
);
assert.match(
  dragSortMigration,
  /field_definition ->> 'field' = 'panes'[\s\S]*'rowDraggable', true[\s\S]*'rowDragConfig'[\s\S]*'trigger', 'cell'/,
  'The pane table must enable handle-compatible row dragging.',
);
assert.match(
  dragSortMigration,
  /'showIcon', true[\s\S]*'animation', true[\s\S]*'showGuidesStatus', true[\s\S]*'showDragTip', true[\s\S]*'movable', false/,
  'The pane table must show drag feedback and hide the legacy move actions.',
);
assert.match(
  arrayTableSource,
  /@row-dragend="handleRowDragend"[\s\S]*function handleRowDragend[\s\S]*commitRows\(\)/,
  'Dragging a pane row must commit the reordered pane array to the bound property.',
);

console.log('VXE tabs pane drag-sort regression test passed.');
