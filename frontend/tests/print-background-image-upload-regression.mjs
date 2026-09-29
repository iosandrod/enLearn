import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

const [visualMaterial, backgroundPanel, migration, applyScript, backendMigration, backgroundStore, canvas, designer] = await Promise.all([
  source('packages/lowcode-framework/src/visual-editor/form-material-visual-components.tsx'),
  source('packages/tldraw-vue/src/components/VueBackgroundPanel.vue'),
  source('supabase/migrations/20260926140000_print_background_image_upload_props.sql'),
  source('api/scripts/apply-print-background-image-upload.ts'),
  source('supabase/migrations/20260929140000_vxe_upload_backend_preview.sql'),
  source('packages/tldraw-vue/src/editor/templateStore.ts'),
  source('packages/tldraw-vue/src/components/VueCanvas.vue'),
  source('packages/tldraw-vue/src/TldrawVue.vue'),
]);

assert.match(visualMaterial, /mode: 'image'/);
assert.match(visualMaterial, /imageTypes: \['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'\]/);
assert.match(backgroundPanel, /normalizeBackgroundSchema/);
assert.match(backgroundPanel, /mode: 'image'/);
assert.match(backgroundPanel, /imageTypes: \[\.\.\.IMAGE_TYPES\]/);
assert.match(backgroundPanel, /fileTypes: \[\.\.\.IMAGE_TYPES\]/);
assert.match(backgroundPanel, /showPreview: true/);
assert.match(backgroundPanel, /operation: 'getDownloadUrl'/);
assert.match(backgroundPanel, /imageFileId: fileId/);
assert.match(backgroundPanel, /function clearBackgroundImage/);
assert.match(backgroundPanel, /previewRequest \+= 1/);
assert.match(backgroundPanel, /imageFileId: '',\s*\n\s*imageUrl: ''/);
assert.match(backgroundStore, /imageFileId\?: string/);
assert.match(canvas, /imageFileId: config\.background\.imageFileId \?\? ''/);
assert.match(designer, /imageFileId: config\.background\.imageFileId \?\? ''/);
assert.match(migration, /'imageTypes', jsonb_build_array\('jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'\)/);
assert.match(migration, /'mode', 'image'/);
assert.match(migration, /'limitCount', 1/);
assert.match(applyScript, /props\.mode !== 'image'/);
assert.match(applyScript, /props\.imageTypes/);
assert.match(backendMigration, /xhr\.open\('POST', '\/api\/files\/upload'\)/);
assert.match(backendMigration, /'showPreview', true/);
assert.match(backendMigration, /material_version = '1\.4\.0'/);

console.log('Print background image upload regression test passed.');
