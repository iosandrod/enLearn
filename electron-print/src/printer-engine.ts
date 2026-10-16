import { BrowserWindow, session, type PrinterInfo, type WebContentsPrintOptions } from 'electron';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { compileDocument } from './document.js';
import type { PreviewRequest, PrintRequest, PrintResult } from './types.js';

export class PrinterEngine {
  private utilityWindow?: BrowserWindow;
  private readonly windows = new Set<BrowserWindow>();
  private previewActive = 0;
  private readonly previewWaiting: Array<() => void> = [];

  get previewStatus() { return { active: this.previewActive, queued: this.previewWaiting.length, concurrency: 4 }; }

  async listPrinters(): Promise<PrinterInfo[]> {
    if (!this.utilityWindow || this.utilityWindow.isDestroyed()) {
      this.utilityWindow = new BrowserWindow({ show: false, webPreferences: securePreferences() });
      await this.utilityWindow.loadURL('about:blank');
    }
    return this.utilityWindow.webContents.getPrintersAsync();
  }

  async setSystemDefaultPrinter(name: string) {
    if (process.platform !== 'win32') throw new Error('当前版本仅支持在 Windows 设置系统默认打印机。');
    await runPowerShell("$ErrorActionPreference='Stop'; $network = New-Object -ComObject WScript.Network; $network.SetDefaultPrinter($env:ENLEARN_PRINTER_NAME)", { ENLEARN_PRINTER_NAME: name });
  }

  async print(request: PrintRequest): Promise<PrintResult> {
    const printers = await this.listPrinters();
    if (!printers.some((printer) => printer.name === request.printerName)) return { success: false, failureReason: `找不到打印机：${request.printerName}` };
    return this.withDocument(request, async (window) => {
      await window.webContents.executeJavaScript(`document.title = ${JSON.stringify(request.jobName)}`);
      const options: WebContentsPrintOptions = {
        silent: true, deviceName: request.printerName, printBackground: request.printBackground,
        copies: request.copies, collate: request.collate, landscape: request.landscape,
        pageSize: { width: Math.round(request.page.widthMm * 1000), height: Math.round(request.page.heightMm * 1000) },
        margins: {
          marginType: 'custom',
          top: mmToPixels(request.page.marginMm.top), bottom: mmToPixels(request.page.marginMm.bottom),
          left: mmToPixels(request.page.marginMm.left), right: mmToPixels(request.page.marginMm.right)
        }
      };
      return new Promise<PrintResult>((resolve) => window.webContents.print(options, (success, failureReason) => resolve({ success, failureReason })));
    }, undefined, 60_000);
  }

  async preview(request: PreviewRequest, signal?: AbortSignal) {
    if (this.previewActive >= 4) {
      if (this.previewWaiting.length >= 32) throw Object.assign(new Error('预览队列已满。'), { statusCode: 503 });
      await new Promise<void>((resolve, reject) => {
        const resume = () => { signal?.removeEventListener('abort', abort); resolve(); };
        const abort = () => { const index = this.previewWaiting.indexOf(resume); if (index >= 0) this.previewWaiting.splice(index, 1); reject(new Error('预览请求已取消。')); };
        if (signal?.aborted) { reject(new Error('预览请求已取消。')); return; }
        this.previewWaiting.push(resume);
        signal?.addEventListener('abort', abort, { once: true });
      });
    } else this.previewActive++;
    try {
      return await this.withDocument(request, async (window) => {
        if (request.format === 'pdf') {
          const body = await window.webContents.printToPDF({
            printBackground: request.printBackground,
            pageSize: { width: request.page.widthMm / 25.4, height: request.page.heightMm / 25.4 },
            margins: Object.fromEntries(Object.entries(request.page.marginMm).map(([key, value]) => [key, value / 25.4])),
            scale: request.scale, preferCSSPageSize: true
          });
          return { body, mimeType: 'application/pdf', filename: request.filename, pageCount: 0 };
        }
        if (!request.printBackground) await window.webContents.insertCSS('* { background: transparent !important; }');
        if (request.scale !== 1) await window.webContents.insertCSS(`body { zoom: ${request.scale}; }`);
        const dimensions = paperPixels(request);
        const density = request.dpi / 96;
        window.setContentSize(Math.max(32, Math.ceil(dimensions.width * density)), Math.max(32, Math.ceil(dimensions.height * density)));
        window.webContents.setZoomFactor(density);
        const target = await window.webContents.executeJavaScript(`(() => {
          const pages = [...document.querySelectorAll('[data-print-page]')];
          const box = pages[${request.pageIndex}]?.getBoundingClientRect();
          return { count: pages.length, box: box && {x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height} };
        })()`);
        if (request.pageIndex >= Math.max(1, target.count)) throw Object.assign(new Error('pageIndex 超出预览页数。'), { statusCode: 400 });
        const clip = target.box ?? { x: 0, y: 0, ...dimensions };
        if (clip.width <= 0 || clip.height <= 0 || clip.x < 0 || clip.y < 0 || clip.width * clip.height * (request.dpi / 96) ** 2 > 40_000_000) throw Object.assign(new Error('预览区域不可见或超过 4000 万像素。'), { statusCode: 400 });
        const width = Math.round(clip.width * density), height = Math.round(clip.height * density);
        window.setContentSize(Math.max(32, width), Math.max(32, height));
        const position = await window.webContents.executeJavaScript(`(() => { window.scrollTo(${clip.x}, ${clip.y}); return { x: ${clip.x} - scrollX, y: ${clip.y} - scrollY }; })()`);
        await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        const result = await window.webContents.capturePage({ x: Math.round(position.x * density), y: Math.round(position.y * density), width, height }, { stayHidden: true, stayAwake: true });
        return { body: result.resize({ width, height }).toPNG(), mimeType: 'image/png', filename: request.filename, pageCount: Math.max(1, target.count) };
      }, signal, 30_000);
    } finally {
      const next = this.previewWaiting.shift();
      if (next) next(); else this.previewActive--;
    }
  }

