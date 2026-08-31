import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const arrayTableSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/form-materials/lc-array-table/index.vue',
    import.meta.url,
  ),
  'utf8',
);
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
const runtimeGridDesignerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/block-materials/grid/runtime-grid-designer.ts',
    import.meta.url,
  ),
  'utf8',
);

assert.match(
  arrayTableSource,
  /v-if="rowDraggable"[\s\S]*drag-sort/,
  'Draggable array tables must render a dedicated row drag handle.',
);
assert.match(
  arrayTableSource,
  /rowDraggable = computed[\s\S]*fieldProps\.value\.rowDraggable === true[\s\S]*!isReadonly\.value/,
  'Row dragging must be opt-in and disabled for readonly array tables.',
);
assert.match(
  arrayTableSource,
  /rowDraggable\.value \? \{ drag: true \} : \{\}/,
  'Opt-in row dragging must enable VXE row drag without replacing the existing row config.',
);
assert.match(
  arrayTableSource,
  /const rowDragConfig = computed\(\(\) => \{[\s\S]*trigger === 'row' \? 'row' : 'cell'[\s\S]*showIcon: config\.showIcon !== false/,
  'Array-table dragging must use the dedicated handle-compatible VXE trigger while preserving configured options.',
);
assert.match(
  arrayTableSource,
  /if \(rowDraggable\.value\) \{[\s\S]*config\.rowDragConfig = rowDragConfig\.value;/,
  'Array-table dragging must pass its resolved configuration to VXE.',
);
assert.match(
  arrayTableSource,
  /@row-dragend="handleRowDragend"[\s\S]*function handleRowDragend[\s\S]*payload\._index[\s\S]*rows\.value\.splice\(newIndex, 0, row\)[\s\S]*commitRows\(\)/,
  'A completed VXE drag must reorder the array-table model and commit the new row order.',
);
assert.match(
  migrationSource,
  /"field": "columns"[\s\S]*"component": "lc-array-table"[\s\S]*"rowDraggable": true[\s\S]*"rowDragConfig": \{[\s\S]*"trigger": "cell"[\s\S]*"movable": false/,
  'The database schema must enable row dragging with a handle-compatible trigger and replace the legacy up/down controls.',
);
assert.match(
  designerSource,
  /onRowMove: \(\{ rows \}[\s\S]*syncColumnsFromRows\(rows\)[\s\S]*columnModel\.columns = state\.columns/,
  'The frontend must inject only the runtime row-move synchronization handler.',
);
assert.match(
  runtimeGridDesignerSource,
  /const updatedBlock = await runtimeBlockEditor\.updateBlock\([\s\S]*Object\.assign\(block, cloneValue\(updatedBlock\)\)/,
  'Saving table design must update the mounted grid block so reopening uses the persisted column order.',
);

console.log('Grid designer column drag regression test passed.');
