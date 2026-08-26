import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [subFormSource, subFormSchemaSource, gridDesignerSource, migrationSource] = await Promise.all([
  readFile(new URL('lowcode/form-materials/lc-sub-form/index.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/form-schema.ts', frameworkRoot), 'utf8'),
  readFile(
    new URL('visual-editor/components/grid-designer/grid-designer.service.tsx', frameworkRoot),
    'utf8',
  ),
  readFile(
    new URL('../../supabase/migrations/20260826130000_grid_designer_form_schemas.sql', import.meta.url),
    'utf8',
  ),
]);

assert.match(
  subFormSource,
  /v-if="configuredSchema"[\s\S]*?子表单 Schema 未配置/,
  'Sub-forms must show an explicit unconfigured state when props.schema is invalid.',
);
assert.doesNotMatch(
  subFormSource,
  /createLegacySubFormSchema|fieldProps\.value\.(fields|columns|layout|actions)/,
  'Sub-forms must not read legacy sibling schema properties.',
);
for (const eventName of ['submit', 'action', 'fieldChange']) {
  assert.match(
    subFormSource,
    new RegExp(`emit\\('${eventName}'`),
    `Sub-forms must forward the ${eventName} event.`,
  );
}
assert.match(
  subFormSchemaSource,
  /function createSubFormField[\s\S]*?component: 'lc-sub-form'[\s\S]*?schema: createSubFormSchema/,
  'Canonical sub-form fields must be created by the shared constructor.',
);
assert.match(
  subFormSchemaSource,
  /schema\?: never;[\s\S]*?fields\?: never;[\s\S]*?columns\?: never;[\s\S]*?layout\?: never;[\s\S]*?actions\?: never;/,
  'The shared constructor must reject legacy schema keys inside props at compile time.',
);
assert.match(
  migrationSource,
  /"field": "rowConfig", "label": "行配置", "component": "lc-sub-form"[\s\S]*?"schema": \{ "columns": 3,[\s\S]*?"field": "keyField"/,
  'The database schema must define rowConfig as a canonical nested sub-form.',
);
assert.match(
  migrationSource,
  /"field": "columnConfig", "label": "列配置", "component": "lc-sub-form"[\s\S]*?"schema": \{ "columns": 3,[\s\S]*?"field": "minWidth"/,
  'The database schema must define columnConfig as a canonical nested sub-form.',
);

for (const field of ['keyField', 'useKey', 'isCurrent', 'isHover', 'resizable', 'drag']) {
  assert.match(
    migrationSource,
    new RegExp(`"field": "${field}"`),
    `Grid configuration must retain the ${field} editor.`,
  );
}
for (const field of ['minWidth']) {
  assert.match(
    migrationSource,
    new RegExp(`"field": "${field}"`),
    `Grid column configuration must retain the ${field} editor.`,
  );
}

assert.doesNotMatch(
  gridDesignerSource,
  /rowConfigSubFields|columnConfigSubFields|rowConfigSchema|columnConfigSchema/,
  'Nested grid schemas must not remain bundled in the frontend.',
);

console.log('Grid designer sub-form schema regression test passed.');
