import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, designer, runtimeForm] = await Promise.all([
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
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/lowcode/block-materials/form/index.vue',
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
  /field_name = 'field' and result ->> 'title' = '字段名'[\s\S]*?'grid-designer-source-fields'/,
  'The column-designer field name must use the current related-table fields.',
);
assert.match(
  migration,
  /field_name = 'foreignKey'[\s\S]*?'grid-designer-detail-fields'/,
  'A child-table foreign key must resolve against the selected child table.',
);
assert.match(
  migration,
  /field_name = any \(array\['parentKey', 'inheritFields'\]\)[\s\S]*?'grid-designer-parent-fields'/,
  'Main-table fields must resolve against the selected parent source.',
);
assert.match(
  migration,
  /field_name = 'parentSourceKey'[\s\S]*?'\{optionsSourceKey\}',[\s\S]*?'grid-designer-page-sources'/,
  'The parent source must be selected from the current page data sources.',
);
assert.match(
  migration,
  /'\{component\}',[\s\S]*?'vxe-select'[\s\S]*?'filterable', true[\s\S]*?'clearable', true/,
  'Related table fields must render as searchable, clearable selects.',
);

assert.match(
  designer,
  /const gridDesignerFieldOptionSourceKeys = \{[\s\S]*?source: 'grid-designer-source-fields',[\s\S]*?detail: 'grid-designer-detail-fields',[\s\S]*?parent: 'grid-designer-parent-fields',[\s\S]*?pageSources: 'grid-designer-page-sources'/,
  'The designer must expose separate option sources for source, detail, parent, and page data.',
);
assert.match(
  designer,
  /const refreshCurrentTableFieldOptions = async[\s\S]*?loadPhysicalTableSource\(\{ value: sourceTarget \}\)[\s\S]*?syncGridDesignerCurrentTableFieldOptions\(source\.columns\)/,
  'Opening a grid designer must resolve physical metadata for its associated source.',
);
assert.match(
  designer,
  /const syncGridDesignerCurrentTableFieldOptions[\s\S]*?state\.business\.tableType === 'detail'[\s\S]*?gridDesignerFieldOptionSourceKeys\.detail/,
  'A detail grid must expose its current table fields as child-table options.',
);
assert.match(
  designer,
  /const refreshDetailTableFieldOptions = async[\s\S]*?state\.business\.tableType === 'detail'[\s\S]*?gridDesignerFieldOptionSourceKeys\.source[\s\S]*?gridDesignerFieldOptionSourceKeys\.detail/,
  'The foreign-key options must mirror the current detail-table fields.',
);
assert.match(
  designer,
  /const refreshParentTableFieldOptions = async[\s\S]*?state\.option\.dataSources\?\.\[parentSourceKey\][\s\S]*?resolveGridDesignerDataSourceTableName[\s\S]*?gridDesignerFieldOptionSourceKeys\.parent/,
  'Parent fields must resolve against the selected parent source table.',
);
assert.match(
  designer,
  /function createGridDesignerPageSourceOptions[\s\S]*?excludedSourceKey[\s\S]*?sourceKey === excludedSourceKey[\s\S]*?!resolveGridDesignerDataSourceTableName\(source\)/,
  'A detail grid must offer only other page sources backed by a table or view.',
);
assert.match(
  designer,
  /applySource[\s\S]*?syncGridDesignerCurrentTableFieldOptions\(source\.columns\)[\s\S]*?assignedDetailResource[\s\S]*?gridDesignerFieldOptionSourceKeys\.detail/,
  'Selecting a table, view, or entity must replace source-field options immediately.',
);
assert.match(
  designer,
  /sectionCode === gridDesignerFormCodes\.detailConfig[\s\S]*?previousResource[\s\S]*?previousParentSourceKey[\s\S]*?await refreshDetailTableFieldOptions\(\)[\s\S]*?await refreshParentTableFieldOptions\(\)/,
  'Changing a detail relation must reload its child and parent field options.',
);
assert.match(
  designer,
  /sectionCode === gridDesignerFormCodes\.businessInfo[\s\S]*?state\.business\.tableType !== previousBusiness\.tableType[\s\S]*?refreshGridDesignerPageSourceOptions\(\)[\s\S]*?await refreshDetailTableFieldOptions\(\)[\s\S]*?await refreshParentTableFieldOptions\(\)/,
  'Changing the grid type or source key must refresh the child- and parent-table fields.',
);
assert.match(
  designer,
  /lowcode: \{[\s\S]*?resolvedData: gridDesignerFieldOptionSources/,
  'The runtime form must receive the dynamic option sources.',
);
assert.match(
  runtimeForm,
  /const resolvedData = computed\([\s\S]*?pageRuntime\?\.state\.sources[\s\S]*?\.\.\.props\.resolvedData/,
  'Explicit designer option sources must override the surrounding page runtime sources.',
);

console.log('Grid designer related-table field options regression test passed.');
