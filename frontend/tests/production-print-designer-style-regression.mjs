import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const [mainSource, workspaceBoundsSource, editorControllerSource] = await Promise.all([
  readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
  readFile(
    new URL('../../packages/tldraw-vue/src/editor/interactions/WorkspaceBoundsManager.ts', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../../packages/tldraw-vue/src/editor/interactions/VueEditorController.ts', import.meta.url),
    'utf8',
  ),
]);

assert.match(
  mainSource,
  /import ['"]tldraw-vue-phase-one\/style\.css['"];/,
  'The print designer stylesheet must be imported explicitly so production builds cannot tree-shake it.',
);

const assetsDirectory = new URL('../dist/assets/', import.meta.url);
const assetNames = await readdir(assetsDirectory);
const cssSources = await Promise.all(
  assetNames
    .filter((name) => name.endsWith('.css'))
    .map((name) => readFile(new URL(name, assetsDirectory), 'utf8')),
);
const productionCss = cssSources.join('\n');

assert.match(
  productionCss,
  /\.editor-host\{[^}]*position:relative/,
  'The production bundle must position the print designer host.',
);
assert.match(
  productionCss,
  /\.vue-canvas\{[^}]*position:absolute/,
  'The production bundle must include the print canvas positioning rules.',
);
assert.match(
  productionCss,
  /\.shape-layer\{[^}]*position:absolute/,
  'The production bundle must include the shape-layer positioning rules.',
);
assert.match(
  workspaceBoundsSource,
  /getFittedCamera\([\s\S]*?horizontalRoom[\s\S]*?verticalRoom[\s\S]*?getCenteredCamera/,
  'The initial print workspace camera must fit the page inside the available viewport.',
);
assert.match(
  editorControllerSource,
  /if \(center\)[\s\S]*?getFittedCamera\(this\.getViewportSize\(\)\)/,
  'Centered viewport initialization must use the fitted workspace camera.',
);

console.log('Production print designer stylesheet regression passed.');
