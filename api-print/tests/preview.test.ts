import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { configuration } from '../src/config.js';
import { createPrintServer } from '../src/server.js';
import { normalizeInput } from '../src/template.js';
import { compileDocuments } from '../src/template-compiler.mjs';

test('validation, safe values and record page boundaries', () => {
  for (const input of [null, {}, { html: '<p>ok</p>', format: 'jpg' }, { html: '<p>x</p>', records: [] }, { html: '<p>x</p>', page: { widthMm: -1 } }, { html: '<p>x</p>', recordIndex: 1 }, { html: '<p>x</p>', pageIndex: 1.5 }, { html: '<script>alert(1)</script>' }]) {
    assert.throws(() => normalizeInput(input));
  }
  const input = normalizeInput({ html: '<p>{{customer.name}}</p>', format: 'pdf', records: [{ customer: { name: '<img src=x onerror=alert(1)>' } }, { customer: { name: 'second' } }] });
  const documents = compileDocuments(input);
  assert.equal(documents.length, 2);
  assert.match(documents[0], /&lt;img/);
  assert.match(documents[0], /class="print-record"/);
});

test('HTTP PDF/PNG preview without credentials and real parallel render workers', { timeout: 60_000 }, async () => {
  const config = { ...configuration(), workerCount: 2, host: '127.0.0.1', maxBodyBytes: 4096 };
  const app = await createPrintServer(config);
  await new Promise<void>((resolve) => app.server.listen(0, config.host, resolve));
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const request = (body: unknown, path = '/render') => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ready, 2);
    const html = '<section data-print-page="1" style="width:50mm;height:40mm;background:#e11d48;break-after:page">{{name}}</section><section data-print-page="2" style="width:50mm;height:40mm;background:#2563eb">second page</section>';
    const body = { html, css: 'body{font-family:Arial}', page: { widthMm: 50, heightMm: 40 }, dpi: 96, filename: '中文预览' };
    const responses = await Promise.all(Array.from({ length: 4 }, (_, index) => request({ ...body, pageIndex: index % 2 })));
    const workerIds = new Set<string>();
    const images: Buffer[] = [];
    for (const response of responses) {
      assert.equal(response.status, 200, await errorIfFailed(response));
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.match(response.headers.get('content-disposition')!, /filename\*=UTF-8''/);
      workerIds.add(response.headers.get('x-worker-id')!);
      assert.equal(response.headers.get('x-page-count'), '2');
      const png = Buffer.from(await response.arrayBuffer());
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.ok(Math.abs(png.readUInt32BE(16) - 189) <= 1);
      assert.ok(Math.abs(png.readUInt32BE(20) - 151) <= 1);
      images.push(png);
    }
    assert.equal(workerIds.size, 2, 'concurrent requests must use two distinct worker threads');
    assert.notDeepEqual(images[0], images[1], 'pageIndex must select a different rendered page');
    assert.deepEqual(images[0], images[2]);
    const pdfResponse = await request({ ...body, html: '<p>{{name}}</p>', format: 'pdf', records: [{ name: 'one' }, { name: 'two' }] }, '/api/print/preview');
    assert.equal(pdfResponse.status, 200, await errorIfFailed(pdfResponse));
    const pdf = Buffer.from(await pdfResponse.arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 2, 'each record starts a PDF page');
    assert.equal(pdfResponse.headers.get('content-type'), 'application/pdf');
    assert.equal((await request({ ...body, pageIndex: 2 })).status, 400);
    assert.equal((await request({ html: '<p>x</p>', format: 'jpeg' })).status, 400);
    assert.equal((await request({ html: 'x'.repeat(5000) })).status, 413);
    assert.equal((await fetch(base + '/render', { method: 'POST', body: '{}' })).status, 415);
    assert.equal((await fetch(base + '/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await fetch(base + '/render', { method: 'OPTIONS' })).status, 204);
    assert.equal((await fetch(base + '/missing')).status, 404);
  } finally { await app.close(); }
});

test('queue backpressure, resource allowlist and timed-out worker replacement', { timeout: 60_000 }, async () => {
  let hits = 0;
  const assetServer = createServer((_request, _response) => { hits += 1; /* deliberately stalled asset */ });
  await new Promise<void>((resolve) => assetServer.listen(0, '127.0.0.1', resolve));
  const assetAddress = assetServer.address();
  assert.ok(assetAddress && typeof assetAddress !== 'string');
  const origin = `http://127.0.0.1:${assetAddress.port}`;
  const config = { ...configuration(), workerCount: 1, host: '127.0.0.1', maxQueue: 1, timeoutMs: 1200, assetOrigins: [origin] };
  const app = await createPrintServer(config);
  try {
    const blockedApp = await createPrintServer({ ...config, timeoutMs: 5000, assetOrigins: [] });
    try {
      await blockedApp.pool.render(normalizeInput({ html: `<img src="${origin}/blocked.png">`, page: { widthMm: 50, heightMm: 40 } }));
      assert.equal(hits, 0, 'unconfigured external resources must not be fetched');
    } finally { await blockedApp.close(); }
    const input = normalizeInput({ html: `<img src="${origin}/stall.png">`, page: { widthMm: 50, heightMm: 40 } });
    const pending = app.pool.render(input).then(() => 0, (error) => error.statusCode);
    const assetDeadline = Date.now() + 5000;
    while (!hits && Date.now() < assetDeadline) await delay(10);
    assert.ok(hits, 'allowed resource must reach the asset server');
    const queued = app.pool.render(input).then(() => 0, (error) => error.statusCode);
    await assert.rejects(app.pool.render(input), (error: any) => error.statusCode === 503);
    assert.equal(await pending, 504);
    assert.equal(await queued, 504);
    const deadline = Date.now() + 15_000;
    while (!app.pool.status().ready && Date.now() < deadline) await delay(30);
    assert.equal(app.pool.status().ready, 1);
    const result = await app.pool.render(normalizeInput({ html: '<p>recovered</p>', page: { widthMm: 50, heightMm: 40 } }));
    assert.ok(result.body.length > 100);
    assert.equal(app.pool.status().busy, 0);
  } finally {
    await app.close();
    assetServer.closeAllConnections();
    await new Promise<void>((resolve) => assetServer.close(() => resolve()));
  }
});

async function errorIfFailed(response: Response) {
  return response.ok ? '' : await response.text();
}
