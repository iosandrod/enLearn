import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PrintQueue } from '../src/queue.js';
import { PersistentStore } from '../src/store.js';
import { Logger } from '../src/logger.js';
import { DesktopPrintServer } from '../src/server.js';
import { DEFAULT_CONFIG, normalizePrintRequest } from '../src/validation.js';

test('concurrent enqueue preserves all records, serializes drivers, retries and recovers interruption', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enlearn-queue-'));
  const store = new PersistentStore(directory); await store.initialize();
  const logger = new Logger(join(directory, 'logs')); await logger.initialize();
  let busy = 0; let maxBusy = 0;
  const queue = new PrintQueue({ async print(request) {
    busy++; maxBusy = Math.max(maxBusy, busy);
    await new Promise(resolve => setTimeout(resolve, 5)); busy--;
    return { success: request.templateName !== 'bad', failureReason: '设备离线' };
  } }, store, logger);
  const requests = Array.from({ length: 8 }, (_, index) => normalizePrintRequest({ html: '<p>{{index}}</p>', records: [{ index }], printerName: 'Zebra', templateName: index === 2 ? 'bad' : String(index), copies: 2 }, DEFAULT_CONFIG));
  const queued = await Promise.all(requests.map(request => queue.enqueue(request)));
  const jobs = await Promise.all(queued.map(item => item.completion));
  assert.equal(maxBusy, 1);
  assert.equal(store.jobs.length, 8);
  assert.equal(jobs.filter(job => job.status === 'submitted').length, 7);
  const failure = jobs.find(job => job.status === 'failed')!;
  assert.equal(failure.error, '设备离线');
  const retry = await queue.retry(failure.id);
  assert.equal((await retry.completion).attempt, 2);
  assert.equal(JSON.parse(await readFile(join(directory, 'jobs.json'), 'utf8')).length, 9);
  await store.putJob({ ...jobs[0], status: 'printing' });
  const recovered = new PersistentStore(directory); await recovered.initialize();
  assert.equal(recovered.findJob(jobs[0].id)?.status, 'failed');
  queue.stopAccepting();
  await assert.rejects(() => queue.enqueue(requests[0]), /退出/);
});

test('HTTP contract: anonymous printer API, submitted/failed response, origin checks and binary preview', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enlearn-http-'));
  const store = new PersistentStore(directory); await store.initialize();
  const logger = new Logger(join(directory, 'logs')); await logger.initialize();
  let selected = '';
  const engine = {
    previewStatus: { active: 0, queued: 0, concurrency: 4 },
    async listPrinters() { return [{ name: 'Zebra', displayName: 'Zebra', description: '', options: {} }]; },
    async setSystemDefaultPrinter(name: string) { selected = name; },
    async print(request: { printerName: string }) { return { success: request.printerName === 'Zebra', failureReason: '打印机不存在' }; },
    async preview() { return { body: Buffer.from('%PDF-test'), mimeType: 'application/pdf', filename: 'test.pdf', pageCount: 0 }; }
  };
  const queue = new PrintQueue(engine, store, logger);
  const server = new DesktopPrintServer(engine, queue, store, logger, { applyAutoStart() {}, async checkForUpdates() { return {}; } });
  const address = await server.listen(0) as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const json = (path: string, body: unknown, method = 'POST') => fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await (await fetch(base + '/printers')).json()).printers.length, 1);
    assert.equal((await json('/printers/default', { name: 'Zebra' }, 'PUT')).status, 200);
    assert.equal(selected, 'Zebra');
    const success = await (await json('/print', { html: '<p>标签</p>', copies: 3 })).json();
    assert.equal(success.job.status, 'submitted'); assert.equal(success.job.copies, 3);
    assert.equal(success.job.request, undefined);
    const failed = await json('/print', { html: '<p>标签</p>', printerName: 'unknown' });
    assert.equal(failed.status, 500); assert.match((await failed.json()).error, /不存在/);
    const preview = await json('/preview', { html: '<p>标签</p>', format: 'pdf' });
    assert.equal(preview.headers.get('content-type'), 'application/pdf'); assert.equal(await preview.text(), '%PDF-test');
    assert.equal((await fetch(base + '/health', { headers: { origin: 'https://evil.example' } })).status, 403);
    const allowed = await fetch(base + '/health', { headers: { origin: 'http://localhost:3301' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3301');
    assert.equal((await json('/print', { html: '<p>x</p>', copies: 0 })).status, 400);
  } finally { await server.close(); }
});
