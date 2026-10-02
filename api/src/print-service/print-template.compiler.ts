import { createHash } from 'node:crypto';
import { printBadRequest } from './print-errors';
import type { PrintOutput, PrintTemplateSnapshot } from './print.types';

const MAX_TEMPLATE_BYTES = 2 * 1024 * 1024;
const DISALLOWED_TEMPLATE = /<\s*(script|iframe|object|embed|base)\b|on[a-z]+\s*=|javascript\s*:|@import\b/i;
const EXTERNAL_RESOURCE = /(?:src|href)\s*=\s*["']\s*(?!data:|https:\/\/)/i;

function readSnapshot(value: unknown): PrintTemplateSnapshot {
  if (typeof value === 'string') return { html: value };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    printBadRequest('PRINT_TEMPLATE_INVALID', 'templateSnapshot must contain an HTML string.');
  }

  const snapshot = value as Record<string, unknown>;
  if (typeof snapshot.html !== 'string' || !snapshot.html.trim()) {
    printBadRequest('PRINT_TEMPLATE_INVALID', 'templateSnapshot.html is required.');
  }
  if (snapshot.css !== undefined && typeof snapshot.css !== 'string') {
    printBadRequest('PRINT_TEMPLATE_INVALID', 'templateSnapshot.css must be a string.');
  }
  return {
    html: snapshot.html,
    css: snapshot.css as string | undefined
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readPath(record: Record<string, unknown>, path: string) {
  return path
    .replace(/^this\./, '')
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, key) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[key];
    }, record);
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export type CompiledPrintTemplate = {
  templateHash: string;
  renderRecord: (record: Record<string, unknown>) => string;
};

export function compilePrintTemplate(
  snapshotValue: unknown,
  output: PrintOutput
): CompiledPrintTemplate {
  const snapshot = readSnapshot(snapshotValue);
  const raw = snapshot.html + '\n' + (snapshot.css ?? '');
  if (Buffer.byteLength(raw, 'utf8') > MAX_TEMPLATE_BYTES) {
    printBadRequest('PRINT_TEMPLATE_INVALID', 'Template snapshot exceeds 2 MB.');
  }
  if (DISALLOWED_TEMPLATE.test(raw) || EXTERNAL_RESOURCE.test(raw)) {
    printBadRequest(
      'PRINT_TEMPLATE_INVALID',
      'Template contains a script, event handler, external resource, or unsafe HTML.'
    );
  }

  const page = output.page;
  const margin = page.marginMm ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const pageCss = [
    '@page { size: ' + page.widthMm + 'mm ' + page.heightMm + 'mm; margin: ' +
      margin.top + 'mm ' + margin.right + 'mm ' + margin.bottom + 'mm ' + margin.left + 'mm; }',
    'html, body { margin: 0; padding: 0; width: ' + page.widthMm + 'mm; min-height: ' +
      page.heightMm + 'mm; }',
    '* { box-sizing: border-box; }',
    '.print-record { break-after: page; page-break-after: always; }',
    '.print-record:last-child { break-after: auto; page-break-after: auto; }'
  ].join('\n');

  const style = '<style>' + pageCss + '\n' + (snapshot.css ?? '') + '</style>';
  let template: string;
  if (snapshot.html.includes('<html')) {
    template = snapshot.html.includes('</head>')
      ? snapshot.html.replace('</head>', style + '</head>')
      : snapshot.html.replace(/<html([^>]*)>/i, '<html$1><head><meta charset="utf-8">' + style + '</head>');
  } else {
    template = '<!doctype html><html><head><meta charset="utf-8">' + style +
      '</head><body>' + snapshot.html + '</body></html>';
  }

  if (!template.includes('<style>')) {
    printBadRequest('PRINT_TEMPLATE_INVALID', 'Template could not be normalized.');
  }

  const templateHash = createHash('sha256').update(template).digest('hex');
  return {
    templateHash,
    renderRecord: (record) => template.replace(
      /{{\s*([A-Za-z0-9_$.-]+)\s*}}/g,
      (_match, path: string) => escapeHtml(formatValue(readPath(record, path)))
    ).replace(
      /<body([^>]*)>/i,
      '<body$1><main data-print-root="true" class="print-record">'
    ).replace(/<\/body>/i, '</main></body>')
  };
}
