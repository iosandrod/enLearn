import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BUILTIN_LOW_CODE_ACTION_KEYS,
  createBuiltinLowCodeAction,
  createBuiltinLowCodeActionEditorRow,
  createBuiltinLowCodePageFunctionScript,
  createDefaultButtonGroupActions,
  createDefaultButtonGroupEditorRows,
  getBuiltinLowCodeActionPresets,
  getBuiltinLowCodeActionPresetsForPage,
  resolveBuiltinLowCodeActionSelection,
  resolveBuiltinLowCodeActionPresetForButton,
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

assert.deepEqual(
  getBuiltinLowCodeActionPresetsForPage('list')
    .filter((preset) => preset.functionName)
    .map((preset) => [preset.action.code, preset.functionName]),
  [
    ['create', 'create'],
    ['edit', 'edit'],
    ['delete', 'delete'],
    ['approve', 'approve'],
    ['unapprove', 'unapprove'],
    ['close', 'close'],
    ['open', 'open'],
    ['refresh', 'refresh'],
    ['print', 'print'],
    ['exit', 'exit'],
  ],
  'List-page default buttons must map to the matching built-in page functions.',
);
assert.deepEqual(
  getBuiltinLowCodeActionPresetsForPage('edit')
    .map((preset) => [preset.action.code, preset.functionName]),
  [
    ['duplicate', 'copy'],
    ['create', 'create'],
    ['modify', 'modify'],
    ['save', 'save'],
    ['approve', 'approve'],
    ['unapprove', 'unapprove'],
    ['close', 'close'],
    ['open', 'open'],
    ['refresh', 'refresh'],
    ['exit', 'exit'],
  ],
  'Edit-page default buttons must map duplicate to copy and all other standard functions.',
);

const listApprovePreset = getBuiltinLowCodeActionPresetsForPage('list')
  .find((preset) => preset.key === BUILTIN_LOW_CODE_ACTION_KEYS.APPROVE);
assert.equal(resolveBuiltinLowCodeActionSelection(listApprovePreset, 'list'), 'multiple');
assert.equal(resolveBuiltinLowCodeActionSelection(listApprovePreset, 'edit'), 'none');

const listCreate = createBuiltinLowCodeAction(
  BUILTIN_LOW_CODE_ACTION_KEYS.CREATE,
  {},
  { pageType: 'list' },
);
assert.equal(listCreate.eventName, 'buttonGroup.create');
assert.equal(listCreate.script, createBuiltinLowCodePageFunctionScript('create'));
assert.match(listCreate.script, /async function main\(\)[\s\S]*?executeFunction[\s\S]*?name: "create"/);

const editDuplicate = createBuiltinLowCodeActionEditorRow(
  BUILTIN_LOW_CODE_ACTION_KEYS.DUPLICATE,
  { pageType: 'edit' },
);
assert.equal(editDuplicate.eventName, 'buttonGroup.duplicate');
assert.match(editDuplicate.script, /name: "copy"/);

assert.equal(
  resolveBuiltinLowCodeActionPresetForButton('list', {
    code: 'create',
    eventName: 'buttonGroup.create',
  })?.functionName,
  'create',
  'Existing default buttons must be identifiable for script backfill.',
);
assert.equal(
  resolveBuiltinLowCodeActionPresetForButton('list', {
    code: 'create',
    eventName: 'buttonGroup.click',
  }),
  undefined,
  'A custom button that merely reuses a built-in code must not be treated as a default button.',
);

const importAction = createBuiltinLowCodeAction(
  BUILTIN_LOW_CODE_ACTION_KEYS.IMPORT,
  {},
  { pageType: 'list' },
);
assert.equal(importAction.script, undefined, 'Unmapped extension buttons must not get a fake function call.');

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

const editEditorRow = createBuiltinLowCodeActionEditorRow(
  BUILTIN_LOW_CODE_ACTION_KEYS.EDIT,
);
assert.equal(editEditorRow.label, '编辑');
assert.equal(editEditorRow.directivesJson, '[]');
assert.deepEqual(editEditorRow.children, []);

const moreEditorRow = createBuiltinLowCodeActionEditorRow(
  BUILTIN_LOW_CODE_ACTION_KEYS.MORE,
  { directivesJson: 'array' },
);
assert.deepEqual(moreEditorRow.directivesJson, []);
assert.deepEqual(
  moreEditorRow.children.map((button) => button.code),
  ['import', 'export'],
);

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const consumerPaths = [
  'lowcode/block-materials/defaults.ts',
  'packages/business-component/lowcode-button-group/index.tsx',
  'visual-editor/components/button-group-designer/button-group-designer.service.tsx',
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
