import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layoutSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodeFormLayout.vue', import.meta.url),
  'utf8'
);
const formSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodeForm.vue', import.meta.url),
  'utf8'
);

assert.match(
  layoutSource,
  /class="lc-form-row lc-form-row--span-grid"/,
  'Schema rows must opt into the span-aware grid layout.'
);
assert.match(
  layoutSource,
  /'--lc-form-row-template': columnTemplate\(node\.columns\)/,
  'Each schema row must expose a weighted grid template.'
);
assert.match(
  layoutSource,
  /`minmax\(0, \$\{columnWeight\(column\)\}fr\)`/,
  'Column spans must become proportional grid tracks.'
);
assert.doesNotMatch(
  layoutSource,
  /flex:\s*`0 0 \$\{basis\}`/,
  'Column widths must not use percentages that ignore the row gap.'
);
assert.match(
  formSource,
  /\.lc-form-layout > \.lc-form-row\.lc-form-row--span-grid \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: var\(--lc-form-row-template, minmax\(0, 1fr\)\);/,
  'Form rows must use weighted grid tracks so gaps are deducted from available width.'
);

console.log('Low-code form layout span regression test passed.');
