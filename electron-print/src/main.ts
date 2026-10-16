import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import electronUpdater from 'electron-updater';
import { join } from 'node:path';
import { DesktopPrintServer } from './server.js';
import { Logger } from './logger.js';
import { PersistentStore } from './store.js';
import { PrinterEngine } from './printer-engine.js';
import { PrintQueue } from './queue.js';

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let server: DesktopPrintServer | undefined;
let engine: PrinterEngine | undefined;
let activeQueue: PrintQueue | undefined;
let quitting = false;
let stopping = false;
const { autoUpdater } = electronUpdater;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showWindow());
  app.on('window-all-closed', () => undefined);
  app.on('activate', () => showWindow());
  void app.whenReady().then(start).catch(async (error) => {
    const { dialog } = await import('electron');
    dialog.showErrorBox('静默打印服务启动失败', (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
      ? '3302 端口已被占用，请先关闭独立 api-print 服务或另一个打印客户端，再重新启动。'
      : error instanceof Error ? error.message : String(error));
    app.exit(1);
  });
}

async function start() {
  app.setAppUserModelId('com.enlearn.silentprint');
  const logger = new Logger(join(app.getPath('userData'), 'logs'));
  await logger.initialize();
  process.on('uncaughtException', (error) => void logger.error('未捕获异常', error.stack || error.message));
  process.on('unhandledRejection', (error) => void logger.error('未处理 Promise 异常', error));

  const store = new PersistentStore(app.getPath('userData'));
  await store.initialize();
  engine = new PrinterEngine();
  const queue = new PrintQueue(engine, store, logger);
  activeQueue = queue;
  server = new DesktopPrintServer(engine, queue, store, logger, { applyAutoStart, checkForUpdates: () => checkForUpdates(store.config.updateFeedUrl) });
  await server.listen();
  applyAutoStart(store.config.autoStart);
  createWindow();
  createTray();

  ipcMain.handle('desktop-print:api', async (event, path: string, options?: { method?: string; body?: unknown }) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('拒绝未知窗口调用。');
    if (typeof path !== 'string' || !/^\/(?:health|printers(?:\/default)?|config|jobs(?:\?limit=\d+|\/[a-zA-Z0-9-]+\/retry)?|test-print|updates\/check)$/.test(path)) throw new Error('非法接口路径。');
    const response = await fetch(`http://${store.config.host}:${store.config.port}${path}`, {
      method: options?.method || 'GET', headers: options?.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: options?.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.job?.error || `请求失败：${response.status}`);
    return data;
  });

  autoUpdater.on('error', (error) => void logger.error('自动更新失败', error.message));
  autoUpdater.on('update-downloaded', () => void logger.info('新版本已下载，将在退出后安装。'));
  await logger.info('EnLearn 静默打印客户端已启动', { version: app.getVersion() });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040, height: 760, minWidth: 860, minHeight: 620, show: false,
    title: 'EnLearn 静默打印', backgroundColor: '#f4f7fb',
    webPreferences: { preload: join(import.meta.dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.loadFile(join(import.meta.dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => { if (!process.argv.includes('--background')) mainWindow?.show(); });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.on('close', (event) => { if (!quitting) { event.preventDefault(); mainWindow?.hide(); } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
}

function createTray() {
  const icon = nativeImage.createFromPath(join(import.meta.dirname, 'renderer', 'tray.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('EnLearn 静默打印');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开管理界面', click: showWindow },
    { label: '退出（等待任务完成）', click: () => app.quit() }
  ]));
  tray.on('double-click', showWindow);
}

function showWindow() { if (!mainWindow) createWindow(); mainWindow?.show(); mainWindow?.focus(); }
function applyAutoStart(enabled: boolean) {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, name: 'EnLearnSilentPrint', args: ['--background'] });
}
async function checkForUpdates(feedUrl: string) {
  if (!app.isPackaged) return { supported: false, message: '开发模式不执行自动更新。' };
  if (process.env.PORTABLE_EXECUTABLE_FILE) return { supported: false, message: '便携版请下载新版替换；自动更新需要安装版。' };
  if (!feedUrl) return { supported: false, message: '尚未配置更新地址。' };
  autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
  await autoUpdater.checkForUpdates();
  return { supported: true, message: '已完成更新检查。' };
}

app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  if (stopping) return;
  stopping = true;
  activeQueue?.stopAccepting();
  void (async () => {
    await activeQueue?.whenIdle();
    await server?.close();
    engine?.destroy();
    quitting = true; app.quit();
  })();
});
