import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL(
  '../../packages/lowcode-framework/src/',
  import.meta.url,
);

const [arrayTableSource, designerSource] = await Promise.all([
  readFile(
    new URL('lowcode/form-materials/lc-array-table/index.vue', frameworkRoot),
    'utf8',
  ),
  readFile(
    new URL(
      'visual-editor/components/button-group-designer/button-group-designer.service.tsx',
      frameworkRoot,
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
  /<vxe-button-group[\s\S]*?:options="toolbarButtonOptions"[\s\S]*?@click="handleToolbarButtonClick"/,
  'The reusable array table toolbar must render a button group.',
);
assert.match(
  arrayTableSource,
  /function handleToolbarButtonClick\([\s\S]*?payload\.option\?\.name \?\? payload\.name[\s\S]*?button\.command === 'add' \? addRow\(\)/,
  'The button group must dispatch its add command through the array-table component.',
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
  designerSource,
  /treeConfig: \{[\s\S]*?childrenField: 'children',[\s\S]*?expandAll: true/,
  'The button designer must enable the children-based tree table.',
);
assert.match(
  designerSource,
  /childAddable: true,[\s\S]*?addChildText: '新增子按钮'/,
  'The button designer must expose an add-child command.',
);
assert.match(
  designerSource,
  /toolbarButtons: \[[\s\S]*?label: '新增按钮',[\s\S]*?command: 'add'/,
  'The button designer must configure its toolbar through the button-group protocol.',
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
