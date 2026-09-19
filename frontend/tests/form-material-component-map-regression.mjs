import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const helpersSource = await readFile(
  new URL('lowcode/visual-converters/helpers.ts', frameworkRoot),
  'utf8',
);
const catalogSource = await readFile(
  new URL('lowcode/material-runtime/catalog.ts', frameworkRoot),
  'utf8',
);
const migration = await readFile(
  new URL('../../supabase/migrations/20260919153000_form_material_component_map.sql', import.meta.url),
  'utf8',
);

assert.doesNotMatch(helpersSource, /const componentMap/);
assert.match(helpersSource, /resolveFormMaterialComponentType\(componentName\)/);
assert.match(catalogSource, /replaceFormMaterialComponentMappings\(rows\)/);
assert.match(migration, /'vxe-select'[\s\S]*?"picker":"vxe-select"/);
assert.match(migration, /'lc-basic-control'[\s\S]*?"stepper":"lc-stepper"/);
assert.match(migration, /'vxe-upload'[\s\S]*?"image":"vxe-upload"/);

const entrySource = `
  export { normalizeField } from './lowcode/visual-converters/helpers.ts';
  export {
    getFormMaterialComponentMappings,
    replaceFormMaterialComponentMappings,
    resolveFormMaterialComponentType,
  } from './lowcode/material-runtime/form-component-map.ts';
`;
const bundle = await build({
  stdin: {
    contents: entrySource,
    resolveDir: fileURLToPath(frameworkRoot),
    sourcefile: 'form-material-component-map-test.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const module = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

module.replaceFormMaterialComponentMappings([
  {
    material_kind: 'form',
    manifest: {
      componentMap: {
        picker: 'vxe-select',
        image: 'vxe-upload',
        customDesignerNode: 'company-custom-input',
      },
    },
  },
]);

assert.equal(module.resolveFormMaterialComponentType('picker'), 'vxe-select');
assert.equal(module.resolveFormMaterialComponentType('image'), 'vxe-upload');
assert.equal(module.resolveFormMaterialComponentType('unknown-material'), 'unknown-material');
assert.equal(
  module.normalizeField({ field: 'attachment', label: '附件', component: 'customDesignerNode' }).component,
  'company-custom-input',
);
assert.deepEqual(
  Object.fromEntries(module.getFormMaterialComponentMappings()),
  {
    picker: 'vxe-select',
    image: 'vxe-upload',
    customDesignerNode: 'company-custom-input',
  },
);

console.log('Database-backed form material component map regression test passed.');
