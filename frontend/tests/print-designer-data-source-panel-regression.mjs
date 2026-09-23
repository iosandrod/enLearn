import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [
  designerSource,
  panelSource,
  schemaSource,
  materialSource,
  printMenuSource,
  migrationSource,
  definitionMigrationSource,
  detailSchemaMigrationSource,
  detailTableMigrationSource,
  detailImportMigrationSource,
  contextMenuSource,
  contextMenuComponentSource,
  stylesSource,
] = await Promise.all([
  readFile(new URL('../../packages/tldraw-vue/src/TldrawVue.vue', import.meta.url), 'utf8'),
  readFile(
    new URL('../../packages/tldraw-vue/src/components/VueDataSourcePanel.vue', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../../packages/tldraw-vue/src/editor/dataSourceForm.ts', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL(
      '../../packages/tldraw-vue/src/components/shapes/VueMaterialSectionShapeNode.vue',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL('../../packages/tldraw-vue/src/components/VueTopLeftMenu.vue', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL(
      '../../supabase/migrations/20260920100000_print_data_source_form_definitions.sql',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../supabase/migrations/20260921120000_print_data_source_definition_form.sql',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../supabase/migrations/20260922100000_print_data_source_print_detail_schema.sql',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../supabase/migrations/20260922110000_normalize_print_detail_tables.sql',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../supabase/migrations/20260923100000_print_data_source_detail_import_form.sql',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(new URL('../../packages/tldraw-vue/src/editor/interactions/ContextMenuState.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/components/VueContextMenu.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/styles.css', import.meta.url), 'utf8'),
]);

assert.match(designerSource, /id: 'dataSource', label: '数据源'/);
assert.match(designerSource, /<VueDataSourcePanel/);
assert.match(panelSource, /<LowCodeForm/);
assert.match(panelSource, /resource: 'lowcode_form_definitions'/);
assert.match(panelSource, /SELECTOR_FORM_CODE = 'print-designer\.datasource-selector'/);
assert.match(panelSource, /class="data-source-panel__selector-form"[\s\S]*<LowCodeForm/);
assert.match(
  panelSource,
  /class="data-source-panel__body"[\s\S]*<footer class="data-source-panel__actions-footer">[\s\S]*aria-label="数据源操作"[\s\S]*handleAddDataSource[\s\S]*handleManageDataSource[\s\S]*handleDesignDataSource/,
);
assert.doesNotMatch(panelSource, /<select/);
assert.match(
  panelSource,
  /headerForm:\s*\{[\s\S]*?schema:\s*dataSourceDefinitionForm\.value\?\.schema\s*\?\?\s*createDataSourceDefinitionSchema\(\)/,
);
assert.match(panelSource, /createInlinePrintDataSource\(value, definition, getWorkspaceDataSource\(\)\)/);
assert.match(
  panelSource,
  /if \(resetModel \|\| !currentSource \|\| currentSource\.type === 'none'\) \{[\s\S]*?applyFormModel\(formModel\.value, definition\)/,
);
assert.match(panelSource, /activeSourceTab.*header.*detail/s);
assert.match(panelSource, /添加子表/);
assert.match(panelSource, /删除子表/);
assert.match(panelSource, /表格配置/);
assert.match(panelSource, /\$\$gridDesigner/);
assert.match(panelSource, /data-source-panel__detail-tabs/);
assert.match(panelSource, /<vxe-grid/);
assert.match(panelSource, /getPrintDataSourceDetailTables/);
assert.match(panelSource, /新增行/);
assert.match(panelSource, /导入数据/);
assert.match(panelSource, /清空数据/);
assert.match(panelSource, /DETAIL_IMPORT_FORM_CODE/);
assert.match(panelSource, /pendingDetailImportConfig/);
assert.match(
  panelSource,
  /async function handleImportData\(\)\s*\{[\s\S]*?openDetailImportDialog\(\)[\s\S]*?pendingDetailImportConfig\.value\s*=\s*config[\s\S]*?importFileInput\.value\?\.click\(\)/,
);
assert.doesNotMatch(
  panelSource,
  /async function handleImportFileChange\(event: Event\)(?:(?!\nasync function|\nfunction)[\s\S])*const config = await openDetailImportDialog\(\)/,
);
assert.match(panelSource, /XLSX\.read/);
assert.match(panelSource, /hasFieldRow/);
assert.match(panelSource, /hasChineseRow/);
assert.match(panelSource, /updateDetailRows/);
assert.match(schemaSource, /printDetail/);
assert.match(schemaSource, /getPrintDataSourceDetailTables/);
assert.match(schemaSource, /getPrintDataSourceHeaderSchema/);
assert.doesNotMatch(schemaSource, /PRINT_DATA_SOURCE_FORM_SCHEMA/);
assert.match(schemaSource, /schema\.fields\.find/);
assert.match(materialSource, /getPrintDataSourceDetailRows\(printDataSource\.value\)/);
assert.doesNotMatch(materialSource, /<span>自动填充<\/span>/);
assert.match(printMenuSource, /getPrintDataSourceDetailRows\(dataSource\)/);
assert.match(printMenuSource, /data,\s*columns,/);
assert.match(migrationSource, /add column if not exists table_name text/);
assert.match(
  migrationSource,
  /create or replace view public\.print_data_source_form_definition_options/,
);
assert.match(
  migrationSource,
  /'print_data_source_form_definition'[\s\S]*?'view'[\s\S]*?public\.print_data_source_form_definition_options/,
);
assert.match(migrationSource, /'print-designer\.datasource-selector'/);
assert.match(
  migrationSource,
  /"field": "formCode"[\s\S]*?"component": "vxe-select"[\s\S]*?"optionsCode": "print_data_source_form_definition"/,
);
assert.match(migrationSource, /'print-designer\.datasource\.sales-orders'/);
assert.match(migrationSource, /"field": "header"[\s\S]*"component": "lc-sub-form"/);
assert.match(migrationSource, /"field": "detail"[\s\S]*"component": "lc-array-table"/);
assert.match(migrationSource, /"tableName": "sales_order_lines"/);
assert.match(definitionMigrationSource, /'print-designer\.datasource-definition'/);
assert.match(
  definitionMigrationSource,
  /"field": "code"[\s\S]*?"component": "vxe-input"[\s\S]*?"field": "tableName"/,
);
assert.match(definitionMigrationSource, /on conflict \(code\) do update set/);
assert.match(detailSchemaMigrationSource, /jsonb_set\(definitions\.schema, '\{printDetail\}'/);
assert.match(detailSchemaMigrationSource, /fields\.field_definition #> '\{props,columns\}'/);
assert.match(detailTableMigrationSource, /jsonb_set\(definitions\.schema, '\{printDetail\}'/);
assert.match(detailTableMigrationSource, /'columns'/);
assert.match(detailImportMigrationSource, /'print-designer\.datasource-detail-import'/);
assert.match(detailImportMigrationSource, /hasFieldRow/);
assert.match(detailImportMigrationSource, /hasChineseRow/);
assert.match(contextMenuSource, /buildDataSourceMenuItem/);
assert.match(contextMenuSource, /(?:source|inlineSource)\.headerFields/);
assert.match(contextMenuSource, /table\.columns\.map/);
assert.match(contextMenuSource, /insertDataSourceReference/);
assert.match(contextMenuComponentSource, /context-menu--submenu/);
assert.match(contextMenuComponentSource, /item\.children/);
assert.match(contextMenuComponentSource, /submenuPositions/);
assert.match(contextMenuComponentSource, /setSubmenuPosition/);
assert.match(stylesSource, /\.context-menu-item-wrapper::after/);
assert.match(stylesSource, /\.context-menu--root\s*\{[\s\S]*?overflow-y:\s*auto/);
assert.match(stylesSource, /\.context-menu--submenu\s*\{[\s\S]*?position:\s*fixed/);
assert.match(stylesSource, /\.context-menu--submenu\s*\{[\s\S]*?position:\s*fixed/);
assert.match(stylesSource, /\.context-menu\s*\{[\s\S]*?width:\s*196px/);
assert.match(
  stylesSource,
  /\.editor-host\.is-data-source-active\s*{\s*grid-template-columns:\s*400px minmax\(0, 1fr\);/,
);
assert.doesNotMatch(
  stylesSource,
  /\.editor-host\.is-data-source-active\s*{[^}]*grid-template-columns:\s*min\(/,
);

console.log('Print designer data source panel regression test passed.');
