import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [apiSource, runtimeDesignerSource, designerSource, migrationSource] = await Promise.all([
  readFile(new URL('../src/lowcode-script-apis.ts', import.meta.url), 'utf8'),
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/lowcode/block-materials/runtime-form-designer.ts',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/visual-editor/components/form-designer/form-designer.service.tsx',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../supabase/migrations/20260825200000_form_definition_designer_button.sql',
      import.meta.url,
    ),
    'utf8',
  ),
]);

assert.match(
  apiSource,
  /registerLowCodeScriptApi\('form\.definition\.designer\.open'[\s\S]*?context\.page\.code === 'form-definetion'/,
  'The form designer API must be registered and restricted to the system form page.',
);
assert.match(
  apiSource,
  /resource: 'lowcode_form_definitions'[\s\S]*?\$\$formDesigner\([\s\S]*?serviceApi\.invoke\('lowcode', 'saveItem'[\s\S]*?data: \{ schema \}/,
  'The API must load the selected definition, open the low-code designer, and save its schema.',
);
assert.match(
  apiSource,
  /createFormDesignerFieldsFromSchema\(definition\.schema\)[\s\S]*?mergeRuntimeFormSchema\([\s\S]*?definition\.schema/,
  'The database form designer must reuse the runtime schema conversion and preservation logic.',
);
assert.match(
  runtimeDesignerSource,
  /export function createFormDesignerFieldsFromSchema\([\s\S]*?schema\.fields\.map\(runtimeFieldToDesignerField\)/,
  'Runtime form schemas must expose the canonical conversion into designer fields.',
);
assert.match(
  designerSource,
  /onClosed=\{\(\) => \{[\s\S]*?!closeCommitted[\s\S]*?handler\.onCancel\(\)[\s\S]*?option\.onCancel\?\.\(\)/,
  'Closing the designer must notify callers so a waiting button script can finish.',
);
assert.match(
  migrationSource,
  /'vid_08134f84e5'[\s\S]*?'lowcode-button-group'[\s\S]*?form\.definition\.designer\.open/,
  'The migration must update both runtime and visual-editor button copies.',
);
assert.match(
  migrationSource,
  /this\.grids\["vid_877ad5473e"\][\s\S]*?grid\.currentRow[\s\S]*?\$source\.refresh\("records"\)/,
  'The button must design the current row and refresh the list after a confirmed save.',
);
for (const capability of ['api.invoke', 'message.warning', 'message.success', 'source.refresh']) {
  assert.ok(
    migrationSource.includes(`'["${capability}"]'::jsonb`),
    `The migration must authorize ${capability}.`,
  );
}

console.log('System form designer regression test passed.');
