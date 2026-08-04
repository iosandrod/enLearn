import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authSource = await readFile(new URL('../composables/useAuth.ts', import.meta.url), 'utf8');
const layoutSource = await readFile(new URL('../layouts/dashboard.vue', import.meta.url), 'utf8');
const fetchSource = await readFile(new URL('../src/spa-compat.ts', import.meta.url), 'utf8');

assert.match(authSource, /postAuthJson<AppAuthPayload>\('\/auth\/dev-impersonate'/);
assert.match(authSource, /persistAuthTokens\(payload\)/);
assert.match(authSource, /applyAuthPayload\(payload\)/);
assert.match(authSource, /DEV_IMPERSONATOR_REFRESH_TOKEN_KEY/);
assert.match(authSource, /Authorization: `Bearer \$\{options\.authorization\}`/);
assert.match(authSource, /async function loadDevTestUsers\(\)/);
assert.match(authSource, /return true;/);
assert.match(authSource, /enlearn:auth-user-changed/);
assert.match(layoutSource, /await auth\.switchDevTestUser\(userId\)/);
assert.match(layoutSource, /会同步切换本地 Token/);
assert.match(fetchSource, /recoverDevImpersonatorSession/);
assert.match(fetchSource, /window\.location\.reload\(\)/);

console.log('frontend development impersonation regression tests passed');
