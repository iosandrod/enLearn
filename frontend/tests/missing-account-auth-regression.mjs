import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fetchSource = await readFile(new URL('../src/spa-compat.ts', import.meta.url), 'utf8');
const authSource = await readFile(new URL('../composables/useAuth.ts', import.meta.url), 'utf8');

assert.match(fetchSource, /normalized\.includes\('x-account-id is required'\)/);
assert.match(fetchSource, /const missingAccountContext = isMissingAccountContext\(statusMessage\)/);
assert.match(fetchSource, /authFailure && !missingAccountContext && canRefreshForPath\(apiPath\)/);
assert.match(fetchSource, /statusCode: authFailure \? 401 : response\.status/);
assert.match(fetchSource, /statusMessage: missingAccountContext \? '未登录' : statusMessage/);
assert.match(authSource, /message\.includes\('x-account-id is required'\)/);

console.log('missing account authentication regression tests passed');
