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
  designerPage,
  emptyDesignerPage,
] = await Promise.all([
  source('packages/lowcode-framework/src/visual-editor/material-prop-forms/database.ts'),
  source('packages/lowcode-framework/src/visual-editor/material-prop-forms/registry.ts'),
  source('packages/lowcode-framework/src/visual-editor/material-prop-forms/visual-props.ts'),
  source('packages/lowcode-framework/src/components/VisualEditorProvider.vue'),
  source('packages/lowcode-framework/src/visual-editor/components/right-attribute-panel/components/attr-editor/index.tsx'),
  source('packages/lowcode-framework/src/visual-editor/components/right-attribute-panel/index.module.scss'),
  source('packages/lowcode-framework/src/materials/index.ts'),
  source('supabase/migrations/20260819100000_database_only_material_property_forms.sql'),
  source('frontend/pages/dashboard/low-code/designer/[code].vue'),
  source('frontend/pages/dashboard/low-code/designer/index.vue'),
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
assert.match(attrEditor, /watch\(\s*\(\) => currentBlock\.value\?\.componentKey/);
assert.match(designerPage, /<LowCodeVisualDesigner[^>]*:service-api="serviceApi"/);
assert.match(designerPage, /const serviceApi = useServiceApi\(\)/);
assert.match(emptyDesignerPage, /<LowCodeVisualDesigner[^>]*:service-api="serviceApi"/);
assert.match(emptyDesignerPage, /const serviceApi = useServiceApi\(\)/);

assert.match(panelStyles, /\.material-prop-form \.lc-form-tabs/);
assert.match(panelStyles, /min-height: 36px/);
assert.match(panelStyles, /border-radius: 6px/);

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

for (const componentKey of ['form', 'lowcode-edit-form', 'lowcode-search-form', 'lowcode-grid', 'array-table', 'input', 'picker', 'datetimePicker', 'stepper', 'switch', 'radio', 'checkbox', 'rate', 'slider', 'sub-form']) {
  assert.ok(definitions.has(componentKey), `missing database material property definition for ${componentKey}`);
}

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
