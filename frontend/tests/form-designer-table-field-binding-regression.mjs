import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [
  collectorSource,
  visualPropsSource,
  attrEditorSource,
  designerSource,
  simulatorSource,
  runtimeSource,
  rendererSource,
  visualDesignerSource,
  lowcodeServiceSource,
] = await Promise.all([
    readFile(
      new URL('visual-editor/material-prop-forms/table-field-options.ts', frameworkRoot),
      'utf8',
    ),
    readFile(new URL('visual-editor/material-prop-forms/visual-props.ts', frameworkRoot), 'utf8'),
    readFile(
      new URL(
        'visual-editor/components/right-attribute-panel/components/attr-editor/index.tsx',
        frameworkRoot,
      ),
      'utf8',
    ),
    readFile(
      new URL('visual-editor/components/form-designer/form-designer.service.tsx', frameworkRoot),
      'utf8',
    ),
    readFile(
      new URL('visual-editor/components/simulator-editor/simulator-editor.vue', frameworkRoot),
      'utf8',
    ),
    readFile(
      new URL('lowcode/block-materials/runtime-form-designer.ts', frameworkRoot),
      'utf8',
    ),
    readFile(new URL('components/LowCodePageRenderer.vue', frameworkRoot), 'utf8'),
    readFile(new URL('components/LowCodeVisualDesigner.vue', frameworkRoot), 'utf8'),
    readFile(new URL('../../api/src/lowcode-service/lowcode.service.ts', import.meta.url), 'utf8'),
  ]);

