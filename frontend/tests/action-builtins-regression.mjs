import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BUILTIN_LOW_CODE_ACTION_KEYS,
  createBuiltinLowCodeAction,
  createDefaultButtonGroupActions,
  createDefaultButtonGroupEditorRows,
  getBuiltinLowCodeActionPresets,
} from '../../packages/lowcode-framework/src/lowcode/actions/builtins.ts';

const presets = getBuiltinLowCodeActionPresets();
assert.deepEqual(
  presets.map((preset) => preset.key),
  Object.values(BUILTIN_LOW_CODE_ACTION_KEYS),
  'The built-in registry must expose every declared action key.',
);

assert.equal(
  createBuiltinLowCodeAction(BUILTIN_LOW_CODE_ACTION_KEYS.EDIT).label,
  '编辑',
  'Common edit actions must come from the built-in registry.',
);
assert.equal(
  createBuiltinLowCodeAction(BUILTIN_LOW_CODE_ACTION_KEYS.DUPLICATE).label,
  '复制',
  'Common duplicate actions must come from the built-in registry.',
);
assert.equal(
  createBuiltinLowCodeAction(BUILTIN_LOW_CODE_ACTION_KEYS.PRINT_PAGE).label,
  '打印',
  'Common print actions must come from the built-in registry.',
);

const firstDefaults = createDefaultButtonGroupActions();
firstDefaults[0].label = 'changed';
firstDefaults[1].children[0].label = 'changed';
const secondDefaults = createDefaultButtonGroupActions();
assert.equal(secondDefaults[0].label, '新增');
assert.equal(secondDefaults[1].children[0].label, '导入');

const jsonRows = createDefaultButtonGroupEditorRows();
const arrayRows = createDefaultButtonGroupEditorRows({ directivesJson: 'array' });
assert.equal(jsonRows[0].directivesJson, '[]');
assert.deepEqual(arrayRows[0].directivesJson, []);
assert.equal(jsonRows[1].children[0].directivesJson, '[]');

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const consumerPaths = [
  'lowcode/block-materials/defaults.ts',
  'packages/business-component/lowcode-button-group/index.tsx',
  'visual-editor/components/button-group-designer/button-group-designer.service.tsx',
  'visual-editor/material-prop-forms/materials/page-blocks.ts',
];
const consumerSources = await Promise.all(
  consumerPaths.map((path) => readFile(new URL(path, frameworkRoot), 'utf8')),
);

for (const [index, source] of consumerSources.entries()) {
  assert.match(
    source,
    /lowcode\/actions\/builtins|\.\.\/actions\/builtins/,
    `${consumerPaths[index]} must import its defaults from actions/builtins.ts.`,
  );
  assert.doesNotMatch(
    source,
    /code:\s*'create',[\s\S]{0,100}?label:\s*'新增'/,
    `${consumerPaths[index]} must not redefine the built-in create action.`,
  );
}

console.log('Built-in low-code action regression test passed.');
