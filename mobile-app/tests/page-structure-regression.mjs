import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { build } from 'esbuild';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(testDirectory, '../src/runtime/mobile-page-structure.ts');
const result = await build({
  entryPoints: [sourcePath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
});
const moduleSource = result.outputFiles[0].text;
const structure = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`
);

const duplicateOverlay = { id: 'record-modal', kind: 'modal', blocks: [] };
const page = {
  schema: {
    blocks: [
      { id: 'content', kind: 'container', blocks: [{ id: 'form', kind: 'form' }] },
      { id: 'inline-drawer', kind: 'drawer', blocks: [] },
    ],
    overlays: [
      { id: 'schema-modal', kind: 'modal', blocks: [] },
      duplicateOverlay,
    ],
  },
  overlays: [
    duplicateOverlay,
    {
      id: 'record-modal',
      kind: 'modal',
      blocks: [{ id: 'ignored-duplicate-child', kind: 'text' }],
    },
    {
      id: 'record-drawer',
      kind: 'drawer',
      blocks: [{ id: 'tabs', kind: 'tabs', tabs: [{ key: 'one', label: 'One', blocks: [
        { id: 'tab-grid', kind: 'grid' },
      ] }] }],
      overlays: [{ id: 'nested-modal', kind: 'modal', blocks: [] }],
    },
  ],
};

assert.deepEqual(
  structure.mobileLayoutBlocks(page).map((block) => block.id),
  ['content'],
  'modal and drawer blocks must not remain in the page layout',
);
assert.deepEqual(
  structure.mobileOverlayBlocks(page).map((block) => block.id),
  ['inline-drawer', 'schema-modal', 'record-modal', 'record-drawer'],
  'schema and record-level overlays must be merged once in stable order',
);
assert.deepEqual(
  structure.allMobilePageBlocks(page).map((block) => block.id),
  [
    'content',
    'form',
    'inline-drawer',
    'schema-modal',
    'record-modal',
    'record-drawer',
    'tabs',
    'tab-grid',
    'nested-modal',
  ],
  'forms, tabs, and nested overlays must participate in runtime lookup',
);

console.log('mobile page structure regression checks passed');
