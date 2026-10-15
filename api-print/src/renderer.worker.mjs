import { parentPort, workerData, threadId } from 'node:worker_threads';
import { chromium } from 'playwright-core';
import { compileDocuments } from './template-compiler.mjs';

let server;
let browser;
const allowedOrigins = new Set(workerData.assetOrigins);

async function getBrowser() {
  if (browser?.isConnected()) return browser;
  if (server) await server.close().catch(() => {});
  server = await chromium.launchServer({
    headless: true,
    executablePath: workerData.executablePath,
    args: ['--disable-dev-shm-usage'],
    timeout: 25_000
  });
  parentPort.postMessage({ type: 'browser', pid: server.process().pid });
  browser = await chromium.connect(server.wsEndpoint());
  return browser;
}

function combineDocuments(documents) {
  if (documents.length <= 1) return documents[0];
  const bodies = documents.map((html) => html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html).join('');
  return documents[0].replace(/(<body[^>]*>)[\s\S]*?(<\/body>)/i, (_match, open, close) => open + bodies + close);
}

async function routeResource(route) {
  const request = route.request();
  const url = new URL(request.url());
  if (request.isNavigationRequest() || !['image', 'font', 'stylesheet'].includes(request.resourceType()) || !['https:', 'http:'].includes(url.protocol) || !allowedOrigins.has(url.origin)) {
    await route.abort('blockedbyclient');
    return;
  }
  // Do not follow redirects to an origin outside the configured asset servers.
  try {
    const response = await route.fetch({ maxRedirects: 0, timeout: 5000 });
    if (response.status() >= 300 && response.status() < 400) await route.abort('blockedbyclient');
    else await route.fulfill({ response });
    await response.dispose();
  } catch { await route.abort('failed').catch(() => {}); }
}

async function render(request) {
  const started = performance.now();
  const { output, pageIndex } = request.input;
  const width = Math.ceil(output.page.widthMm * 96 / 25.4);
  const height = Math.ceil(output.page.heightMm * 96 / 25.4);
  const activeBrowser = await getBrowser();
  const context = await activeBrowser.newContext({
    viewport: { width, height },
    deviceScaleFactor: output.format === 'png' ? output.dpi / 96 : 1,
    javaScriptEnabled: false,
    serviceWorkers: 'block',
    acceptDownloads: false,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai'
  });
  try {
    await context.route('**/*', routeResource);
    const page = await context.newPage();
    page.setDefaultTimeout(Math.max(100, workerData.timeoutMs - 100));
    await page.emulateMedia({ media: 'print', reducedMotion: 'reduce', colorScheme: 'light' });
    await page.setContent(combineDocuments(compileDocuments(request.input)), { waitUntil: 'load', timeout: Math.max(100, workerData.timeoutMs - 100) });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.complete ? undefined : new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      })));
    });
    let body;
    let pageCount = 0;
    if (output.format === 'pdf') {
      body = await page.pdf({
        width: output.page.widthMm + 'mm', height: output.page.heightMm + 'mm',
        printBackground: output.printBackground, preferCSSPageSize: true, scale: output.scale,
        margin: Object.fromEntries(Object.entries(output.page.marginMm).map(([key, value]) => [key, value + 'mm']))
      });
    } else {
      const targets = page.locator('[data-print-page]');
      pageCount = await targets.count();
      if (pageIndex >= Math.max(1, pageCount)) throw Object.assign(new Error('pageIndex is outside the template pages.'), { statusCode: 400 });
      if (!output.printBackground) await page.addStyleTag({ content: '* { background: transparent !important; }' });
      if (output.scale !== 1) await page.addStyleTag({ content: `body { zoom: ${output.scale}; }` });
      // Marked pages are cropped individually; otherwise return one fixed paper-sized viewport.
      const target = pageCount ? targets.nth(pageIndex) : undefined;
      if (target) {
        const box = await target.boundingBox();
        if (!box || box.width * box.height * (output.dpi / 96) ** 2 > 40_000_000) throw Object.assign(new Error('Preview page is hidden or exceeds 40 million pixels.'), { statusCode: 400 });
      }
      body = target
        ? await target.screenshot({ type: 'png', animations: 'disabled', timeout: workerData.timeoutMs })
        : await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled', timeout: workerData.timeoutMs });
    }
    return { body, mimeType: output.format === 'pdf' ? 'application/pdf' : 'image/png', filename: output.filename, pageCount: output.format === 'png' ? Math.max(1, pageCount) : 0, renderMs: Math.round(performance.now() - started), workerId: threadId };
  } finally { await context.close(); }
}

parentPort.on('message', async (request) => {
  try {
    const result = await render(request);
    const bytes = Uint8Array.from(result.body);
    parentPort.postMessage({ type: 'result', id: request.id, result: { ...result, body: bytes } }, [bytes.buffer]);
  } catch (error) {
    parentPort.postMessage({ type: 'error', id: request.id, message: error.message || String(error), statusCode: error.statusCode || (error.name === 'TimeoutError' ? 504 : 500) });
  }
});

try { await getBrowser(); parentPort.postMessage({ type: 'ready' }); }
catch (error) { parentPort.postMessage({ type: 'fatal', message: error.message }); }
