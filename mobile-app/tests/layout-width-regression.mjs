import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { build } from 'esbuild';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(testDirectory, '../src/runtime/layout-width.ts');
const result = await build({
  entryPoints: [sourcePath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
  define: { __PLATFORM__: '"android"' },
});
const moduleSource = result.outputFiles[0].text;
const { createLayoutWidthScheduler } = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`
);

let currentWidth = 0;
let callback;
let requestCount = 0;
let cancelCount = 0;
const scheduler = createLayoutWidthScheduler(
  () => currentWidth,
  (width) => {
    currentWidth = width;
  },
  {
    request: (nextCallback) => {
      requestCount += 1;
      callback = nextCallback;
      return requestCount;
    },
    cancel: () => {
      cancelCount += 1;
    },
  },
);

scheduler.schedule(640);
scheduler.schedule(720);
assert.equal(requestCount, 1, 'layout bursts should schedule only one frame');
assert.equal(currentWidth, 0, 'width changes must be deferred outside the observer callback');
callback();
assert.equal(currentWidth, 720, 'the latest measured width should win');

scheduler.schedule(720.25);
callback();
assert.equal(currentWidth, 720, 'sub-pixel jitter should not trigger responsive layout updates');

scheduler.schedule(800);
scheduler.cancel();
assert.equal(cancelCount, 1, 'pending frames should be cancelled when a component unmounts');

console.log('layout-width regression checks passed');
