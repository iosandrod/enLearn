import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [runtimeButtonGroupSource, designerSource, rendererSource] = await Promise.all([
  readLowCodeMaterialSource('page', 'buttonGroup'),
  readFile(
    new URL(
      'visual-editor/components/button-group-designer/button-group-designer.service.tsx',
      frameworkRoot,
    ),
    'utf8',
  ),
  readFile(new URL('components/LowCodePageRenderer.vue', frameworkRoot), 'utf8'),
]);

assert.match(
  runtimeButtonGroupSource,
  /@contextmenu\.stop\.prevent="openButtonGroupContextMenu"/,
  'The rendered button group must handle right clicks.',
);
assert.match(
  runtimeButtonGroupSource,
  /VxeUI\.contextMenu\.openByEvent\(event, \{/,
  'The rendered button group must use the VXE imperative context-menu API.',
);
assert.match(
  runtimeButtonGroupSource,
  /code: 'design-buttons',[\s\S]*?name: '设计按钮'/,
  'The runtime context menu must expose the design-buttons action.',
);
assert.match(
  runtimeButtonGroupSource,
  /optionClick\(\{ option \}\)[\s\S]*?option\.code === 'design-buttons'[\s\S]*?openButtonDesigner\(\)/,
  'Clicking design-buttons must open the button designer.',
);
assert.match(
  runtimeButtonGroupSource,
  /const \{ \$\$buttonGroupDesigner \} = await import\([\s\S]*?button-group-designer\.service'/,
  'The runtime action must reuse the existing button-group designer service.',
);
assert.match(
  runtimeButtonGroupSource,
  /buttons: props\.block\.actions\.map\(\(action\) => toDesignerButton\(action\)\)/,
  'The designer must receive the current rendered button configuration.',
);
assert.match(
  runtimeButtonGroupSource,
  /directivesJson: JSON\.stringify\(directives \?\? \[\]\)/,
  'Runtime directives must be adapted to the schema field used by the reused designer.',
);
assert.match(
  runtimeButtonGroupSource,
  /const \{[\s\S]*?directivesJson,[\s\S]*?\.\.\.preservedProps[\s\S]*?const next: Record<string, unknown> = \{[\s\S]*?\.\.\.preservedProps/,
  'Saving a button must retain supported properties that are not shown as designer columns.',
);
assert.match(
  runtimeButtonGroupSource,
  /function createRuntimeBlockChanges[\s\S]*?actions: result\.buttons\.map[\s\S]*?onConfirm: async \(result\) => \{[\s\S]*?runtimeBlockEditor\.updateBlock\(\{/,
  'Confirming the runtime designer must map the edited rows back to the button-group block.',
);
assert.match(
  designerSource,
  /await option\.onConfirm\?\.\(result\);[\s\S]*?close: true/,
  'The designer must finish persistence before it closes the dialog.',
);
assert.match(
  rendererSource,
  /provide\(lowCodeRuntimeBlockEditorKey,[\s\S]*?updateBlock: persistRuntimeBlockUpdate/,
  'The runtime renderer must provide the block persistence bridge.',
);
assert.match(
  rendererSource,
  /function persistRuntimeBlockUpdate[\s\S]*?resource: 'lowcode_pages',[\s\S]*?schema: nextSchema,[\s\S]*?version: nextVersion/,
  'Runtime button edits must persist the updated page schema and version.',
);
assert.match(
  rendererSource,
  /function updateVisualButtonGroupBlocks[\s\S]*?componentKey === 'lowcode-button-group'[\s\S]*?visualProps\.buttons = actions\.map\(runtimeButtonToVisualButton\)/,
  'Runtime edits must also update the stored visual model so later designer saves retain them.',
);
assert.match(
  rendererSource,
  /function runtimeButtonToVisualButton[\s\S]*?directivesJson: JSON\.stringify/,
  'The visual model must use the designer directivesJson representation.',
);

console.log('Runtime button-group context menu regression test passed.');
