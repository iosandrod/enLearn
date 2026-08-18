import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [formDesignerSource, modalDesignerSource] = await Promise.all([
  readFile(
    new URL('visual-editor/components/form-designer/form-designer.service.tsx', frameworkRoot),
    'utf8',
  ),
  readFile(
    new URL('visual-editor/components/modal-designer/modal-designer.service.tsx', frameworkRoot),
    'utf8',
  ),
]);

for (const [name, source] of [
  ['form designer', formDesignerSource],
  ['modal designer', modalDesignerSource],
]) {
  assert.match(
    source,
    /<VisualEditorProvider[\s\S]*?showGlobalDialogHost=\{false\}[\s\S]*?\/>/,
    `The embedded ${name} must reuse the outer GlobalDialogHost.`,
  );
}

console.log('Nested visual-designer dialog-host regression test passed.');
