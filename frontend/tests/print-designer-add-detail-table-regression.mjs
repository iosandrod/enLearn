import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL(
    '../../packages/tldraw-vue/src/components/VueDataSourcePanel.vue',
    import.meta.url,
  ),
  'utf8',
);

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

console.log('print designer add detail table regression checks passed');
