import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

const [
  database,
  registry,
  visualProps,
  provider,
  attrEditor,
  panelStyles,
  materialsApi,
  migration,
  formInputTypeMigration,
  removeDatetimePickerMigration,
  pickerOptionSourceMigration,
  designerPage,
  emptyDesignerPage,
  designerUi,
] = await Promise.all([
  source('packages/lowcode-framework/src/visual-editor/material-prop-forms/database.ts'),
  source('packages/lowcode-framework/src/visual-editor/material-prop-forms/registry.ts'),
  source('packages/lowcode-framework/src/visual-editor/material-prop-forms/visual-props.ts'),
  source('packages/lowcode-framework/src/components/VisualEditorProvider.vue'),
  source('packages/lowcode-framework/src/visual-editor/components/right-attribute-panel/components/attr-editor/index.tsx'),
  source('packages/lowcode-framework/src/visual-editor/components/right-attribute-panel/index.module.scss'),
  source('packages/lowcode-framework/src/materials/index.ts'),
  source('supabase/migrations/20260819100000_database_only_material_property_forms.sql'),
  source('supabase/migrations/20260823120000_form_input_component_type_options.sql'),
  source('supabase/migrations/20260828110000_remove_datetime_picker_form_component_type.sql'),
  source('supabase/migrations/20260823130000_picker_option_source_code_property.sql'),
  source('frontend/pages/dashboard/low-code/designer/[code].vue'),
  source('frontend/pages/dashboard/low-code/designer/index.vue'),
  source('packages/lowcode-framework/src/visual-editor/components/common/designer-ui/index.tsx'),
]);

