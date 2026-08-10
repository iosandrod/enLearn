import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [pageRendererSource, blockChildrenSource, lowCodeServiceSource] = await Promise.all([
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/components/LowCodeBlockChildren.vue',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(new URL('../../api/src/lowcode-service/lowcode.service.ts', import.meta.url), 'utf8'),
]);

assert.match(
  pageRendererSource,
  /function validBlocks[\s\S]*?value\.filter\(isRuntimeBlock\)[\s\S]*?validBlocks\(tab\?\.blocks\)/,
  'The page runtime must ignore invalid root and nested blocks.',
);
assert.match(
  blockChildrenSource,
  /Array\.isArray\(props\.blocks\) \? props\.blocks\.filter\(isRuntimeBlock\) : \[\]/,
  'Nested block rendering must ignore invalid children.',
);
assert.match(
  lowCodeServiceSource,
  /assertRuntimeBlockArrays\(data\.schema\)[\s\S]*?Block must be an object/,
  'Low-code page saves must reject invalid runtime blocks.',
);

console.log('Invalid low-code block runtime regression test passed.');
