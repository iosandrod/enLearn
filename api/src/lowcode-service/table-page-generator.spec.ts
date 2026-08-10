import assert from 'node:assert/strict';
import {
  buildTableListPageSchemaFromMetadata,
  mapDatabaseTableOptions,
  normalizeTablePageInspection,
  normalizeDatabaseColumns
} from './table-page-generator';

const tableComment = JSON.stringify({
  title: '销售订单',
  description: '保存销售订单主数据。',
  relation: [
    {
      table: 'public.sales_order_lines',
      type: 'referenced_by',
      localColumns: ['id'],
      relatedColumns: ['order_id'],
      constraint: 'sales_order_lines_order_id_fkey',
      onDelete: 'CASCADE'
    }
  ]
});

const tableOptions = mapDatabaseTableOptions([
  {
    table_schema: 'public',
    table_name: 'sales_orders',
    table_comment: tableComment
  }
]);
assert.equal(tableOptions[0]?.title, '销售订单');
assert.equal(tableOptions[0]?.label, '销售订单 (public.sales_orders)');
assert.equal(tableOptions[0]?.comment, tableComment);

const tableInspection = normalizeTablePageInspection({
  table: { schema: 'public', name: 'sales_orders', fullName: 'public.sales_orders' },
  comment: tableComment,
  columns: [],
  childRelations: [
    {
      constraintName: 'sales_order_lines_order_id_fkey',
      childTable: {
        schema: 'public',
        name: 'sales_order_lines',
        fullName: 'public.sales_order_lines'
      },
      childColumns: ['order_id'],
      parentColumns: ['id'],
      columns: [],
      title: JSON.stringify({
        title: '销售订单明细',
        description: '保存销售订单明细数据。',
        relation: []
      })
    }
  ]
});
assert.equal(tableInspection.title, '销售订单');
assert.equal(tableInspection.description, '保存销售订单主数据。');
assert.equal(tableInspection.childRelations[0]?.title, '销售订单明细');

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

const masterDetailSchema = buildTableListPageSchemaFromMetadata({
  table: { schema: 'public', name: 'sales_orders', fullName: 'public.sales_orders' },
  columns: [
    {
      name: 'id',
      ordinalPosition: 1,
      dataType: 'uuid',
      udtName: 'uuid',
      isPrimaryKey: true,
    },
  ],
  childRelations: [
    {
      constraintName: 'sales_order_lines_order_id_fkey',
      childTable: {
        schema: 'public',
        name: 'sales_order_lines',
        fullName: 'public.sales_order_lines',
      },
      childColumns: ['order_id'],
      parentColumns: ['id'],
      title: '销售订单明细',
      columns: [
        {
          name: 'id',
          ordinalPosition: 1,
          dataType: 'uuid',
          udtName: 'uuid',
          isPrimaryKey: true,
        },
        {
          name: 'order_id',
          ordinalPosition: 2,
          dataType: 'uuid',
          udtName: 'uuid',
        },
      ],
    },
  ],
}, { tableName: 'public.sales_orders' });
const masterGrid = masterDetailSchema.blocks.find(
  (block) => block.id === 'publicSalesOrders-grid',
) as Record<string, unknown>;
const detailTabs = masterDetailSchema.blocks.find(
  (block) => block.id === 'publicSalesOrders-detail-tabs',
) as Record<string, unknown>;
const detailGrid = (detailTabs.tabs as Array<Record<string, unknown>>)[0]
  .blocks as Array<Record<string, unknown>>;
assert.equal(masterGrid.tableType, 'main');
assert.equal(detailGrid[0].tableType, 'detail');
assert.deepEqual(
  ((masterGrid.schema as Record<string, unknown>).events as Record<string, unknown>)
    .rowCurrentChange,
  [
    {
      type: 'setDataSource',
      sourceKey: 'publicSalesOrdersSelected',
      value: '{{ event.row }}',
    },
    {
      type: 'setSearchFilters',
      sourceKey: 'publicSalesOrderLinesRows',
      mode: 'replace',
      values: { order_id: '{{ event.row.id }}' },
    },
  ],
);

const singleTableSchema = buildTableListPageSchemaFromMetadata({
  table: { schema: 'public', name: 'customers', fullName: 'public.customers' },
  columns: [
    {
      name: 'id',
      ordinalPosition: 1,
      dataType: 'uuid',
      udtName: 'uuid',
      isPrimaryKey: true,
    },
  ],
  childRelations: [],
}, { tableName: 'public.customers' });
const singleTableGrid = singleTableSchema.blocks.find(
  (block) => block.id === 'publicCustomers-grid',
) as Record<string, unknown>;
assert.deepEqual(
  ((singleTableGrid.schema as Record<string, unknown>).events as Record<string, unknown>)
    .rowCurrentChange,
  [
    {
      type: 'setDataSource',
      sourceKey: 'publicCustomersSelected',
      value: '{{ event.row }}',
    },
    {
      type: 'setSearchFilters',
      sourceKey: 'publicCustomersSelectedRows',
      mode: 'replace',
      values: { id: '{{ event.row.id }}' },
    },
  ],
);

console.log('table page column metadata tests passed');
