import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

const [arrayTable, optionRegistry, visualConverter, formDesigner] = await Promise.all([
  readLowCodeMaterialSource('form', 'lc-array-table'),
  readFile(new URL(
    '../../packages/lowcode-framework/src/runtime/option-source-registry.ts',
    import.meta.url,
  ), 'utf8'),
  readFile(new URL(
    '../../packages/lowcode-framework/src/lowcode/visual-converters/helpers.ts',
    import.meta.url,
  ), 'utf8'),
  readFile(new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/form-designer/form-designer.service.tsx',
    import.meta.url,
  ), 'utf8'),
]);

assert.match(arrayTable, /optionsCode\?: string;/);
assert.match(
  arrayTable,
  /const optionsCodes = computed\([\s\S]*new Set\(columns\.value\.map\(\(column\) => column\.optionsCode\)/,
  'One array table must collect all unique column option codes.',
);
assert.match(
  arrayTable,
  /lowCodeOptionSourceRegistry\.subscribe\([\s\S]*codes,[\s\S]*codeOptionSources\[code\] = options/,
  'Array-table columns must subscribe once through the global registry.',
);
assert.match(
  arrayTable,
  /codeOptionSources\[column\.optionsCode\][\s\S]*lowCodeOptionSourceRegistry\.peek\(column\.optionsCode\)/,
  'Select rendering must reuse reactive and globally cached options.',
);
assert.doesNotMatch(
  arrayTable,
  /resolveOptionItemsBatch|serviceApi\.invoke/,
  'The array table must not issue direct option requests.',
);
assert.match(
  optionRegistry,
  /BATCH_WINDOW_MS[\s\S]*resolveOptionItemsBatch[\s\S]*GLOBAL_REGISTRY_KEY/,
  'The reused registry must retain throttled batching and global caching.',
);
assert.match(
  visualConverter,
  /const optionsCode = readString\(column\.optionsCode\)[\s\S]*optionsCode \? \{ optionsCode \}/,
  'Visual conversion must preserve array-table column optionsCode.',
);
assert.match(
  formDesigner,
  /const optionsCode = readString\(field\.optionsCode\)[\s\S]*?\.\.\.\(optionsCode \? \{ optionsCode \} : \{\}\)/,
  'Form designer conversion must preserve field optionsCode.',
);

console.log('Array-table optionsCode regression test passed.');
