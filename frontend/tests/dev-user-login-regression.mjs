import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authSource = await readFile(new URL('../composables/useAuth.ts', import.meta.url), 'utf8');
const layoutSource = await readFile(new URL('../layouts/dashboard.vue', import.meta.url), 'utf8');
const fetchSource = await readFile(new URL('../src/spa-compat.ts', import.meta.url), 'utf8');

assert.doesNotMatch(authSource, /dev-impersonate/);
assert.match(authSource, /const TEST_USER_PASSWORD = '123456'/);
assert.match(authSource, /postAuthJson<AppAuthPayload>\('\/auth\/signin', \{\s*email: testUser\.email,\s*password: TEST_USER_PASSWORD,\s*accountId/s);
assert.match(authSource, /payload\.user\?\.id !== testUser\.id/);
assert.match(authSource, /persistAuthTokens\(payload\)/);
assert.match(authSource, /applyAuthPayload\(payload\)/);
assert.doesNotMatch(authSource, /DEV_IMPERSONATOR_REFRESH_TOKEN_KEY/);
assert.match(authSource, /Authorization: `Bearer \$\{options\.authorization\}`/);
assert.match(authSource, /async function loadDevTestUsers\(\)/);
assert.match(authSource, /'listAccountLoginUsers'/);
assert.doesNotMatch(authSource, /listApprovalTestUsers/);
assert.match(authSource, /return true;/);
assert.match(authSource, /enlearn:auth-user-changed/);
assert.match(layoutSource, /await auth\.switchDevTestUser\(userId\)/);
assert.match(layoutSource, /使用统一测试密码通过正常登录接口切换/);
assert.doesNotMatch(fetchSource, /recoverDevImpersonatorSession/);
assert.doesNotMatch(fetchSource, /DEV_IMPERSONATOR_REFRESH_TOKEN_KEY/);

console.log('frontend development test-user login regression tests passed');
