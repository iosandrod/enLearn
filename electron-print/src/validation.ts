import type { DesktopConfig, MillimeterBox, OffsetSettings, PaperSettings, PreviewRequest, PrintRequest, PrinterProfile } from './types.js';

export class RequestError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
}

export const DEFAULT_PROFILE: PrinterProfile = {
  paper: { widthMm: 100, heightMm: 50, marginMm: { top: 0, right: 0, bottom: 0, left: 0 } },
  offset: { xMm: 0, yMm: 0 },
  landscape: false,
  printBackground: true
};

export const DEFAULT_CONFIG: DesktopConfig = {
  host: '127.0.0.1',
  port: 3302,
  defaultPrinter: '',
  autoStart: false,
  maxHistory: 1000,
  updateFeedUrl: '',
  allowedOrigins: ['http://localhost:3301', 'http://127.0.0.1:3301'],
  defaultProfile: DEFAULT_PROFILE,
  printerProfiles: {}
};

export function normalizePrintRequest(value: unknown, config: DesktopConfig): PrintRequest {
  const input = object(value, '请求体');
  const printerName = text(input.printerName, config.defaultPrinter, 256, 'printerName');
  if (!printerName) throw new RequestError(400, '未指定打印机，且没有配置默认打印机。');
  const profile = config.printerProfiles[printerName] ?? config.defaultProfile;
  const css = text(input.css, '', 2 * 1024 * 1024, 'css');
  if (/<\s*\/\s*style\b/i.test(css)) throw new RequestError(400, 'css 不能包含 HTML 结束标签。');
  return {
    html: safeHtml(input.html),
    css,
    records: records(input.records),
    printerName,
    templateName: text(input.templateName, '未命名模板', 200, 'templateName'),
    jobName: text(input.jobName, '打印任务', 200, 'jobName'),
    copies: integer(input.copies, 1, 1, 999, 'copies'),
    collate: boolean(input.collate, true, 'collate'),
    landscape: boolean(input.landscape, profile.landscape, 'landscape'),
    printBackground: boolean(input.printBackground, profile.printBackground, 'printBackground'),
    page: paper(input.page, profile.paper),
    offset: offset(input.offset, profile.offset),
    wait: boolean(input.wait, true, 'wait')
  };
}

export function normalizePreviewRequest(value: unknown, config: DesktopConfig): PreviewRequest {
  const input = object(value, '请求体');
  const base = normalizePrintRequest({ ...input, printerName: text(input.printerName, config.defaultPrinter || '__preview__', 256, 'printerName') }, config);
  const format = input.format ?? 'png';
  if (format !== 'pdf' && format !== 'png') throw new RequestError(400, 'format 必须是 pdf 或 png。');
  const dpi = number(input.dpi, 144, 72, 300, 'dpi');
  if (format === 'png' && base.page.widthMm * base.page.heightMm * (dpi / 25.4) ** 2 > 40_000_000) throw new RequestError(400, '图片超过 4000 万像素，请降低纸张尺寸或 DPI。');
  return {
    ...base,
    format,
    recordIndex: integer(input.recordIndex, 0, 0, Math.max(0, base.records.length - 1), 'recordIndex'),
    pageIndex: integer(input.pageIndex, 0, 0, 99, 'pageIndex'),
    dpi,
    scale: number(input.scale, 1, 0.5, 2, 'scale'),
    filename: filename(input.filename, format)
  };
}

export function mergeConfig(current: DesktopConfig, value: unknown): DesktopConfig {
  const input = object(value, '配置');
  const next: DesktopConfig = {
    ...current,
    defaultPrinter: text(input.defaultPrinter, current.defaultPrinter, 256, 'defaultPrinter'),
    autoStart: boolean(input.autoStart, current.autoStart, 'autoStart'),
    maxHistory: integer(input.maxHistory, current.maxHistory, 100, 10000, 'maxHistory'),
    updateFeedUrl: text(input.updateFeedUrl, current.updateFeedUrl, 2000, 'updateFeedUrl'),
    allowedOrigins: input.allowedOrigins === undefined ? [...current.allowedOrigins] : origins(input.allowedOrigins),
    defaultProfile: input.defaultProfile === undefined ? current.defaultProfile : profile(input.defaultProfile, current.defaultProfile),
    printerProfiles: { ...current.printerProfiles }
  };
  if (next.updateFeedUrl) {
    try { const url = new URL(next.updateFeedUrl); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); }
    catch { throw new RequestError(400, '更新地址必须是没有账号密码的 HTTPS 地址。'); }
  }
  if (input.printerProfiles !== undefined) {
    const values = object(input.printerProfiles, 'printerProfiles');
    next.printerProfiles = Object.fromEntries(Object.entries(values).map(([name, item]) => [name, profile(item, current.printerProfiles[name] ?? next.defaultProfile)]));
  }
  return next;
}

