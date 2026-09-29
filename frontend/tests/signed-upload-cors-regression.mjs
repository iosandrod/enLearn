import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const [webClient, mobileClient, storageDriver, migration, bodyMigration] = await Promise.all([
  readFile(new URL('../composables/useFilesApi.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../mobile-package/lowcode/src/runtime/native-capabilities.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../api/src/files-service/supabase-storage.driver.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260928100000_fix_signed_upload_cors.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260929100000_fix_signed_upload_body.sql', import.meta.url), 'utf8'),
]);

assert.match(webClient, /\/api\/files\/upload/);
assert.match(webClient, /form\.append\('file', input\.file/);
assert.match(webClient, /xhr\.open\('POST', uploadEndpoint\(\)\);/);
assert.match(mobileClient, /method: 'PUT'/);
assert.match(mobileClient, /body: file/);
assert.doesNotMatch(mobileClient, /formData:\s*\{\s*cacheControl/);
assert.doesNotMatch(mobileClient, /['"]x-upsert['"]\s*:/);
assert.match(storageDriver, /async function createSignedUpload/);
assert.match(storageDriver, /async uploadObject\(input: UploadObjectInput\)/);
assert.match(migration, /fix_signed_upload_cors|x-upsert/);
assert.match(migration, /xhr\.open\('PUT', url\);\s*\n\s*const body = new FormData\(\)/);
assert.match(bodyMigration, /xhr\.send\(file\)/);
assert.match(bodyMigration, /new FormData\(\)/);

console.log('Signed upload CORS regression test passed.');
