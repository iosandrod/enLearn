import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL(
    '../../supabase/migrations/20260826130000_grid_designer_form_schemas.sql',
    import.meta.url,
  ),
  'utf8',
);

const expectedLabels = new Map([
  ['id', '表格标识'],
  ['size', '组件尺寸'],
  ['height', '表格高度'],
  ['mobileDisplay', '移动端显示方式'],
  ['rowHeight', '行高'],
  ['headerHeight', '表头高度'],
  ['overscanRowCount', '预渲染行数'],
  ['overscanColumnCount', '预渲染列数'],
  ['maxHeight', '最大高度'],
  ['border', '边框样式'],
  ['stripe', '显示斑马纹'],
  ['round', '圆角边框'],
  ['showFooter', '显示表尾'],
  ['checkField', '选中状态字段'],
  ['checkRowKey', '选中行键值'],
  ['showFilterFooter', '显示筛选底栏'],
  ['filterMethod', '筛选方法'],
]);

for (const [field, label] of expectedLabels) {
  assert.match(
    source,
    new RegExp(`"field": "${field}"[\\s\\S]*?"label": "${label}"`),
    `${field} must use the Chinese label ${label}.`,
  );
}

for (const field of [
  'id',
  'size',
  'height',
  'mobileDisplay',
  'rowHeight',
  'headerHeight',
  'overscanRowCount',
  'overscanColumnCount',
  'maxHeight',
  'border',
  'stripe',
  'round',
  'showHeader',
  'showFooter',
  'showOverflow',
  'showHeaderOverflow',
  'align',
  'headerAlign',
  'autoResize',
  'keepSource',
  'checkField',
  'labelField',
  'trigger',
  'reserve',
  'range',
  'highlight',
  'strict',
  'checkStrictly',
  'checkRowKey',
  'remote',
  'multiple',
  'orders',
  'chronological',
  'showIcon',
  'showFilterFooter',
  'filterMethod',
]) {
  assert.doesNotMatch(
    source,
    new RegExp(`"field": "${field}", "label": "${field}"`),
    `${field} must not expose its implementation key as the visible label.`,
  );
}

console.log('Grid designer Chinese-label regression test passed.');
