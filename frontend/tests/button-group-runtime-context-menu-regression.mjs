import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtimeButtonGroupSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/block-materials/button-group/index.vue',
    import.meta.url,
  ),
  'utf8',
);

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

console.log('Runtime button-group context menu regression test passed.');
