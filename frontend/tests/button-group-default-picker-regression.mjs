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
  /code: 'select-default',[\s\S]*?label: '选择默认按钮',[\s\S]*?prefixIcon: 'ri-list-check-3',[\s\S]*?execute:[\s\S]*?executeSelectDefaultButtons\(context, pageType\)/,
  'The button designer toolbar must expose the default-button picker.',
);
assert.match(
  designerSource,
  /async function executeSelectDefaultButtons[\s\S]*?title: '选择默认按钮'[\s\S]*?type: 'checkbox'[\s\S]*?checkField: 'checked'[\s\S]*?checkMethod:[\s\S]*?label: '添加所选'/,
  'The default-button picker must provide a multi-select grid and an explicit add action.',
);
assert.match(
  designerSource,
  /function resolveDesignerPageType[\s\S]*?page_type[\s\S]*?schema\.pageType[\s\S]*?function getPickerPresets[\s\S]*?getBuiltinLowCodeActionPresetsForPage\(pageType\)/,
  'The picker must derive list/edit page type from its script context and filter the shared registry.',
);
assert.match(
  designerSource,
  /function createDefaultButtonPickerRows[\s\S]*?getPickerPresets\(pageType\)[\s\S]*?resolveBuiltinLowCodeActionSelection\(preset, pageType\)[\s\S]*?availabilityLabel:[\s\S]*?disabled/,
  'The picker must show page-aware choices and selection requirements while marking conflicts unavailable.',
);
assert.match(
  designerSource,
  /function appendBuiltinButtons[\s\S]*?getPickerPresets\(pageType\)[\s\S]*?configuredCodes\.has\(code\)[\s\S]*?createBuiltinLowCodeActionEditorRow\(preset\.key, \{[\s\S]*?pageType/,
  'Selected defaults must use the page-aware editor-row conversion and skip duplicate codes.',
);
assert.match(
  designerSource,
  /function attachMissingBuiltinFunctionScripts[\s\S]*?resolveBuiltinLowCodeActionPresetForButton\(pageType[\s\S]*?!readString\(button\.script\)[\s\S]*?createBuiltinLowCodePageFunctionScript\(preset\.functionName\)[\s\S]*?function createInitialButtons/,
  'Opening an existing default button must backfill a missing function script without replacing custom scripts.',
);
assert.match(
  builtinsSource,
  /export function createBuiltinLowCodePageFunctionScript[\s\S]*?async function main[\s\S]*?executeFunction[\s\S]*?export function createBuiltinLowCodeActionEditorRow[\s\S]*?pageType: options\.pageType/,
  'The built-in registry must generate a safe executeFunction script for page-aware editor rows.',
);

console.log('Button-group default picker regression test passed.');
