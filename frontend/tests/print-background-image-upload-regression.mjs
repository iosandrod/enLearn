import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

const [visualMaterial, backgroundPanel, migration, applyScript] = await Promise.all([
  source('packages/lowcode-framework/src/visual-editor/form-material-visual-components.tsx'),
  source('packages/tldraw-vue/src/components/VueBackgroundPanel.vue'),
  source('supabase/migrations/20260926140000_print_background_image_upload_props.sql'),
  source('api/scripts/apply-print-background-image-upload.ts'),
]);

assert.match(visualMaterial, /mode: 'image'/);
assert.match(visualMaterial, /imageTypes: \['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'\]/);
assert.match(backgroundPanel, /normalizeBackgroundSchema/);
assert.match(backgroundPanel, /mode: 'image'/);
assert.match(backgroundPanel, /imageTypes: \[\.\.\.IMAGE_TYPES\]/);
assert.match(backgroundPanel, /fileTypes: \[\.\.\.IMAGE_TYPES\]/);
assert.match(migration, /'imageTypes', jsonb_build_array\('jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'\)/);
assert.match(migration, /'mode', 'image'/);
assert.match(migration, /'limitCount', 1/);
assert.match(applyScript, /props\.mode !== 'image'/);
assert.match(applyScript, /props\.imageTypes/);

console.log('Print background image upload regression test passed.');
