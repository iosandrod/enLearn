import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [arrayTableSource, formSource] = await Promise.all([
  readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/form-materials/lc-array-table/index.vue',
    import.meta.url,
  ),
  'utf8',
  ),
  readFile(
    new URL('../../packages/lowcode-framework/src/components/LowCodeForm.vue', import.meta.url),
    'utf8',
  ),
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
const formModelWatcher = formSource.match(
  /watch\(\s*\(\) => props\.modelValue,[\s\S]*?\{ deep: true \}\s*\);/,
);
assert.ok(formModelWatcher, 'Low-code forms must accept external model updates.');
assert.match(
  formModelWatcher[0],
  /const isLocalUpdate = formValuesEqual\(nextValue, formData\);\s*if \(isLocalUpdate\) return;/,
  'A form must not clear and repopulate fields for its own emitted value.',
);

console.log('Array-table input focus regression test passed.');
