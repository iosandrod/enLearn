import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const [material, converter, runtimeConverter, propertyForms, migration] = await Promise.all([
  readFile(
    new URL(
      'packages/lowcode-framework/src/packages/business-component/lowcode-search-form/index.tsx',
      root,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      'packages/lowcode-framework/src/lowcode/visual-converters/lowcode-search-form/index.ts',
      root,
    ),
    'utf8',
  ),
  readFile(
    new URL('packages/lowcode-framework/src/lowcode/visual-converters/index.ts', root),
    'utf8',
  ),
  readFile(
    new URL(
      'packages/lowcode-framework/src/visual-editor/material-prop-forms/materials/page-blocks.ts',
      root,
    ),
    'utf8',
  ),
  readFile(
    new URL('supabase/migrations/20260810130000_search_form_material_schema.sql', root),
    'utf8',
  ),
]);

assert.match(
  material,
  /import LowCodeForm from ['"]\.\.\/\.\.\/\.\.\/components\/LowCodeForm\.vue['"];/,
  'The search-form material must reuse the framework LowCodeForm renderer.',
);
assert.match(
  material,
  /const fields = Array\.isArray\(props\.fields\)[\s\S]*?preservedSchema\?\.fields \?\? \[\][\s\S]*?createLowCodeFormSchema\([\s\S]*?fields,[\s\S]*?props\.formDesignerModel,[\s\S]*?props\.schema/,
  'The designer must normalize visual fields into the canonical form schema.',
);
assert.match(
  material,
  /<LowCodeForm[\s\S]*?\.\.\.createDesignFormProps\(props\)/,
  'The design canvas must pass schema, modelValue, and optionSources to LowCodeForm.',
);
assert.doesNotMatch(
  material,
  /readDesignedBlocks|renderDesignedBlocks|previewFields/,
  'The material must not keep a second nested-block rendering path.',
);
assert.doesNotMatch(
  material,
  /background:\s*['"]#f8fafc['"]|>\s*查询\s*</,
  'The material must not draw placeholder inputs or fake action buttons.',
);
assert.match(
  converter,
  /const initialValues = readJsonObject\(props\.initialValuesJson, \{\}\)/,
  'Visual-to-runtime conversion must read search-form initial values.',
);
assert.match(
  converter,
  /Object\.keys\(initialValues\)\.length \? \{ initialValues \} : \{\}/,
  'Visual-to-runtime conversion must retain non-empty search-form initial values.',
);
assert.match(
  runtimeConverter,
  /initialValuesJson: stringifyJson\(block\.initialValues, \{\}\)/,
  'Runtime-to-visual conversion must retain initial values for search and edit forms.',
);
assert.match(
  propertyForms,
  /componentKey: 'lowcode-search-form'[\s\S]*?field: 'initialValuesJson'/,
  'The database-backed property form must expose canonical search initial values.',
);
assert.match(
  migration,
  /where code = 'material-prop\.lowcode-search-form'/,
  'The database-backed property definition must be updated by a forward migration.',
);
assert.match(
  migration,
  /"label": "数据"[\s\S]*?"field": "initialValuesJson"/,
  'The database property layout must keep initial values in the data tab.',
);

console.log('low-code search-form material regression checks passed');
