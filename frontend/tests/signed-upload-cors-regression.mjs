import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const [webClient, mobileClient, storageDriver, migration] = await Promise.all([
  readFile(new URL('../composables/useFilesApi.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../mobile-package/lowcode/src/runtime/native-capabilities.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../api/src/files-service/supabase-storage.driver.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260928100000_fix_signed_upload_cors.sql', import.meta.url), 'utf8'),
]);

assert.match(webClient, /xhr\.open\('PUT', upload\.signedUrl\);/);
assert.doesNotMatch(webClient, /setRequestHeader\(['"]x-upsert['"]/);
assert.match(mobileClient, /method: 'PUT'/);
assert.doesNotMatch(mobileClient, /['"]x-upsert['"]\s*:/);
assert.match(storageDriver, /createSignedUploadUrl\(input\.objectKey, \{ upsert: false \}\)/);
assert.match(migration, /fix_signed_upload_cors|x-upsert/);
assert.match(migration, /xhr\.open\('PUT', url\);\s*\n\s*const body = new FormData\(\)/);

console.log('Signed upload CORS regression test passed.');
