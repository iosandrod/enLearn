import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [tabsSource, rendererSource] = await Promise.all([
  read('../../packages/lowcode-framework/src/lowcode/block-materials/tabs/index.vue'),
  read('../../packages/lowcode-framework/src/runtime/useLowCodePageRenderer.ts'),
]);

assert.match(
  tabsSource,
  /async function setActiveTab\(key: string\)[\s\S]*?name: 'tabs\.activeChange'[\s\S]*?payload: \{ tabKey: key \}/,
  'Changing a page tab must publish the selected tab key to the runtime.',
);
assert.match(
  rendererSource,
  /event\.name === 'tabs\.activeChange'[\s\S]*?targetBlock\?\.kind === 'tabs'[\s\S]*?flattenBlocks\(activeTab\.blocks\)[\s\S]*?block\.tableType === 'detail'[\s\S]*?method: 'loadData'/,
  'Activating a page tab must reload only the detail grids contained in that tab.',
);

console.log('Page tab detail-grid load regression test passed.');
