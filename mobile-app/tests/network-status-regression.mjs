import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { build } from 'esbuild';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(testDirectory, '../src/runtime/network-status.ts');
const result = await build({
  entryPoints: [sourcePath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
  define: { __PLATFORM__: '"web"' },
});
const moduleSource = result.outputFiles[0].text;
const network = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`
);

assert.equal(network.networkStatusFromType('NONE'), 'offline');
assert.equal(network.networkStatusFromType({ network_info: 'offline' }), 'offline');
assert.equal(network.networkStatusFromType('WIFI'), 'online');
assert.equal(network.networkStatusFromType({ type: '5g' }), 'online');

console.log('mobile network status regression checks passed');
