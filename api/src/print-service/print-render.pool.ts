import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { getEnv } from '../common/utils/env';
import type { PrintOutput, RenderResult } from './print.types';

type WorkerRequest = {
  id: string;
  documents: string[];
  output: PrintOutput;
};

type WorkerResponse = {
  id: string;
  ok: boolean;
  files?: Array<{ name: string; mimeType: string; body: Uint8Array }>;
  renderMs?: number;
  error?: string;
};

type PendingTask = {
  request: WorkerRequest;
  resolve: (value: RenderResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type PoolWorker = {
  worker: Worker;
  busy: boolean;
  current?: PendingTask;
};

const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { chromium } = require(workerData.playwrightModulePath);
let browser;

function isBlockedUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol === 'about:' || url.protocol === 'data:' || url.protocol === 'blob:') return false;
    if (url.protocol !== 'https:') return true;
    const host = url.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
      host.startsWith('10.') || host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local');
  } catch {
    return true;
  }
}

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({
    headless: true,
    executablePath: workerData.executablePath || undefined,
    args: ['--disable-dev-shm-usage', '--no-sandbox']
  });
  return browser;
}

async function waitForAssets(page) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const images = Array.from(document.images);
    await Promise.all(images.map((img) => img.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        })));
  });
}

function bodyOf(documentHtml) {
  const match = documentHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : documentHtml;
}

function combineDocuments(documents) {
  if (documents.length <= 1) return documents[0] || '';
  const first = documents[0];
  const bodies = documents.map(bodyOf).join('');
  return first.replace(/<body([^>]*)>[\s\S]*?<\/body>/i, '<body$1>' + bodies + '</body>');
}

async function render(request) {
  const startedAt = Date.now();
  const activeBrowser = await getBrowser();
  const output = request.output;
  const dpi = output.dpi || 96;
  const width = Math.max(1, Math.ceil(output.page.widthMm * 96 / 25.4));
  const height = Math.max(1, Math.ceil(output.page.heightMm * 96 / 25.4));
  const context = await activeBrowser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpi / 96 * (output.scale || 1),
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  });
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (isBlockedUrl(url)) await route.abort('blockedbyclient');
    else await route.continue();
  });

  try {
    const files = [];
    if (output.format === 'pdf') {
      const page = await context.newPage();
      await page.setContent(combineDocuments(request.documents), { waitUntil: 'load', timeout: 10000 });
      await waitForAssets(page);
      const body = await page.pdf({
        width: output.page.widthMm + 'mm',
        height: output.page.heightMm + 'mm',
        printBackground: output.printBackground !== false,
        preferCSSPageSize: true,
        scale: output.scale || 1,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
      });
      files.push({ name: 'output.pdf', mimeType: 'application/pdf', body });
      await page.close();
    } else {
      const imageType = output.format === 'jpeg' ? 'jpeg' : 'png';
      for (let index = 0; index < request.documents.length; index += 1) {
        const page = await context.newPage();
        await page.setContent(request.documents[index], { waitUntil: 'load', timeout: 10000 });
        await waitForAssets(page);
        const printPages = page.locator('[data-print-page]');
        const pageCount = await printPages.count();
        const targets = pageCount ? Array.from({ length: pageCount }, (_, pageIndex) => printPages.nth(pageIndex)) : [page];
        for (let pageIndex = 0; pageIndex < targets.length; pageIndex += 1) {
          const body = await targets[pageIndex].screenshot({
            type: imageType,
            ...(pageCount ? {} : { fullPage: true }),
            animations: 'disabled',
            ...(imageType === 'jpeg' ? { quality: 90 } : {})
          });
          const recordNumber = String(index + 1).padStart(4, '0');
          const pageNumber = String(pageIndex + 1).padStart(3, '0');
          files.push({
            name: 'record-' + recordNumber + '-page-' + pageNumber + '.' + (imageType === 'jpeg' ? 'jpg' : 'png'),
            mimeType: imageType === 'jpeg' ? 'image/jpeg' : 'image/png',
            body
          });
        }
        await page.close();
      }
    }
    return { files, renderMs: Date.now() - startedAt };
  } finally {
    await context.close();
  }
}

