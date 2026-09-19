import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

const [formPanel, shapes, imageNode, svgExport] = await Promise.all([
  source('packages/tldraw-vue/src/components/LowCodeFormPanel.vue'),
  source('packages/tldraw-vue/src/editor/vueDefaultShapes.ts'),
  source('packages/tldraw-vue/src/components/shapes/VueImageShapeNode.vue'),
  source('packages/tldraw-vue/src/editor/vueSvgExport.ts'),
]);

assert.match(shapes, /fileId\?: string/);
assert.match(shapes, /fileId: T\.string\.optional\(\)/);
assert.match(formPanel, /field\.field === 'src' && field\.component === 'vxe-upload'/);
assert.match(formPanel, /operation: 'getDownloadUrl'/);
assert.match(formPanel, /return \{ src: await readBlobAsDataUrl\(blob\) \}/);
assert.match(formPanel, /if \(fileId\) model\.src = fileId/);
assert.match(formPanel, /isFileObjectId\(legacyFileId\)/);
assert.match(formPanel, /getCurrentPageShapes\(\)[\s\S]*hydrateUploadedImageShape/);
assert.match(imageNode, /<img v-if="imageSrc" :src="imageSrc"/);
assert.match(svgExport, /createElement\('image',[\s\S]*href: src/);

console.log('Print designer uploaded image regression test passed.');
