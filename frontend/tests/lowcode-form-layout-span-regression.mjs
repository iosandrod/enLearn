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
const arrayTableSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/form-materials/lc-array-table/index.vue',
    import.meta.url
  ),
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
assert.match(
  formSource,
  /function createLastRowFillTemplate\([\s\S]*?`repeat\(\$\{rowCount - 1\}, max-content\) \$\{lastRow\}`/,
  'All form layouts must keep leading rows content-sized and reserve flexible height for the final row.'
);
assert.match(
  formSource,
  /ref="formGridRef"[\s\S]*?gridTemplateRows: createLastRowFillTemplate\(formGridRowCount\.value\)/,
  'Automatic form grids must derive their final-row fill template from the rows rendered by the browser.'
);
assert.match(
  formSource,
  /gridTemplateRows: createLastRowFillTemplate\([\s\S]*?renderedLayoutRowCount\.value,[\s\S]*?fillRemainingLayout\.value/,
  'Schema layouts must use the same final-row fill policy while preserving fill-enabled tabs.'
);
assert.match(
  formSource,
  /\.lc-form-grid-cell--array \{[\s\S]*?align-self: stretch;/,
  'Array-table fields must stretch into a flexible form row without a fixed height.'
);
assert.match(
  arrayTableSource,
  /if \(isFillHeight\(config\.height\)\)[\s\S]*?config\.minHeight = 0;[\s\S]*?delete config\.maxHeight;/,
  'Fill-height array tables must not inherit system size constraints that can overflow their parent.'
);
assert.match(
  arrayTableSource,
  /\.lc-array-table--fill \{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\);/,
  'Fill-height array tables must reserve only the remaining row for the VXE viewport.'
);

console.log('Low-code form layout span regression test passed.');
