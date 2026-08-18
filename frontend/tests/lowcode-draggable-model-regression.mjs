import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const draggableSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/simulator-editor/draggable-transition-group.vue',
    import.meta.url,
  ),
  'utf8',
);

assert.match(
  draggableSource,
  /modelValue:\s*\{[\s\S]*?defineEmits\(\['update:modelValue', 'update:drag'\]\)[\s\S]*?useVModel\(props, 'modelValue', emit\)/,
  'The draggable wrapper must implement Vue default v-model with modelValue/update:modelValue.',
);
assert.match(
  draggableSource,
  /<draggable\s+[\s\S]*?:list="list"/,
  'Sortable must mutate the shared list so cross-container drops are committed in the destination.',
);
assert.doesNotMatch(
  draggableSource,
  /moduleValue|update:moduleValue/,
  'The misspelled moduleValue model contract must not return.',
);

console.log('Low-code draggable model regression test passed.');
