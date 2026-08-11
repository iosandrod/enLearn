import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [
  componentSource,
  relateSource,
  materialSource,
  fieldSource,
  formSource,
  formBlockSource,
  searchFormBlockSource,
  fieldEditorSource,
  runtimeDesignerSource,
  visualDesignerSource,
  visualConverterSource,
  pageRendererSource,
  typesSource,
  migrationSource,
  followupMigrationSource,
  applyScriptSource,
  operationMaterialMigrationSource,
  operationMaterialApplyScriptSource,
] = await Promise.all([
  readFile(new URL('lowcode/form-materials/base-info/index.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/form-materials/base-info/relate-info.ts', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/form-materials/base-info/index.ts', frameworkRoot), 'utf8'),
  readFile(new URL('components/LowCodeFormField.vue', frameworkRoot), 'utf8'),
  readFile(new URL('components/LowCodeForm.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/form/index.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/search-form/index.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/runtime-form-field-editor.ts', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/runtime-form-designer.ts', frameworkRoot), 'utf8'),
  readFile(new URL('visual-editor/components/form-designer/form-designer.service.tsx', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/visual-converters/index.ts', frameworkRoot), 'utf8'),
  readFile(new URL('components/LowCodePageRenderer.vue', frameworkRoot), 'utf8'),
  readFile(new URL('types/lowcode.ts', frameworkRoot), 'utf8'),
  readFile(new URL('../../../supabase/migrations/20260812130000_runtime_form_field_component_type.sql', frameworkRoot), 'utf8'),
  readFile(new URL('../../../supabase/migrations/20260812143000_runtime_form_field_base_info.sql', frameworkRoot), 'utf8'),
  readFile(new URL('../../../api/scripts/apply-runtime-form-field-base-info.ts', frameworkRoot), 'utf8'),
  readFile(new URL('../../../supabase/migrations/20260812150000_planning_operationmaterial_base_info.sql', frameworkRoot), 'utf8'),
  readFile(new URL('../../../api/scripts/apply-planning-operationmaterial-base-info.ts', frameworkRoot), 'utf8'),
]);

assert.match(materialSource, /type: 'base-info'[^]*?label: '关联资料'/);
assert.match(
  componentSource,
  /<vxe-pulldown[^]*?<vxe-input[^]*?@focus="openPanel"[^]*?<template #dropdown>[^]*?<vxe-grid[^]*?@cell-dblclick="handleRowDblclick"/,
  'Base-info must use VXE input, pulldown, and a double-click selection grid.',
);
assert.match(
  componentSource,
  /getLowCodePage[^]*?findRelateInfoGrid[^]*?page\.schema\.dataSources[^]*?loadEntityMetadata[^]*?resolveEntityRequest/,
  'Base-info must resolve low-code page and entity metadata sources.',
);
assert.match(
  componentSource,
  /extractRelateInfoRows\(result[^]*?resolveRelateInfoColumns[^]*?emit\('patchModel', \{ values, row \}\)[^]*?emit\('select', \{ row, values \}\)[^]*?hidePanel/,
  'A selected row must patch mapped values, return the complete row, and close the panel.',
);
assert.match(
  componentSource,
  /watch\(selectedValueIdentity[^]*?loadSelectedDisplayValue[^]*?\[valueField\]: expectedValue[^]*?\[displayTarget\]: label/,
  'Stored relation values must resolve and persist their display label on edit-page hydration.',
);
assert.match(
  relateSource,
  /normalizeRelateInfoMappings[^]*?mapRelateInfoRow[^]*?getRelateInfoDisplayValueTarget[^]*?findRelateInfoGrid[^]*?isMainGrid/,
  'Mapping and main-grid selection must be centralized in testable helpers.',
);
assert.match(
  fieldSource,
  /:form-values="formValues"[^]*?@patch-model="handlePatchModel"[^]*?@select="handleSelect"/,
  'LowCodeFormField must forward form context and relation events.',
);
assert.match(
  formSource,
  /function patchFieldValues[^]*?Object\.entries\(payload\.values\)[^]*?formData\[field\] = value[^]*?updateStatus[^]*?emit\('fieldChange'/,
  'LowCodeForm must merge all mapped fields and refresh their validation state.',
);
assert.match(
  formBlockSource,
  /@relate-select="handleRelateSelect"[^]*?emitRuntimeEvent\('form\.relateSelect'/,
  'Edit forms must publish the selected complete relation row.',
);
assert.match(
  searchFormBlockSource,
  /@relate-select="handleRelateSelect"[^]*?emitRuntimeEvent\('searchForm\.relateSelect'/,
  'Search forms must publish the selected complete relation row.',
);
assert.match(
  fieldEditorSource,
  /relateInfoConfig: createRelateInfoConfig\(field\)[^]*?component === 'base-info'[^]*?createDefaultRelateInfoConfig\(field\.field\)[^]*?props\.relateInfoConfig = relateInfoConfig/,
  'The runtime field editor must round-trip relateInfoConfig in field.props.',
);
assert.match(
  runtimeDesignerSource,
  /originalProps[^]*?cloneValue\(designed\.props[^]*?designerModel: isDesignerModelCurrent\(block\)[^]*?block\.formDesignerModel[^]*?: null/,
  'Full-form design must rebuild stale models and retain arbitrary field props.',
);
assert.match(
  visualDesignerSource,
  /'base-info': 'input'[^]*?runtimeComponent === 'base-info'[^]*?block\.props\.__lowcodeComponent = 'base-info'[^]*?result\.propsJson = stringifyFieldProps/,
  'The visual designer must preserve the base-info runtime component override.',
);
assert.match(
  visualConverterSource,
  /'base-info': 'input'[^]*?field\.component === 'base-info'[^]*?Object\.assign\(block\.props[^]*?field\.component === 'base-info'[^]*?cloneJson\(props\)/,
  'Schema/visual conversion must carry relation props in both directions.',
);
assert.match(
  pageRendererSource,
  /visualProps\.formDesignerModel = cloneRuntimeValue\([^]*?'formDesignerModel' in update\.changes[^]*?: null/,
  'Current-field edits must refresh the page-owned visual designer model.',
);
assert.match(typesSource, /\| 'base-info'[^]*?LowCodeRelateInfoConfig[^]*?fieldMappings/);
assert.match(
  migrationSource,
  /'base-info'[^]*?v_option_count <> 17/,
  'The component option migration must include base-info in all validation counts.',
);
assert.match(
  followupMigrationSource,
  /"field": "relateInfoConfig"[^]*?"component": "lc-sub-form"[^]*?"field": "fieldMappings"[^]*?"component": "lc-array-table"[^]*?"sourceField"[^]*?"targetField"/,
  'Existing databases must receive the sub-form and multi-mapping editor.',
);
assert.match(
  applyScriptSource,
  /item_count !== 17[^]*?has_base_info[^]*?config_field\?\.component !== 'lc-sub-form'[^]*?mappingField\?\.component !== 'lc-array-table'/,
  'The database runner must verify the installed relation editor.',
);
assert.match(
  operationMaterialMigrationSource,
  /planning_operationmaterial-edit[^]*?planning_operationmaterial_edit_form[^]*?item_id[^]*?"base-info"[^]*?planning_item[^]*?fieldMappings/,
  'The operation-material item field must use base-info with a planning-item mapping.',
);
assert.match(
  operationMaterialApplyScriptSource,
  /20260812150000_planning_operationmaterial_base_info\.sql[^]*?field\?\.component !== 'base-info'[^]*?targetField !== 'item_id'/,
  'The operation-material database runner must verify the installed base-info field.',
);

console.log('Base-info form material regression test passed.');
