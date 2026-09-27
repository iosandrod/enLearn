import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const signupSource = readFileSync(resolve('pages/signup.vue'), 'utf8');
const signinSource = readFileSync(resolve('pages/signin.vue'), 'utf8');
const authSource = readFileSync(resolve('composables/useAuth.ts'), 'utf8');
const compatSource = readFileSync(resolve('src/spa-compat.ts'), 'utf8');

assert.ok(signupSource.includes('savePendingSignup({ email, password, accountId })'));
assert.ok(signupSource.includes("navigateTo('/signin?registered=1', { replace: true })"));
assert.ok(signinSource.includes('password: pendingSignup?.password'));
assert.ok(signinSource.includes('accountId: signupAccountId.value || undefined'));
assert.ok(authSource.includes('{ accountId: requestAccountId }'));
assert.ok(compatSource.includes("headers.set('X-Account-Id', accountId)"));

console.log('signup account context regression tests passed');
