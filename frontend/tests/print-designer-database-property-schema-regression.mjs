import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { computed, reactive, ref } from 'vue';

const filename = new URL('../../packages/tldraw-vue/src/components/LowCodeFormPanel.vue', import.meta.url);
const source = await readFile(filename, 'utf8');
const { descriptor, errors } = parse(source, { filename: filename.pathname });
assert.deepEqual(errors, []);
const script = compileScript(descriptor, { id: 'property-schema-regression' });
const template = compileTemplate({
  source: descriptor.template.content,
  filename: filename.pathname,
  id: 'property-schema-regression',
  compilerOptions: { bindingMetadata: script.bindings },
});
assert.deepEqual(template.errors, []);

const ast = ts.createSourceFile('panel.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
const functions = new Set(['loadPropertyFormDefinitions', 'isLowCodeFormSchema', 'isRecord',
  'normalizeBasePropertyFieldName', 'normalizePropertyFormModel', 'createPropertyFormModel']);
const variables = new Set(['activeSchema', 'materialColumnSchema', 'displayedFormCode', 'displayedFormError', 'designSchema']);
const declarations = ast.statements.flatMap(statement => {
  if (ts.isFunctionDeclaration(statement) && functions.has(statement.name?.text)) return [statement.getText(ast)];
  if (!ts.isVariableStatement(statement)) return [];
  return statement.declarationList.declarations.filter(declaration => variables.has(declaration.name.getText(ast)))
    .map(declaration => `const ${declaration.getText(ast)};`);
});
const code = ts.transpileModule(declarations.join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

const workspaceCode = 'print-designer.property.workspace';
const materialCode = 'print-designer.property.vue-material';
const columnCode = 'print-designer.property.vue-material-column';
const workspaceSchema = {
  title: '数据库画布属性', columns: 2,
  fields: [{ field: 'pageWidthMm', label: '数据库页面宽度', component: 'lc-number-input', props: { min: 30, step: 0.5 } }],
  layout: [{ kind: 'tabs', tabs: [{ key: 'page', label: '数据库页面', blocks: [{ kind: 'field', field: 'pageWidthMm' }] }] }],
  actions: [{ key: 'custom', label: '数据库操作' }],
};
const materialSchema = {
  fields: [
    { field: 'dataSourceField', label: '数据库数据源', component: 'custom-source-picker', props: { clearable: true, disabled: false } },
    { field: 'padding-left', label: '保留字段名称', component: 'lc-number-input' },
  ],
  actions: [],
};
let rows = [undefined, { id: 'workspace-id', code: workspaceCode, schema: workspaceSchema },
  { id: 'material-id', code: materialCode, schema: materialSchema }];
let fail = false;
const requests = [];
const props = reactive({ columnOnly: false });
const formDefinitions = ref({});
const formDefinitionsLoading = ref(true);
const formDefinitionError = ref('');
const formDefinitionIds = ref({});
const activeFormCode = ref(workspaceCode);
const materialOptions = ref([{ value: 'items', label: '订单明细' }]);
const api = { invoke: async (service, method, payload) => {
  requests.push({ service, method, payload });
  if (fail) throw new Error('加载失败');
  return rows;
} };
const panel = new Function('computed', 'props', 'formDefinitions', 'formDefinitionsLoading', 'formDefinitionError',
  'formDefinitionIds', 'host', 'requiredPropertyFormCodes', 'materialColumnFormCode', 'activeFormCode',
  'materialDataSourceFieldOptions', 'propertyFormCode',
  `${code}; return { loadPropertyFormDefinitions, activeSchema, materialColumnSchema, displayedFormError, designSchema,
    normalizePropertyFormModel, createPropertyFormModel };`,
)(computed, props, formDefinitions, formDefinitionsLoading, formDefinitionError, formDefinitionIds,
  { getServiceApi: () => api }, [workspaceCode, materialCode, 'print-designer.property.vue-image'], columnCode,
  activeFormCode, materialOptions, type => `print-designer.property.${type}`);

await panel.loadPropertyFormDefinitions();
assert.equal(formDefinitionsLoading.value, false);
assert.deepEqual(panel.activeSchema.value, workspaceSchema, 'Canvas fields, labels, components, props, layout and actions must match the database.');
assert.equal(panel.displayedFormError.value, '', 'An unrelated missing form must not block the canvas form.');
assert.equal(formDefinitionIds.value[workspaceCode], 'workspace-id');
assert.equal(requests[0].payload.resource, 'lowcode_form_definitions');
assert.equal(requests[0].payload.filters.enabled, true);
panel.activeSchema.value.fields[0].label = '本地修改';
assert.equal(workspaceSchema.fields[0].label, '数据库页面宽度', 'Loading must clone the database schema.');

activeFormCode.value = materialCode;
assert.equal(panel.activeSchema.value.fields[0].component, 'custom-source-picker', 'Dynamic source options must preserve the database component.');
assert.deepEqual(panel.activeSchema.value.fields[0].props, materialSchema.fields[0].props);
assert.deepEqual(panel.activeSchema.value.fields[0].options, materialOptions.value);
assert.equal(panel.activeSchema.value.fields[1].field, 'padding-left', 'Do not rename or inject schema fields.');
assert.deepEqual(materialSchema.fields[0].options, undefined, 'Runtime options must not mutate the saved schema.');
assert.equal(panel.createPropertyFormModel({ paddingLeft: 8 }, materialSchema)['padding-left'], 8,
  'Stored schema aliases must still read node properties.');
assert.equal(panel.normalizePropertyFormModel({ 'padding-left': 16 }).paddingLeft, 16,
  'Schema aliases must still write node properties without changing the schema.');

rows = [{ id: 'workspace-id', code: workspaceCode, schema: { ...workspaceSchema, fields: [], layout: [], actions: [] } }];
activeFormCode.value = workspaceCode;
await panel.loadPropertyFormDefinitions();
assert.deepEqual(panel.activeSchema.value.fields, [], 'An intentionally empty schema must stay empty.');
assert.equal(formDefinitions.value[materialCode], undefined, 'Reloading must discard removed definitions.');
activeFormCode.value = materialCode;
assert.equal(panel.activeSchema.value, null);
assert.match(panel.displayedFormError.value, /vue-material.*不存在/);

props.columnOnly = true;
rows = [{ id: 'column-id', code: columnCode, schema: { fields: [], actions: [] } }];
await panel.loadPropertyFormDefinitions();
assert.deepEqual(requests.at(-1).payload.filters.code, [columnCode], 'Column properties request their own database form.');
assert.deepEqual(panel.materialColumnSchema.value, { fields: [], actions: [] });
assert.deepEqual(panel.designSchema.value, panel.materialColumnSchema.value, 'Designing column properties must edit the same schema as the displayed form.');
rows = [];
await panel.loadPropertyFormDefinitions();
assert.equal(panel.materialColumnSchema.value, null);
assert.match(panel.displayedFormError.value, /vue-material-column.*不存在/);

fail = true;
await panel.loadPropertyFormDefinitions();
assert.deepEqual(formDefinitions.value, {});
assert.deepEqual(formDefinitionIds.value, {});
assert.equal(formDefinitionError.value, '加载失败');
assert.equal(panel.materialColumnSchema.value, null, 'A request failure must never fall back to a frontend schema.');
assert.doesNotMatch(source, /materialColumnFallbackSchema|ensureBasePropertyFields|localSchemas|function createSchema\(/);
console.log('Verified database-only property schemas, schema fidelity, scoped missing forms, reloads and request failures.');
