/** @param {import('./types.js').RenderInput} input */
export function compileDocuments(input) {
  const { page } = input.output;
  const pageCss = `@page { size: ${page.widthMm}mm ${page.heightMm}mm; margin: ${page.marginMm.top}mm ${page.marginMm.right}mm ${page.marginMm.bottom}mm ${page.marginMm.left}mm; }
html,body { margin:0; padding:0; } * { box-sizing:border-box; }
.print-record { break-after:page; page-break-after:always; } .print-record:last-child { break-after:auto; page-break-after:auto; }`;
  const template = normalizeDocument(input.html, pageCss + '\n' + input.css);
  let size = 0;
  return (input.output.format === 'png' ? [input.records[input.recordIndex]] : input.records).map((record) => {
    const document = template.replace(/{{\s*([A-Za-z0-9_$.-]+)\s*}}/g, (_match, path) => {
      const value = path.replace(/^this\./, '').split('.').filter(Boolean).reduce((current, key) => {
        if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined;
        return current[key];
      }, record);
      return escapeHtml(value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));
    }).replace(/<body([^>]*)>/i, '<body$1><main class="print-record">').replace(/<\/body>/i, '</main></body>');
    size += Buffer.byteLength(document);
    if (size > 16 * 1024 * 1024) throw Object.assign(new Error('Expanded templates exceed 16 MB.'), { statusCode: 413 });
    return document;
  });
}

function normalizeDocument(html, css) {
  const style = '<style>' + css + '</style>';
  if (/<html\b/i.test(html)) return /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, () => style + '</head>')
    : html.replace(/<html([^>]*)>/i, (_match, attributes) => '<html' + attributes + '><head><meta charset="utf-8">' + style + '</head>');
  return '<!doctype html><html><head><meta charset="utf-8">' + style + '</head><body>' + html + '</body></html>';
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}
