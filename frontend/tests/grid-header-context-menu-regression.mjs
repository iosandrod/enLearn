import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gridSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodeGrid.vue', import.meta.url),
  'utf8'
);
const pageGridSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/block-materials/grid/index.vue',
    import.meta.url
  ),
  'utf8'
);
const pageGridMenuSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/block-materials/grid/page-grid-menu.ts',
    import.meta.url
  ),
  'utf8'
);

assert.match(
  gridSource,
  /@menu-click="handleMenuClick"/,
  'LowCodeGrid must handle VXE menu clicks.'
);
assert.doesNotMatch(
  gridSource,
  /tableInfoDesign|openSearch|associateEntityField|copyCellValue|editCurrentRow|downloadCurrentRowAttachments|表格信息设计|打开搜索框|关联实体字段|编辑当前行|下载当前行附件/,
  'The generic LowCodeGrid must not own page business menu data.'
);
assert.doesNotMatch(
  gridSource,
  /createDefaultHeaderContextMenuOptions|createGridMenuConfig/,
  'The generic LowCodeGrid must not inject a default menu.'
);
assert.match(
  pageGridSource,
  /:schema="pageGridSchema"/,
  'Page grid blocks must use their page-level schema wrapper.'
);
assert.match(
  pageGridSource,
  /menuConfig: createPageGridMenuConfig\(props\.block\.schema\.grid\.menuConfig\)/,
  'Only page grid blocks should inject the business header menu.'
);

for (const [code, label] of [
  ['tableInfoDesign', '表格信息设计'],
  ['openSearch', '打开搜索框'],
  ['associateEntityField', '关联实体字段'],
  ['copyCellValue', '复制'],
  ['editCurrentRow', '编辑当前行'],
  ['downloadCurrentRowAttachments', '下载当前行附件'],
]) {
  assert.match(
    pageGridMenuSource,
    new RegExp(`code: '${code}'`),
    `Page grid menu action ${code} must be stable.`
  );
  assert.match(
    pageGridMenuSource,
    new RegExp(`name: '${label}'`),
    `Page grid menu action ${code} must be visible.`
  );
}

assert.match(
  gridSource,
  /menuType === 'body'[\s\S]*\? 'bodyMenuClick'/,
  'Body menu clicks must remain available to the low-code runtime for later implementation.'
);
assert.match(
  gridSource,
  /\.\.\.\(row \? \{ row \} : \{\}\)/,
  'Body menu clicks must preserve the current row context.'
);
assert.match(
  pageGridSource,
  /'headerMenuClick'[\s\S]*'bodyMenuClick'/,
  'Page grid menu clicks must be published even when the page configures other grid events.'
);

console.log('LowCodeGrid header context menu regression test passed.');
