import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `
      export { useAuth } from './composables/useAuth';
      export { useAuthState } from './composables/useAuthState';
      export { $fetch, useState, createError, navigateTo } from './src/spa-compat';
      export { computed } from 'vue';
    `,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  define: {
    'import.meta.server': 'false',
    'import.meta.env.DEV': 'true',
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://localhost/api'),
    'import.meta.env.VITE_SOCKET_BASE_URL': JSON.stringify(''),
  },
  plugins: [{
    name: 'stub-content-and-router',
    setup(build) {
      build.onResolve({ filter: /^\.\/(router|spa-content)$/ }, (args) => ({
        path: args.path,
        namespace: 'test-stub',
      }));
      build.onLoad({ filter: /.*/, namespace: 'test-stub' }, (args) => ({
        contents: args.path === './router'
          ? 'export const router = { push: async (path) => { globalThis.navigations.push(path); } };'
          : 'export function getContentResponse() { throw new Error("Unexpected content request"); }',
      }));
    },
  }],
});
const runtime = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
Object.assign(globalThis, runtime);

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
globalThis.localStorage = memoryStorage();
globalThis.window = {
  localStorage,
  sessionStorage: memoryStorage(),
  location: { origin: 'http://localhost', pathname: '/signin' },
};
globalThis.navigations = [];

const userKeys = [
  'enlearn_access_token', 'enlearn_refresh_token', 'enlearn_active_account_id',
  'enlearn_dev_test_user', 'enlearn_login_account_set_id', 'hikari-dashboard-settings',
  'tldraw-vue.templates.v1', 'PAGE_DATA_KEY',
  'enlearn.workflow.designer.account-a.default',
  'enlearn.workflow.designer.account-b.workflow-a',
  'enlearn.trigger-workflow-editor.account-a',
  'enlearn.trigger-workflow-editor.account-b',
];
const preferences = [
  'enlearn_login_account', 'enlearn_mes_web_device_id', 'enlearn_mes_web_local_sequence',
  'vue-minimap', 'vue-minimap-position', 'unrelated-app-setting',
];
const auth = runtime.useAuth();
const payload = {
  user: { id: 'old-user' }, profile: { name: 'Old user' }, permissions: ['read'],
  accounts: [{ account_id: 'account-a' }], activeAccount: { account_id: 'account-a' },
  session: { expiresAt: 123 },
};

