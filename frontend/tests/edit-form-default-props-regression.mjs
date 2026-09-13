import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url);
const componentPath = new URL(
  'packages/lowcode-framework/src/packages/business-component/lowcode-edit-form/index.tsx',
  root,
);
const editorUtilsPath = new URL(
  'packages/lowcode-framework/src/visual-editor/visual-editor.utils.ts',
  root,
);
const componentSource = await readFile(componentPath, 'utf8');
const editorUtilsSource = await readFile(editorUtilsPath, 'utf8');

assert.match(componentSource, /defaultProps:\s*\{/);
assert.match(componentSource, /blockId:\s*'edit-form'/);
assert.match(componentSource, /formType:\s*'edit'/);
assert.match(componentSource, /title:\s*'编辑信息'/);
assert.match(componentSource, /serviceName:\s*'admin'/);
assert.match(componentSource, /serviceMethod:\s*'listItems'/);
assert.match(componentSource, /saveMethod:\s*'saveItem'/);
assert.match(componentSource, /postDataJson:\s*\{\}/);
assert.match(componentSource, /initialValuesJson:\s*\{\}/);
assert.match(componentSource, /submitText:\s*'保存'/);
assert.match(componentSource, /resetText:\s*'重置'/);
assert.match(componentSource, /formActions:\s*\[/);
assert.match(componentSource, /fields:\s*\[\]/);
assert.match(editorUtilsSource, /cloneDeep\(component\.defaultProps \?\? \{\}\)/);

const bundled = await build({
  entryPoints: [fileURLToPath(editorUtilsPath)],
  bundle: true,
  define: { 'import.meta.env.BASE_URL': '"/"' },
  format: 'esm',
  platform: 'node',
  write: false,
});
const module = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`,
);

const component = {
  key: 'lowcode-edit-form',
  moduleName: 'businessComponents',
  label: '编辑表单',
  defaultProps: {
    formType: 'edit',
    serviceMethod: 'listItems',
    saveMethod: 'saveItem',
    postDataJson: {},
    formActions: [{ code: 'submit', label: '保存' }],
    fields: [],
  },
};
const firstBlock = module.createNewBlock(component);
const secondBlock = module.createNewBlock(component);

assert.equal(firstBlock.props.formType, 'edit');
assert.equal(firstBlock.props.serviceMethod, 'listItems');
assert.equal(firstBlock.props.saveMethod, 'saveItem');
assert.deepEqual(firstBlock.props.postDataJson, {});
assert.deepEqual(firstBlock.props.formActions, [{ code: 'submit', label: '保存' }]);
firstBlock.props.formActions[0].label = '修改';
assert.equal(secondBlock.props.formActions[0].label, '保存');

console.log('Edit form default props regression test passed.');
