import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { RenderPool } from './render-pool.js';
import { normalizeInput, RequestError } from './template.js';
import type { Configuration } from './config.js';

export async function createPrintServer(config: Configuration) {
  const pool = new RenderPool(config);
  await pool.start();
  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    response.setHeader('x-request-id', requestId);
    response.setHeader('access-control-allow-origin', config.allowOrigin);
    response.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');
    response.setHeader('access-control-expose-headers', 'content-disposition, x-request-id, x-render-ms, x-worker-id, x-page-count');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    const path = new URL(request.url || '/', 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      const status = pool.status();
      sendJson(response, status.ready ? 200 : 503, { ok: Boolean(status.ready), service: 'api-print', ...status });
      return;
    }
    if (!['/render', '/preview', '/api/print/render', '/api/print/preview'].includes(path)) { sendJson(response, 404, { ok: false, error: 'Not found.', requestId }); return; }
    if (request.method !== 'POST') { response.setHeader('allow', 'POST, OPTIONS'); sendJson(response, 405, { ok: false, error: 'Use POST.', requestId }); return; }
    const controller = new AbortController();
    const cancel = () => { if (!response.writableEnded) controller.abort(); };
    response.once('close', cancel);
    try {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw new RequestError(415, 'Content-Type must be application/json.');
      const input = normalizeInput(await readJson(request, config.maxBodyBytes));
      const result = await pool.render(input, controller.signal);
      if (response.destroyed) return;
      const disposition = `inline; filename="print-preview.${input.output.format}"; filename*=UTF-8''${encodeURIComponent(result.filename).replace(/['()*]/g, (char) => '%' + char.charCodeAt(0).toString(16))}`;
      response.writeHead(200, {
        'content-type': result.mimeType, 'content-length': result.body.byteLength,
        'content-disposition': disposition, 'x-render-ms': result.renderMs, 'x-worker-id': result.workerId,
        ...(input.output.format === 'png' ? { 'x-page-count': result.pageCount } : {})
      });
      response.end(Buffer.from(result.body));
    } catch (error) {
      if (response.destroyed) return;
      const status = error instanceof RequestError ? error.statusCode : 500;
      if (status === 503) response.setHeader('retry-after', '1');
      if (status >= 500) console.error(`[api-print] ${requestId}:`, error);
      sendJson(response, status, { ok: false, error: error instanceof Error ? error.message : String(error), requestId });
    } finally { response.removeListener('close', cancel); }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  return {
    server, pool,
    async close() {
      const closed = new Promise<void>((resolve, reject) => server.close((error) => error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve()));
      await pool.close();
      server.closeAllConnections();
      await closed;
    }
  };
}

function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let exceeded = false;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      if (exceeded) return;
      size += chunk.length;
      if (size > maxBytes) { exceeded = true; chunks.length = 0; reject(new RequestError(413, 'Request body is too large.')); return; }
      chunks.push(chunk);
    });
    request.once('end', () => {
      if (exceeded) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new RequestError(400, 'Request body must be valid JSON.')); }
    });
    request.once('error', reject);
    request.once('aborted', () => reject(new RequestError(400, 'Request body was interrupted.')));
  });
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  if (response.destroyed) return;
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  response.end(body);
}
