import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const filesPage = await readFile(
  new URL('../pages/dashboard/files.vue', import.meta.url),
  'utf8',
);
const filesApi = await readFile(
  new URL('../composables/useFilesApi.ts', import.meta.url),
  'utf8',
);

assert.match(
  filesPage,
  /isImage\(file\)\s*&&\s*\['uploaded',\s*'ready'\]\.includes\(file\.status\)/,
  'Only uploaded or ready images may request download URLs for thumbnails.',
);
assert.doesNotMatch(
  filesPage,
  /uploadDialog\.phase === 'failed' && errorMessage/,
  'Upload failures should use the global VXE message instead of inline dialog text.',
);
assert.match(filesPage, /useVxeMessage\(errorMessage, 'error'\)/);
assert.match(filesPage, /showVxeMessage\('文件已上传完成。', 'success'\)/);
assert.match(
  filesApi,
  /attempt = 0[\s\S]*?attempt \+ 1[\s\S]*?xhr\.ontimeout/,
  'Signed uploads should retry transient browser network failures.',
);
assert.match(
  filesApi,
  /async function upload\(input: UploadFileInput\) \{\s*return uploadFileToBackend\(input\);/,
  'The browser should upload through the backend upload endpoint.',
);
assert.doesNotMatch(filesApi, /setRequestHeader\(['"]x-upsert['"]/);

console.log('File upload progress regression test passed.');