function safeHtml(value: unknown) {
  const html = text(value, '', 2 * 1024 * 1024, 'html');
  if (!html.trim()) throw new RequestError(400, 'html 不能为空。');
  if (/<\s*\/?\s*(script|iframe|object|embed|base)\b|\bon[a-z]+\s*=|javascript\s*:/i.test(html)) throw new RequestError(400, 'HTML 包含不允许的活动内容。');
  return html;
}

function origins(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50) throw new RequestError(400, 'allowedOrigins 必须是最多 50 项的数组。');
  return [...new Set(value.map((item) => {
    try {
      if (typeof item !== 'string') throw new Error();
      const url = new URL(item);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== item || url.username || url.password) throw new Error();
      return url.origin;
    } catch { throw new RequestError(400, 'allowedOrigins 必须填写完整来源，例如 https://example.com（不带路径和末尾斜杠）。'); }
  }))];
}

function records(value: unknown) {
  if (value === undefined) return [{}];
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new RequestError(400, 'records 必须包含 1 到 100 条数据。');
  return value.map((item) => object(item, 'record'));
}

function paper(value: unknown, fallback: PaperSettings): PaperSettings {
  if (value === undefined) return structuredClone(fallback);
  const input = object(value, 'page');
  const widthMm = number(input.widthMm, fallback.widthMm, 1, 1000, 'page.widthMm');
  const heightMm = number(input.heightMm, fallback.heightMm, 1, 1000, 'page.heightMm');
  const margin = box(input.marginMm, fallback.marginMm, widthMm, heightMm);
  if (margin.left + margin.right >= widthMm || margin.top + margin.bottom >= heightMm) throw new RequestError(400, '页边距必须保留可打印区域。');
  return { widthMm, heightMm, marginMm: margin };
}

function box(value: unknown, fallback: MillimeterBox, width: number, height: number): MillimeterBox {
  if (value === undefined) value = fallback;
  const input = object(value, 'marginMm');
  return {
    top: number(input.top, fallback.top, 0, height, 'margin.top'), right: number(input.right, fallback.right, 0, width, 'margin.right'),
    bottom: number(input.bottom, fallback.bottom, 0, height, 'margin.bottom'), left: number(input.left, fallback.left, 0, width, 'margin.left')
  };
}

function offset(value: unknown, fallback: OffsetSettings): OffsetSettings {
  if (value === undefined) return { ...fallback };
  const input = object(value, 'offset');
  return { xMm: number(input.xMm, fallback.xMm, -100, 100, 'offset.xMm'), yMm: number(input.yMm, fallback.yMm, -100, 100, 'offset.yMm') };
}

function profile(value: unknown, fallback: PrinterProfile): PrinterProfile {
  const input = object(value, 'profile');
  return {
    paper: paper(input.paper, fallback.paper), offset: offset(input.offset, fallback.offset),
    landscape: boolean(input.landscape, fallback.landscape, 'landscape'),
    printBackground: boolean(input.printBackground, fallback.printBackground, 'printBackground')
  };
}

function filename(value: unknown, format: 'pdf' | 'png') {
  const base = text(value, 'print-preview', 100, 'filename').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '-').replace(/\.(pdf|png)$/i, '') || 'print-preview';
  return `${base}.${format}`;
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(400, `${name} 必须是对象。`);
  return value as Record<string, unknown>;
}
function text(value: unknown, fallback: string, max: number, name: string) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || Buffer.byteLength(value) > max) throw new RequestError(400, `${name} 必须是长度不超过 ${max} 字节的字符串。`);
  return value.trim();
}
function boolean(value: unknown, fallback: boolean, name: string) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new RequestError(400, `${name} 必须是布尔值。`);
  return value;
}
function number(value: unknown, fallback: number, min: number, max: number, name: string) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new RequestError(400, `${name} 必须在 ${min} 到 ${max} 之间。`);
  return value;
}
function integer(value: unknown, fallback: number, min: number, max: number, name: string) {
  const result = number(value, fallback, min, max, name);
  if (!Number.isInteger(result)) throw new RequestError(400, `${name} 必须是整数。`);
  return result;
}
