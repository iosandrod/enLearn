import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const arrayTableSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/form-materials/lc-array-table/index.vue',
    import.meta.url,
  ),
  'utf8',
);
const designerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx',
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
  /config\.rowDragConfig = \{[\s\S]*trigger: 'default'[\s\S]*showIcon: true/,
  'Array-table dragging must use the dedicated handle as the VXE drag trigger.',
);
assert.match(
  arrayTableSource,
  /@row-dragend="handleRowDragend"[\s\S]*function handleRowDragend[\s\S]*payload\._index[\s\S]*rows\.value\.splice\(newIndex, 0, row\)[\s\S]*commitRows\(\)/,
  'A completed VXE drag must reorder the array-table model and commit the new row order.',
);
assert.match(
  designerSource,
  /field: 'columns'[\s\S]*component: 'lc-array-table'[\s\S]*rowDraggable: true[\s\S]*onRowMove:[\s\S]*syncColumnsFromRows\(rows\)[\s\S]*movable: false/,
  'The grid column designer must enable drag ordering, sync the reordered model, and replace the legacy up/down controls.',
);

console.log('Grid designer column drag regression test passed.');
