import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/spa-compat.ts', import.meta.url), 'utf8');
const serviceApi = await readFile(new URL('../composables/useServiceApi.ts', import.meta.url), 'utf8');

assert.match(source, /LOW_CODE_HTTP_CACHE_TTL_MS/);
assert.match(source, /lowCodeHttpResponseCache = new Map/);
assert.match(source, /lowCodeHttpResponseRequests = new Map/);
assert.match(source, /cloneHttpCacheValue/);
assert.match(source, /Page code is the identity of a low-code definition/);
assert.match(source, /includeData = body\.postData\.includeData/);
assert.match(source, /new Set\(codes\)/);
assert.doesNotMatch(source, /stableSerialize\(body\)/);
assert.match(source, /body\.serviceName !== 'lowcode'/);
assert.match(source, /body\.serviceMethod !== 'listItems'/);
assert.match(source, /lowcode_pages/);
assert.match(source, /lowcode_form_definitions/);
assert.match(source, /const pending = lowCodeHttpResponseRequests\.get\(cacheKey\)/);
assert.match(source, /fetchBackendUncached<T>\(url, options\)/);
assert.match(source, /isLowCodeWriteRequest\(apiPath, method, options\.body\)/);
assert.match(source, /body\.serviceName !== 'admin'/);
assert.match(source, /lowcode_pages.*lowcode_form_definitions/);
assert.match(source, /clearLowCodeHttpResponseCache\(\)/);
assert.match(serviceApi, /readLowCodeWriteTable/);
assert.match(serviceApi, /serviceName === 'admin'/);
assert.match(serviceApi, /invalidateLowCodeListCache\(writtenLowCodeTable\)/);

console.log('Low-code HTTP cache regression test passed.');
