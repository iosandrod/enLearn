import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [helpersSource, converterSource, formMaterialSource, simulatorSource, visualDesignerSource, migrationSource] =
  await Promise.all([
    readFile(new URL('lowcode/visual-converters/helpers.ts', frameworkRoot), 'utf8'),
    readFile(new URL('lowcode/visual-converters/index.ts', frameworkRoot), 'utf8'),
    readFile(new URL('packages/container-component/form/index.tsx', frameworkRoot), 'utf8'),
    readFile(
      new URL('visual-editor/components/simulator-editor/simulator-editor.vue', frameworkRoot),
      'utf8',
    ),
    readFile(new URL('components/LowCodeVisualDesigner.vue', frameworkRoot), 'utf8'),
    readFile(
      new URL('../../supabase/migrations/20260808220000_fix_sales_order_edit_page.sql', import.meta.url),
      'utf8',
    ),
  ]);

const schemaMatch = migrationSource.match(/v_schema jsonb := \$json\$\s*([\s\S]*?)\s*\$json\$::jsonb/);
assert.ok(schemaMatch, 'The sales-order migration must contain its page schema.');
const pageSchema = JSON.parse(schemaMatch[1]);
const runtimeForm = pageSchema.blocks.find((block) => block.id === 'sales-order-edit-form');
assert.ok(runtimeForm, 'The sales-order form block must exist.');

const executableHelpers = ts.transpileModule(helpersSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helpersUrl = `data:text/javascript;base64,${Buffer.from(executableHelpers).toString('base64')}`;
const { createLowCodeFormSchema } = await import(helpersUrl);

const visualFields = runtimeForm.schema.fields.map((field) => ({
  field: field.field,
  label: field.label,
  component: field.component,
  placeholder: field.props?.placeholder,
  required: field.rules?.some((rule) => rule.required === true),
  span: field.span,
  optionsJson: field.options ? JSON.stringify(field.options) : '',
  propsJson: field.props ? JSON.stringify(field.props) : '',
}));
const reconstructedSchema = createLowCodeFormSchema(
  visualFields,
  undefined,
  runtimeForm.schema,
);

assert.equal(reconstructedSchema.columns, 4, 'Form column metadata must survive conversion.');
assert.equal(reconstructedSchema.fields.length, runtimeForm.schema.fields.length);
assert.deepEqual(
  reconstructedSchema.layout[0].tabs.map((tab) => tab.label),
  ['单据信息', '客户与收货', '商务条款', '金额汇总', '来源与备注'],
  'All sales-order form tabs must survive runtime-to-visual fallback conversion.',
);
assert.deepEqual(
  reconstructedSchema.actions,
  [],
  'An explicitly empty runtime action list must not gain designer default buttons.',
);

assert.match(
  converterSource,
  /schema: cloneJson\(schema\)[\s\S]*?formDesignerModel,/,
  'Runtime form conversion must carry the canonical schema into the visual block.',
);
assert.match(
  converterSource,
  /function createFormDesignerModelFromSchema[\s\S]*?createFormDesignerLayoutBlocks\(layout, fieldBlocks,[\s\S]*?createFormDesignerModelFromSchema\(schema/,
  'Schema-only forms must synthesize a nested designer model for the outline and canvas.',
);
assert.match(
  formMaterialSource,
  /createLowCodeFormSchema\([\s\S]*?props\.fields,[\s\S]*?props\.formDesignerModel,[\s\S]*?props\.schema/,
  'The visual form must render from the stored runtime layout when no designer model exists.',
);
assert.match(
  simulatorSource,
  /layout: Array\.isArray\(runtimeSchema\.layout\)[\s\S]*?columns: Number\.isFinite\(schemaColumns\)/,
  'Opening the nested form designer must receive the runtime layout fallback.',
);
assert.match(
  visualDesignerSource,
  /const runtimeFormModels = new Map[\s\S]*?formDesignerModel: fallbackModel/,
  'A stored visual page must backfill missing form design models from the canonical runtime schema.',
);

console.log('Sales-order form layout round-trip regression test passed.');
