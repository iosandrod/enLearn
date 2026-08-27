import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const migrationUrl = new URL(
  '../../supabase/migrations/20260827100000_form_node_data_source_binding.sql',
  import.meta.url,
);

async function bundleUrl(url) {
  const bundled = await build({
    entryPoints: [fileURLToPath(url)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
  );
}

const [{ default: formConverter }, { PageSchemaRepository }, apiSchema] = await Promise.all([
  bundleUrl(new URL('lowcode/visual-converters/lowcode-edit-form/index.ts', frameworkRoot)),
  bundleUrl(new URL('runtime/page-schema-repository.ts', frameworkRoot)),
  bundleUrl(new URL('../../api/src/lowcode-service/lowcode.schema.ts', import.meta.url)),
]);

const pageDataSources = {};
const formBlock = formConverter.toRuntimeBlock(
  {
    _vid: 'vid-edit-form',
    componentKey: 'lowcode-edit-form',
    props: {
      blockId: 'edit-form',
      formType: 'edit',
      title: '编辑信息',
      serviceName: 'admin',
      serviceMethod: 'listItems',
      saveMethod: 'saveItem',
      postDataJson: {
        tableName: 'lowcode_node_actions',
        filters: { id: '{{ route.query.id }}' },
        requiredFilters: ['id'],
        limit: 1,
      },
      fields: [
        {
          field: 'node_label',
          label: 'node_label',
          component: 'vxe-input',
        },
      ],
    },
  },
  {
    dataSources: pageDataSources,
    convertBlocks: () => [],
    convertOverlays: () => [],
  },
);

assert.equal(formBlock.id, 'edit-form');
assert.equal(formBlock.sourceKey, undefined);
assert.equal(formBlock.submitSourceKey, undefined);
assert.deepEqual(pageDataSources, {});
assert.equal(formBlock.dataSource.key, 'edit-form');
assert.equal(formBlock.dataSource.tableName, 'lowcode_node_actions');
assert.equal(formBlock.dataSource.autoLoad, true);
assert.deepEqual(formBlock.dataSource.postData.filters, {
  id: '{{ route.query.id }}',
});

const page = {
  schema: {
    blocks: [formBlock],
    dataSources: {},
  },
};
const repository = new PageSchemaRepository(() => page);
assert.equal(repository.getDataSource('edit-form').key, 'edit-form');
assert.equal(repository.getDataSource('edit-form').serviceMethod, 'listItems');
assert.equal(repository.getDataSource('record'), undefined);

const normalized = apiSchema.normalizeLowCodePageSchema({
  code: 'node-actions-edit',
  route: '/node-actions/edit',
  title: '节点动作编辑',
  pageType: 'edit',
  dataSources: {},
  blocks: [{
    ...formBlock,
    sourceKey: 'legacy-record',
    submitSourceKey: 'legacy-record',
    dataSource: { ...formBlock.dataSource, key: 'legacy-record' },
  }],
});
assert.deepEqual(normalized.dataSources, {});
assert.equal(normalized.blocks[0].sourceKey, undefined);
assert.equal(normalized.blocks[0].submitSourceKey, undefined);
assert.equal(normalized.blocks[0].dataSource.key, 'edit-form');

const normalizedLegacyPage = apiSchema.normalizeLowCodePageSchema({
  code: 'sales-orders-edit',
  route: '/sales/orders/edit',
  title: '销售订单编辑',
  pageType: 'edit',
  dataSources: {
    salesOrder: {
      key: 'salesOrder',
      serviceName: 'admin',
      serviceMethod: 'listItems',
      saveMethod: 'saveItem',
      tableName: 'sales_orders',
    },
  },
  blocks: [
    {
      id: 'sales-order-edit-form',
      kind: 'form',
      sourceKey: 'salesOrder',
      submitSourceKey: 'salesOrder',
      schema: { fields: [{ field: 'id', label: 'ID', component: 'vxe-input' }] },
    },
    {
      id: 'sales-order-lines-grid',
      kind: 'grid',
      sourceKey: 'salesOrder',
      schema: {
        grid: { columns: [] },
        detailConfig: { parentSourceKey: 'salesOrder' },
      },
    },
    {
      id: 'sales-order-actions',
      kind: 'buttonGroup',
      actions: [{ code: 'refresh', script: "await this.$source.refresh('salesOrder');" }],
    },
  ],
});
assert.equal(normalizedLegacyPage.dataSources.salesOrder, undefined);
assert.equal(normalizedLegacyPage.blocks[0].sourceKey, undefined);
assert.equal(normalizedLegacyPage.blocks[0].submitSourceKey, undefined);
assert.equal(normalizedLegacyPage.blocks[0].dataSource.key, 'sales-order-edit-form');
assert.equal(normalizedLegacyPage.blocks[1].sourceKey, 'sales-order-edit-form');
assert.equal(
  normalizedLegacyPage.blocks[1].schema.detailConfig.parentSourceKey,
  'sales-order-edit-form',
);
assert.match(normalizedLegacyPage.blocks[2].actions[0].script, /sales-order-edit-form/);

const migration = await readFile(migrationUrl, 'utf8');
assert.match(migration, /'key', 'edit-form'/);
assert.match(migration, /'const sourceKey = readString\(block\.id\);'/);
assert.doesNotMatch(migration, /\{dataSources,edit-form\}/);

console.log('Form node data-source regression test passed.');
