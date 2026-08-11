import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [
  formSource,
  formBlockSource,
  searchFormBlockSource,
  runtimeDesignerSource,
  fieldEditorSource,
  designerSource,
  migrationSource,
  converterHelpersSource,
  rendererSource,
] = await Promise.all([
  readFile(new URL('components/LowCodeForm.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/form/index.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/search-form/index.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/runtime-form-designer.ts', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/runtime-form-field-editor.ts', frameworkRoot), 'utf8'),
  readFile(
    new URL('visual-editor/components/form-designer/form-designer.service.tsx', frameworkRoot),
    'utf8',
  ),
  readFile(new URL('../../../supabase/migrations/20260811160000_runtime_form_field_editor.sql', frameworkRoot), 'utf8'),
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
  /schema: \{[\s\S]*?fields,[\s\S]*?initialValues: createUpdatedInitialValues/,
  'The field editor must persist only the selected field schema and its initial value.',
);
assert.match(
  migrationSource,
  /'runtime-form-field-editor'[\s\S]*?"field": "required"[\s\S]*?"field": "defaultValueType"[\s\S]*?"field": "optionsCode"[\s\S]*?"field": "updateScript"[\s\S]*?"field": "validationScript"/,
  'The database form schema must expose all requested field properties.',
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
  /'defaultValueType',[\s\S]*?'defaultValueScript',[\s\S]*?'updateScript',[\s\S]*?'validationScript',[\s\S]*?'validationMessage',[\s\S]*?original\[key\]/,
  'Full-form design must preserve field scripts configured by the lightweight editor.',
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
