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
const runtimeGridDesignerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/block-materials/grid/runtime-grid-designer.ts',
    import.meta.url
  ),
  'utf8'
);
const gridDesignerServiceSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx',
    import.meta.url
  ),
  'utf8'
);
const pageRendererSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue',
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
assert.match(
  pageGridSource,
  /payload\.key === 'headerMenuClick'[\s\S]*payload\.actionCode === 'tableInfoDesign'[\s\S]*openRuntimeGridDesigner\(props\.block, runtimeBlockEditor, serviceApi\)/,
  'Clicking table information design must open the existing grid designer with the host service API.'
);
assert.match(
  runtimeGridDesignerSource,
  /const \{ \$\$gridDesigner \} = await import\([\s\S]*grid-designer\.service'/,
  'The runtime action must reuse the existing grid designer service.'
);
assert.match(
  runtimeGridDesignerSource,
  /columns: cloneValue\(columns\),[\s\S]*gridOptions: cloneValue\(gridOptions\),[\s\S]*gridEvents: createDesignerEvents\(block\)/,
  'The designer must receive the current table columns, options, and events.'
);
assert.match(
  runtimeGridDesignerSource,
  /onConfirm: async \(result\) => \{[\s\S]*runtimeBlockEditor\.updateBlock\(\{[\s\S]*schema: createRuntimeGridSchema\(block, result\)[\s\S]*dataSources:/,
  'Confirming table design must persist both the grid block and its data source.'
);
assert.match(
  runtimeGridDesignerSource,
  /menuConfig: _menuConfig,[\s\S]*\.\.\.gridOptions/,
  'The built-in runtime context menu must not leak into editable VXE grid options.'
);
assert.match(
  runtimeGridDesignerSource,
  /rowActions\?\.edit === true[\s\S]*rowActions\?\.delete === true/,
  'An explicitly disabled row-action configuration must remain disabled in the designer.'
);
assert.match(
  gridDesignerServiceSource,
  /onClick: async \(\) =>[\s\S]*await handler\.onConfirm\(\)/,
  'The grid designer must wait for runtime persistence before closing.'
);
assert.match(
  gridDesignerServiceSource,
  /await state\.option\.onConfirm\?\.\(\{[\s\S]*gridOptions: buildGridOptions/,
  'The grid designer confirmation callback must support asynchronous persistence.'
);
assert.match(
  pageGridSource,
  /payload\.key === 'bodyMenuClick'[\s\S]*payload\.actionCode === 'editCurrentRow'[\s\S]*emit\('gridEdit', \{ block: props\.block, row: payload\.row \}\)/,
  'Editing the current row from the body context menu must enter the grid edit flow.'
);
assert.match(
  pageRendererSource,
  /async function handleGridEdit\([\s\S]*resolveLinkedEditPageRoute\(block, row\)[\s\S]*host\.getRouter\(\)\.push\(linkedEditRoute\)/,
  'The grid edit flow must navigate to the linked edit page.'
);
assert.match(
  pageRendererSource,
  /if \(update\.dataSources\)[\s\S]*nextSchema\.dataSources = \{[\s\S]*cloneRuntimeValue\(update\.dataSources\)/,
  'Runtime table design must save data-source changes into the page schema.'
);

console.log('LowCodeGrid header context menu regression test passed.');
