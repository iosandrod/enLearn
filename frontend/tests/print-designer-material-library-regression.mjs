import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [designer, canvas, contextMenu, materialDrag, host, styles, migration, confirmFormMigration] = await Promise.all([
  readFile(new URL('../../packages/tldraw-vue/src/TldrawVue.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/components/VueCanvas.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/editor/interactions/ContextMenuState.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/editor/printMaterials.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/lowcode-framework/src/lowcode/block-materials/label-designer/LabelDesignerMaterial.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20261015150000_print_materials.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20261015160000_print_material_confirm_form.sql', import.meta.url), 'utf8'),
]);
const materialSelectHandler = host.slice(
  host.indexOf('function handleMaterialSelect'),
  host.indexOf('async function handleMaterialDelete'),
);

assert.match(designer, /\{ id: 'materials', label: '素材'/, 'The left panel must expose a material tab.');
assert.match(designer, /保存选中节点/, 'The material panel must save selected canvas nodes.');
assert.match(designer, /@save-as-material="createSelectionMaterial"/, 'The canvas context menu must reuse the selection material workflow.');
assert.match(contextMenu, /id: 'save-as-material'[\s\S]*label: '另存为素材'/, 'The canvas context menu must expose save as material.');
assert.match(canvas, /emit\('save-as-material', shapeIds\)/, 'The exact context-menu selection must be forwarded for saving.');
assert.match(designer, /rootCount > 1 \? 'group' : 'node'/, 'One selected root is a node material and multiple selected roots are a group material.');
assert.match(designer, /上传图片素材/, 'The material panel must create reusable image materials.');
assert.doesNotMatch(designer, /createVueImageAssetFromFile\(file\)/,
  'Uploading an image material must not serialize a data URL into the material draft.');
assert.match(designer, /sourceFile: file[\s\S]*mimeType: file\.type[\s\S]*fileSize: file\.size/,
  'Image material drafts must pass the original File and only small image metadata.');
assert.match(designer, /materialType === 'image'/, 'Image materials must have a dedicated insertion path.');
assert.match(designer, /putContentOntoCurrentPage\([\s\S]*select: true/, 'Node and group materials must be reusable on the canvas.');
assert.match(host, /void refreshTemplateItems\(\);[\s\S]*void refreshMaterialItems\(\);[\s\S]*void loadData\(/,
  'Templates and materials must both load when the designer becomes ready.');
assert.match(host, /function loadMoreMaterialItems\(\)[\s\S]*materialHasMore\.value[\s\S]*loadMaterialPage\(true\)/,
  'Material pagination must append the next page when more rows are available.');
assert.match(host, /materialPageSize = 12/, 'Materials must load in bounded pages.');
assert.match(materialDrag, /PRINT_MATERIAL_MIME = 'application\/x-enlearn-print-material'/,
  'Material drag and drop must use a dedicated transfer type.');
assert.match(designer, /draggable="true"[\s\S]*@dragstart="startMaterialDrag\(\$event, material\)"/,
  'Material cards must expose a native copy drag operation.');
assert.match(canvas, /types\.includes\(PRINT_MATERIAL_MIME\)[\s\S]*emit\('material-drop', materialId/,
  'The canvas must accept material drops and forward the drop point.');
assert.match(designer, /function insertPrintMaterial\(material: PrintMaterialItem, point\?[\s\S]*const insertionPoint = point/,
  'Dropped materials must be inserted at the canvas drop point.');
assert.match(materialSelectHandler, /materialItems\.value\.find\(\(item\) => item\.id === id\)/,
  'Clicking or dropping a material must reuse the data already loaded in the panel.');
assert.doesNotMatch(materialSelectHandler, /invoke|listItems|print_materials/,
  'Clicking or dropping a material must not issue another material request.');
assert.match(styles, /\.designer-material-panel/, 'The new material panel must have production styles.');
assert.match(host, /import \{ confirmForm, openGlobalDialog \}/, 'Saving a material must use the shared confirmForm helper.');
assert.match(host, /MATERIAL_SAVE_FORM_CODE = 'print-designer\.material-save'/,
  'The material form must use the database-backed print designer form code.');
assert.match(host, /await confirmForm\(\{[\s\S]*formCode: MATERIAL_SAVE_FORM_CODE[\s\S]*formOptions: \{ model \}/,
  'Saving a material must open the database-backed low-code form with a reactive model.');
assert.match(host, /if \(dialogResult\.action !== 'confirm'\) return;[\s\S]*invoke(?:<[^>]+>)?\('admin', 'saveItem'/,
  'The material record must only be saved after the low-code form is confirmed.');
assert.match(host, /model\.materialType !== material\.materialType/,
  'The form must reject attempts to change the automatically determined material type.');
assert.match(host, /VITE_API_BASE_URL[\s\S]*\/files\/upload/,
  'Image materials must reuse the existing file upload endpoint.');
assert.match(host, /new FormData\(\)[\s\S]*form\.append\('file', file, file\.name\)/,
  'Image material files must be uploaded as multipart form data.');
assert.match(host, /await uploadPrintMaterialImage\(material\.sourceFile\)[\s\S]*content\.src = uploaded\.fileUrl[\s\S]*content\.fileId = uploaded\.fileId/,
  'The saved image material must contain the uploaded file URL and file id instead of image bytes.');
assert.match(designer, /const fileId = typeof content\.fileId[\s\S]*props: \{ w, h, assetId, fileId, src/,
  'Reusing an image material must preserve its uploaded file reference on the canvas node.');

for (const method of ['listItems', 'saveItem', 'deleteItem']) {
  assert.match(
    host,
    new RegExp(`invoke(?:<[^>]+>)?\\('admin', '${method}'[\\s\\S]*resource: 'print_materials'`),
    `Material ${method} must reuse the existing generic admin interface.`,
  );
}
assert.doesNotMatch(host, /\/api\/print-materials|serviceMethod:\s*['"](?:create|list|delete)PrintMaterial/i,
  'The material library must not add a dedicated HTTP/service method.');

assert.match(migration, /create table if not exists public\.print_materials/);
assert.match(migration, /material_type text not null check \(material_type in \('image', 'node', 'group'\)\)/);
assert.match(migration, /resource_name, table_name[\s\S]*'print_materials',[\s\S]*'print_materials'/);
assert.match(migration, /'clientMode', 'user'/);
assert.match(migration, /select public\.configure_access_level_resource\('public\.print_materials'::regclass\)/);

assert.match(confirmFormMigration, /insert into public\.lowcode_form_definitions/,
  'The material property form must be stored in the low-code form definitions table.');
assert.match(confirmFormMigration, /'print-designer\.material-save'/,
  'The database migration must define the material save form code.');
for (const field of ['name', 'materialType', 'accessLevel', 'category', 'tags', 'description']) {
  assert.match(confirmFormMigration, new RegExp(`"field": "${field}"`),
    `The material property form must define the ${field} field.`);
}
assert.match(confirmFormMigration, /"field": "materialType"[\s\S]*?"disabled": true/,
  'The database-backed form must display the automatically determined material type as read-only.');

console.log('print designer material library regression checks passed');
