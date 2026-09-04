import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodeForm.vue', import.meta.url),
  'utf8',
);
const pageRendererSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue', import.meta.url),
  'utf8',
);
const rendererRuntimeSource = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/useLowCodePageRenderer.ts', import.meta.url),
  'utf8',
);
const pageDataControllerSource = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/page-data-controller.ts', import.meta.url),
  'utf8',
);

assert.match(
  source,
  /v-if="formActions\.length"[\s\S]*v-for="action in formActions"[\s\S]*@click="handleAction\(action\)"/,
  'LowCodeForm must render schema actions and route clicks through its action handler.',
);
assert.match(
  rendererRuntimeSource,
  /\[\(\) => props\.page\.id, \(\) => props\.page\.version, \(\) => props\.route\?\.fullPath/,
  'Runtime data must reload on page identity/version changes without treating in-place schema edits as navigation.',
);
assert.doesNotMatch(
  pageRendererSource,
  /\[\(\) => props\.page, \(\) => props\.route\?\.fullPath/,
  'Watching the mutable page object causes search-time grid updates to reset forms and sources.',
);
assert.match(
  pageDataControllerSource,
  /readonly refreshDataSources = async[\s\S]*executeNodeAction\(\{ node: block\.id, method: 'loadData' \}\)/,
  'Data-source refreshes must route through the page node action loader.',
);
assert.match(
  source,
  /if \(action\.type === 'reset'\)[\s\S]*Object\.assign\(formData, initialModel\.value\)[\s\S]*emit\('action', action, snapshot\(\)\)/,
  'Reset actions must restore the initial model and publish the action event.',
);
assert.match(
  source,
  /const isLocalUpdate = formValuesEqual\(nextValue, formData\)[\s\S]*if \(isLocalUpdate\) return;[\s\S]*initialModel\.value = \{ \.\.\.nextValue \}/,
  'External model changes must refresh the reset baseline while local field updates do not.',
);

console.log('Low-code form action rendering regression checks passed.');
