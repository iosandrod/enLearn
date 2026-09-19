import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [mainSource, caddySource] = await Promise.all([
  readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../Caddyfile', import.meta.url), 'utf8'),
]);

assert.match(
  mainSource,
  /addEventListener\('vite:preloadError',[\s\S]*?preventDefault\(\)[\s\S]*?location\.reload\(\)/,
  'Production clients must recover when a stale tab requests a removed Vite chunk.',
);
assert.match(
  mainSource,
  /cleanupLegacyServiceWorkers[\s\S]*?getRegistrations\(\)[\s\S]*?registration\.unregister\(\)[\s\S]*?caches\.delete/,
  'The app must remove legacy service workers and their stale cache entries.',
);
assert.doesNotMatch(
  mainSource,
  /import\.meta\.env\.DEV[^\n]*serviceWorker/,
  'Legacy service-worker cleanup must also run in production.',
);
assert.match(
  caddySource,
  /@versionedAssets path \/assets\/\*[\s\S]*?Cache-Control "public, max-age=31536000, immutable"/,
  'Hashed Vite assets should be cached immutably.',
);
assert.match(
  caddySource,
  /@appShell not path \/assets\/\*[\s\S]*?Cache-Control "no-cache, no-store, must-revalidate"/,
  'The SPA shell must be revalidated after every deployment.',
);

console.log('Production cache recovery regression passed.');
