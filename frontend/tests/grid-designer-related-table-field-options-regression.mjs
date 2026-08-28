import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, designer] = await Promise.all([
  readFile(
    new URL(
      '../../supabase/migrations/20260828170000_grid_designer_related_table_field_options.sql',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx',
      import.meta.url,
    ),
    'utf8',
  ),
]);

assert.match(
  migration,
  /'categoryField',[\s\S]*?'keyField',[\s\S]*?'checkField',[\s\S]*?'labelField'[\s\S]*?'rowField',[\s\S]*?'parentField',[\s\S]*?'childrenField',[\s\S]*?'hasChild'/,
  'Grid field selectors must cover the source-backed configuration fields.',
);
assert.match(
  migration,
  /field_name = 'foreignKey'[\s\S]*?'grid-designer-detail-fields'/,
  'A child-table foreign key must resolve against the selected child table.',
);
assert.match(
  migration,
  /field_name = 'inheritFields'[\s\S]*?'optionsSourceKey', 'grid-designer-source-fields'/,
  'Inherited main-table fields must use the current source-field dropdown.',
);
assert.match(
  migration,
  /'\{component\}',[\s\S]*?'vxe-select'[\s\S]*?'filterable', true[\s\S]*?'clearable', true/,
  'Related table fields must render as searchable, clearable selects.',
);

assert.match(
  designer,
  /const gridDesignerFieldOptionSourceKeys = \{[\s\S]*?source: 'grid-designer-source-fields',[\s\S]*?detail: 'grid-designer-detail-fields'/,
  'The designer must expose separate option sources for the grid and its detail resource.',
);
assert.match(
  designer,
  /const refreshCurrentTableFieldOptions = async[\s\S]*?loadPhysicalTableSource\(\{ value: sourceTarget \}\)[\s\S]*?gridDesignerFieldOptionSourceKeys\.source/,
  'Opening a grid designer must resolve physical metadata for its associated source.',
);
assert.match(
  designer,
  /const refreshDetailTableFieldOptions = async[\s\S]*?loadPhysicalTableSource\(\{ value: resource \}\)[\s\S]*?gridDesignerFieldOptionSourceKeys\.detail/,
  'The child-table field source must refresh from the selected resource.',
);
assert.match(
  designer,
  /applySource[\s\S]*?syncGridDesignerTableFieldOptions\([\s\S]*?gridDesignerFieldOptionSourceKeys\.source,[\s\S]*?source\.columns[\s\S]*?assignedDetailResource[\s\S]*?gridDesignerFieldOptionSourceKeys\.detail/,
  'Selecting a table, view, or entity must replace source-field options immediately.',
);
assert.match(
  designer,
  /sectionCode === gridDesignerFormCodes\.detailConfig[\s\S]*?previousResource[\s\S]*?await refreshDetailTableFieldOptions\(\)/,
  'Changing the child resource must reload the foreign-key options.',
);
assert.match(
  designer,
  /lowcode: \{[\s\S]*?resolvedData: gridDesignerFieldOptionSources/,
  'The runtime form must receive the dynamic option sources.',
);

console.log('Grid designer related-table field options regression test passed.');
