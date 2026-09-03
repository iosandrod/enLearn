import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../packages/lowcode-framework/src/lowcode/form-materials/vxe-select/index.vue', import.meta.url),
  'utf8',
);

assert.match(source, /v-bind="selectProps"/);
assert.match(
  source,
  /fieldProps\.filterable === undefined[\s\S]*?fieldProps\.filterable = true/,
  'Selects must default to searchable.',
);
assert.match(
  source,
  /if \(fieldProps\.filterable === undefined\)/,
  'The searchable default must be derived without overriding explicit props.',
);

console.log('VXE select searchable regression test passed.');
