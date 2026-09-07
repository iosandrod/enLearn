import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

const [arrayTableSource, formSource, appStyles] = await Promise.all([
  readLowCodeMaterialSource('form', 'lc-array-table'),
  readFile(
    new URL('../../packages/lowcode-framework/src/components/LowCodeForm.vue', import.meta.url),
    'utf8',
  ),
  readFile(new URL('../assets/styles/app.css', import.meta.url), 'utf8'),
]);

const modelWatcher = arrayTableSource.match(
  /watch\(\s*\(\) => props\.modelValue,[\s\S]*?\{ immediate: true, deep: true \}\s*\);/,
);
assert.ok(modelWatcher, 'Array tables must synchronize external model changes.');
assert.match(
  modelWatcher[0],
  /if \(isSameValue\(serializeRows\(\), normalizeModelValue\(value\)\)\) return;/,
  'A value emitted from the active table must not rebuild its own rows.',
);
assert.match(
  modelWatcher[0],
  /rows\.value = normalizeRows\(value\);\s*recalculateTable\(\);/,
  'Actual external changes should retain the table layout while refreshing row measurements.',
);
assert.doesNotMatch(
  modelWatcher[0],
  /refreshTableColumns\(|refreshColumn\(/,
  'Synchronizing an edited value must not refresh VXE columns and clear the input focus.',
);
assert.match(
  arrayTableSource,
  /function serializeRows\(\) \{[\s\S]*rows\.value\.map/,
  'The emitted model and synchronization comparison must use the same row serialization.',
);
assert.match(
  arrayTableSource,
  /const measuredFillHeight = ref<number>\(\);[\s\S]*?function measureFillHeight\(\)[\s\S]*?Math\.min\(\.\.\.heights\)/,
  'Fill-height array tables must measure the constrained ancestor instead of their content-sized root.',
);
assert.match(
  arrayTableSource,
  /arrayTableResizeObserver\.observe\(observed\);[\s\S]*?observed = observed\.parentElement;/,
  'Array-table resize handling must observe ancestor containers so parent height changes are detected.',
);
const formModelWatcher = formSource.match(
  /watch\(\s*\(\) => props\.modelValue,[\s\S]*?\{ deep: true \}\s*\);/,
);
assert.ok(formModelWatcher, 'Low-code forms must accept external model updates.');
assert.match(
  formModelWatcher[0],
  /const isLocalUpdate = formValuesEqual\(nextValue, formData\);\s*if \(isLocalUpdate\) return;/,
  'A form must not clear and repopulate fields for its own emitted value.',
);
assert.doesNotMatch(
  appStyles,
  /\.vxe-cell--wrapper\s+\.vxe-(?:input|number-input)\s*\{[^}]*height\s*:/,
  'Global styles must not override VXE input heights inside array-table cells.',
);
assert.doesNotMatch(
  appStyles,
  /\.lc-array-table\s*\{[^}]*display\s*:\s*flex\s*!important/,
  'Global styles must not replace the array-table material grid layout in designer dialogs.',
);

console.log('Array-table input focus regression test passed.');
