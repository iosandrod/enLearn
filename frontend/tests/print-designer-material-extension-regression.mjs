import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../packages/tldraw-vue/src/editor/extensions/defaultExtensions.ts', import.meta.url),
  'utf8',
);

assert.match(
  source,
  /import \{ materialExtension \} from '\.\/material\/materialExtension'/,
  'The default print designer extensions must import the material table extension.',
);
assert.match(
  source,
  /return \[coreExtension, frameExtension, tableExtension, materialExtension\]/,
  'The default print designer extensions must register the material table extension.',
);

console.log('Print designer material extension regression test passed.');
