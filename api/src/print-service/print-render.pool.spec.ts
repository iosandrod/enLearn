import assert from 'node:assert/strict';
import { PrintRenderPool } from './print-render.pool';
import type { PrintOutput } from './print.types';

const output: PrintOutput = {
  format: 'png',
  page: { widthMm: 50, heightMm: 40 },
  dpi: 96,
  scale: 1,
  printBackground: true
};

const document = `<!doctype html><html><head><style>
  html,body{margin:0;padding:0}.print-page{width:50mm;height:40mm;page-break-after:always}
</style></head><body>
  <section data-print-page="1" class="print-page">page one</section>
  <section data-print-page="2" class="print-page">page two</section>
</body></html>`;

const pool = new PrintRenderPool();
async function main() {
  try {
    const images = await pool.render([document], output);
    assert.equal(images.files.length, 2);
    assert.deepEqual(images.files.map((file) => file.name), [
      'record-0001-page-001.png',
      'record-0001-page-002.png'
    ]);
    assert.ok(images.files.every((file) => file.body.length > 100));

    const pdf = await pool.render([document], { ...output, format: 'pdf' });
    assert.equal(pdf.files.length, 1);
    assert.equal(pdf.files[0].mimeType, 'application/pdf');
    assert.ok(pdf.files[0].body.subarray(0, 4).equals(Buffer.from('%PDF')));
  } finally {
    await pool.onModuleDestroy();
  }
  console.log('print render pool multi-page tests passed');
}

void main();
