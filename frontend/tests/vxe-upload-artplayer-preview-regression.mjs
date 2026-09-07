import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const [migration, moduleRegistry, packageJson] = await Promise.all([
  readFile(new URL('supabase/migrations/20260907230000_vxe_upload_artplayer_inline_preview.sql', root), 'utf8'),
  readFile(new URL('packages/lowcode-framework/src/lowcode/material-runtime/module-registry.ts', root), 'utf8'),
  readFile(new URL('packages/lowcode-framework/package.json', root), 'utf8'),
]);

assert.match(migration, /import Artplayer from 'artplayer'/);
assert.match(migration, /:preview-method="previewMethod"/);
assert.match(migration, /new Artplayer\(\{/);
assert.match(migration, /operation: 'getDownloadUrl'/);
assert.match(migration, /previewMode":"inline"/);
assert.match(migration, /field\.value->>'field' = 'video_file_id'/);
assert.match(migration, /\{props,showPreview\}.*'true'::jsonb/);
assert.doesNotMatch(migration, /VxeModal|vxe-modal/);

assert.match(moduleRegistry, /import Artplayer from 'artplayer'/);
assert.match(moduleRegistry, /artplayer: component\(\(\) => Artplayer\)/);
assert.equal(JSON.parse(packageJson).dependencies.artplayer, '^5.4.0');

console.log('VxeUpload ArtPlayer inline preview regression checks passed.');
