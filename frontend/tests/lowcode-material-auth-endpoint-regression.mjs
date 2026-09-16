import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [catalogSource, serviceApiSource, fetchSource] = await Promise.all([
  readFile(new URL('../../packages/lowcode-framework/src/lowcode/material-runtime/catalog.ts', import.meta.url), 'utf8'),
  readFile(new URL('../composables/useServiceApi.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/spa-compat.ts', import.meta.url), 'utf8'),
]);

assert.match(
  catalogSource,
  /serviceApi\.listPublishedLowCodeMaterials[\s\S]*serviceApi\.invoke<unknown\[]>\('lowcode', 'listItems'/,
  'The material catalog must prefer the dedicated public loader while preserving legacy-host fallback.',
);
assert.match(
  serviceApiSource,
  /request<\{ materials: TResponse\[] \}>\('\/api\/auth\/lowcode-materials'\)/,
  'The frontend material loader must call the dedicated Auth endpoint.',
);
assert.match(
  serviceApiSource,
  /getPublicLowCodeCatalog[\s\S]*'\/api\/auth\/lowcode-catalog'/,
  'The frontend service API must expose the anonymous low-code catalog.',
);
assert.match(
  fetchSource,
  /!apiPath\.startsWith\('\/auth\/lowcode-materials'\)/,
  'The public material endpoint must not trigger auth refresh.',
);
assert.match(
  fetchSource,
  /!apiPath\.startsWith\('\/auth\/lowcode-catalog'\)/,
  'The public low-code catalog must not trigger auth refresh or receive account context.',
);
assert.match(
  fetchSource,
  /!apiPath\.startsWith\('\/auth\/account-options'\) &&\s*!apiPath\.startsWith\('\/auth\/lowcode-materials'\)/,
  'The public material endpoint must not receive an account header.',
);

console.log('Low-code material Auth endpoint regression test passed.');
