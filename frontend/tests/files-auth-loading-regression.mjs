import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [pageSource, apiSource] = await Promise.all([
  readFile(new URL('../pages/dashboard/files.vue', import.meta.url), 'utf8'),
  readFile(new URL('../composables/useFilesApi.ts', import.meta.url), 'utf8'),
]);

assert.match(pageSource, /const auth = useAuth\(\);/);
assert.match(
  pageSource,
  /onMounted\(async \(\) => \{\s*await auth\.init\(\);\s*await loadAll\(\);\s*\}\);/,
  'The file list must wait for authentication before its initial request.',
);
assert.doesNotMatch(
  pageSource,
  /onMounted\(\(\) => \{\s*void loadAll\(\);\s*\}\);/,
  'The file page must not query before the current user is available.',
);
assert.match(
  pageSource,
  /\(\) => auth\.user\.value\?\.id \?\? ''[\s\S]*?userId === previousUserId[\s\S]*?void loadAll\(\);/,
  'Switching authenticated users must refresh the owner-scoped file list.',
);
assert.match(
  apiSource,
  /const rows = Array\.isArray\(result\)[\s\S]*?Array\.isArray\(result\?\.rows\)/,
  'The file client must tolerate both legacy array and paged list responses.',
);
assert.match(apiSource, /items: rows\.map\(normalizeFile\)/);

console.log('File authentication loading regression test passed.');
