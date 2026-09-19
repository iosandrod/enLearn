import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

const [visualMaterial, visualConfig, attrEditor, formDesigner, converter, adapters, migration, previewMigration] =
  await Promise.all([
    source('packages/lowcode-framework/src/visual-editor/form-material-visual-components.tsx'),
    source('packages/lowcode-framework/src/visual.config.tsx'),
    source('packages/lowcode-framework/src/visual-editor/components/right-attribute-panel/components/attr-editor/index.tsx'),
    source('packages/lowcode-framework/src/visual-editor/components/form-designer/form-designer.service.tsx'),
    source('packages/lowcode-framework/src/lowcode/visual-converters/index.ts'),
    source('packages/lowcode-framework/src/lowcode/material-runtime/material-adapters.ts'),
    source('supabase/migrations/20260919150000_image_upload_form_material.sql'),
    source('supabase/migrations/20260919160000_vxe_upload_image_preview.sql'),
  ]);

assert.match(visualMaterial, /image:\s*\{[\s\S]*?runtimeComponent: 'vxe-upload'/);
assert.match(visualMaterial, /fileTypes: \['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'\]/);
assert.match(visualMaterial, /showPreview: true/);
assert.match(visualMaterial, /previewType: 'image'/);
assert.match(visualConfig, /'image'/);
assert.match(attrEditor, /'vxe-upload': 'image'/);
assert.match(attrEditor, /image: 'vxe-upload'/);
assert.match(attrEditor, /nextComponentKey === 'image'/);
assert.match(formDesigner, /'vxe-upload': 'image'/);
assert.match(formDesigner, /image: 'vxe-upload'/);
assert.match(formDesigner, /runtimeComponent === 'vxe-upload'[\s\S]*?Object\.assign\(block\.props, cloneDeep\(fieldProps\)\)/);
assert.match(converter, /'vxe-upload': 'image'/);
assert.match(converter, /field\.component === 'vxe-upload'[\s\S]*?Object\.assign\(block\.props, cloneJson\(props\)\)/);
assert.match(adapters, /\['upload', 'file-upload', 'image'\]/);

assert.match(migration, /'form_input_component_type', '图片上传', 'image'/);
assert.match(migration, /'form_field_component_type', '图片上传', 'vxe-upload'/);
assert.match(migration, /'material-prop\.image'/);
assert.match(migration, /aliases @> array\['image'\]::text\[\]/);
assert.match(migration, /"componentKey": "image"/);
assert.match(migration, /"field":"fileTypes"/);
assert.match(migration, /"field":"showPreview"/);
assert.match(migration, /"field":"folderPath"/);
assert.match(previewMigration, /v-if="isImagePreview && activePreviewUrl"/);
assert.match(previewMigration, /if \(isImagePreview\.value\) return;/);
assert.match(previewMigration, /object-fit: contain/);

const schemaMatch = migration.match(/\$schema\$\s*(\{[\s\S]*?\})\s*\$schema\$::jsonb/);
assert.ok(schemaMatch, 'The image upload property form must contain a JSON schema.');
const schema = JSON.parse(schemaMatch[1]);
assert.equal(schema.componentKey, 'image');
assert.ok(schema.fields.length >= 20);
assert.equal(schema.layout.length, 1);
assert.equal(schema.layout[0].kind, 'tabs');
assert.deepEqual(
  schema.fields.find((field) => field.field === 'fileTypes')?.defaultValue,
  ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'],
);

console.log('Image upload form material regression test passed.');
