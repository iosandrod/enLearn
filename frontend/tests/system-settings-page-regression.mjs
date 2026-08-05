import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260804183000_system_settings_lowcode_page.sql',
    import.meta.url
  ),
  'utf8'
);
const editMigrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260804190000_system_settings_edit_page.sql',
    import.meta.url
  ),
  'utf8'
);
const tablePreferencesMigrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260805103000_system_settings_table_preferences.sql',
    import.meta.url
  ),
  'utf8'
);
const adminServiceSource = await readFile(
  new URL('../../api/src/admin-service/admin.service.ts', import.meta.url),
  'utf8'
);
const rendererSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue',
    import.meta.url
  ),
  'utf8'
);
const dashboardLayoutSource = await readFile(
  new URL('../layouts/dashboard.vue', import.meta.url),
  'utf8'
);
const dialogHostSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/components/GlobalDialogHost.tsx',
    import.meta.url
  ),
  'utf8'
);

assert.match(
  migrationSource,
  /'system-settings',[\s\S]*'\/dashboard\/system\/settings'/,
  'The system settings low-code page must use a stable route.'
);
assert.match(
  migrationSource,
  /where parent\.code = 'business-root'/,
  'System settings must be registered in the database-driven left navigation.'
);
assert.match(
  migrationSource,
  /"id": "system-settings-grid"[\s\S]*"id": "system-settings-tabs"/,
  'The page must retain the same master-grid and child-tabs structure as sales orders.'
);
assert.match(
  migrationSource,
  /"id": "system-settings-form"[\s\S]*"submitSourceKey": "systemSettings"/,
  'The settings tab must expose an editable, persisted configuration form.'
);
assert.match(
  adminServiceSource,
  /system_config:\s*\{[\s\S]*ownerField:\s*'user_id'[\s\S]*maxPageSize:\s*1/,
  'The admin resource must scope system settings to the authenticated user.'
);
assert.match(
  rendererSource,
  /const sourceRecord = Array\.isArray\(sourceValue\) \? sourceValue\[0\] : sourceValue;/,
  'A single-row list data source must hydrate the low-code settings form.'
);
assert.match(
  rendererSource,
  /function mergeFormModelValues\([\s\S]*isRecord\(defaultValue\) && isRecord\(value\)[\s\S]*mergeFormModelValues\(defaultValue, value\)/,
  'Nested settings defaults must be merged with previously saved user values.'
);
assert.match(
  rendererSource,
  /function collectSharedFormDefaults\([\s\S]*defaultsBySource\[sourceKey\] = mergeFormModelValues/,
  'Forms split across settings tabs must share one complete source model.'
);
assert.match(
  editMigrationSource,
  /'system-settings-edit',[\s\S]*'\/dashboard\/system\/settings\/edit'/,
  'The system settings edit page must be stored as a database-backed low-code page.'
);
assert.match(
  editMigrationSource,
  /"id": "system-settings-edit-tabs"[\s\S]*"key": "appearance"[\s\S]*"key": "table"[\s\S]*"key": "locale"[\s\S]*"key": "advanced"/,
  'The edit page must separate appearance, table, locale, and advanced settings.'
);
assert.match(
  editMigrationSource,
  /"component": "lc-sub-form"[\s\S]*"field": "theme_config"|"field": "theme_config"[\s\S]*"component": "lc-sub-form"/,
  'Structured theme settings must use nested schema-driven controls.'
);
assert.match(
  editMigrationSource,
  /"id": "system-settings-table-form"[\s\S]*"field": "table_config"[\s\S]*"component": "vxe-switch"/,
  'Table preferences must be editable with purpose-built controls.'
);
assert.match(
  tablePreferencesMigrationSource,
  /"id": "system-settings-table-tabs"[\s\S]*"key": "table-basic"[\s\S]*"key": "table-row"[\s\S]*"key": "table-column"[\s\S]*"key": "table-pager"[\s\S]*"key": "table-format"/,
  'Detailed table preferences must be organized into focused tabs.'
);
assert.match(
  tablePreferencesMigrationSource,
  /"field": "rowHeight"[\s\S]*"field": "headerRowHeight"[\s\S]*"field": "footerRowHeight"/,
  'Row, header, and footer heights must be configurable independently.'
);
assert.match(
  tablePreferencesMigrationSource,
  /"field": "emptyText"[\s\S]*"field": "numberDigits"[\s\S]*"field": "dateTimeFormat"[\s\S]*"field": "currency"/,
  'Default cell formatting preferences must cover empty, numeric, date-time, and currency values.'
);
assert.match(
  tablePreferencesMigrationSource,
  /update public\.system_config[\s\S]*'\:\:jsonb \|\| table_config/,
  'Existing users must receive new defaults without losing their saved table preferences.'
);
assert.match(
  editMigrationSource,
  /update public\.lowcode_pages as list_page[\s\S]*edit_page_id = edit_page\.id[\s\S]*list_page\.code = 'system-settings'/,
  'The overview page must remain linked to the database-backed edit page.'
);
assert.match(
  editMigrationSource,
  /"id": "system-settings-edit-actions"[\s\S]*"icon": "ri-arrow-left-line"[\s\S]*"icon": "ri-refresh-line"/,
  'The edit-page utility actions must use familiar icons.'
);
assert.match(
  dashboardLayoutSource,
  /class="admin-system-settings-button"[\s\S]*@click="openSystemSettingsDialog"[\s\S]*<ChatPopup\s*\/>/,
  'The topbar must expose the system settings button before chat.'
);
assert.match(
  dashboardLayoutSource,
  /confirmLowCodePage\(\{[\s\S]*pageCode:\s*'system-settings-edit'/,
  'The topbar button must open the low-code system settings edit page.'
);
assert.match(
  dashboardLayoutSource,
  /<GlobalDialogHost\s*\/>/,
  'The dashboard layout must provide a global dialog host.'
);
assert.match(
  dashboardLayoutSource,
  /findGlobalDialog\(SYSTEM_SETTINGS_DIALOG_ID\)/,
  'Repeated topbar clicks must not open duplicate system settings dialogs.'
);
assert.match(
  dialogHostSource,
  /registerGlobalDialogHost\(\)[\s\S]*isActiveGlobalDialogHost\(host\.hostId\)/,
  'Nested low-code renderers must not render duplicate global dialogs.'
);

console.log('System settings page regression test passed.');
