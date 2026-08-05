import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [
  formSource,
  formBlockSource,
  searchFormBlockSource,
  runtimeDesignerSource,
  designerSource,
  converterHelpersSource,
  rendererSource,
] = await Promise.all([
  readFile(new URL('components/LowCodeForm.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/form/index.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/search-form/index.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/runtime-form-designer.ts', frameworkRoot), 'utf8'),
  readFile(
    new URL('visual-editor/components/form-designer/form-designer.service.tsx', frameworkRoot),
    'utf8',
  ),
  readFile(new URL('lowcode/visual-converters/helpers.ts', frameworkRoot), 'utf8'),
  readFile(new URL('components/LowCodePageRenderer.vue', frameworkRoot), 'utf8'),
]);

assert.match(
  formSource,
  /@contextmenu="handleLabelContextMenu"[\s\S]*?target\.closest\('\.vxe-form--item-title'\)/,
  'LowCodeForm must only promote context menus that originate from a rendered field label.',
);
assert.match(
  formSource,
  /if \(!props\.labelContextMenu\) return;[\s\S]*?event\.preventDefault\(\);[\s\S]*?emit\('labelContextMenu', event\)/,
  'The native context menu should be suppressed only when label design is enabled.',
);

for (const source of [formBlockSource, searchFormBlockSource]) {
  assert.match(source, /label-context-menu/, 'Runtime forms must enable label context menus.');
  assert.match(
    source,
    /@label-context-menu="openFormContextMenu"/,
    'Runtime forms must handle the promoted label context-menu event.',
  );
  assert.match(
    source,
    /openRuntimeFormDesigner\(props\.block, '(edit|search)', runtimeBlockEditor\)/,
    'Runtime form blocks must open the shared form designer in the correct mode.',
  );
}

assert.match(
  runtimeDesignerSource,
  /code: 'design-current-form',[\s\S]*?name: '设计当前表单'/,
  'The context menu must expose the requested design-current-form action.',
);
assert.match(
  runtimeDesignerSource,
  /fields: block\.schema\.fields\.map\(runtimeFieldToDesignerField\),[\s\S]*?layout: block\.schema\.layout,[\s\S]*?columns: block\.schema\.columns/,
  'The designer must receive the current form fields and layout metadata.',
);
assert.match(
  runtimeDesignerSource,
  /required: field\.rules\?\.some\(\(rule\) => rule\.required === true\)/,
  'Runtime validation rules must be adapted to the designer required flag.',
);
assert.match(
  runtimeDesignerSource,
  /await runtimeBlockEditor\.updateBlock\([\s\S]*?schema: mergeRuntimeFormSchema[\s\S]*?formDesignerModel: result\.designerModel/,
  'Confirming form design must persist both the runtime schema and designer model.',
);
assert.match(
  runtimeDesignerSource,
  /actions: cloneValue\(original\.actions \?\? \[\]\)/,
  'Form design must retain existing runtime actions.',
);

assert.match(
  designerSource,
  /function layoutNodesToBlocks[\s\S]*?componentMap\.layout[\s\S]*?block\.props\.slots = createLayoutSlots/,
  'Schema-only forms must reconstruct their existing row/column layout on first design.',
);
assert.match(
  designerSource,
  /columnCount - occupiedColumns[\s\S]*?blocks: \[\]/,
  'Schema-only forms must retain trailing empty columns in partially filled rows.',
);
assert.match(
  converterHelpersSource,
  /columns\.some\(\(column\) => column\.blocks\.length > 0\)/,
  'Saving a designed row must retain empty layout columns used as spacing.',
);
assert.match(
  designerSource,
  /onConfirm: async \(\)[\s\S]*?await state\.option\.onConfirm[\s\S]*?methods\.hide\(\)/,
  'The form designer must finish persistence before closing.',
);

assert.match(
  rendererSource,
  /function persistRuntimeBlockUpdate[\s\S]*?resource: 'lowcode_pages'[\s\S]*?schema: nextSchema/,
  'Runtime form edits must use the existing page persistence bridge.',
);
assert.match(
  rendererSource,
  /targetBlock\.kind === 'form' \|\| targetBlock\.kind === 'searchForm'[\s\S]*?visualProps\.formDesignerModel/,
  'Runtime form edits must also update a stored page-level visual model when present.',
);

console.log('Runtime form-label context menu regression test passed.');
