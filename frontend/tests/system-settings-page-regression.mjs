import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

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
const rendererSource = (
  await Promise.all([
    readFile(
      new URL(
        '../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue',
        import.meta.url
      ),
      'utf8'
    ),
    readFile(
      new URL(
        '../../packages/lowcode-framework/src/runtime/useLowCodePageRenderer.ts',
        import.meta.url
      ),
      'utf8'
    ),
    readFile(
      new URL(
        '../../packages/lowcode-framework/src/runtime/page-data-controller.ts',
        import.meta.url
      ),
      'utf8'
    ),
  ])
).join('\n');
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
const pageDialogSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/runtime/page-reference-dialog.tsx',
    import.meta.url
  ),
  'utf8'
);
const appSource = await readFile(new URL('../app.vue', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const dashboardRouteSource = await readFile(
  new URL('../pages/dashboard/[...slug].vue', import.meta.url),
  'utf8'
);
const systemSettingsRuntimeSource = await readFile(
  new URL('../composables/useSystemSettings.ts', import.meta.url),
  'utf8'
);
const systemSettingsContextSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/core/system-settings.ts',
    import.meta.url
  ),
  'utf8'
);
const lowCodeGridSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/components/LowCodeGrid.vue',
    import.meta.url
  ),
  'utf8'
);
const arrayTableSource = await readLowCodeMaterialSource('form', 'lc-array-table');
const lowCodeFormSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodeForm.vue', import.meta.url),
  'utf8'
);
const colorPickerSource = await readLowCodeMaterialSource('form', 'lc-color-picker');
const subFormSource = await readLowCodeMaterialSource('form', 'lc-sub-form');

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
  /mergeFormModelValues\s*=\s*\([\s\S]*isRecord\(defaultValue\) && isRecord\(value\)[\s\S]*mergeFormModelValues\(defaultValue, value\)/,
  'Nested settings defaults must be merged with previously saved user values.'
);
assert.match(
  rendererSource,
  /collectSharedFormDefaults\s*=\s*\([\s\S]*defaultsBySource\[sourceKey\] = this\.mergeFormModelValues/,
  'Multiple forms sharing a source must still contribute one complete source model.'
);
assert.match(
  editMigrationSource,
  /'system-settings-edit',[\s\S]*'\/dashboard\/system\/settings\/edit'/,
  'The system settings edit page must be stored as a database-backed low-code page.'
);
assert.match(
  editMigrationSource,
  /"id": "system-settings-edit-form"[\s\S]*"kind": "form"[\s\S]*"sourceKey": "systemSettings"[\s\S]*"layout": \[[\s\S]*"kind": "tabs"[\s\S]*"key": "appearance"[\s\S]*"key": "table"[\s\S]*"key": "locale"[\s\S]*"key": "advanced"/,
  'The edit page must use one form and place appearance, table, locale, and advanced settings in the form layout tabs.'
);
assert.doesNotMatch(
  editMigrationSource,
  /"id": "system-settings-edit-tabs"|"id": "system-settings-appearance-form"|"id": "system-settings-locale-form"|"id": "system-settings-advanced-form"/,
  'The edit page must not use page-level tabs or split the settings into multiple page forms.'
);
assert.match(
  editMigrationSource,
  /"component": "lc-sub-form"[\s\S]*"field": "theme_config"|"field": "theme_config"[\s\S]*"component": "lc-sub-form"/,
  'Structured theme settings must use nested schema-driven controls.'
);
assert.match(
  editMigrationSource,
  /"field": "table_config"[\s\S]*"component": "lc-sub-form"[\s\S]*"component": "vxe-switch"/,
  'Table preferences must remain editable with purpose-built controls inside the single form.'
);
assert.match(
  tablePreferencesMigrationSource,
  /'\{blocks,2,schema,fields,3\}'[\s\S]*"field": "table_config"[\s\S]*"layout": \[[\s\S]*"kind": "tabs"[\s\S]*"key": "table-basic"[\s\S]*"key": "table-row"[\s\S]*"key": "table-column"[\s\S]*"key": "table-pager"[\s\S]*"key": "table-format"/,
  'Detailed table preferences must be organized into focused tabs inside the table_config sub-form.'
);
assert.doesNotMatch(
  tablePreferencesMigrationSource,
  /"id": "system-settings-table-tabs"|"id": "system-settings-table-form"|"id": "system-settings-table-row-form"|"id": "system-settings-table-column-form"|"id": "system-settings-table-pager-form"|"id": "system-settings-table-format-form"/,
  'Detailed table preferences must not reintroduce page-level tabs or split table settings into multiple page forms.'
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
  /confirmLowCodePage\(\{[\s\S]*pageCode:\s*'system-settings-edit'[\s\S]*submitOnConfirm:\s*true/,
  'The topbar button must save the low-code system settings page before closing it.'
);
assert.match(
  rendererSource,
  /collectFormSubmissionGroups\s*=\s*\(\)[\s\S]*groups\.set\(sourceKey[\s\S]*buildFormSubmissionValues\s*=\s*\([\s\S]*mergeChangedFormValue/,
  'Forms sharing a data source must be merged into one save payload without overwriting changes from another settings tab.'
);
assert.match(
  rendererSource,
  /defineExpose\(renderer\.exposed\)[\s\S]*submitForms[\s\S]*saveFormSource/,
  'The page renderer must expose an awaited form submission operation to dialog hosts.'
);
assert.match(
  rendererSource,
  /submitForms\s*=\s*async[\s\S]*await this\.commitPendingFormValues\(\)[\s\S]*commitPendingFormValues\s*=\s*async/,
  'Outer dialog submission must commit pending field values before building the save payload.'
);
assert.match(
  lowCodeFormSource,
  /function commitPendingValues\([\s\S]*fieldRefs\.forEach[\s\S]*defineExpose\(\{[\s\S]*commitPendingValues/,
  'Forms must expose pending-field synchronization to page submission.'
);
assert.match(
  colorPickerSource,
  /reactData[\s\S]*defineExpose\(\{ commitPendingValue \}\)/,
  'Color pickers must expose their pending internal value to the outer form submit.'
);
assert.match(
  subFormSource,
  /lowCodeFormRef[\s\S]*commitPendingValue\(\)[\s\S]*commitPendingValues\(\)[\s\S]*defineExpose\(\{ commitPendingValue \}\)/,
  'Nested sub-forms must recursively commit pending field values.'
);
assert.match(
  pageDialogSource,
  /submitOnConfirm\?: boolean[\s\S]*await rendererRef\.value\?\.submitForms\(\)[\s\S]*if \(!submitted\) return false/,
  'A submit-on-confirm dialog must remain open when the page save fails.'
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
assert.match(
  appSource,
  /provideAppSystemSettings\(\)/,
  'The application root must provide per-user system settings.'
);
assert.match(
  mainSource,
  /installSystemSettingsListeners\(\)[\s\S]*await initializeSystemSettings\(\)[\s\S]*app\.mount\('#app'\)/,
  'System settings must be initialized before the root component is mounted.'
);
assert.doesNotMatch(
  appSource,
  /initializeSystemSettings\(/,
  'The root component must reuse the settings loaded before mount instead of initializing them again.'
);
assert.match(
  appSource,
  /watch\([\s\S]*auth\.user\.value\?\.id[\s\S]*loadSystemSettings\(true\)/,
  'A user change after mount must reload the provided settings context.'
);
assert.match(
  systemSettingsRuntimeSource,
  /enlearn:auth-user-changed[\s\S]*enlearn:account-changed[\s\S]*handleAuthenticatedScopeChange/,
  'Authentication and account changes must reload the provided settings context.'
);
assert.match(
  systemSettingsRuntimeSource,
  /resource:\s*SYSTEM_CONFIG_RESOURCE[\s\S]*normalizeSystemSettings\(row\)[\s\S]*VxeUI\.setConfig/,
  'System initialization must load the database configuration and apply global VXE defaults.'
);
assert.match(
  systemSettingsRuntimeSource,
  /if \(loadPromise && loadPromiseUserId === userId\) \{[\s\S]*if \(!force\) return loadPromise;[\s\S]*loadSequence \+= 1;/,
  'Concurrent settings loads must share normal requests while forced reloads invalidate stale requests.'
);
assert.match(
  systemSettingsRuntimeSource,
  /--app-primary-color[\s\S]*--lc-color-primary[\s\S]*--vxe-ui-font-primary-color/,
  'Theme colors must be exposed to application, low-code, and VXE components.'
);
assert.match(
  systemSettingsContextSource,
  /provideSystemSettings[\s\S]*useSystemSettings[\s\S]*mergeSystemTableOptions/,
  'Shared system settings must be injectable and expose a table-default resolver.'
);
assert.match(
  systemSettingsContextSource,
  /readExplicitHeight\([\s\S]*options\.rowHeight[\s\S]*systemTableConfig\.rowHeight/,
  'An explicit table row height must take precedence over the system default.'
);
assert.match(
  lowCodeGridSource,
  /mergeSystemTableOptions\([\s\S]*resolveSystemTableConfig\(systemSettings\)/,
  'Low-code grids must consume the injected system table defaults.'
);
assert.match(
  arrayTableSource,
  /v-bind="tableConfig"[\s\S]*mergeSystemTableOptions\([\s\S]*resolveSystemTableConfig\(systemSettings\)/,
  'Array tables must consume system table defaults while retaining local overrides.'
);
assert.match(
  dashboardLayoutSource,
  /event\.name === 'form\.saved'[\s\S]*loadSystemSettings\(true\)/,
  'Saving the settings dialog must refresh the provided runtime configuration.'
);
assert.match(
  dashboardRouteSource,
  /event\.name === 'form\.saved'[\s\S]*system-settings-edit[\s\S]*notifySystemSettingsChanged\(\)/,
  'Saving the standalone system-settings page must refresh the provided runtime configuration.'
);

console.log('System settings page regression test passed.');