assert.match(
  visualPropsSource,
  /component: 'vxe-select',[\s\S]*?optionsSourceKey: visualTableFieldsSourceKey,[\s\S]*?filterable: true,[\s\S]*?allowCreate: true/,
  'Field binding must use a filterable select that accepts custom field names.',
);
assert.match(
  attrEditorSource,
  /inject\(formDesignerPageDataKey, null\)[\s\S]*?designerPageData\?\.value \?\? jsonData/,
  'The attribute editor must consume the injected outer-page data.',
);
assert.match(
  designerSource,
  /pageData\?: unknown[\s\S]*?pageRecord\?: LowCodePageRecord \| null[\s\S]*?serviceApi\?: LowCodeHostServiceApi[\s\S]*?provide\(formDesignerPageDataKey, computed\(\(\) => state\.option\.pageData\)\)/,
  'The form designer must provide its outer-page data to nested designer controls.',
);
assert.match(
  simulatorSource,
  /const openFormDesigner[\s\S]*?\$\$formDesigner\(\{[\s\S]*?pageData: currentPage\.value[\s\S]*?pageRecord: props\.pageRecord[\s\S]*?serviceApi: getOptionalServiceApi\(\)[\s\S]*?const openSubFormDesigner[\s\S]*?\$\$formDesigner\(\{[\s\S]*?pageData: currentPage\.value[\s\S]*?pageRecord: props\.pageRecord/,
  'Visual-page form and sub-form design must pass the current page into the form designer.',
);
assert.match(
  runtimeSource,
  /pageData: runtimeBlockEditor\.getPageSchema\?\.\(\)[\s\S]*?pageRecord: runtimeBlockEditor\.getPageRecord\?\.\(\)[\s\S]*?serviceApi: runtimeBlockEditor\.getServiceApi\?\.\(\)/,
  'Runtime form design must pass the page record and service API into the form designer.',
);
assert.match(
  rendererSource,
  /getPageRecord: \(\) => props\.page[\s\S]*?getServiceApi: \(\) => host\.getServiceApi\(\)/,
  'Runtime page rendering must expose its page record and service API to form design.',
);
assert.match(
  visualDesignerSource,
  /:page-record="designerPageRecord"[\s\S]*?const designerPageRecord = computed<LowCodePageRecord>[\s\S]*?\.\.\.\(currentSchema \?\? \{\}\)[\s\S]*?code: form\.value\.code/,
  'Visual page design must pass live page metadata and the saved schema into nested designers.',
);
assert.match(
  lowcodeServiceSource,
  /case 'listTableColumns':[\s\S]*?read_lowcode_table_metadata[\s\S]*?p_action: 'inspect_table'/,
  'Low-code metadata must expose a focused table-column API fallback.',
);

const executableCollector = ts.transpileModule(collectorSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const collectorUrl = `data:text/javascript;base64,${Buffer.from(executableCollector).toString('base64')}`;
const { collectPageTableFieldOptions, loadFormDesignerTableFieldOptions } = await import(
  collectorUrl
);

const pageData = {
  blocks: [
    {
      kind: 'grid',
      schema: {
        grid: {
          columns: [
            { field: 'id', title: '编号' },
            { field: 'name', title: '名称' },
            { field: '', title: '忽略' },
            { field: 'operation', title: '操作', slots: { default: 'actions' } },
            { field: 'actions', title: 'Actions', type: 'action' },
          ],
        },
      },
    },
    {
      kind: 'container',
      blocks: [
        {
          kind: 'grid',
          schema: {
            grid: {
              columns: [
                { field: 'name', title: '重复名称' },
                { field: 'status', title: '状态' },
              ],
            },
          },
        },
      ],
    },
  ],
  overlays: [
    {
      kind: 'modal',
      blocks: [
        {
          componentKey: 'lowcode-grid',
          props: {
            columns: [
              { field: 'created_at', title: '创建时间' },
              { field: 'id', title: '另一个编号' },
            ],
          },
        },
      ],
    },
  ],
};

assert.deepEqual(collectPageTableFieldOptions(pageData), [
  { label: '编号 (id)', value: 'id' },
  { label: '名称 (name)', value: 'name' },
  { label: '状态 (status)', value: 'status' },
  { label: '创建时间 (created_at)', value: 'created_at' },
]);

function pageRecord(id, schema) {
  return {
    id,
    code: id,
    route: `/${id}`,
    title: id,
    description: null,
    layout: 'dashboard',
    status: 'published',
    keep_alive: true,
    page_type: id.includes('edit') ? 'edit' : 'list',
    edit_page_id: null,
    schema,
    version: 1,
    published_at: null,
    created_at: '',
    updated_at: '',
  };
}

const editPage = pageRecord('orders-edit', {
  code: 'orders-edit',
  route: '/orders/edit',
  title: 'Edit order',
  blocks: [],
});
const parentWithColumns = pageRecord('orders', {
  code: 'orders',
  route: '/orders',
  title: 'Orders',
  blocks: [
    {
      kind: 'grid',
      sourceKey: 'orders',
      schema: {
        grid: {
          columns: [
            { field: 'id', title: 'Order ID' },
            { field: 'status', title: 'Status' },
          ],
        },
      },
    },
  ],
});

const parentCalls = [];
const parentOptions = await loadFormDesignerTableFieldOptions(
  {
    async invoke(service, method, payload) {
      parentCalls.push({ service, method, payload });
      if (service === 'lowcode' && method === 'listItems') return [parentWithColumns];
      throw new Error(`Unexpected API call ${service}.${method}`);
    },
  },
  editPage,
);
assert.deepEqual(parentOptions, [
  { label: 'Order ID (id)', value: 'id' },
  { label: 'Status (status)', value: 'status' },
]);
assert.equal(parentCalls.length, 1, 'Stored parent columns should avoid metadata calls.');

const parentWithNestedGridFirst = pageRecord('orders', {
  code: 'orders',
  route: '/orders',
  title: 'Orders',
  dataSources: {
    orders: { key: 'orders', tableName: 'public.orders' },
    lines: { key: 'lines', tableName: 'public.order_lines' },
  },
  blocks: [
    {
      kind: 'container',
      blocks: [
        {
          kind: 'grid',
          sourceKey: 'lines',
          schema: { grid: { columns: [{ field: 'line_note', title: 'Line note' }] } },
        },
      ],
    },
    {
      kind: 'grid',
      sourceKey: 'orders',
      schema: { grid: { columns: [{ field: 'id', title: 'Order ID' }] } },
    },
  ],
});
const nestedFirstCalls = [];
const nestedFirstOptions = await loadFormDesignerTableFieldOptions(
  {
    async invoke(service, method) {
      nestedFirstCalls.push({ service, method });
      if (service === 'lowcode' && method === 'listItems') {
        return [parentWithNestedGridFirst];
      }
      throw new Error(`Unexpected API call ${service}.${method}`);
    },
  },
  editPage,
);
assert.deepEqual(nestedFirstOptions, [
  { label: 'Line note (line_note)', value: 'line_note' },
  { label: 'Order ID (id)', value: 'id' },
]);
assert.equal(
  nestedFirstCalls.length,
  1,
  'A direct main grid must take precedence over an earlier nested child grid.',
);

const parentWithoutColumns = pageRecord('orders', {
  code: 'orders',
  route: '/orders',
  title: 'Orders',
  dataSources: {
    orders: {
      key: 'orders',
      tableName: 'public.orders',
      postData: { tableName: 'public.orders' },
    },
  },
  blocks: [
    {
      kind: 'grid',
      sourceKey: 'orders',
      schema: { grid: { columns: [] } },
    },
    {
      kind: 'container',
      blocks: [
        {
          kind: 'grid',
          sourceKey: 'orderLines',
          schema: {
            grid: { columns: [{ field: 'line_note', title: 'Line note' }] },
          },
        },
      ],
    },
  ],
});
const metadataCalls = [];
const metadataOptions = await loadFormDesignerTableFieldOptions(
  {
    async invoke(service, method, payload) {
      metadataCalls.push({ service, method, payload });
      if (service === 'lowcode' && method === 'listItems') return [parentWithoutColumns];
      if (service === 'lowcode' && method === 'listTableColumns') {
        return [
          { name: 'id', comment: 'Order ID' },
          { name: 'customer_id', comment: 'Customer' },
          { name: 'id', comment: 'Duplicate ID' },
        ];
      }
      throw new Error(`Unexpected API call ${service}.${method}`);
    },
  },
  editPage,
);
assert.deepEqual(metadataOptions, [
  { label: 'Line note (line_note)', value: 'line_note' },
  { label: 'Order ID (id)', value: 'id' },
  { label: 'Customer (customer_id)', value: 'customer_id' },
]);
assert.ok(
  metadataCalls.some(
    ({ service, method }) => service === 'lowcode' && method === 'listTableColumns',
  ),
  'A parent grid without columns must load table metadata through the API.',
);

const visualParentWithoutColumns = pageRecord('visual-orders', {
  code: 'visual-orders',
  route: '/visual-orders',
  title: 'Visual orders',
  blocks: [],
  visualEditor: {
    pages: {
      '/': {
        blocks: [
          {
            componentKey: 'lowcode-grid',
            props: {
              sourceKey: 'orders',
              postDataJson: JSON.stringify({ tableName: 'public.orders' }),
              columns: [],
            },
          },
        ],
      },
    },
  },
});
const visualMetadataCalls = [];
const visualMetadataOptions = await loadFormDesignerTableFieldOptions(
  {
    async invoke(service, method, payload) {
      visualMetadataCalls.push({ service, method, payload });
      if (service === 'lowcode' && method === 'listItems') {
        return [visualParentWithoutColumns];
      }
      if (service === 'lowcode' && method === 'listTableColumns') {
        return [{ name: 'id', comment: 'Order ID' }];
      }
      throw new Error(`Unexpected API call ${service}.${method}`);
    },
  },
  editPage,
);
assert.deepEqual(visualMetadataOptions, [{ label: 'Order ID (id)', value: 'id' }]);
assert.deepEqual(
  visualMetadataCalls.find(({ method }) => method === 'listTableColumns')?.payload,
  { tableName: 'public.orders' },
  'Visual-grid postDataJson must resolve the physical main table.',
);

await assert.rejects(
  () =>
    loadFormDesignerTableFieldOptions(
      {
        async invoke(service, method) {
          if (service === 'lowcode' && method === 'listItems') return [parentWithoutColumns];
          throw new Error('Metadata unavailable');
        },
      },
      editPage,
    ),
  /Metadata unavailable/,
);
assert.match(
  designerSource,
  /catch \{[\s\S]*?custom field creation remain available|catch \{[\s\S]*?Local choices and custom field creation remain available/,
  'Metadata errors must be non-fatal so custom field creation stays usable.',
);

console.log('Form designer table-field binding regression test passed.');
