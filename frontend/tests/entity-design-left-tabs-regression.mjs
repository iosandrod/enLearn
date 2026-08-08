import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageSource = await readFile(
  new URL('../pages/dashboard/entity-design.vue', import.meta.url),
  'utf8'
);
const layoutSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodeFormLayout.vue', import.meta.url),
  'utf8'
);
const formSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodeForm.vue', import.meta.url),
  'utf8'
);
const formDefinitionMigration = await readFile(
  new URL('../../supabase/migrations/20260808200000_lowcode_form_definitions.sql', import.meta.url),
  'utf8'
);

assert.match(
  formDefinitionMigration,
  /'entity-design-left-panel'[\s\S]*?"kind": "tabs"[\s\S]*?"key": "table-list"[\s\S]*?"field": "tables"[\s\S]*?"key": "table-detail"[\s\S]*?"field": "table"/,
  'The database-defined left entity panel must split entity details and the entity list into schema tabs.'
);
assert.match(
  formDefinitionMigration,
  /'entity-design-right-panel'[\s\S]*?"defaultKey": "column-list"[\s\S]*?"key": "column-list"[\s\S]*?"field": "columns"[\s\S]*?"key": "column-detail"[\s\S]*?"field": "columnDetail"[\s\S]*?"key": "relation-list"[\s\S]*?"field": "relations"[\s\S]*?"key": "relation-detail"[\s\S]*?"field": "relation"/,
  'The database-defined right entity panel must expose separate list and edit tabs for fields and relations.'
);
assert.match(
  formDefinitionMigration,
  /"field": "columns"[\s\S]*?"height": "100%"[\s\S]*?"minHeight": 0[\s\S]*?"maxHeight": "100%"/,
  'The field table must fill its dedicated tab without a fixed pixel height.'
);
assert.match(
  formDefinitionMigration,
  /"field": "relations"[\s\S]*?"height": "100%"[\s\S]*?"minHeight": 0[\s\S]*?"maxHeight": "100%"/,
  'The relation table must fill its dedicated tab without a fixed pixel height.'
);
assert.match(
  formDefinitionMigration,
  /"field": "tables"[\s\S]*?"height": "100%"[\s\S]*?"maxHeight": "100%"[\s\S]*?"kind": "tabs"[\s\S]*?"fillRemaining": true/,
  'The entity table and its tab layout must fill the left panel without a fixed pixel height.'
);
assert.doesNotMatch(
  formDefinitionMigration,
  /"field": "tables"[\s\S]{0,500}?"height": 360/,
  'The entity list must not restore its old fixed 360px height.'
);
assert.match(
  pageSource,
  /loadLowCodeFormDefinitions\(serviceApi,[\s\S]*?entityDesignLeftPanel[\s\S]*?entityDesignRightPanel/,
  'The entity designer must load its base and combined form schemas from the database.'
);
assert.match(
  layoutSource,
  /v-else-if="node\.kind === 'tabs'"[\s\S]*<vxe-tabs[\s\S]*v-for="tab in node\.tabs"[\s\S]*:nodes="tab\.blocks"/,
  'The low-code form layout must render tab nodes and their nested fields.'
);
assert.match(
  layoutSource,
  /'lc-form-tabs--fill': node\.fillRemaining/,
  'Fill behavior must be enabled by the tab schema instead of applying to every tab layout.'
);
assert.match(
  layoutSource,
  /'lc-form-tab-pane--single': tab\.blocks\.length === 1/,
  'Single-field fill panes must remain distinguishable from stacked list-detail panes.'
);
assert.match(
  formSource,
  /'lc-form--fill': fillRemainingLayout/,
  'A fill-enabled form must propagate the available height into its layout.'
);

console.log('Entity designer left tabs regression test passed.');
