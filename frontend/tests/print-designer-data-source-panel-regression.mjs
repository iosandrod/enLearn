import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [
  designerSource,
  panelSource,
  schemaSource,
  materialSource,
  printMenuSource,
  migrationSource,
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
  readFile(new URL('../../packages/tldraw-vue/src/styles.css', import.meta.url), 'utf8'),
]);

assert.match(designerSource, /id: 'dataSource', label: '数据源'/);
assert.match(designerSource, /<VueDataSourcePanel/);
assert.match(panelSource, /<LowCodeForm/);
assert.match(panelSource, /resource: 'lowcode_form_definitions'/);
assert.match(panelSource, /SELECTOR_FORM_CODE = 'print-designer\.datasource-selector'/);
assert.match(panelSource, /class="data-source-panel__selector-form"[\s\S]*<LowCodeForm/);
assert.doesNotMatch(panelSource, /<select/);
assert.match(panelSource, /createInlinePrintDataSource\(value, definition\)/);
assert.doesNotMatch(schemaSource, /PRINT_DATA_SOURCE_FORM_SCHEMA/);
assert.match(schemaSource, /definition\.schema\.fields\.find/);
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
assert.match(
  stylesSource,
  /\.editor-host\.is-data-source-active\s*{\s*grid-template-columns:\s*400px minmax\(0, 1fr\);/,
);
assert.doesNotMatch(
  stylesSource,
  /\.editor-host\.is-data-source-active\s*{[^}]*grid-template-columns:\s*min\(/,
);

console.log('Print designer data source panel regression test passed.');
