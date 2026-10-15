import { BrowserWindow, type PrinterInfo, type WebContentsPrintOptions } from 'electron';
import { spawn } from 'node:child_process';
import { compileDocument } from './document.js';
import type { PreviewRequest, PrintRequest, PrintResult } from './types.js';

export class PrinterEngine {
  private utilityWindow?: BrowserWindow;

  async listPrinters(): Promise<PrinterInfo[]> {
    const window = this.getUtilityWindow();
    return window.webContents.getPrintersAsync();
  }

  async setSystemDefaultPrinter(name: string) {
    if (process.platform !== 'win32') throw new Error('当前版本仅支持在 Windows 设置系统默认打印机。');
    const escaped = name.replace(/'/g, "''");
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$network = New-Object -ComObject WScript.Network; $network.SetDefaultPrinter('${escaped}')`]);
  }

  async print(request: PrintRequest): Promise<PrintResult> {
    const printers = await this.listPrinters();
    if (!printers.some((printer) => printer.name === request.printerName)) return { success: false, failureReason: `找不到打印机：${request.printerName}` };
    const window = await this.createDocumentWindow(compileDocument(request), request.page.widthMm, request.page.heightMm);
    try {
      const options: WebContentsPrintOptions = {
        silent: true,
        deviceName: request.printerName,
        printBackground: request.printBackground,
        copies: request.copies,
        collate: request.collate,
        landscape: request.landscape,
        pageSize: { width: mmToMicrons(request.page.widthMm), height: mmToMicrons(request.page.heightMm) },
        margins: {
          marginType: 'custom',
          top: mmToPixels(request.page.marginMm.top), bottom: mmToPixels(request.page.marginMm.bottom),
          left: mmToPixels(request.page.marginMm.left), right: mmToPixels(request.page.marginMm.right)
        }
      };
      return await new Promise<PrintResult>((resolve) => window.webContents.print(options, (success, failureReason) => resolve({ success, failureReason })));
    } finally { window.destroy(); }
  }

  async preview(request: PreviewRequest) {
    const html = compileDocument({ ...request, recordIndex: request.format === 'png' ? request.recordIndex : undefined });
    const window = await this.createDocumentWindow(html, request.page.widthMm, request.page.heightMm, request.dpi / 96);
    try {
      if (request.format === 'pdf') {
        const body = await window.webContents.printToPDF({
          printBackground: request.printBackground, landscape: request.landscape,
          pageSize: { width: mmToInches(request.page.widthMm), height: mmToInches(request.page.heightMm) },
          margins: Object.fromEntries(Object.entries(request.page.marginMm).map(([key, value]) => [key, mmToInches(value)])),
          scale: request.scale, preferCSSPageSize: true
        });
        return { body, mimeType: 'application/pdf', filename: request.filename, pageCount: request.records.length };
      }
      if (!request.printBackground) await window.webContents.insertCSS('* { background: transparent !important; }');
      if (request.scale !== 1) await window.webContents.insertCSS(`body { zoom: ${request.scale}; }`);
      const image = await window.webContents.capturePage();
      return { body: image.toPNG(), mimeType: 'image/png', filename: request.filename, pageCount: 1 };
    } finally { window.destroy(); }
  }

  destroy() { this.utilityWindow?.destroy(); this.utilityWindow = undefined; }

  private getUtilityWindow() {
    if (!this.utilityWindow || this.utilityWindow.isDestroyed()) {
      this.utilityWindow = new BrowserWindow({ show: false, webPreferences: securePreferences() });
      this.utilityWindow.loadURL('about:blank').catch(() => undefined);
    }
    return this.utilityWindow;
  }

  private async createDocumentWindow(html: string, widthMm: number, heightMm: number, scale = 1) {
    const window = new BrowserWindow({
      show: false,
      width: Math.max(32, Math.ceil(mmToPixels(widthMm) * scale)),
      height: Math.max(32, Math.ceil(mmToPixels(heightMm) * scale)),
      useContentSize: true,
      webPreferences: securePreferences()
    });
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await window.webContents.executeJavaScript('Promise.all([document.fonts.ready, ...Array.from(document.images, image => image.complete ? Promise.resolve() : new Promise(resolve => { image.addEventListener("load", resolve, {once:true}); image.addEventListener("error", resolve, {once:true}); }))])');
    return window;
  }
}

function securePreferences() {
  return { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } as const;
}
function mmToMicrons(value: number) { return Math.round(value * 1000); }
function mmToPixels(value: number) { return Math.round(value * 96 / 25.4); }
function mmToInches(value: number) { return value / 25.4; }

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk) => { error += String(chunk); });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(error.trim() || `${command} 退出码 ${code}`)));
  });
}