function seedSession() {
  for (const key of userKeys) localStorage.setItem(key, 'private-data');
  for (const key of preferences) localStorage.setItem(key, 'keep');
  localStorage.setItem('enlearn_access_token', 'old-access');
  localStorage.setItem('enlearn_refresh_token', 'old-refresh');
  localStorage.setItem('enlearn_active_account_id', 'account-a');
  for (const [key, value] of Object.entries(payload)) auth[key].value = value;
  auth.devTestUsers.value = [{ id: 'old-user' }];
  auth.activeDevTestUserId.value = 'old-user';
}
function assertStorageCleared() {
  for (const key of userKeys) assert.equal(localStorage.getItem(key), null, key);
  for (const key of preferences) assert.equal(localStorage.getItem(key), 'keep', key);
}
function assertLoggedOut() {
  assertStorageCleared();
  assert.equal(auth.user.value, null);
  assert.equal(auth.profile.value, null);
  assert.equal(auth.session.value, null);
  assert.equal(auth.activeAccount.value, null);
  assert.deepEqual(auth.permissions.value, []);
  assert.deepEqual(auth.accounts.value, []);
  assert.deepEqual(auth.devTestUsers.value, []);
  assert.equal(auth.activeDevTestUserId.value, '');
  assert.equal(auth.ready.value, true);
  assert.equal(window.sessionStorage.getItem('enlearn_dev_auto_login_disabled'), '1');
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const originalWarn = console.warn;
const warnings = [];
console.warn = (...args) => warnings.push(args);
try {
  for (const outcome of ['success', 'server-error', 'network-error', 'expired-token']) {
    seedSession();
    const response = deferred();
    let requestCount = 0;
    globalThis.fetch = (url, options) => {
      requestCount += 1;
      assert.ok(url.endsWith('/auth/signout'));
      assert.equal(options.headers.get('Authorization'), 'Bearer old-access');
      assert.equal(options.headers.get('X-Account-Id'), 'account-a');
      return response.promise;
    };
    const epoch = auth.accountEpoch.value;
    const logout = auth.signOut();
    assertLoggedOut(); // The server has not responded yet.
    assert.equal(auth.accountEpoch.value, epoch + 1);
    await new Promise(setImmediate);
    assert.equal(navigations.at(-1), '/signin');
    if (outcome === 'network-error') response.reject(new Error('Offline'));
    else response.resolve(json({ message: outcome }, outcome === 'server-error' ? 500 : outcome === 'expired-token' ? 401 : 200));
    await logout;
    assertLoggedOut();
    assert.equal(requestCount, 1, 'Logout must not refresh or retry authentication');
  }
  assert.equal(warnings.length, 3);

  // A delayed logout error cannot clear a new login in the same tab.
  seedSession();
  const delayedLogout = deferred();
  globalThis.fetch = () => delayedLogout.promise;
  const logout = auth.signOut();
  localStorage.setItem('enlearn_access_token', 'new-access');
  localStorage.setItem('enlearn_refresh_token', 'new-refresh');
  delayedLogout.resolve(json({ message: 'Invalid token' }, 401));
  await logout;
  assert.equal(localStorage.getItem('enlearn_access_token'), 'new-access');

  // An in-flight token refresh cannot restore tokens after logout.
  seedSession();
  const refreshResponse = deferred();
  const refreshStarted = deferred();
  globalThis.fetch = (url) => {
    if (url.endsWith('/auth/refresh')) {
      refreshStarted.resolve();
      return refreshResponse.promise;
    }
    return Promise.resolve(url.endsWith('/auth/signout') ? json({}) : json({ message: 'JWT expired' }, 401));
  };
  const pendingService = runtime.$fetch('/api/service').catch((error) => error);
  await refreshStarted.promise;
  await auth.signOut();
  refreshResponse.resolve(json({ session: { access_token: 'stale-access', refresh_token: 'stale-refresh' } }));
  assert.equal((await pendingService).statusCode, 401);
  assertLoggedOut();

  // A stale authenticated request must also leave a subsequent login intact.
  seedSession();
  const staleResponse = deferred();
  globalThis.fetch = (url) => {
    assert.ok(!url.endsWith('/auth/refresh'), 'A stale request must not refresh the new session');
    return url.endsWith('/auth/signout') ? Promise.resolve(json({})) : staleResponse.promise;
  };
  const staleService = runtime.$fetch('/api/service').catch((error) => error);
  await auth.signOut();
  localStorage.setItem('enlearn_access_token', 'new-access');
  localStorage.setItem('enlearn_refresh_token', 'new-refresh');
  staleResponse.resolve(json({ message: 'Invalid token' }, 401));
  await staleService;
  assert.equal(localStorage.getItem('enlearn_access_token'), 'new-access');

  // An in-flight /me response cannot restore user/account state after logout.
  seedSession();
  const meResponse = deferred();
  globalThis.fetch = (url) => url.endsWith('/auth/me') ? meResponse.promise : Promise.resolve(json({}));
  const pendingInit = auth.init(true);
  await auth.signOut();
  meResponse.resolve(json(payload));
  await pendingInit;
  assertLoggedOut();

  // Session expiry uses the same user-data cleanup as explicit logout.
  seedSession();
  localStorage.removeItem('enlearn_refresh_token');
  globalThis.fetch = async () => json({ message: 'Invalid token' }, 401);
  await assert.rejects(runtime.$fetch('/api/service'), { statusCode: 401 });
  assertStorageCleared();
} finally {
  console.warn = originalWarn;
}
console.log('Logout user-storage regression tests passed.');
