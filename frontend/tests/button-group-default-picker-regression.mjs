import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL(
  '../../packages/lowcode-framework/src/',
  import.meta.url,
);

const [designerSource, builtinsSource] = await Promise.all([
  readFile(
    new URL(
      'visual-editor/components/button-group-designer/button-group-designer.service.tsx',
      frameworkRoot,
    ),
    'utf8',
  ),
  readFile(new URL('lowcode/actions/builtins.ts', frameworkRoot), 'utf8'),
]);

assert.match(
  designerSource,
  /code: 'select-default',[\s\S]*?label: '选择默认按钮',[\s\S]*?prefixIcon: 'ri-list-check-3',[\s\S]*?execute: executeSelectDefaultButtons/,
  'The button designer toolbar must expose the default-button picker.',
);
assert.match(
  designerSource,
  /async function executeSelectDefaultButtons[\s\S]*?title: '选择默认按钮'[\s\S]*?type: 'checkbox'[\s\S]*?checkField: 'checked'[\s\S]*?checkMethod:[\s\S]*?label: '添加所选'/,
  'The default-button picker must provide a multi-select grid and an explicit add action.',
);
assert.match(
  designerSource,
  /function createDefaultButtonPickerRows[\s\S]*?getBuiltinLowCodeActionPresets\(\)[\s\S]*?availabilityLabel:[\s\S]*?disabled/,
  'The picker must load its choices from the shared built-in registry and mark conflicts unavailable.',
);
assert.match(
  designerSource,
  /function appendBuiltinButtons[\s\S]*?configuredCodes\.has\(code\)[\s\S]*?addRow\([\s\S]*?createBuiltinLowCodeActionEditorRow\(preset\.key\)/,
  'Selected defaults must use the shared editor-row conversion and skip duplicate codes.',
);
assert.match(
  builtinsSource,
  /export function createBuiltinLowCodeActionEditorRow[\s\S]*?createBuiltinLowCodeAction\(key\)[\s\S]*?options\.directivesJson \?\? 'string'/,
  'The built-in registry must expose one-button editor-row conversion.',
);

console.log('Button-group default picker regression test passed.');
