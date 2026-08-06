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

assert.match(
  pageSource,
  /const leftPanelSchema[\s\S]*kind: 'tabs'[\s\S]*key: 'table-detail'[\s\S]*blocks: \[\{ kind: 'field', field: 'table' \}\][\s\S]*key: 'table-list'[\s\S]*blocks: \[\{ kind: 'field', field: 'tables' \}\]/,
  'The left entity panel must split entity details and the entity list into schema tabs.'
);
assert.match(
  layoutSource,
  /v-else-if="node\.kind === 'tabs'"[\s\S]*<vxe-tabs[\s\S]*v-for="tab in node\.tabs"[\s\S]*:nodes="tab\.blocks"/,
  'The low-code form layout must render tab nodes and their nested fields.'
);

console.log('Entity designer left tabs regression test passed.');