assert.match(database, /MATERIAL_PROP_FORM_CODE_PREFIX = 'material-prop\.'/);
assert.match(database, /componentKey\.trim\(\)\.toLowerCase\(\)/);
assert.match(database, /resource: 'lowcode_form_definitions'/);
assert.match(database, /filters:\s*\{\s*code,\s*enabled: true/);
assert.match(database, /limit: 1/);
assert.match(database, /layout\.length === 1/);
assert.match(database, /layout\[0\]\.kind === 'tabs'/);
assert.match(database, /layout\[0\]\.tabs\.length > 0/);
assert.doesNotMatch(database, /op:\s*'startsWith'|loadDatabaseMaterialPropForms/);

assert.match(registry, /const definitionMap/);
assert.doesNotMatch(registry, /import\.meta\.glob|mergeBuiltinFields|materials\//);
assert.doesNotMatch(materialsApi, /registerMaterialPropForm/);
assert.doesNotMatch(visualProps, /VisualEditorProps|promoteArrayTableFieldsToTabs|mergeBuiltinFields|extendsVisualProps/);
assert.doesNotMatch(provider, /loadDatabaseMaterialPropForm/);
assert.match(attrEditor, /loadDatabaseMaterialPropForm\(host\.getServiceApi\(\), componentKey\)/);
assert.match(attrEditor, /watch\(\s*\(\) => getMaterialPropComponentKey\(currentBlock\.value\?\.componentKey\)/);
assert.match(attrEditor, /getMaterialPropComponentKey/);
assert.match(attrEditor, /componentTypeVisualMap\[key\] \?\? key/);
assert.match(attrEditor, /formInputComponentTypeOptionCode = 'form_input_component_type'/);
assert.match(
  attrEditor,
  /lowCodeOptionSourceRegistry\.refresh\([\s\S]*?componentTypeOptionCodes/,
  'The component selector must load both the visual and runtime input option sources.',
);
assert.match(attrEditor, /formFieldComponentTypeOptionCode/);
assert.match(attrEditor, /componentTypeVisualMap[\s\S]*?'vxe-textarea'[\s\S]*?'lc-monaco-editor'/);
assert.match(attrEditor, /nextRuntimeComponent[\s\S]*?__lowcodeComponent/);
for (const runtimeComponent of [
  'vxe-input',
  'vxe-textarea',
  'vxe-select',
  'vxe-switch',
  'vxe-password-input',
  'vxe-checkbox-group',
  'vxe-radio-group',
  'vxe-tree-select',
  'lc-cascader',
  'lc-number-input',
  'lc-color-picker',
  'lc-option-select',
  'lc-json-editor',
  'lc-monaco-editor',
  'base-info',
  'lc-array-table',
  'lc-sub-form',
]) {
  assert.match(
    attrEditor,
    new RegExp(`['"]${runtimeComponent.replaceAll('-', '\\-')}['"]`),
    `missing visual mapping for ${runtimeComponent}`,
  );
}
assert.match(attrEditor, /componentTypeFormSchema/);
assert.match(attrEditor, /optionsSourceKey: componentTypeOptionsSourceKey/);
assert.match(attrEditor, /<LowCodeForm/);
assert.match(attrEditor, /className=\{styles\.componentTypeForm\}/);
assert.match(attrEditor, /onFieldChange=\{handleComponentTypeFormChange\}/);
assert.doesNotMatch(attrEditor, /<ElSelect/);
assert.match(attrEditor, /changeComponentType/);
assert.match(attrEditor, /visualConfig\.componentMap\[nextComponentKey\]/);
assert.match(attrEditor, /block\.componentKey = component\.key/);
assert.match(designerPage, /<LowCodeVisualDesigner[^>]*:service-api="serviceApi"/);
assert.match(designerPage, /const serviceApi = useServiceApi\(\)/);
assert.match(emptyDesignerPage, /<LowCodeVisualDesigner[^>]*:service-api="serviceApi"/);
assert.match(emptyDesignerPage, /const serviceApi = useServiceApi\(\)/);
assert.match(designerUi, /import VxeUITable, \{ VxeColumn, VxeGrid, VxeTable \} from 'vxe-table'/);
assert.match(designerUi, /app\.use\(installVxeUI\);[\s\S]*?app\.use\(VxeUITable\);/);

assert.match(panelStyles, /\.component-type-editor/);
assert.match(panelStyles, /\.component-type-form/);
assert.match(panelStyles, /\.material-prop-form \.lc-form-tabs/);
assert.match(panelStyles, /min-height: 36px/);
assert.match(panelStyles, /border-radius: 6px/);
assert.match(panelStyles, /display: block !important;/);
assert.match(panelStyles, /\.material-prop-form \.lc-array-table:not\(\.lc-array-table--fill\)/);
assert.match(panelStyles, /overflow-y: visible;/);

assert.match(formInputTypeMigration, /'form_input_component_type'/);
for (const componentKey of [
  'input',
  'picker',
  'switch',
  'checkbox',
  'radio',
  'stepper',
  'rate',
  'slider',
  'array-table',
  'sub-form',
]) {
  assert.match(
    formInputTypeMigration,
    new RegExp(`'form_input_component_type'[^\\n]+ '${componentKey.replace('-', '\\-')}'`),
    `missing form input component type option for ${componentKey}`,
  );
}
assert.match(formInputTypeMigration, /v_option_count <> 10/);
assert.match(removeDatetimePickerMigration, /value = 'datetimePicker'/);
assert.match(removeDatetimePickerMigration, /material-prop\.datetimepicker/);

assert.match(pickerOptionSourceMigration, /definitions\.code = 'material-prop\.picker'/);
assert.match(pickerOptionSourceMigration, /'field', '__lowcodeOptionsCode'/);
assert.match(pickerOptionSourceMigration, /'path', '__lowcodeOptionsCode'/);
assert.match(pickerOptionSourceMigration, /'component', 'vxe-select'/);
assert.match(pickerOptionSourceMigration, /'optionsCode', 'option_source_code'/);
assert.match(pickerOptionSourceMigration, /'allowCreate', true/);
assert.match(pickerOptionSourceMigration, /'field', 'columns'/);
assert.match(pickerOptionSourceMigration, /U&'\\4E0B\\62C9\\9009\\9879\\8868'/);
assert.match(pickerOptionSourceMigration, /'height', 180/);
assert.match(pickerOptionSourceMigration, /'minHeight', 0/);
assert.match(
  pickerOptionSourceMigration,
  /v_option_blocks <> array\['__lowcodeOptionsCode', 'columns'\]::text\[\]/,
);

const rowPattern = /\(\s*'material-prop\.([^']+)'[^$]*\$schema\$(\{.*?\})\$schema\$::jsonb,\s*true\s*\)/g;
const definitions = new Map();
for (const match of migration.matchAll(rowPattern)) {
  const definition = JSON.parse(match[2]);
  assert.equal(match[1], definition.componentKey.toLowerCase());
  definitions.set(definition.componentKey, definition);
}

const chartComponentKeys = [
  'echarts-bar',
  'echarts-line',
  'echarts-area',
  'echarts-pie',
  'echarts-doughnut',
  'echarts-scatter',
  'echarts-radar',
];

assert.ok(
  definitions.size + chartComponentKeys.length >= 38,
  'the database-only migration must seed all draggable material schemas',
);
for (const [componentKey, definition] of definitions) {
  assert.equal(definition.componentKey, componentKey);
  assert.ok(Array.isArray(definition.fields) && definition.fields.length > 0, `${componentKey} needs fields`);
  assert.ok(Array.isArray(definition.actions), `${componentKey} needs actions`);
  assert.equal(definition.layout?.length, 1, `${componentKey} needs one root layout node`);
  assert.equal(definition.layout[0].kind, 'tabs', `${componentKey} root layout must be tabs`);
  assert.ok(definition.layout[0].tabs.length > 0, `${componentKey} needs at least one tab`);
}

for (const componentKey of ['form', 'lowcode-edit-form', 'lowcode-search-form', 'lowcode-grid', 'array-table', 'input', 'picker', 'stepper', 'switch', 'radio', 'checkbox', 'rate', 'slider', 'sub-form']) {
  assert.ok(definitions.has(componentKey), `missing database material property definition for ${componentKey}`);
}

const pickerDefinition = definitions.get('picker');
assert.ok(
  pickerDefinition.fields.some((field) => field.field === 'columns' && field.target === 'props'),
  'picker material properties must expose static option columns',
);
assert.ok(
  pickerDefinition.layout[0].tabs.some(
    (tab) => tab.key === 'options' && tab.blocks.some((block) => block.field === 'columns'),
  ),
  'picker material properties must keep the static option table on the options tab',
);

assert.ok(definitions.has('planning-flow'), 'missing database material property definition for planning-flow');
for (const componentKey of chartComponentKeys) {
  assert.ok(
    migration.includes(`('${componentKey}'`),
    `missing database material property definition for ${componentKey}`,
  );
}
assert.match(migration, /'layout', jsonb_build_array\(jsonb_build_object\(\s*'kind', 'tabs'/);
assert.match(migration, /'actions', jsonb_build_array\(\)/);

const sourceMaterialKeys = new Set();
for (const match of (await source('packages/lowcode-framework/src/packages/chart-component/index.tsx')).matchAll(/key:\s*'([^']+)'/g)) {
  sourceMaterialKeys.add(match[1]);
}

async function walk(path) {
  const entries = await readdir(new URL(path, root), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = `${path}${entry.name}`;
    if (entry.isDirectory()) files.push(...await walk(`${child}/`));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(child);
  }
  return files;
}

const materialSources = await Promise.all((await walk('packages/lowcode-framework/src/packages/')).map(source));
for (const materialSource of materialSources) {
  assert.doesNotMatch(materialSource, /createEditor[A-Za-z]*Prop|createFieldProps|visual-editor\.props/);
  for (const match of materialSource.matchAll(/key:\s*'([^']+)'/g)) sourceMaterialKeys.add(match[1]);
}

for (const componentKey of sourceMaterialKeys) {
  if (componentKey === 'tabbar-item') continue;
  assert.ok(
    definitions.has(componentKey) || chartComponentKeys.includes(componentKey),
    `missing database material property definition for source material ${componentKey}`,
  );
}

console.log('material property database-only tabs regression checks passed');
