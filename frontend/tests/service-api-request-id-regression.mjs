import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../composables/useServiceApi.ts', import.meta.url),
  'utf8',
);

assert.match(source, /export type ServiceInvokeOptions = \{\s*requestId\?: string;/s);
assert.match(source, /const requestId = options\.requestId\?\.trim\(\) \|\| createRequestId\(\)/);
assert.match(source, /headers: \{\s*'X-Request-Id': requestId\s*\}/s);
assert.doesNotMatch(
  source,
  /headers: \{\s*'X-Request-Id': createRequestId\(\)/s,
  'A retried fetch must reuse the request id captured by invoke.',
);

console.log('service API request-id regression tests passed');
