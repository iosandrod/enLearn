import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parse } from '@vue/compiler-sfc';

const source = await readFile(new URL('../../packages/lowcode-framework/src/lowcode/block-materials/label-designer/LabelDesignerMaterial.vue', import.meta.url), 'utf8');
const ast = ts.createSourceFile('material.ts', parse(source).descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
const names = new Set(['compressTemplatePreview', 'createTemplatePreviewDataUrl', 'getPreviewBounds', 'isPreviewSize', 'sanitizePreviewColor', 'normalizePreviewOpacity', 'getPreviewAspectRatio', 'resolvePreviewImageUrl', 'escapePreviewAttribute']);
const code = ts.transpileModule(ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map((node) => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const { default: { chromium } } = await import(pathToFileURL(resolve(import.meta.dirname, '../../node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js')).href);
const browser = await chromium.launch({ executablePath: process.env.PRINT_TEMPLATE_PICKER_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: code });
  const result = await page.evaluate(async () => {
    const measure = async (url) => {
      if (!url) throw new Error('Expected a compressed thumbnail.');
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return { length: url.length, width: canvas.width, height: canvas.height, prefix: url.slice(0, 30), center: [...context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data] };
    };
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 2400;
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 42;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = seed & 255;
      pixels.data[i + 1] = (seed >>> 8) & 255;
      pixels.data[i + 2] = (seed >>> 16) & 255;
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const original = canvas.toDataURL('image/png');
    const compressed = await compressTemplatePreview(original);
    const redSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><foreignObject width="600" height="800"><div xmlns="http://www.w3.org/1999/xhtml" style="width:600px;height:800px;background:#ff0000">文字</div></foreignObject></svg>';
    const generated = await createTemplatePreviewDataUrl({ getSvgString: async () => ({ svg: redSvg }) }, ['shape:test'], { pageBounds: { w: 600, h: 800 }, background: { color: '#ffffff' } });
    const blank = await createTemplatePreviewDataUrl({}, [], { pageBounds: { w: 800, h: 400 }, background: { color: '#00ff00' } });
    const background = await createTemplatePreviewDataUrl({}, [], { pageBounds: { w: 800, h: 400 }, background: { imageUrl: original, imageSize: 'contain' } });
    return {
      originalLength: original.length, noise: await measure(compressed), generated: await measure(generated),
      blank: await measure(blank), background: await measure(background),
      idempotent: compressed === await compressTemplatePreview(compressed),
      empty: await compressTemplatePreview(null), invalid: await compressTemplatePreview('data:image/png;base64,invalid'),
    };
  });
  for (const image of [result.noise, result.generated, result.blank, result.background]) {
    assert.ok(image.length <= 8192, JSON.stringify(image));
    assert.ok(Math.max(image.width, image.height) <= 240);
    assert.match(image.prefix, /^data:image\/(webp|jpeg|png);base64,/);
  }
  assert.ok(result.noise.length < result.originalLength / 100);
  assert.ok(result.generated.center[0] > 220 && result.generated.center[1] < 35, 'Shape content must survive nested SVG rasterization.');
  assert.ok(result.blank.center[1] > 220 && result.blank.center[0] < 35, 'Page background must survive compression.');
  assert.equal(result.idempotent, true);
  assert.equal(result.empty, null);
  assert.equal(result.invalid, null);
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
