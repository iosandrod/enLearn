import assert from 'node:assert/strict';
import { compilePrintTemplate } from './print-template.compiler';

const output = {
  format: 'pdf' as const,
  page: { widthMm: 210, heightMm: 297 },
  printBackground: true
};

const compiled = compilePrintTemplate(
  {
    html: '<section><h1>{{customer.name}}</h1><p>{{amount}}</p></section>',
    css: 'h1 { color: #111; }'
  },
  output
);
const html = compiled.renderRecord({
  customer: { name: '<Example & Co>' },
  amount: 1280.5
});

assert.match(html, /&lt;Example &amp; Co&gt;/);
assert.match(html, /1280\.5/);
assert.match(html, /@page/);
assert.match(html, /data-print-root="true"/);
assert.throws(
  () => compilePrintTemplate({ html: '<script>alert(1)</script>' }, output),
  /script|unsafe/i
);
assert.throws(
  () => compilePrintTemplate({ html: '<img src="http://127.0.0.1/a.png">' }, output),
  /external resource|unsafe/i
);

console.log('print template compiler tests passed');
