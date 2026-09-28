import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [source, detailDesignerSource, formDesignerSource, globalDialogHostSource, frontendStyleSource] = await Promise.all([
  readFile(
    new URL(
      '../../packages/tldraw-vue/src/components/VueDataSourcePanel.vue',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../packages/tldraw-vue/src/components/PrintDataSourceDetailDesigner.vue',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/visual-editor/components/form-designer/form-designer.service.tsx',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/components/GlobalDialogHost.tsx',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL('../assets/styles/visual-editor-utilities.scss', import.meta.url),
    'utf8',
  ),
]);

assert.match(source, /async function handleAddDetailTable\(\)/);
assert.match(source, /title: '添加子表'/);
assert.match(source, /field: 'label'/);
assert.match(source, /field: 'field'/);
assert.match(source, /子表字段只能以字母或下划线开头/);
assert.match(source, /detailTables\.value\.some\(\(table\) => table\.field === field\)/);
assert.match(source, /function applyWorkspaceDetailTables\(tables: PrintDataSourceDetailTable\[\]\)/);
assert.match(source, /activeDefinition\.value = nextDefinition/);
assert.match(source, /applyWorkspaceDetailTables\(tables\)[\s\S]*?await host\.getServiceApi\(\)\.invoke/);
assert.match(source, /detailTables: tables\.map/);
assert.match(source, /const sourceRows = inlineSource\.rows\.length \? inlineSource\.rows : \[\{\}\]/);
assert.match(source, /if \(!Array\.isArray\(nextRow\[table\.field\]\)\) nextRow\[table\.field\] = \[\]/);
assert.match(source, /component: 'lc-array-table'/);
assert.match(source, /component: 'lc-array-table',[\s\S]*?showTitle: false/);
assert.match(source, /kind: 'tabs'/);
assert.match(source, /label: `\$\{table\.label\}（\$\{table\.field\}）`/);
assert.match(source, /@update:model-value="handleDetailFormUpdate"/);
assert.match(source, /toolbarButtons: \[/);
assert.match(source, /code: 'configure'/);
assert.match(source, /code: 'delete'/);
assert.match(source, /primaryTabLabel: '表单'/);
assert.match(source, /name: 'detail',[\s\S]*label: '明细'/);
assert.match(source, /h\(PrintDataSourceDetailDesigner/);
assert.match(source, /printDetail: detailTableDefinitions \?\? existingSchema\?\.printDetail \?\? \[\]/);
assert.match(formDesignerSource, /contentTabs\?: FormDesignerContentTab\[\]/);
assert.match(formDesignerSource, /class="form-workbench-content-tabs__header" role="tablist"/);
assert.match(formDesignerSource, /state\.activeContentTab = tab\.name/);
assert.match(formDesignerSource, /class="form-workbench-primary"[\s\S]*class="form-workbench-toolbar"[\s\S]*renderDesigner\(\)/);
assert.doesNotMatch(formDesignerSource, /<div class="form-workbench">\s*<div class="form-workbench-toolbar">/);
assert.match(frontendStyleSource, /\.form-workbench-content-tabs\s*\{[\s\S]*display: flex;/);
assert.match(frontendStyleSource, /\.form-workbench-primary\s*\{[\s\S]*flex-direction: column;/);
assert.match(detailDesignerSource, /aria-label="明细数据源设计"/);
assert.match(detailDesignerSource, /handleAddTable/);
assert.match(detailDesignerSource, /handleConfirmAddTable/);
assert.match(detailDesignerSource, /handleConfigureTable/);
assert.match(detailDesignerSource, /handleDeleteTable/);
assert.match(globalDialogHostSource, /isGridDesignerDialog \? 2000/);

console.log('print designer add detail table regression checks passed');
