import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/form-designer/form-designer.service.tsx',
    import.meta.url,
  ),
  'utf8',
);

assert.match(
  source,
  /<LowCodeForm[\s\S]*?onUpdate:modelValue=\{\(value: Record<string, unknown>\)/,
);
assert.doesNotMatch(source, /<LowCodeForm[\s\S]*?onUpdateModel=/);
assert.match(
  source,
  /Object\.assign\(model, nextModel\)/,
);

console.log('form designer header model regression checks passed');
