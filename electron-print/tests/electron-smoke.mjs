import assert from 'node:assert/strict';
import { app, nativeImage } from 'electron';
import { createServer } from 'node:http';
import { PrinterEngine } from '../dist/printer-engine.js';
import { DEFAULT_CONFIG, normalizePreviewRequest, normalizePrintRequest } from '../dist/validation.js';

void app.whenReady().then(run);
async function run() {
const engine = new PrinterEngine();
let externalRequests = 0;
const assets = createServer((_request, response) => { externalRequests++; response.end('blocked'); });
await new Promise(resolve => assets.listen(0, '127.0.0.1', resolve));
const assetUrl = `http://127.0.0.1:${assets.address().port}/image`;
try {
  const printers = await engine.listPrinters();
  console.log(`System printers enumerated: ${printers.length}`);
  const input = { html: '<section data-print-page="1" style="width:50mm;height:30mm;background:#123456">{{title}}</section>', records: [{ title: '生产标签' }], page: { widthMm: 50, heightMm: 30 } };
  const png = await engine.preview(normalizePreviewRequest({ ...input, dpi: 144 }, DEFAULT_CONFIG));
  assert.equal(png.body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(Math.abs(png.body.readUInt32BE(16) - 50 * 144 / 25.4) < 2);
  assert.ok(Math.abs(png.body.readUInt32BE(20) - 30 * 144 / 25.4) < 2);
  const pixels = nativeImage.createFromBuffer(png.body).toBitmap();
  const center = 4 * (Math.floor(png.body.readUInt32BE(20) / 2) * png.body.readUInt32BE(16) + Math.floor(png.body.readUInt32BE(16) / 2));
  assert.equal(pixels.subarray(center, center + 3).toString('hex'), '563412');
  const pdf = await engine.preview(normalizePreviewRequest({ ...input, format: 'pdf' }, DEFAULT_CONFIG));
  assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
  const pdfText = pdf.body.toString('latin1');
  assert.equal((pdfText.match(/\/Type\s*\/Page\b/g) || []).length, 1);
  const size = pdfText.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
  assert.ok(size); assert.ok(Math.abs(Number(size[1]) - 50 * 72 / 25.4) < 1); assert.ok(Math.abs(Number(size[2]) - 30 * 72 / 25.4) < 1);
  const multi = await engine.preview(normalizePreviewRequest({ html: '<p>{{title}}</p>', records: [{ title: 'one' }, { title: 'two' }], format: 'pdf', page: { widthMm: 100, heightMm: 50 } }, DEFAULT_CONFIG));
  assert.equal((multi.body.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 2);
  const twoPages = { ...input, html: input.html + input.html.replace('#123456', '#abcdef'), pageIndex: 1 };
  const second = await engine.preview(normalizePreviewRequest(twoPages, DEFAULT_CONFIG));
  assert.equal(second.pageCount, 2); assert.notDeepEqual(second.body, png.body);
  await assert.rejects(() => engine.preview(normalizePreviewRequest({ ...input, pageIndex: 2 }, DEFAULT_CONFIG)), /pageIndex/);
  await engine.preview(normalizePreviewRequest({ ...input, html: `<p>图片应被阻止</p><img src="${assetUrl}">` }, DEFAULT_CONFIG));
  assert.equal(externalRequests, 0);
  await Promise.all(Array.from({ length: 8 }, () => engine.preview(normalizePreviewRequest(input, DEFAULT_CONFIG))));
  assert.equal(engine.previewStatus.active, 0); assert.equal(engine.previewStatus.queued, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => engine.preview(normalizePreviewRequest(input, DEFAULT_CONFIG), controller.signal), /取消/);

  // Intercept Electron's final driver call to verify units/options without consuming paper.
  const captured = [];
  const intercept = (_event, contents) => {
    contents.print = (options, callback) => { captured.push(options); callback(true, ''); };
  };
  app.on('web-contents-created', intercept);
  engine.listPrinters = async () => [{ name: 'Fixture Printer' }];
  const printed = await engine.print(normalizePrintRequest({ ...input, printerName: 'Fixture Printer', copies: 3, page: { ...input.page, marginMm: { top: 1, right: 0, bottom: 0, left: 1 } } }, DEFAULT_CONFIG));
  assert.equal(printed.success, true); assert.equal(captured[0].silent, true); assert.equal(captured[0].deviceName, 'Fixture Printer');
  assert.deepEqual(captured[0].pageSize, { width: 50000, height: 30000 }); assert.equal(captured[0].copies, 3);
  assert.ok(Math.abs(captured[0].margins.top - 96 / 25.4) < 0.001);
  app.removeListener('web-contents-created', intercept);
  console.log('Electron smoke passed: PDF dimensions/pages, PNG DPI/page selection, 4 renderers, blocked assets, cancellation and silent driver options.');
  app.exit(0);
} catch (error) {
  console.error(error); app.exit(1);
} finally { engine.destroy(); assets.close(); }
}
