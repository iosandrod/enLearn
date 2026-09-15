import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { build } from 'esbuild';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(testDirectory, '../src/runtime/runtime-cache.ts');
const storage = new Map();
globalThis.window = {
  __localStorage: {
    get length() { return storage.size; },
    key: (index) => [...storage.keys()][index] ?? null,
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
};

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
const cache = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`
);

const page = { id: 'page-1', code: 'orders', schema: { blocks: [] } };
await cache.writePageCache('account-a', 'user-a', page);
assert.equal((await cache.readPageCache('account-a', 'user-a', { id: 'page-1' }))?.data.code, 'orders');
assert.equal((await cache.readPageCache('account-a', 'user-a', { code: 'orders' }))?.data.id, 'page-1');
assert.equal(await cache.readPageCache('account-b', 'user-a', { code: 'orders' }), null);
assert.equal(
  await cache.readPageCache('account-a', 'user-b', { code: 'orders' }),
  null,
  'runtime cache must be isolated by user as well as account',
);

await cache.writePageDataCache('account-a', 'user-a', 'page-1', { orders: [1] });
await cache.writePageDataCache('account-a', 'user-a', 'page-1', { lines: [2] });
assert.deepEqual(
  (await cache.readPageDataCache('account-a', 'user-a', 'page-1'))?.data,
  { orders: [1], lines: [2] },
  'partial data-source refreshes must preserve the other cached sources',
);

await cache.writePageCache('account-a', 'user-b', { ...page, id: 'page-2', code: 'quality' });
await cache.clearRuntimeCache('user-a');
assert.equal(await cache.readPageCache('account-a', 'user-a', { code: 'orders' }), null);
assert.equal(
  (await cache.readPageCache('account-a', 'user-b', { code: 'quality' }))?.data.id,
  'page-2',
  'sign-out cleanup must preserve another user cache',
);

console.log('mobile runtime cache regression checks passed');
