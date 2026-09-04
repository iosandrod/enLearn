import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [
  formSource,
  formBlockSource,
  searchFormBlockSource,
  runtimeDesignerSource,
  fieldEditorSource,
  designerSource,
  migrationSource,
  optionSourceMigrationSource,
  modeDisabledMigrationSource,
  componentTypeMigrationSource,
  baseInfoMigrationSource,
  tabLayoutMigrationSource,
  procedureMigrationSource,
  converterHelpersSource,
  rendererSource,
] = await Promise.all([
  readFile(new URL('components/LowCodeForm.vue', frameworkRoot), 'utf8'),
  readLowCodeMaterialSource('page', 'form'),
  readLowCodeMaterialSource('page', 'searchForm'),
  readFile(new URL('lowcode/block-materials/runtime-form-designer.ts', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/runtime-form-field-editor.ts', frameworkRoot), 'utf8'),
  readFile(
    new URL('visual-editor/components/form-designer/form-designer.service.tsx', frameworkRoot),
    'utf8',
  ),
  readFile(new URL('../../../supabase/migrations/20260811160000_runtime_form_field_editor.sql', frameworkRoot), 'utf8'),
  readFile(new URL('../../../supabase/migrations/20260812100000_runtime_form_field_editor_option_source_select.sql', frameworkRoot), 'utf8'),
  readFile(new URL('../../../supabase/migrations/20260812113000_runtime_form_field_mode_disabled.sql', frameworkRoot), 'utf8'),
  readFile(new URL('../../../supabase/migrations/20260812130000_runtime_form_field_component_type.sql', frameworkRoot), 'utf8'),
  readFile(new URL('../../../supabase/migrations/20260812143000_runtime_form_field_base_info.sql', frameworkRoot), 'utf8'),
  readFile(new URL('../../../supabase/migrations/20260812160000_runtime_form_field_editor_tabs.sql', frameworkRoot), 'utf8'),
  readFile(new URL('../../../supabase/migrations/20260812200000_runtime_form_default_value_procedure.sql', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/visual-converters/helpers.ts', frameworkRoot), 'utf8'),
  readFile(new URL('components/LowCodePageRenderer.vue', frameworkRoot), 'utf8'),
]);

assert.match(
  formSource,
  /@contextmenu="handleLabelContextMenu"[\s\S]*?target\.closest\('\.vxe-form--item-title'\)/,
  'LowCodeForm must only promote context menus that originate from a rendered field label.',
);
assert.match(
  formSource,
  /if \(!props\.labelContextMenu\) return;[\s\S]*?data-lc-field[\s\S]*?fieldsByKey\.value\[fieldName\][\s\S]*?event\.preventDefault\(\);[\s\S]*?emit\('labelContextMenu', event, field\)/,
  'The native context menu should be suppressed only when label design is enabled.',
);

for (const source of [formBlockSource, searchFormBlockSource]) {
  assert.match(source, /label-context-menu/, 'Runtime forms must enable label context menus.');
  assert.match(
    source,
    /<LowCodeForm[\s\S]*?:key="block\.formDesignerUpdatedAt \?\? 0"/,
    'Runtime forms must remount after a successful designer save so VXE rebuilds the layout.',
  );
  assert.match(
    source,
    /@label-context-menu="openFormContextMenu"/,
    'Runtime forms must handle the promoted label context-menu event.',
  );
  assert.match(
    source,
    /openRuntimeFormDesigner\(props\.block, '(edit|search)', runtimeBlockEditor\)[\s\S]*?openRuntimeFormFieldEditor\(props\.block, field, runtimeBlockEditor\)/,
    'Runtime forms must keep full-form design and field-property editing separate.',
  );
}
assert.match(
  formBlockSource,
  /:mode="formMode"[\s\S]*?pageRuntime\?\.state\.status\.formMode/,
  'Edit-form blocks must receive the reactive edit-page mode.',
);
assert.doesNotMatch(
  searchFormBlockSource,
  /:mode="formMode"/,
  'Search forms must remain interactive because they filter data rather than mutate the document.',
);

assert.match(
  runtimeDesignerSource,
  /code: 'design-current-form',[\s\S]*?name: '设计当前表单'/,
  'The context menu must expose the requested design-current-form action.',
);
assert.match(
  runtimeDesignerSource,
  /code: 'design-current-field',[\s\S]*?name: '设计当前字段'/,
  'The context menu must expose the requested design-current-field action.',
);
assert.match(
  fieldEditorSource,
  /RUNTIME_FORM_FIELD_EDITOR_CODE = 'runtime-form-field-editor'[\s\S]*?loadLowCodeFormDefinition[\s\S]*?openGlobalDialog<FieldEditorModel>/,
  'The field editor must load its LowCodeForm schema from the database and use a lightweight dialog.',
);
assert.match(
  fieldEditorSource,
  /preloadEditorOptionSources[\s\S]*?lowCodeOptionSourceRegistry\.refresh[\s\S]*?await preloadEditorOptionSources\(definition\.schema, serviceApi\)[\s\S]*?openGlobalDialog<FieldEditorModel>/,
  'The field editor must preload select option sources through its page-owned service API.',
);
assert.match(
  fieldEditorSource,
  /schema: \{[\s\S]*?fields,[\s\S]*?initialValues: createUpdatedInitialValues/,
  'The field editor must persist only the selected field schema and its initial value.',
);
assert.match(
  fieldEditorSource,
  /component: field\.component[\s\S]*?createDisabled: field\.createDisabled === true[\s\S]*?editDisabled: field\.editDisabled === true[\s\S]*?component = readString\(values\.component\)[\s\S]*?component,[\s\S]*?values\.createDisabled === true[\s\S]*?values\.editDisabled === true/,
  'The field editor must round-trip component and create/edit disabled settings.',
);
assert.match(
  fieldEditorSource,
  /defaultValueProcedure[\s\S]*?defaultValueType: 'procedure'[\s\S]*?listDefaultValueProcedures/,
  'The field editor must load and persist a selected default-value procedure.',
);
assert.match(
  procedureMigrationSource,
  /read_lowcode_default_value_procedure[\s\S]*?pronargs = 0[\s\S]*?proretset = false[\s\S]*?has_function_privilege\(current_user[\s\S]*?'value', 'procedure'[\s\S]*?defaultValueProcedure/,
  'The migration must expose executable scalar procedures and add the procedure selector.',
);
assert.doesNotMatch(
  procedureMigrationSource,
  /pg_catalog\.current_user/,
  'PostgreSQL special values such as current_user must not be schema-qualified.',
);
assert.match(
  migrationSource,
  /'runtime-form-field-editor'[\s\S]*?"field": "label"[\s\S]*?"field": "component"[\s\S]*?"optionsCode": "form_field_component_type"[\s\S]*?"field": "required"[\s\S]*?"field": "createDisabled"[\s\S]*?"field": "editDisabled"[\s\S]*?"field": "defaultValueType"[\s\S]*?"field": "optionsCode"[\s\S]*?"field": "updateScript"[\s\S]*?"field": "validationScript"/,
  'The database form schema must expose all requested field properties.',
);
assert.match(
  migrationSource,
  /"field": "optionsCode"[\s\S]*?"component": "vxe-select"[\s\S]*?"optionsCode": "option_source_code"[\s\S]*?"filterable": true[\s\S]*?"allowCreate": true/,
  'The option-source code property must be a searchable select that can add a typed entry.',
);
assert.match(
  optionSourceMigrationSource,
  /create or replace view public\.system_option_source_code_options[\s\S]*?sources\.code::text as value[\s\S]*?sources\.name \|\| ' \(' \|\| sources\.code \|\| '\)'/,
  'The option-source Code select must list active source names and codes.',
);
assert.match(
  optionSourceMigrationSource,
  /'option_source_code'[\s\S]*?'view'[\s\S]*?'public\.system_option_source_code_options'[\s\S]*?update public\.lowcode_form_definitions/,
  'Existing databases must receive the option source and updated field-editor definition.',
);
for (const field of ['createDisabled', 'editDisabled']) {
  assert.match(
    modeDisabledMigrationSource,
    new RegExp(
      `jsonb_insert\\([\\s\\S]*?"field": "${field}"[\\s\\S]*?where definitions\\.code = 'runtime-form-field-editor'[\\s\\S]*?not coalesce\\(definitions\\.schema -> 'fields'[\\s\\S]*?@> '\\[\\{"field":"${field}"\\}\\]'::jsonb`,
    ),
    `Existing databases must conditionally receive the ${field} switch.`,
  );
}
assert.match(
  modeDisabledMigrationSource,
  /notify pgrst, 'reload schema'/,
  'The mode-disabled migration must refresh the PostgREST schema cache.',
);
assert.match(
  componentTypeMigrationSource,
  /'form_field_component_type'[\s\S]*?'vxe-input'[\s\S]*?'vxe-select'[\s\S]*?'lc-number-input'[\s\S]*?'base-info'[\s\S]*?'lc-sub-form'/,
  'The component selector must be backed by the supported runtime form materials.',
);
assert.match(
  baseInfoMigrationSource,
  /'base-info'[\s\S]*?"field": "relateInfoConfig"[\s\S]*?"component": "lc-sub-form"[\s\S]*?"field": "fieldMappings"[\s\S]*?"component": "lc-array-table"/,
  'Existing databases must receive the base-info option and relation sub-form.',
);
assert.match(
  migrationSource,
  /"layout": \[[\s\S]*?"kind": "tabs"[\s\S]*?"key": "basic"[\s\S]*?"key": "relation"[\s\S]*?"field": "relateInfoConfig"[\s\S]*?"key": "default-options"[\s\S]*?"key": "events-validation"/,
  'Fresh databases must seed the runtime field editor with a tabbed schema layout.',
);
assert.match(
  tabLayoutMigrationSource,
  /jsonb_set\([\s\S]*?'\{layout\}'[\s\S]*?"kind": "tabs"[\s\S]*?"key": "basic"[\s\S]*?"key": "relation"[\s\S]*?"key": "default-options"[\s\S]*?"key": "events-validation"/,
  'Existing databases must receive the runtime field editor tab layout.',
);
assert.match(
  tabLayoutMigrationSource,
  /with recursive layout_nodes[\s\S]*?v_layout_fields <> v_schema_fields/,
  'The tab-layout migration must verify that every editor field remains reachable.',
);
assert.match(
  componentTypeMigrationSource,
  /update public\.lowcode_form_definitions[\s\S]*?'field', 'component'[\s\S]*?'component', 'vxe-select'[\s\S]*?'optionsCode', 'form_field_component_type'/,
  'Existing databases must receive the component-type select in the runtime field editor.',
);
assert.match(
  componentTypeMigrationSource,
  /existing_field->>'field' = 'required'[\s\S]*?limit 1/,
  'The component selector must be inserted immediately before the required switch.',
);
assert.doesNotMatch(
  fieldEditorSource,
  /\$\$formDesigner|form-designer-dialog|selectedField/,
  'Designing one field must not invoke the full drag-and-drop form designer.',
);
assert.match(
  runtimeDesignerSource,
  /fields: block\.schema\.fields\.map\(runtimeFieldToDesignerField\),[\s\S]*?layout: block\.schema\.layout,[\s\S]*?columns: block\.schema\.columns/,
  'The designer must receive the current form fields and layout metadata.',
);
assert.match(
  runtimeDesignerSource,
  /required: field\.rules\?\.some\(\(rule\) => rule\.required === true\)/,
  'Runtime validation rules must be adapted to the designer required flag.',
);
assert.match(
  runtimeDesignerSource,
  /await runtimeBlockEditor\.updateBlock\([\s\S]*?schema: mergeRuntimeFormSchema[\s\S]*?formDesignerModel: result\.designerModel/,
  'Confirming form design must persist both the runtime schema and designer model.',
);
assert.match(
  runtimeDesignerSource,
  /actions: cloneValue\(original\.actions \?\? \[\]\)/,
  'Form design must retain existing runtime actions.',
);
assert.match(
  runtimeDesignerSource,
  /const props = cloneValue\(field\.props \?\? \{\}\)[\s\S]*?propsJson[\s\S]*?originalProps[\s\S]*?cloneValue\(designed\.props/,
  'Full-form design must preserve base-info relateInfoConfig in field props.',
);
assert.match(
  runtimeDesignerSource,
  /'defaultValueType',[\s\S]*?'defaultValue',[\s\S]*?'defaultValueProcedure',[\s\S]*?'updateScript',[\s\S]*?'validationScript',[\s\S]*?'validationMessage',[\s\S]*?designed\[key\][\s\S]*?original\[key\][\s\S]*?\['createDisabled', 'editDisabled'\][\s\S]*?original\[key\]/,
  'Full-form design must preserve field default metadata and prefer newly designed values.',
);
assert.match(
  runtimeDesignerSource,
  /defaultValueType: field\.defaultValueType,[\s\S]*?defaultValue: cloneValue\(field\.defaultValue\),[\s\S]*?defaultValueProcedure: field\.defaultValueProcedure/,
  'Full-form design must supply dynamic default metadata to the visual designer.',
);
assert.match(
  runtimeDesignerSource,
  /legacyDefaultValueScript[\s\S]*?merged\.defaultValueType === 'function'[\s\S]*?merged\.defaultValue = legacyDefaultValueScript[\s\S]*?delete \(merged as Record<string, unknown>\)\.defaultValueScript/,
  'Full-form saves must migrate any stale defaultValueScript value and never write the legacy key back.',
);
assert.match(
  formSource,
  /:disabled="isFieldDisabled\(field\)"[\s\S]*?disabled: props\.disabled \|\| isLowCodeEditPageReadonly\(props\.mode\)[\s\S]*?isLowCodeEditPageFieldDisabled\(field, props\.mode\)/,
  'LowCodeForm must keep input components rendered and disable them for scan or field-specific modes.',
);
assert.match(
  formSource,
  /function setFieldValue[\s\S]*?isFormInteractionBlocked\.value \|\| isFieldDisabled\(field\)[\s\S]*?function patchFieldValues[\s\S]*?isFieldDisabled\(sourceField\)/,
  'Read-only and mode-disabled fields must reject updates emitted by custom form materials.',
);
assert.match(
  formBlockSource,
  /function isFormInteractionBlocked\(\)[\s\S]*?formMode\.value === 'scan'[\s\S]*?function updateFormModel[\s\S]*?isFormInteractionBlocked\(\)/,
  'The form block boundary must reject custom-material updates while the page is in scan mode.',
);
assert.match(
  formSource,
  /formRules = computed[\s\S]*?isFieldDisabled\(field\)[\s\S]*?return rules/,
  'Disabled fields must not run required or script validation.',
);

assert.match(
  designerSource,
  /function layoutNodesToBlocks[\s\S]*?componentMap\.layout[\s\S]*?block\.props\.slots = createLayoutSlots/,
  'Schema-only forms must reconstruct their existing row/column layout on first design.',
);
assert.match(
  designerSource,
  /columnCount - occupiedColumns[\s\S]*?blocks: \[\]/,
  'Schema-only forms must retain trailing empty columns in partially filled rows.',
);
assert.match(
  converterHelpersSource,
  /columns\.some\(\(column\) => column\.blocks\.length > 0\)/,
  'Saving a designed row must retain empty layout columns used as spacing.',
);
assert.match(
  converterHelpersSource,
  /preservedByField[\s\S]*?cloneJson\(preserved\)[\s\S]*?\.\.\.field/,
  'Visual round trips must retain field metadata not owned by the visual field row.',
);
assert.match(
  designerSource,
  /onConfirm: async \(\)[\s\S]*?await state\.option\.onConfirm[\s\S]*?methods\.hide\(\)/,
  'The form designer must finish persistence before closing.',
);

assert.match(
  rendererSource,
  /function persistRuntimeBlockUpdate[\s\S]*?resource: 'lowcode_pages'[\s\S]*?schema: nextSchema/,
  'Runtime form edits must use the existing page persistence bridge.',
);
assert.match(
  rendererSource,
  /Object\.assign\(props\.page, saved\);[\s\S]*?const renderedBlock = flattenPageBlocks\(props\.page\.schema\)\.find[\s\S]*?Object\.assign\(renderedBlock, cloneRuntimeValue\(update\.changes\)\)/,
  'A saved runtime block must also be patched in place so the rendered page updates immediately.',
);
assert.match(
  rendererSource,
  /const runtimeBlockRenderRevision = ref\(0\);[\s\S]*?const layoutBlocks = computed[\s\S]*?runtimeBlockRenderRevision\.value[\s\S]*?runtimeBlockRenderRevision\.value \+= 1/,
  'Runtime block saves must invalidate rendering even when the host page object is not deeply reactive.',
);
assert.match(
  rendererSource,
  /runtimeBlockReloadSuppression = reloadSuppression;[\s\S]*?Object\.assign\(props\.page, saved\);[\s\S]*?runtimeBlockReloadSuppression\?\.pageId === nextPage[\s\S]*?return;/,
  'A local designer save must not reload page data and discard current form values.',
);
assert.match(
  rendererSource,
  /targetBlock\.kind === 'form' \|\| targetBlock\.kind === 'searchForm'[\s\S]*?visualProps\.formDesignerModel/,
  'Runtime form edits must also update a stored page-level visual model when present.',
);

console.log('Runtime form-label context menu regression test passed.');
