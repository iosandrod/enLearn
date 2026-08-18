import assert from 'node:assert/strict';
import {
  extractRelateInfoRows,
  filterRelateInfoRows,
  findRelateInfoGrid,
  mapRelateInfoRow,
  normalizeRelateInfoMappings,
  resolveRelateInfoColumns,
} from '../../packages/lowcode-framework/src/lowcode/form-materials/base-info/relate-info.ts';

const row = {
  id: 'item-1',
  name: 'RM-MCU-STM32',
  uom: 'PCS',
  nested: { code: 'MCU' },
};
const config = {
  valueField: 'id',
  displayField: ['name', 'uom'],
  fieldMappings: [
    { sourceField: 'id', targetField: 'item_id' },
    { sourceField: 'name', targetField: 'item_name' },
    { sourceField: 'uom', targetField: 'uom' },
    { sourceField: 'nested.code', targetField: 'item_code' },
    { sourceField: 'missing', targetField: 'must_not_clear' },
    { sourceField: 'id', targetField: '__proto__' },
  ],
};

assert.deepEqual(mapRelateInfoRow(row, config, 'item_id'), {
  item_id: 'item-1',
  item_name: 'RM-MCU-STM32',
  uom: 'PCS',
  item_code: 'MCU',
  item_id_label: 'RM-MCU-STM32 PCS',
});
assert.deepEqual(
  normalizeRelateInfoMappings({ mappings: { item_id: 'id', constructor: 'name' } }, 'item_id'),
  [{ sourceField: 'id', targetField: 'item_id' }],
);

assert.deepEqual(extractRelateInfoRows({ data: { result: { rows: [row, null] } } }), [row]);
assert.deepEqual(extractRelateInfoRows({ payload: { records: [row] } }, 'payload.records'), [row]);
assert.deepEqual(filterRelateInfoRows([row], 'mcu', ['name']), [row]);
assert.deepEqual(filterRelateInfoRows([row], 'pcs', ['nested.code']), []);
assert.deepEqual(filterRelateInfoRows([row], 'mcu', ['nested.code']), [row]);
assert.deepEqual(filterRelateInfoRows([row], 'missing', ['name']), []);

const secondaryGrid = {
  id: 'secondary',
  kind: 'grid',
  sourceKey: 'secondaryRows',
  schema: { grid: { columns: [{ field: 'id', title: 'ID' }] } },
};
const mainGrid = {
  id: 'main',
  kind: 'grid',
  sourceKey: 'mainRows',
  schema: {
    grid: {
      tableType: 'main',
      columns: [
        { type: 'seq', title: '序号' },
        { field: 'name', title: '物料' },
        { title: '操作', slots: { default: 'actions' } },
      ],
    },
  },
};
const schema = {
  code: 'item-list',
  route: '/items',
  title: '物料',
  blocks: [
    secondaryGrid,
    { id: 'tabs', kind: 'tabs', tabs: [{ key: 'data', label: '数据', blocks: [mainGrid] }] },
  ],
};

assert.equal(findRelateInfoGrid(schema)?.id, 'main');
assert.equal(findRelateInfoGrid(schema, 'secondaryRows')?.id, 'secondary');
assert.deepEqual(resolveRelateInfoColumns({}, mainGrid, [], [row]), [
  { field: 'name', title: '物料' },
]);
assert.deepEqual(resolveRelateInfoColumns(
  { columns: [{ field: 'uom', title: '单位' }] },
  mainGrid,
  [],
  [row],
), [{ field: 'uom', title: '单位' }]);

console.log('Base-info relation helper runtime test passed.');
