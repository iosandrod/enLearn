import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const saveDialogMigration = await readFile(
  new URL('../../supabase/migrations/20260923160000_print_template_lowcode_save_dialog.sql', import.meta.url),
  'utf8',
);
const designer = await readFile(
  new URL('../pages/dashboard/advanced/print-designer.vue', import.meta.url),
  'utf8',
);
const dialog = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/page-reference-dialog.tsx', import.meta.url),
  'utf8',
);
const runtime = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/lowcode-page-script-runtime.ts', import.meta.url),
  'utf8',
);
const editDialogMigration = await readFile(
  new URL('../../supabase/migrations/20260923170000_print_template_edit_dialog_actions.sql', import.meta.url),
  'utf8',
);
const directDialogMigration = await readFile(
  new URL('../../supabase/migrations/20260923180000_print_template_save_direct_dialog.sql', import.meta.url),
  'utf8',
);
const currentRecordMigration = await readFile(
  new URL('../../supabase/migrations/20260923190000_print_template_dialog_current_record.sql', import.meta.url),
  'utf8',
);
const autoLoadMigration = await readFile(
  new URL('../../supabase/migrations/20260923200000_print_template_disable_dialog_autoload.sql', import.meta.url),
  'utf8',
);
const keepDesignerMigration = await readFile(
  new URL('../../supabase/migrations/20260923210000_print_template_keep_designer_instance.sql', import.meta.url),
  'utf8',
);
const materialStateMigration = await readFile(
  new URL('../../supabase/migrations/20260923220000_print_template_material_state.sql', import.meta.url),
  'utf8',
);
const rendererTypes = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/renderer-types.ts', import.meta.url),
  'utf8',
);
const pageDataController = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/page-data-controller.ts', import.meta.url),
  'utf8',
);
const rendererRuntime = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/useLowCodePageRenderer.ts', import.meta.url),
  'utf8',
);
const formConverter = await readFile(
  new URL('../../packages/lowcode-framework/src/lowcode/visual-converters/lowcode-edit-form/index.ts', import.meta.url),
  'utf8',
);

assert.match(saveDialogMigration, /pageCode: 'print-templates-edit'/);
assert.match(saveDialogMigration, /submitOnConfirm: true/);
assert.match(saveDialogMigration, /formInitialValues:[\s\S]*print-templates-edit-form/);
assert.match(saveDialogMigration, /method: 'getData'/);
assert.match(saveDialogMigration, /method: 'save',[\s\S]*savedRecord/);
assert.match(designer, /formInitialValues:[\s\S]*submitOnConfirm: true/);
assert.match(designer, /disableFormAutoLoad: true,[\s\S]*disablePageAutoLoad: true/);
assert.match(designer, /page: createTemplateSaveDialogPage\(editPage\)/);
assert.match(designer, /blocks:[\s\S]*filter\(\(block\) => block\.kind !== 'buttonGroup'\)/);
assert.match(designer, /schema: \{ \.\.\.block\.schema, actions: \[\] \}/);
assert.match(designer, /payload\?\.savedRecord/);
assert.match(designer, /const template = mode === 'save' \? selectedTemplate\.value : null/);
assert.match(designer, /id: template\?\.id \?\? ''/);
assert.match(designer, /content: cloneJson\(snapshot\.content\)/);
assert.match(designer, /workspace: cloneJson\(snapshot\.workspace\)/);
assert.doesNotMatch(designer, /async function persistTemplateFromDialog/);
assert.doesNotMatch(designer, /syncRouteTemplateId/);
assert.doesNotMatch(designer, /router\.replace\(\{ query \}\)/);
assert.match(dialog, /code: 'confirm',[\s\S]*role: 'confirm'/);
assert.match(
  dialog,
  /submitOnConfirm[\s\S]*submitForms\(\{ reload: false \}\)/,
  'Confirm dialogs must resolve after saving instead of waiting for a page data reload.',
);
assert.match(runtime, /case 'material\.save':[\s\S]*executeLowCodeMaterialRuntimeAction\(block\.id, 'save', payload\)/);
assert.match(editDialogMigration, /where page\.code = 'print-templates-edit'/);
assert.match(editDialogMigration, /block\.value ->> 'kind' <> 'buttonGroup'/);
assert.match(directDialogMigration, /when action\.value ->> 'code' = 'label-save'/);
assert.match(directDialogMigration, /await this\.\$dialog\.confirmLowCodePage\(\{/);
assert.doesNotMatch(directDialogMigration, /name: 'confirmLowCodePage'/);
assert.match(currentRecordMigration, /templateStatus: result\.row\.status/);
assert.match(currentRecordMigration, /templateVersion: result\.row\.version/);
assert.match(currentRecordMigration, /status: templateStatus,[\s\S]*version: templateVersion/);
assert.match(currentRecordMigration, /delete query\.templateStatus;[\s\S]*delete query\.templateVersion/);
assert.match(autoLoadMigration, /disablePageAutoLoad: true/);
assert.match(keepDesignerMigration, /label-load/);
assert.match(keepDesignerMigration, /label-new/);
assert.match(keepDesignerMigration, /label-save/);
assert.doesNotMatch(keepDesignerMigration, /\$router\.push/);
assert.match(materialStateMigration, /const templateId = ref\(''\)/);
assert.match(materialStateMigration, /templateId\.value = String\(row\.id \|\| requestedId\)/);
assert.match(materialStateMigration, /getTemplateInfo: \(\) =>/);
assert.match(materialStateMigration, /method: 'getTemplateInfo'/);
assert.match(materialStateMigration, /const info = await this\.executeAction\(\{ node: 'label-designer-canvas', method: 'getTemplateInfo' \}\)/);
assert.doesNotMatch(materialStateMigration, /const templateId = String\(this\.route\?\.query\?\.templateId/);
assert.match(rendererTypes, /disablePageAutoLoad\?: boolean/);
assert.match(runtime, /'disablePageAutoLoad'/);
assert.match(runtime, /request\.name === 'router\.push'[\s\S]*getRouter\(\)\.push/);
assert.match(pageDataController, /if \(options\.disablePageAutoLoad === true \|\| options\.skipDataSources\)[\s\S]*captureFormBaselines\(\)[\s\S]*return \[\]/);
assert.match(pageDataController, /options: \{ skipDataSources\?: boolean; disablePageAutoLoad\?: boolean \}/);
assert.match(pageDataController, /if \(options\.disablePageAutoLoad === true \|\| options\.skipDataSources\)/);
assert.match(pageDataController, /resolveRuntimePostData\(source\.savePostData\)/);
assert.match(pageDataController, /const savePostData:[\s\S]*\.\.\.configuredSavePostData,[\s\S]*\.\.\.values/);
assert.doesNotMatch(pageDataController, /\.\.\.request\.postData,[\s\S]*\.\.\.values/);
assert.match(formConverter, /savePostDataJson: '\{\}'/);
assert.match(rendererRuntime, /disablePageAutoLoad: props\.disablePageAutoLoad === true,[\s\S]*skipDataSources: props\.disablePageAutoLoad === true/);
assert.match(rendererRuntime, /skipDataSources: props\.disablePageAutoLoad === true/);

console.log('Print template save dialog regression test passed.');
