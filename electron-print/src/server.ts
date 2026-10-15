import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Server } from 'node:http';
import { PrintQueue } from './queue.js';
import { PrinterEngine } from './printer-engine.js';
import { PersistentStore } from './store.js';
import { Logger } from './logger.js';
import { normalizePreviewRequest, normalizePrintRequest, RequestError } from './validation.js';

type ServerHooks = { applyAutoStart: (enabled: boolean) => void; checkForUpdates: () => Promise<unknown> };

export class DesktopPrintServer {
  private server?: Server;
  constructor(
    private readonly engine: PrinterEngine,
    private readonly queue: PrintQueue,
    private readonly store: PersistentStore,
    private readonly logger: Logger,
    private readonly hooks: ServerHooks
  ) {}

  async listen() {
    const config = this.store.config;
    this.server = createServer((request, response) => void this.route(request, response));
    this.server.requestTimeout = 120_000;
    this.server.headersTimeout = 10_000;
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(config.port, config.host, () => resolve());
    });
    await this.logger.info(`本地打印接口已启动：http://${config.host}:${config.port}`);
  }

  async close() {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
  }

  private async route(request: IncomingMessage, response: ServerResponse) {
    cors(response);
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return json(response, 200, { ok: true, service: 'enlearn-silent-print', version: process.env.npm_package_version || '0.1.0', ...this.queue.status });
      }
      if (request.method === 'GET' && url.pathname === '/printers') {
        const printers = await this.engine.listPrinters();
        return json(response, 200, { ok: true, defaultPrinter: this.store.config.defaultPrinter, printers });
      }
      if (request.method === 'PUT' && url.pathname === '/printers/default') {
        const body = object(await readJson(request), '请求体');
        if (typeof body.name !== 'string' || !body.name.trim()) throw new RequestError(400, 'name 不能为空。');
        const name = body.name.trim();
        const printers = await this.engine.listPrinters();
        if (!printers.some((printer) => printer.name === name)) throw new RequestError(404, `找不到打印机：${name}`);
        await this.engine.setSystemDefaultPrinter(name);
        const config = await this.store.updateConfig({ defaultPrinter: name });
        return json(response, 200, { ok: true, defaultPrinter: config.defaultPrinter });
      }
      if (request.method === 'GET' && url.pathname === '/config') return json(response, 200, { ok: true, config: this.store.config, logFile: this.logger.file });
      if (request.method === 'PUT' && url.pathname === '/config') {
        const config = await this.store.updateConfig(await readJson(request));
        this.hooks.applyAutoStart(config.autoStart);
        return json(response, 200, { ok: true, config, restartRequired: false });
      }
      if (request.method === 'GET' && url.pathname === '/jobs') {
        const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 100)));
        return json(response, 200, { ok: true, jobs: this.store.jobs.slice(0, limit), ...this.queue.status });
      }
      const retry = url.pathname.match(/^\/jobs\/([^/]+)\/retry$/);
      if (request.method === 'POST' && retry) {
        const queued = await this.queue.retry(decodeURIComponent(retry[1]));
        const job = queued.job.request.wait ? await queued.completion : queued.job;
        return json(response, job.status === 'failed' ? 500 : 200, { ok: job.status !== 'failed', job });
      }
      if (request.method === 'POST' && url.pathname === '/print') {
        const input = normalizePrintRequest(await readJson(request), this.store.config);
        const queued = await this.queue.enqueue(input);
        if (!input.wait) return json(response, 202, { ok: true, job: queued.job });
        const job = await queued.completion;
        return json(response, job.status === 'failed' ? 500 : 200, { ok: job.status !== 'failed', job, message: job.status === 'submitted' ? '任务已提交到系统打印队列。' : undefined });
      }
      if (request.method === 'POST' && url.pathname === '/test-print') {
        const raw = object(await readJson(request), '请求体');
        const now = new Date().toLocaleString('zh-CN', { hour12: false });
        const input = normalizePrintRequest({
          ...raw,
          html: `<section class="test"><h1>EnLearn 打印测试</h1><p>打印机：{{printer}}</p><p>时间：{{time}}</p><div class="ruler">纸张边界测试</div></section>`,
          css: '.test{font-family:"Microsoft YaHei",sans-serif;padding:3mm}.test h1{font-size:14pt;margin:0 0 2mm}.test p{font-size:9pt;margin:1mm 0}.ruler{margin-top:3mm;border:1px solid #111;padding:2mm;font-size:8pt}',
          records: [{ printer: raw.printerName || this.store.config.defaultPrinter, time: now }],
          templateName: '系统测试页', jobName: '测试打印'
        }, this.store.config);
        const queued = await this.queue.enqueue(input);
        const job = await queued.completion;
        return json(response, job.status === 'failed' ? 500 : 200, { ok: job.status !== 'failed', job });
      }
      if (request.method === 'POST' && ['/render', '/preview', '/api/print/render', '/api/print/preview'].includes(url.pathname)) {
        const input = normalizePreviewRequest(await readJson(request), this.store.config);
        const result = await this.engine.preview(input);
        response.writeHead(200, {
          'content-type': result.mimeType, 'content-length': result.body.byteLength,
          'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
          'x-page-count': result.pageCount, 'cache-control': 'no-store'
        });
        response.end(result.body); return;
      }
      if (request.method === 'POST' && url.pathname === '/updates/check') return json(response, 200, { ok: true, result: await this.hooks.checkForUpdates() });
      json(response, 404, { ok: false, error: '接口不存在。' });
    } catch (error) {
      const status = error instanceof RequestError ? error.statusCode : typeof (error as { statusCode?: unknown })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
      if (status >= 500) await this.logger.error('接口调用失败', { path: url.pathname, error: error instanceof Error ? error.stack || error.message : String(error) });
      json(response, status, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

async function readJson(request: IncomingMessage) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw new RequestError(415, 'Content-Type 必须是 application/json。');
  return await new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    request.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 10 * 1024 * 1024) reject(new RequestError(413, '请求体超过 10 MB。')); else chunks.push(chunk); });
    request.once('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new RequestError(400, '请求体不是有效 JSON。')); } });
    request.once('error', reject);
  });
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(400, `${name}必须是对象。`);
  return value as Record<string, unknown>;
}
function cors(response: ServerResponse) {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  response.setHeader('access-control-expose-headers', 'content-disposition,x-page-count');
  response.setHeader('x-content-type-options', 'nosniff');
}
function json(response: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  response.end(body);
}
