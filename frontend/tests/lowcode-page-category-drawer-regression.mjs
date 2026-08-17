import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [rendererSource, drawerSource, treeNodeSource] = await Promise.all([
  readFile(new URL('components/LowCodePageRenderer.vue', frameworkRoot), 'utf8'),
  readFile(new URL('components/LowCodeCategoryDrawer.vue', frameworkRoot), 'utf8'),
  readFile(new URL('components/LowCodeCategoryTreeNode.vue', frameworkRoot), 'utf8'),
]);

assert.match(
  rendererSource,
  /v-if="hasCategoryRelation"[^]*?:config="page\.relate_config"[^]*?@select="handleCategorySelect"/,
  'Pages with a category relation must render the shared category drawer.',
);
assert.match(
  rendererSource,
  /readString\(props\.page\.relate_config\?\.category\) !== ''/,
  'An empty category relation must not reserve drawer space.',
);
assert.match(
  drawerSource,
  /invoke\('planning', 'listRelationOptions'[^]*?resource: 'planning_category'[^]*?target_type: category[^]*?status: 'active'[^]*?tree: true/s,
  'The drawer must load the active planning_category tree for the configured target type.',
);
assert.match(
  drawerSource,
  /collapsed \? '展开类别树' : '收起类别树'[^]*?collapsed = !collapsed/s,
  'The category drawer must expose an accessible expand/collapse control.',
);
assert.match(
  treeNodeSource,
  /@click="emit\('toggle', node\)"[^]*?@click="emit\('select', node\)"/s,
  'Tree branches and category selection must be independently interactive.',
);

console.log('Low-code page category drawer regression test passed.');
