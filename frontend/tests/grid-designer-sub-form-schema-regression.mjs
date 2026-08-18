import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [subFormSource, subFormSchemaSource, gridDesignerSource] = await Promise.all([
  readFile(new URL('lowcode/form-materials/lc-sub-form/index.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/form-schema.ts', frameworkRoot), 'utf8'),
  readFile(
    new URL('visual-editor/components/grid-designer/grid-designer.service.tsx', frameworkRoot),
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
  gridDesignerSource,
  /createSubFormField\(\{[\s\S]*?field: 'rowConfig'[\s\S]*?fields: rowConfigSubFields,[\s\S]*?columns: 3/,
  'Grid rowConfig must use the canonical sub-form constructor.',
);
assert.match(
  gridDesignerSource,
  /createSubFormField\(\{[\s\S]*?field: 'columnConfig'[\s\S]*?fields: columnConfigSubFields,[\s\S]*?columns: 3/,
  'Grid columnConfig must use the canonical sub-form constructor.',
);

for (const field of ['keyField', 'useKey', 'isCurrent', 'isHover', 'resizable', 'drag']) {
  assert.match(
    gridDesignerSource,
    new RegExp(`field: '${field}'`),
    `Grid configuration must retain the ${field} editor.`,
  );
}
for (const field of ['minWidth']) {
  assert.match(
    gridDesignerSource,
    new RegExp(`field: '${field}'`),
    `Grid column configuration must retain the ${field} editor.`,
  );
}

console.log('Grid designer sub-form schema regression test passed.');
