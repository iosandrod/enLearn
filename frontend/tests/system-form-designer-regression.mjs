import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [
  listPageFunctionSource,
  runtimeDesignerSource,
  designerSource,
  migrationSource,
  pageTypeMigrationSource,
] = await Promise.all([
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/runtime/page-function/list-page-function.ts',
      import.meta.url,
    ),
    'utf8',
  ),
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
      '../../supabase/migrations/20260828180000_form_definition_designer_execute_function.sql',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../../supabase/migrations/20260828190000_form_definition_page_list_type.sql',
      import.meta.url,
    ),
    'utf8',
  ),
]);

assert.match(
  listPageFunctionSource,
  /resource: 'lowcode_form_definitions'[\s\S]*?\$\$formDesigner\([\s\S]*?serviceApi\.invoke\('lowcode', 'saveItem'[\s\S]*?data: \{ schema \}/,
  'designForm must load the selected definition, open the low-code designer, and save its schema.',
);
assert.match(
  listPageFunctionSource,
  /createFormDesignerFieldsFromSchema\(definition\.schema\)[\s\S]*?mergeRuntimeFormSchema\([\s\S]*?definition\.schema/,
  'designForm must reuse the runtime schema conversion and preservation logic.',
);
assert.match(
  listPageFunctionSource,
  /executeListPageDesignForm[\s\S]*?context\.pageCode !== 'form-definetion'[\s\S]*?openListPageFormDefinitionDesigner\(id, context\.serviceApi\)[\s\S]*?await context\.refresh\(\)[\s\S]*?context\.notify\('表单配置已保存。', 'success'\)[\s\S]*?id: 'list\.design-form'[\s\S]*?name: 'designForm'/,
  'designForm must live in the list-page function registry and refresh after a confirmed save.',
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
  /'vid_08134f84e5'[\s\S]*?'lowcode-button-group'[\s\S]*?this\.executeFunction/,
  'The migration must update both runtime and visual-editor button copies.',
);
assert.match(
  migrationSource,
  /this\.grids\["vid_877ad5473e"\][\s\S]*?grid\.currentRow[\s\S]*?this\.executeFunction\(\{[\s\S]*?name: "designForm"[\s\S]*?args: \{ id:/,
  'The button must pass the current row to designForm through executeFunction.',
);
assert.match(
  migrationSource,
  /not in \([\s\S]*?'api\.invoke'[\s\S]*?'message\.warning'[\s\S]*?'message\.success'[\s\S]*?'source\.refresh'[\s\S]*?\)[\s\S]*?'\["pageFunction\.execute"\]'::jsonb/,
  'The migration must replace legacy button capabilities with pageFunction.execute.',
);
const buttonScript = migrationSource.match(/v_script text := \$script\$([\s\S]*?)\$script\$;/)?.[1] ?? '';
assert.doesNotMatch(buttonScript, /this\.\$(?:api|source|message)/);
assert.match(
  pageTypeMigrationSource,
  /where code = 'form-definetion'[\s\S]*?jsonb_set\(v_current_schema, '\{pageType\}', '"list"'::jsonb[\s\S]*?set page_type = 'list'[\s\S]*?insert into public\.lowcode_page_versions/,
  'The system form page must be a list page so its list.design-form function can execute.',
);

console.log('System form designer regression test passed.');
