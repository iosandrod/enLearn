import type { RenderInput } from './types.js';

export class RequestError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
}

export function normalizeInput(value: unknown): RenderInput {
  const input = object(value, 'Request body');
  if (typeof input.html !== 'string' || !input.html.trim()) throw new RequestError(400, 'html is required.');
  if (input.css !== undefined && typeof input.css !== 'string') throw new RequestError(400, 'css must be a string.');
  const css = (input.css as string | undefined) ?? '';
  if (Buffer.byteLength(input.html + css) > 2 * 1024 * 1024) throw new RequestError(413, 'html and css exceed 2 MB.');
  // Chromium also runs with JavaScript disabled; templates never execute application code.
  if (/<\s*\/?\s*(script|iframe|object|embed|base)\b|\bon[a-z]+\s*=|javascript\s*:/i.test(input.html + css)) {
    throw new RequestError(400, 'Template contains unsupported active markup.');
  }
  const format = input.format ?? 'png';
  if (format !== 'pdf' && format !== 'png') throw new RequestError(400, 'format must be pdf or png.');
  const page = input.page === undefined ? {} : object(input.page, 'page');
  const margin = page.marginMm === undefined ? {} : object(page.marginMm, 'page.marginMm');
  const widthMm = number(page.widthMm, 210, 1, 1000, 'page.widthMm');
  const heightMm = number(page.heightMm, 297, 1, 1000, 'page.heightMm');
  const marginMm = {
    top: number(margin.top, 0, 0, heightMm, 'margin.top'),
    right: number(margin.right, 0, 0, widthMm, 'margin.right'),
    bottom: number(margin.bottom, 0, 0, heightMm, 'margin.bottom'),
    left: number(margin.left, 0, 0, widthMm, 'margin.left')
  };
  if (marginMm.top + marginMm.bottom >= heightMm || marginMm.left + marginMm.right >= widthMm) throw new RequestError(400, 'Margins must leave a printable area.');
  const records = input.records === undefined ? [{}] : input.records;
  if (!Array.isArray(records) || !records.length || records.length > 100) throw new RequestError(400, 'records must contain 1 to 100 objects.');
  records.forEach((record) => object(record, 'record'));
  if (input.printBackground !== undefined && typeof input.printBackground !== 'boolean') throw new RequestError(400, 'printBackground must be a boolean.');
  if (input.filename !== undefined && typeof input.filename !== 'string') throw new RequestError(400, 'filename must be a string.');
  const dpi = number(input.dpi, 144, 72, 300, 'dpi');
  if (format === 'png' && (widthMm * dpi / 25.4) * (heightMm * dpi / 25.4) > 40_000_000) throw new RequestError(400, 'Page exceeds 40 million pixels; reduce page size or dpi.');
  return {
    html: input.html, css,
    records: records as Array<Record<string, unknown>>,
    recordIndex: integer(input.recordIndex, 0, records.length - 1, 'recordIndex'),
    pageIndex: integer(input.pageIndex, 0, 99, 'pageIndex'),
    output: {
      format, page: { widthMm, heightMm, marginMm },
      printBackground: input.printBackground !== false,
      scale: number(input.scale, 1, 0.5, 2, 'scale'), dpi,
      filename: filename(input.filename as string | undefined, format)
    }
  };
}

function filename(value: string | undefined, format: 'pdf' | 'png') {
  return ((value?.trim() || 'print-preview').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '-').slice(0, 100).replace(/\.(pdf|png)$/i, '') || 'print-preview') + '.' + format;
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(400, name + ' must be an object.');
  return value as Record<string, unknown>;
}
function number(value: unknown, fallback: number, min: number, max: number, name: string) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new RequestError(400, `${name} must be a number between ${min} and ${max}.`);
  return value;
}
function integer(value: unknown, fallback: number, max: number, name: string) {
  const result = number(value, fallback, 0, max, name);
  if (!Number.isInteger(result)) throw new RequestError(400, name + ' must be an integer.');
  return result;
}