  destroy() {
    this.utilityWindow?.destroy(); this.utilityWindow = undefined;
    for (const window of this.windows) if (!window.isDestroyed()) window.destroy();
  }

  private async withDocument<T>(request: PrintRequest | PreviewRequest, operation: (window: BrowserWindow) => Promise<T>, signal: AbortSignal | undefined, timeoutMs: number): Promise<T> {
    if (signal?.aborted) throw new Error('预览请求已取消。');
    const preview = 'format' in request;
    const html = compileDocument({ ...request, recordIndex: preview && request.format === 'png' ? request.recordIndex : undefined });
    const printSession = session.fromPartition(`print-${randomUUID()}`);
    printSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    printSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('data:') && details.url !== 'about:blank' }));
    const window = new BrowserWindow({ show: false, ...paperPixels(request), useContentSize: true, webPreferences: { ...securePreferences(), offscreen: true, session: printSession } });
    this.windows.add(window);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    let timer: NodeJS.Timeout | undefined;
    let abort: () => void = () => undefined;
    try {
      const failure = new Promise<never>((_resolve, reject) => {
        const fail = (message: string) => reject(new Error(message));
        timer = setTimeout(() => fail(preview ? '预览生成超时。' : '打印调用超时，可能已提交系统，请检查出纸后再手动重试。'), timeoutMs);
        abort = () => fail('预览请求已取消。');
        signal?.addEventListener('abort', abort, { once: true });
        window.webContents.once('render-process-gone', () => fail('打印渲染进程异常退出。'));
      });
      const task = (async () => {
        await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        window.webContents.debugger.attach('1.3');
        await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
        await window.webContents.executeJavaScript('Promise.all([document.fonts.ready, ...Array.from(document.images, image => image.complete ? Promise.resolve() : new Promise(resolve => { image.addEventListener("load", resolve, {once:true}); image.addEventListener("error", resolve, {once:true}); }))])');
        return operation(window);
      })();
      return await Promise.race([task, failure]);
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (!window.isDestroyed()) window.destroy();
      this.windows.delete(window);
      printSession.webRequest.onBeforeRequest(null);
      await printSession.clearStorageData();
    }
  }
}

function securePreferences() { return { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } as const; }
function mmToPixels(value: number) { return value * 96 / 25.4; }
function paperPixels(request: Pick<PrintRequest, 'page' | 'landscape'>) {
  return { width: Math.ceil(mmToPixels(request.landscape ? request.page.heightMm : request.page.widthMm)), height: Math.ceil(mmToPixels(request.landscape ? request.page.widthMm : request.page.heightMm)) };
}

function runPowerShell(code: string, environment: Record<string, string>) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { windowsHide: true, env: { ...process.env, ...environment }, stdio: ['ignore', 'ignore', 'pipe'] });
    const timer = setTimeout(() => { child.kill(); reject(new Error('设置系统默认打印机超时。')); }, 15_000);
    let error = '';
    child.stderr.on('data', (chunk) => { error += String(chunk); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(error.trim() || `PowerShell 退出码 ${code}`)); });
  });
}
