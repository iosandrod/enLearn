import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

const frameworkRoot = new URL(
  '../../packages/lowcode-framework/src/',
  import.meta.url,
);

const [arrayTableSource, designerSource, formSchemaMigrationSource] = await Promise.all([
  readLowCodeMaterialSource('form', 'lc-array-table'),
  readFile(
    new URL(
      'visual-editor/components/button-group-designer/button-group-designer.service.tsx',
      frameworkRoot,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../supabase/migrations/20260831170000_button_group_designer_form_schema.sql',
      import.meta.url,
    ),
    'utf8',
  ),
]);

assert.match(
  arrayTableSource,
  /:tree-config="treeConfig"/,
  'The reusable array table must forward native VXE tree configuration.',
);
assert.match(
  arrayTableSource,
  /const rowConfig = computed\([\s\S]*?isCurrent: config\.isCurrent !== false/,
  'The reusable array table must highlight the current row by default while allowing an explicit opt-out.',
);
assert.match(
  arrayTableSource,
  /function handleCellClick\([\s\S]*?rowConfig\.value\.isCurrent !== false[\s\S]*?setCurrentRow\?\.\(payload\.row\)/,
  'Clicking an array-table cell must explicitly select its row, including clicks inside cell editors.',
);
assert.match(
  arrayTableSource,
  /<vxe-button-group[\s\S]*?:options="toolbarButtonOptions"[\s\S]*?@click="handleToolbarButtonClick"/,
  'The reusable array table toolbar must render a button group.',
);
assert.match(
  arrayTableSource,
  /async function handleToolbarButtonClick\([\s\S]*?payload\.option\?\.name \?\? payload\.name[\s\S]*?typeof button\.execute === 'function'[\s\S]*?await button\.execute\([\s\S]*?emitConfiguredEvent\('onToolbarAction', actionPayload\)/,
  'The button group must execute button-owned behavior and fall back to its configured toolbar event.',
);
assert.doesNotMatch(
  arrayTableSource,
  /button\.command === 'add'/,
  'Toolbar dispatch must not hard-code one command branch.',
);
assert.match(
  arrayTableSource,
  /function executeAddToolbarAction\(\{ action, addRow \}[\s\S]*?addRow\(action\.row\)[\s\S]*?const legacyToolbarCommandExecutors:[\s\S]*?add: executeAddToolbarAction[\s\S]*?legacyToolbarCommandExecutors\[command\]/,
  'Legacy command-based toolbar configurations must be adapted to button executors through an extensible registry.',
);
assert.match(
  arrayTableSource,
  /function addRow\(toolbarRow\?[^)]*\)[\s\S]*?createDefaultRow\(toolbarRow\)[\s\S]*?ensureChildRowKeys\(row\)/,
  'Rows created from toolbar templates must receive nested tree-row keys.',
);
assert.doesNotMatch(
  arrayTableSource,
  /addText/,
  'The reusable array table must not model its toolbar as one add-button label.',
);
assert.match(
  arrayTableSource,
  /:tree-node="isTreeNodeColumn\(column\)"/,
  'The first configured data column must render the tree expander.',
);
assert.match(
  arrayTableSource,
  /function addChildRow\(parent:[\s\S]*?children\.push\(child\)[\s\S]*?setTreeExpand\?\.\(parent, true\)/,
  'Tree rows must support adding and immediately revealing a child row.',
);
assert.match(
  arrayTableSource,
  /function findRowLocation\([\s\S]*?findRowLocation\(target, getChildRows\(row\), row\)/,
  'Move, copy, and delete operations must locate nested rows recursively.',
);
assert.match(
  formSchemaMigrationSource,
  /"treeConfig": \{[\s\S]*?"childrenField": "children",[\s\S]*?"expandAll": true/,
  'The button designer must enable the children-based tree table.',
);
assert.match(
  formSchemaMigrationSource,
  /"childAddable": true,[\s\S]*?"addChildText": "新增子按钮"/,
  'The button designer must expose an add-child command.',
);
assert.match(
  designerSource,
  /code === 'add-dropdown'[\s\S]*?execute: executeAddToolbarAction/,
  'The button designer must attach executable toolbar behavior to add-dropdown.',
);
assert.match(
  designerSource,
  /if \(code === 'add-dropdown'\)[\s\S]*?const row = isRecord\(button\.row\)/,
  'The button designer must expose an executable action that creates a dropdown button with a child item.',
);
assert.doesNotMatch(
  designerSource,
  /addText/,
  'The button designer must not customize the array table through addText.',
);
assert.doesNotMatch(
  designerSource,
  /title: '子按钮 JSON'/,
  'Children must be edited as tree rows instead of an opaque JSON cell.',
);

console.log('Button-group tree designer regression test passed.');
