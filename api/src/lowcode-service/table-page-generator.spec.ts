import assert from 'node:assert/strict';
import {
  buildTableListPageSchemaFromMetadata,
  normalizeDatabaseColumns
} from './table-page-generator';

const columns = normalizeDatabaseColumns([
  {
    name: 'total_amount',
    ordinalPosition: 1,
    dataType: 'numeric',
    udtName: 'numeric',
    isNullable: false,
    hasDefault: false,
    comment: JSON.stringify({
      title: '订单金额',
      type: 'number',
      align: 'right',
      description: '记录订单的含税金额。'
    }),
    isPrimaryKey: false
  },
  {
    name: 'is_active',
    ordinalPosition: 2,
    dataType: 'boolean',
    udtName: 'bool',
    comment: '是否启用'
  },
  {
    name: 'delivery_date',
    ordinalPosition: 3,
    dataType: 'date',
    udtName: 'date'
  },
  {
    name: 'broken_metadata',
    ordinalPosition: 4,
    dataType: 'text',
    udtName: 'text',
    comment: '{"title":'
  }
]);

assert.deepEqual(
  {
    title: columns[0].title,
    type: columns[0].type,
    align: columns[0].align,
    description: columns[0].description
  },
  {
    title: '订单金额',
    type: 'number',
    align: 'right',
    description: '记录订单的含税金额。'
  }
);
assert.equal(columns[1].title, '是否启用');
assert.equal(columns[1].type, 'boolean');
assert.equal(columns[1].align, 'center');
assert.equal(columns[2].type, 'date');
assert.equal(columns[2].align, 'center');
assert.equal(columns[3].title, 'Broken Metadata');
assert.equal(columns[3].type, 'text');
assert.equal(columns[3].align, 'left');

const schema = buildTableListPageSchemaFromMetadata({
  table: { schema: 'public', name: 'sales_orders', fullName: 'public.sales_orders' },
  columns: [
    {
      name: 'total_amount',
      ordinalPosition: 1,
      dataType: 'numeric',
      udtName: 'numeric',
      comment: JSON.stringify({
        title: '订单金额',
        type: 'number',
        align: 'right',
        description: '记录订单的含税金额。'
      })
    }
  ],
  childRelations: []
}, { tableName: 'public.sales_orders' });
const listGridBlock = schema.blocks?.find((block) => block.id === 'publicSalesOrders-grid');
const listGridSchema = listGridBlock?.schema as Record<string, unknown> | undefined;
const listGrid = listGridSchema?.grid as Record<string, unknown> | undefined;
const gridColumns = listGrid?.columns as Array<Record<string, unknown>> | undefined;

assert.equal(gridColumns?.[0]?.title, '订单金额');
assert.equal(gridColumns?.[0]?.align, 'right');
assert.deepEqual(gridColumns?.[0]?.formatter, {
  type: 'number',
  locale: 'zh-CN',
  emptyText: '0'
});

console.log('table page column metadata tests passed');
