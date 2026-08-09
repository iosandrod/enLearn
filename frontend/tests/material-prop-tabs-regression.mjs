import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

const database = await source(
  'packages/lowcode-framework/src/visual-editor/material-prop-forms/database.ts',
);
const registry = await source(
  'packages/lowcode-framework/src/visual-editor/material-prop-forms/registry.ts',
);
const visualProps = await source(
  'packages/lowcode-framework/src/visual-editor/material-prop-forms/visual-props.ts',
);
const provider = await source(
  'packages/lowcode-framework/src/components/VisualEditorProvider.vue',
);
const panelStyles = await source(
  'packages/lowcode-framework/src/visual-editor/components/right-attribute-panel/index.module.scss',
);
const migration = await source(
  'supabase/migrations/20260809160000_material_property_form_tabs.sql',
);
const arrayTableMigration = await source(
  'supabase/migrations/20260809170000_material_property_array_table_tabs.sql',
);

assert.match(database, /MATERIAL_PROP_FORM_CODE_PREFIX = 'material-prop\.'/);
assert.match(database, /resource: 'lowcode_form_definitions'/);
assert.match(database, /op: 'startsWith'/);
assert.match(database, /definitions\.forEach\(registerMaterialPropForm\)/);

assert.match(registry, /const definitionVersion = shallowRef\(0\)/);
assert.match(registry, /definition\.mergeBuiltinFields && current/);
assert.match(registry, /definitionVersion\.value \+= 1/);
assert.match(visualProps, /definition\?\.separateArrayTableTabs === true/);
assert.match(visualProps, /field\.component === 'lc-array-table'/);
assert.match(visualProps, /promoteArrayTableFieldsToTabs\(rootTabs, fields\)/);
assert.match(visualProps, /label: firstField\.label \|\| tab\.label/);
assert.match(visualProps, /'样式'/);
assert.match(visualProps, /'其他'/);
assert.match(provider, /loadDatabaseMaterialPropForms\(host\.getServiceApi\(\)\)/);

assert.match(panelStyles, /\.material-prop-form \.lc-form-tabs/);
assert.match(panelStyles, /min-height: 36px/);
assert.match(panelStyles, /border-radius: 6px/);

const expectedComponents = [
  'form',
  'lowcode-edit-form',
  'lowcode-search-form',
  'lowcode-grid',
  'array-table',
  'input',
  'picker',
  'datetimePicker',
  'stepper',
  'switch',
  'radio',
  'checkbox',
  'rate',
  'slider',
  'sub-form',
];

for (const componentKey of expectedComponents) {
  assert.match(
    migration,
    new RegExp(`'${componentKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`),
    `missing database material property definition for ${componentKey}`,
  );
}

assert.equal(
  new Set(migration.match(/'material-prop\.[^']+'/g) ?? []).size,
  expectedComponents.length,
);
assert.match(migration, /'mergeBuiltinFields', true/);
assert.match(migration, /'separateArrayTableTabs', true/);
assert.match(migration, /'fields', '\[\]'::jsonb/);
assert.match(migration, /on conflict \(code\) do update set/);
assert.match(arrayTableMigration, /where code like 'material-prop\.%'/);
assert.match(arrayTableMigration, /\{separateArrayTableTabs\}/);

console.log('material property tabs regression checks passed');
