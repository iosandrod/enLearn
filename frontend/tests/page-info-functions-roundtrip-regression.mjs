import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reactive } from 'vue';
import {
  buildPageInfoSaveData,
  createPageInfoDesignForm,
  normalizePageInfoDesignForm,
} from '../utils/lowCodePageInfoDesign.ts';

const page = {
  id: 'page-1',
  code: 'entity-views-edit',
  route: '/dashboard/data/views/edit',
  title: '视图管理编辑',
  description: 'Edit managed views.',
  layout: 'dashboard',
  status: 'published',
  keep_alive: false,
  page_type: 'edit',
  edit_page_id: null,
  view_name: null,
  table_name: 'entity_views',
  relate_config: {
    category: 'system',
    parentCategory: 'data-management',
    relatedPageCode: 'entity-views',
  },
  schema: {
    schemaVersion: 3,
    code: 'entity-views-edit',
    route: '/dashboard/data/views/edit',
    title: '视图管理编辑',
    pageType: 'edit',
    layout: 'dashboard',
    status: 'published',
    keepAlive: false,
    config: { bgColor: '#fff' },
    visualEditor: { pages: { '/': { blocks: [] } } },
    dataSources: {},
    apis: {
      analyzeViewSql: {
        serviceName: 'entityDesign',
        serviceMethod: 'validateView',
        method: 'POST',
        postData: { schemaName: 'public' },
        resultPath: 'columns',
      },
    },
    functions: [
      {
        name: 'analyzeColumns',
        label: '分析列',
        description: '分析 SQL 并返回列信息',
        enabled: false,
        script: 'async function main() {\n  return this.event.args;\n}',
      },
    ],
    scriptPolicy: {
      apiNames: ['page.reload'],
      capabilities: ['action.execute', 'http.execute'],
    },
    eventHandlers: [],
    blocks: [],
    overlays: [],
  },
  version: 7,
  published_at: '2026-08-07T00:00:00.000Z',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-07T00:00:00.000Z',
};

const opened = createPageInfoDesignForm(page);
assert.equal(opened.tableName, 'entity_views');
assert.deepEqual(opened.relateConfig, page.relate_config);
assert.notEqual(opened.relateConfig, page.relate_config);
assert.deepEqual(opened.functions, page.schema.functions);
assert.deepEqual(opened.apis, [
  {
    name: 'analyzeViewSql',
    serviceName: 'entityDesign',
    serviceMethod: 'validateView',
    method: 'POST',
    postData: { schemaName: 'public' },
    resultPath: 'columns',
  },
]);

const normalized = normalizePageInfoDesignForm({
  ...opened,
  tableName: ' public.entity_view_drafts ',
  relateConfig: {
    category: 'configuration',
    parentCategory: 'system',
    relatedPageCode: 'entity-view-drafts',
    customFlag: true,
  },
  functions: [
    ...opened.functions,
    {
      name: ' formatColumns ',
      label: ' 格式化列 ',
      description: ' 保存前格式化 ',
      enabled: true,
      script: 'async function main() {\n  return this.event.args.columns;\n}',
    },
  ],
  apis: [
    ...opened.apis,
    {
      name: ' createView ',
      serviceName: ' entityDesign ',
      serviceMethod: ' saveView ',
      method: 'post',
      postData: { publish: false },
      resultPath: 'data.view',
    },
  ],
}, page);
const saved = buildPageInfoSaveData(page, normalized);
const reopened = createPageInfoDesignForm({
  ...page,
  ...saved,
  schema: saved.schema,
});

assert.equal(saved.version, 8);
assert.equal(normalized.tableName, 'entity_view_drafts');
assert.equal(saved.table_name, 'entity_view_drafts');
assert.equal(reopened.tableName, 'entity_view_drafts');
assert.deepEqual(saved.relate_config, normalized.relateConfig);
assert.deepEqual(reopened.relateConfig, normalized.relateConfig);
assert.deepEqual(reopened.functions, normalized.functions);
assert.deepEqual(reopened.apis, normalized.apis);
assert.deepEqual(saved.schema.scriptPolicy, page.schema.scriptPolicy);
assert.deepEqual(saved.schema.visualEditor, page.schema.visualEditor);
assert.deepEqual(saved.schema.config, page.schema.config);

const reactiveNormalized = normalizePageInfoDesignForm({
  ...opened,
  relateConfig: reactive({
    category: 'reactive-category',
    parentCategory: 'reactive-parent',
  }),
}, page);
assert.deepEqual(reactiveNormalized.relateConfig, {
  category: 'reactive-category',
  parentCategory: 'reactive-parent',
});
assert.deepEqual(buildPageInfoSaveData(page, reactiveNormalized).relate_config, {
  category: 'reactive-category',
  parentCategory: 'reactive-parent',
});

const designerSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodeVisualDesigner.vue', import.meta.url),
  'utf8',
);
assert.match(
  designerSource,
  /const previousSchema = \(page\.value\?\.schema \?\? \{\}\)[\s\S]*?return prepareLowCodePageSchema\(\{[\s\S]*?\.\.\.previousSchema/,
  'Visual designer saves must retain page-owned functions, APIs, and script policy.',
);
assert.match(
  designerSource,
  /relate_config: page\.value\?\.relate_config \?\? \{\}/,
  'Visual designer saves must retain page relation configuration.',
);

console.log('Page information functions/API round-trip regression passed.');