parentPort.on('message', async (request) => {
  try {
    const result = await render(request);
    parentPort.postMessage({ id: request.id, ok: true, ...result });
  } catch (error) {
    parentPort.postMessage({
      id: request.id,
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
});

process.on('exit', () => {
  if (browser) browser.close().catch(() => undefined);
});
`;

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveExecutablePath() {
  const configured = getEnv().PRINT_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (configured) return configured;

  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find(existsSync);
}

@Injectable()
export class PrintRenderPool implements OnModuleDestroy {
  private readonly workers: PoolWorker[] = [];
  private readonly queue: PendingTask[] = [];
  private sequence = 0;
  private closed = false;

  constructor() {
    const env = getEnv();
    const count = readPositiveInteger(
      env.PRINT_WORKER_COUNT,
      Math.min(4, Math.max(1, cpus().length - 1))
    );
    for (let index = 0; index < count; index += 1) this.addWorker();
  }

  render(documents: string[], output: PrintOutput): Promise<RenderResult> {
    if (this.closed) return Promise.reject(new Error('Print render pool is closed.'));
    const timeoutMs = readPositiveInteger(getEnv().PRINT_RENDER_TIMEOUT_MS, 120_000);
    return new Promise((resolve, reject) => {
      const request: WorkerRequest = {
        id: String(++this.sequence),
        documents,
        output
      };
      const task: PendingTask = {
        request,
        resolve,
        reject,
        timeout: setTimeout(() => {
          const slot = this.workers.find((item) => item.current === task);
          if (slot) {
            void slot.worker.terminate();
            slot.current = undefined;
            slot.busy = false;
          } else {
            const queuedIndex = this.queue.indexOf(task);
            if (queuedIndex >= 0) this.queue.splice(queuedIndex, 1);
          }
          reject(new Error('Print render timed out.'));
        }, timeoutMs)
      };
      this.queue.push(task);
      this.drain();
    });
  }

  async onModuleDestroy() {
    this.closed = true;
    for (const task of this.queue.splice(0)) {
      clearTimeout(task.timeout);
      task.reject(new Error('Print render pool is shutting down.'));
    }
    await Promise.all(this.workers.map((slot) => slot.worker.terminate()));
  }

  private addWorker() {
    if (this.closed) return;
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        executablePath: resolveExecutablePath(),
        playwrightModulePath: require.resolve('playwright-core')
      }
    });
    const slot: PoolWorker = { worker, busy: false };
    worker.on('message', (response: WorkerResponse) => this.handleResponse(slot, response));
    worker.on('error', (error) => this.handleWorkerFailure(slot, error));
    worker.on('exit', (code) => {
      const index = this.workers.indexOf(slot);
      if (index >= 0) this.workers.splice(index, 1);
      if (slot.current) {
        clearTimeout(slot.current.timeout);
        slot.current.reject(new Error('Print worker exited with code ' + code + '.'));
      }
      if (!this.closed) {
        this.addWorker();
        this.drain();
      }
    });
    this.workers.push(slot);
  }

  private handleResponse(slot: PoolWorker, response: WorkerResponse) {
    const task = slot.current;
    if (!task || response.id !== task.request.id) return;
    clearTimeout(task.timeout);
    slot.current = undefined;
    slot.busy = false;

    if (!response.ok || !response.files) {
      task.reject(new Error(response.error || 'Print rendering failed.'));
    } else {
      task.resolve({
        files: response.files.map((file) => ({
          name: file.name,
          mimeType: file.mimeType,
          body: Buffer.from(file.body)
        })),
        renderMs: response.renderMs ?? 0
      });
    }
    this.drain();
  }

  private handleWorkerFailure(slot: PoolWorker, error: Error) {
    if (!slot.current) return;
    clearTimeout(slot.current.timeout);
    slot.current.reject(error);
    slot.current = undefined;
    slot.busy = false;
  }

  private drain() {
    for (const slot of this.workers) {
      if (slot.busy) continue;
      const task = this.queue.shift();
      if (!task) return;
      slot.busy = true;
      slot.current = task;
      slot.worker.postMessage(task.request);
    }
  }
}
