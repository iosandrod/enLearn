import type { OffsetSettings, PaperSettings } from './types.js';

type DocumentInput = {
  html: string;
  css: string;
  records: Array<Record<string, unknown>>;
  page: PaperSettings;
  offset: OffsetSettings;
  recordIndex?: number;
};

export function compileDocument(input: DocumentInput) {
  const { page, offset } = input;
  const pageCss = `
@page { size: ${page.widthMm}mm ${page.heightMm}mm; margin: ${page.marginMm.top}mm ${page.marginMm.right}mm ${page.marginMm.bottom}mm ${page.marginMm.left}mm; }
html, body { margin: 0; padding: 0; width: ${page.widthMm}mm; min-height: ${page.heightMm}mm; }
* { box-sizing: border-box; }
.print-record { width: 100%; min-height: 100%; transform: translate(${offset.xMm}mm, ${offset.yMm}mm); transform-origin: top left; break-after: page; page-break-after: always; }
.print-record:last-child { break-after: auto; page-break-after: auto; }`;
  const records = input.recordIndex === undefined ? input.records : [input.records[input.recordIndex]];
  const bodies = records.map((record) => `<main class="print-record">${interpolate(bodyOf(input.html), record)}</main>`).join('');
  const source = normalizeDocument(input.html, `${pageCss}\n${input.css}`, bodies);
  if (Buffer.byteLength(source) > 16 * 1024 * 1024) throw Object.assign(new Error('展开后的打印文档超过 16 MB。'), { statusCode: 413 });
  return source;
}

function bodyOf(html: string) {
  return html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
}

function normalizeDocument(html: string, css: string, body: string) {
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline' data:">${head}<style>${css}</style></head><body>${body}</body></html>`;
}

function interpolate(template: string, record: Record<string, unknown>) {
  return template.replace(/{{\s*([A-Za-z0-9_$.-]+)\s*}}/g, (_match, path: string) => {
    const value = path.replace(/^this\./, '').split('.').filter(Boolean).reduce<unknown>((current, key) => {
      return current && typeof current === 'object' && Object.hasOwn(current, key) ? (current as Record<string, unknown>)[key] : undefined;
    }, record);
    return escapeHtml(value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}
