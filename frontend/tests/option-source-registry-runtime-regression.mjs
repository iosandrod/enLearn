import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const entryPoint = fileURLToPath(new URL(
  '../../packages/lowcode-framework/src/runtime/option-source-registry.ts',
  import.meta.url,
));
const bundled = await build({
  entryPoints: [entryPoint],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(
  bundled.outputFiles[0].text,
).toString('base64')}`;
const { lowCodeOptionSourceRegistry: registry } = await import(moduleUrl);

registry.invalidate();
registry.subscribers.clear();
registry.inFlight.clear();

const calls = [];
const serviceApi = {
  async invoke(serviceName, serviceMethod, payload) {
    calls.push({ serviceName, serviceMethod, payload });
    return Object.fromEntries(payload.sourceCodes.map((code) => [code, {
      options: [{ label: code, value: code }],
      cacheTtlSeconds: 60,
    }]));
  },
};
const received = {};
const provider = () => serviceApi;
const listener = (code, options) => {
  received[code] = options;
};

const unsubscribeA = registry.subscribe(['physical_table_name'], listener, provider);
const unsubscribeB = registry.subscribe(['database_view_name'], listener, provider);
await new Promise((resolve) => setTimeout(resolve, 80));

assert.equal(calls.length, 1, 'Codes registered together must use one request.');
assert.equal(calls[0].serviceName, 'admin');
assert.equal(calls[0].serviceMethod, 'resolveOptionItemsBatch');
assert.deepEqual(
  [...calls[0].payload.sourceCodes].sort(),
  ['database_view_name', 'physical_table_name'],
);
assert.equal(received.physical_table_name[0].value, 'physical_table_name');
assert.equal(received.database_view_name[0].value, 'database_view_name');

unsubscribeA();
unsubscribeB();
delete received.physical_table_name;
delete received.database_view_name;
const unsubscribeCached = registry.subscribe(
  ['physical_table_name', 'database_view_name'],
  listener,
  provider,
);
await new Promise((resolve) => setTimeout(resolve, 50));
assert.equal(calls.length, 1, 'Fresh global cache must prevent a repeated request.');
assert.equal(
  received.physical_table_name[0].value,
  'physical_table_name',
  'A new subscriber must receive cached options synchronously.',
);
assert.equal(received.database_view_name[0].value, 'database_view_name');
unsubscribeCached();

calls.length = 0;
await registry.refresh(['physical_table_name'], provider);
assert.equal(calls.length, 1, 'Explicit refresh must bypass a fresh cache entry.');
assert.deepEqual(calls[0].payload.sourceCodes, ['physical_table_name']);

registry.invalidate();
calls.length = 0;
let resolveSlowRequest;
const slowServiceApi = {
  invoke(_serviceName, _serviceMethod, payload) {
    calls.push(payload.sourceCodes);
    return new Promise((resolve) => {
      resolveSlowRequest = resolve;
    });
  },
};
const unsubscribeSlow = registry.subscribe(['race_code'], listener, () => slowServiceApi);
await new Promise((resolve) => setTimeout(resolve, 40));
const refreshPromise = registry.refresh(['race_code'], provider);
await refreshPromise;
resolveSlowRequest({
  race_code: {
    options: [{ label: 'stale', value: 'stale' }],
    cacheTtlSeconds: 60,
  },
});
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
  registry.peek('race_code')[0].value,
  'race_code',
  'A stale request must not overwrite an explicit refresh result.',
);
unsubscribeSlow();

registry.invalidate();
calls.length = 0;
const zeroTtlServiceApi = {
  async invoke(serviceName, serviceMethod, payload) {
    calls.push({ serviceName, serviceMethod, payload });
    return Object.fromEntries(payload.sourceCodes.map((code) => [code, {
      options: [{ label: code, value: code }],
      cacheTtlSeconds: 0,
    }]));
  },
};
const zeroTtlProvider = () => zeroTtlServiceApi;
const unsubscribeExisting = registry.subscribe(['zero_ttl'], listener, zeroTtlProvider);
await new Promise((resolve) => setTimeout(resolve, 50));
unsubscribeExisting();
const unsubscribeReopen = registry.subscribe(['zero_ttl'], listener, zeroTtlProvider);
await new Promise((resolve) => setTimeout(resolve, 50));
assert.equal(
  calls.length,
  1,
  'The global cache must reuse zero-TTL values until explicitly invalidated.',
);
unsubscribeReopen();

const source = await readFile(entryPoint, 'utf8');
assert.match(source, /cacheTtlSeconds/);
assert.match(source, /inFlight/);
assert.match(source, /subscribers/);
assert.match(source, /version: 2/);

console.log('Option source registry runtime regression test passed.');
