import assert from 'node:assert/strict';
import test from 'node:test';
import { compileDocument } from '../src/document.js';
import { DEFAULT_CONFIG, mergeConfig, normalizePreviewRequest, normalizePrintRequest, RequestError } from '../src/validation.js';

test('normalizes label printer settings and custom paper sizes', () => {
  const result = normalizePrintRequest({
    html: '<h1>{{name}}</h1>', records: [{ name: '标签' }], printerName: 'ZDesigner', copies: 3,
    page: { widthMm: 50, heightMm: 30, marginMm: { top: 1, right: 2, bottom: 1, left: 2 } },
    offset: { xMm: -0.5, yMm: 1.2 }
  }, DEFAULT_CONFIG);
  assert.equal(result.page.widthMm, 50);
  assert.equal(result.page.heightMm, 30);
  assert.equal(result.copies, 3);
  assert.deepEqual(result.offset, { xMm: -0.5, yMm: 1.2 });
});

test('rejects active markup and invalid margins', () => {
  assert.throws(() => normalizePrintRequest({ html: '<script>alert(1)</script>', printerName: 'P' }, DEFAULT_CONFIG), RequestError);
  assert.throws(() => normalizePrintRequest({ html: '<div>x</div>', printerName: 'P', page: { widthMm: 50, heightMm: 30, marginMm: { left: 25, right: 25 } } }, DEFAULT_CONFIG), /可打印区域/);
});

test('compiles records without executing HTML values', () => {
  const request = normalizePreviewRequest({ html: '<b>{{name}}</b>', records: [{ name: '<危险>' }], format: 'png', page: { widthMm: 100, heightMm: 50 } }, DEFAULT_CONFIG);
  const document = compileDocument({ ...request, recordIndex: 0 });
  assert.match(document, /&lt;危险&gt;/);
  assert.match(document, /size: 100mm 50mm/);
  assert.match(document, /Content-Security-Policy/);
});

test('merges per-printer profiles while preserving safe server binding', () => {
  const result = mergeConfig(DEFAULT_CONFIG, { autoStart: false, printerProfiles: { Zebra: { paper: { widthMm: 100, heightMm: 50 }, offset: { xMm: 1, yMm: 2 } } } });
  assert.equal(result.host, '127.0.0.1');
  assert.equal(result.port, 3302);
  assert.equal(result.printerProfiles.Zebra.paper.widthMm, 100);
});
