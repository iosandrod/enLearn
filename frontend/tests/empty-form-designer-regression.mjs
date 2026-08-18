import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const designerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/form-designer/form-designer.service.tsx',
    import.meta.url,
  ),
  'utf8',
);

const createFormModelSource = designerSource.match(
  /function createFormModel\([\s\S]*?\r?\n}\r?\n\r?\nfunction resolveInitialModel/,
)?.[0];

assert.ok(createFormModelSource, 'The form designer model factory must remain discoverable.');
assert.match(
  createFormModelSource,
  /const normalizedFields = fields;/,
  'An empty form must remain empty when its designer model is created.',
);
assert.doesNotMatch(
  createFormModelSource,
  /fields\.length\s*\?\s*fields\s*:\s*\[createDefaultField\(\)\]/,
  'Opening an empty form must not inject a default input field.',
);

const resolveInitialModelSource = designerSource.match(
  /function resolveInitialModel\([\s\S]*?\r?\n}\r?\n\r?\nfunction flattenBlocks/,
)?.[0];

assert.ok(resolveInitialModelSource, 'The form designer initial model resolver must remain discoverable.');
assert.match(
  resolveInitialModelSource,
  /isDesignerModelCompatible\(option\.designerModel, normalizedFields\)/,
  'A stale designer model must not override the current empty field list.',
);

console.log('Empty form designer regression test passed.');
