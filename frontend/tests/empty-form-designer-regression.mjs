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
assert.match(
  resolveInitialModelSource,
  /const initialLayout = resolveInitialLayout\(normalizedFields, option\.layout, option\.columns\);[\s\S]*?canReuseDesignerLayout\(option\.designerModel, initialLayout\)/,
  'A field-compatible designer model without layout must not override schema layout.',
);

const subFormBlockSource = designerSource.match(
  /if \(runtimeComponent === 'lc-sub-form'\) \{[\s\S]*?\r?\n  \}\r?\n\r?\n  if \(runtimeComponent === 'lc-array-table'\)/,
)?.[0];

assert.ok(subFormBlockSource, 'The sub-form field block initializer must remain discoverable.');
assert.match(
  subFormBlockSource,
  /const schemaLayout = readSchemaLayout\(schema\);[\s\S]*?const schemaColumns = readSchemaColumns\(schema\);/,
  'Sub-form field blocks must read layout metadata from the canonical schema.',
);
assert.match(
  subFormBlockSource,
  /const initialLayout = resolveInitialLayout\(designerFields, schemaLayout, schemaColumns\);[\s\S]*?canReuseDesignerLayout\(subFormDesignerModel, initialLayout\)/,
  'Sub-form field blocks must reject stale designer models when schema layout exists.',
);
assert.match(
  subFormBlockSource,
  /createFormModel\([\s\S]*?designerFields,[\s\S]*?schemaLayout,[\s\S]*?schemaColumns,/,
  'Sub-form field blocks must build their designer model from schema layout and columns.',
);

console.log('Empty form designer regression test passed.');
