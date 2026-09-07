import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sectionCodes = [
  'grid-designer-columns',
  'grid-designer-business-info',
  'grid-designer-grid-options',
  'grid-designer-form-settings',
  'grid-designer-row-config',
  'grid-designer-column-config',
  'grid-designer-events',
  'grid-designer-extra-props',
  'grid-designer-pager-config',
  'grid-designer-toolbar-config',
  'grid-designer-proxy-config',
  'grid-designer-edit-config',
  'grid-designer-checkbox-config',
  'grid-designer-radio-config',
  'grid-designer-sort-config',
  'grid-designer-filter-config',
  'grid-designer-tree-config',
  'grid-designer-expand-config',
  'grid-designer-column-size-align',
  'grid-designer-column-display',
  'grid-designer-column-filters',
  'grid-designer-column-renderers',
  'grid-designer-detail-config',
];

const [designerSource, baseMigrationSource, detailMigrationSource] = await Promise.all([
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../supabase/migrations/20260826130000_grid_designer_form_schemas.sql',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../supabase/migrations/20260826143000_grid_detail_schema_save.sql',
      import.meta.url,
    ),
    'utf8',
  ),
]);
const migrationSource = `${baseMigrationSource}\n${detailMigrationSource}`;

for (const code of sectionCodes) {
  assert.match(
    migrationSource,
    new RegExp(`["']${code}["']`),
    `The database migration must include ${code}.`,
  );
}

