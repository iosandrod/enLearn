import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gridSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodeGrid.vue', import.meta.url),
  'utf8'
);

assert.match(
  gridSource,
  /@menu-click="handleMenuClick"/,
  'LowCodeGrid must handle VXE menu clicks.'
);
assert.match(
  gridSource,
  /nextConfig\.menuConfig = createGridMenuConfig\(baseGrid\.menuConfig\)/,
  'Every runtime LowCodeGrid must receive the default header menu configuration.'
);

for (const [code, label] of [
  ['tableInfoDesign', '表格信息设计'],
  ['openSearch', '打开搜索框'],
  ['associateEntityField', '关联实体字段'],
]) {
  assert.match(gridSource, new RegExp(`code: '${code}'`), `Menu action ${code} must be stable.`);
  assert.match(gridSource, new RegExp(`name: '${label}'`), `Menu action ${code} must be visible.`);
}

assert.match(
  gridSource,
  /key: menuType === 'header' \? 'headerMenuClick' : 'menuClick'/,
  'Header menu clicks must remain available to the low-code runtime for later implementation.'
);
assert.match(
  gridSource,
  /const isMenuEnabled = menuConfig\.enabled !== false/,
  'Individual grids must be able to opt out of the default header menu.'
);

console.log('LowCodeGrid header context menu regression test passed.');
