import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const helpersPath = fileURLToPath(new URL('lowcode/visual-converters/helpers.ts', frameworkRoot));
const [formDesignerSource, runtimeDesignerSource, pageFunctionSource] = await Promise.all([
  readFile(
    new URL('visual-editor/components/form-designer/form-designer.service.tsx', frameworkRoot),
    'utf8',
  ),
  readFile(new URL('lowcode/block-materials/runtime-form-designer.ts', frameworkRoot), 'utf8'),
  readFile(new URL('runtime/page-function/index.ts', frameworkRoot), 'utf8'),
]);

const bundledHelpers = await build({
  entryPoints: [helpersPath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const helpers = await import(
  `data:text/javascript;base64,${Buffer.from(bundledHelpers.outputFiles[0].text).toString('base64')}`
);

const fieldBlock = (componentKey, name, moduleName = 'formComponents') => ({
  _vid: `vid_${name}`,
  moduleName,
  componentKey,
  props: { name },
});
const image = { ...fieldBlock('image', 'image_url'), moduleName: undefined };
const rate = fieldBlock('rate', 'score');
const slider = fieldBlock('slider', 'progress');
const model = {
  pages: {
    '/': {
      blocks: [
        {
          _vid: 'vid_layout',
          moduleName: 'containerComponents',
          componentKey: 'layout',
          props: {
            gutter: 16,
            slots: {
              slot0: { key: 'slot0', span: 12, children: [image, rate] },
              slot1: { key: 'slot1', span: 12, children: [slider] },
            },
          },
        },
      ],
    },
  },
};

const layout = helpers.readFormDesignerLayout(model);
assert.equal(layout.length, 1);
assert.equal(layout[0].kind, 'row');
assert.deepEqual(
  layout[0].columns.map((column) => column.blocks.map((block) => block.field)),
  [['image_url', 'score'], ['progress']],
  'Every formComponents node must survive designer-model to schema.layout conversion.',
);

assert.match(
  formDesignerSource,
  /export type FormDesignerResult = \{[\s\S]*?layout: LowCodeFormLayoutNode\[\]/,
  'The dialog result must carry layout explicitly.',
);
assert.match(
  formDesignerSource,
  /state\.option\.onConfirm\(\{[\s\S]*?fields,[\s\S]*?layout: readFormDesignerLayout\(snapshot\.model\) \?\? \[\],[\s\S]*?designerModel:/,
  'Confirm must return the layout captured from the current designer snapshot.',
);
assert.match(
  formDesignerSource,
  /createLowCodeFormSchema\(result\.fields, result\.designerModel, result\.layout\)/,
  'Schema creation must persist the explicit dialog layout.',
);
assert.match(
  runtimeDesignerSource,
  /if \(designed\.layout\?\.length\) schema\.layout = cloneValue\(designed\.layout\)/,
  'The runtime schema merge must copy the designed layout.',
);
assert.match(
  pageFunctionSource,
  /createLowCodeFormSchemaFromDesignerResult\(result\)[\s\S]*?mergeRuntimeFormSchema\([\s\S]*?data: \{ schema \}/,
  'The system form-definition dialog must save the merged schema including layout.',
);

console.log('Form designer layout save regression test passed.');