assert.match(
  baseMigrationSource,
  /'layout'[\s\S]*"defaultKey": "columns"[\s\S]*"label": "列设计"[\s\S]*"label": "表格信息设计"[\s\S]*"label": "事件属性"/,
  'The master grid designer form must retain its database-owned root tab layout.',
);
assert.match(
  detailMigrationSource,
  /"key": "detail"[\s\S]*"label": "子表配置"[\s\S]*when 'detail' then 3[\s\S]*when 'events' then 4/,
  'The detail tab must be inserted before the event tab as the fourth root tab.',
);
assert.match(
  migrationSource,
  /removed_legacy as[\s\S]*delete from public\.lowcode_form_definitions[\s\S]*select[\s\S]*'grid-designer',[\s\S]*on conflict \(code\) do update set/,
  'The migration must remove split definitions and idempotently persist one master form.',
);
assert.match(
  designerSource,
  /serviceApi\.invoke[\s\S]*'lowcode', 'listItems'[\s\S]*resource: 'lowcode_form_definitions'[\s\S]*code: gridDesignerFormCode[\s\S]*enabled: true[\s\S]*limit: 1/,
  'The grid designer must load only the enabled master form definition.',
);
assert.match(
  designerSource,
  /sectionField = databaseFormSchema\?\.fields\.find[\s\S]*sectionField\?\.props[\s\S]*isLowCodeFormSchema\(sectionSchema\)/,
  'Runtime panels must resolve their schemas from sub-form fields in the master schema.',
);
assert.match(
  designerSource,
  /if \(!isLowCodeFormSchema\(schema\)\)[\s\S]*databaseFormSchema = cloneDeep\(schema\)/,
  'The master database schema must be validated before the designer uses it.',
);
assert.doesNotMatch(
  designerSource,
  /const (businessInfoSchema|gridOptionsSchema|formSettingsSchema|rowConfigSchema|columnConfigSchema|createColumnDesignerArrayColumns|createEventDesignerArrayColumns)/,
  'Grid designer form and array-table schemas must not be hardcoded in the frontend.',
);
assert.doesNotMatch(
  designerSource,
  /fallbackSchema|Keep the bundled schemas|const (columnTypeOptions|selectionColumnTypeOptions|pagerConfigFields|toolbarConfigFields)/,
  'The database-backed grid designer must not retain bundled schema fallbacks.',
);
assert.match(
  designerSource,
  /if \(!isLowCodeFormSchema\(schema\)\)[\s\S]*低代码表单[\s\S]*不存在、已停用或 schema 无效/,
  'A missing or invalid database form must stop the designer with an explicit error.',
);
assert.match(
  designerSource,
  /show: async \(\) => \{[\s\S]*await loadGridDesignerFormSchemas\(\);[\s\S]*syncActiveDesignerDialogModel\(\);/,
  'Database schemas must be loaded before the designer dialog model is built.',
);
assert.match(
  designerSource,
  /const createGridDesignerDialogBlocks[\s\S]*id: gridDesignerFormBlockId,[\s\S]*kind: 'form',[\s\S]*schema: createGridDesignerSchema\(\)/,
  'The designer dialog must render the database definition as one master form block.',
);
assert.doesNotMatch(
  designerSource,
  /id: 'grid-designer-tabs'[\s\S]*key: 'columns'[\s\S]*key: 'info'[\s\S]*key: 'events'/,
  'The frontend must not rebuild the database-owned root tab layout.',
);
assert.match(
  designerSource,
  /gridDesignerFormCodes\.columns[\s\S]*const columnsField = schema\.fields\.find[\s\S]*associate-entity[\s\S]*associate-view[\s\S]*sync-table-comments[\s\S]*onRowMove:[\s\S]*onRowDblclick:/,
  'The database-backed column schema must receive its runtime-only actions and row handlers.',
);
assert.match(
  designerSource,
  /columnsField\.props = \{[\s\S]*rowHeight: Math\.max\(Number\(fieldProps\.rowHeight\) \|\| 0, 36\),/,
  'The column editor must keep compact VXE controls inside a row with vertical breathing room.',
);
assert.match(
  designerSource,
  /columnsField\.props = \{[\s\S]*height: '100%',[\s\S]*rowHeight:/,
  'The column editor must use fill height so its array table follows dialog resizing.',
);
assert.match(
  baseMigrationSource,
  /"rowActions": \[[\s\S]*"code": "advanced-column-design"[\s\S]*"title": "高级列设计"[\s\S]*"icon": "ri-settings-3-line"/,
  'The column table schema must expose an advanced-design icon action.',
);
assert.match(
  designerSource,
  /const openColumnFieldEditor[\s\S]*openRuntimeGridFieldEditor[\s\S]*rowActions: \[[\s\S]*code: 'advanced-column-design'[\s\S]*icon: 'ri-settings-3-line'[\s\S]*onRowAction:[\s\S]*openColumnFieldEditor\(row, rows\)/,
  'The advanced-design row action must reuse the current-field property editor.',
);
assert.match(
  detailMigrationSource,
  /"parentSourceKey"[\s\S]*"resource"[\s\S]*"foreignKey"[\s\S]*"parentKey"[\s\S]*"inheritFields"[\s\S]*"updateMode"[\s\S]*"defaults"/,
  'The database-owned child-table form must expose the complete relation configuration.',
);
assert.match(
  detailMigrationSource,
  /"parentSourceKey": "salesOrder"[\s\S]*"resource": "sales_order_lines"[\s\S]*"foreignKey": "order_id"[\s\S]*"inheritFields": \["account_id"\]/,
  'The sales-order detail relation must be stored in the grid schema.',
);
assert.match(
  detailMigrationSource,
  /"parentSourceKey": "optionSource"[\s\S]*"resource": "system_option_items"[\s\S]*"foreignKey": "source_code"[\s\S]*"parentKey": "code"/,
  'The option-item relation must be stored in the grid schema.',
);
assert.match(
  detailMigrationSource,
  /return this\.executeFunction\(\{ name: "save", args: \{\} \}\);/,
  'The sales-order page must use the generic database-schema-aware save function.',
);
assert.doesNotMatch(
  detailMigrationSource,
  /getChanges|detailFields|saveSalesOrder/,
  'The final page migration must not retain page-specific detail-save code.',
);

console.log(`Grid designer database schema regression test passed (1 form, ${sectionCodes.length} sections).`);
