import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [layoutSource, treeNodeSource, styleSource] = await Promise.all([
  readFile(new URL('../layouts/dashboard.vue', import.meta.url), 'utf8'),
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/components/SystemMenuTreeNode.vue',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(new URL('../assets/styles/app.css', import.meta.url), 'utf8'),
]);

assert.match(
  layoutSource,
  /<SystemMenuTreeNode[\s\S]*?:accordion="true"/,
  'The dashboard sidebar must enable accordion expansion.',
);
assert.match(
  layoutSource,
  /findSiblingGroupCodes\(menuTree\.value, code\)[\s\S]*?expandedGroups\[siblingCode\] = false/,
  'Expanding a dashboard menu group must collapse its expanded siblings.',
);
assert.match(
  treeNodeSource,
  /props\.accordion[\s\S]*?props\.expandedGroups\[props\.item\.code\] === true/,
  'Accordion groups must be collapsed until explicitly expanded.',
);
assert.match(
  styleSource,
  /\.admin-sidebar\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?overflow:\s*hidden;/,
  'The sidebar shell must keep its fixed controls outside the scroll container.',
);
assert.match(
  styleSource,
  /\.admin-sidebar > \.admin-menu\s*\{[\s\S]*?overflow-y:\s*auto;/,
  'Only the menu list must scroll vertically.',
);

console.log('Sidebar menu accordion regression test passed.');
