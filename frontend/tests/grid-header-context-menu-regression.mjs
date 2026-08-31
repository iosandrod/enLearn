import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gridSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodeGrid.vue', import.meta.url),
  'utf8'
);
const pageGridSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/block-materials/grid/index.vue',
    import.meta.url
  ),
  'utf8'
);
const pageGridMenuSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/block-materials/grid/page-grid-menu.ts',
    import.meta.url
  ),
  'utf8'
);
const runtimeGridDesignerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/block-materials/grid/runtime-grid-designer.ts',
    import.meta.url
  ),
  'utf8'
);
const runtimeGridConverterSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/visual-converters/lowcode-grid/index.ts',
    import.meta.url
  ),
  'utf8'
);
const runtimeGridFieldEditorSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/block-materials/grid/runtime-grid-field-editor.ts',
    import.meta.url
  ),
  'utf8'
);
const runtimeFormFieldEditorSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/block-materials/runtime-form-field-editor.ts',
    import.meta.url
  ),
  'utf8'
);
const gridDesignerServiceSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx',
    import.meta.url
  ),
  'utf8'
);
const pageRendererSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/runtime/useLowCodePageRenderer.ts',
    import.meta.url
  ),
  'utf8'
);
const pageDataControllerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/runtime/page-data-controller.ts',
    import.meta.url
  ),
  'utf8'
);

assert.match(
  gridSource,
  /@menu-click="handleMenuClick"/,
  'LowCodeGrid must handle VXE menu clicks.'
);
assert.match(
  gridSource,
  /<template #actions="\{ row \}">[\s\S]*schema\.rowActions\?\.edit === true[\s\S]*emit\('edit', row\)[\s\S]*schema\.rowActions\?\.delete === true[\s\S]*emit\('delete', row\)[\s\S]*visibleRowActions\(row\)[\s\S]*emitRowAction\(action, row\)/,
  'The actions slot must render built-in and custom row actions.'
);
assert.doesNotMatch(
  gridSource,
  /tableInfoDesign|openSearch|associateEntityField|copyCellValue|editCurrentRow|downloadCurrentRowAttachments|表格信息设计|打开搜索框|关联实体字段|编辑当前行|下载当前行附件/,
  'The generic LowCodeGrid must not own page business menu data.'
);
assert.doesNotMatch(
  gridSource,
  /createDefaultHeaderContextMenuOptions|createGridMenuConfig/,
  'The generic LowCodeGrid must not inject a default menu.'
);
assert.match(
  pageGridSource,
  /:schema="pageGridSchema"/,
  'Page grid blocks must use their page-level schema wrapper.'
);
assert.match(
  pageGridSource,
  /menuConfig: createPageGridMenuConfig\(props\.block\.schema\.grid\.menuConfig\)/,
  'Only page grid blocks should inject the business header menu.'
);

for (const [code, label] of [
  ['tableInfoDesign', '表格信息设计'],
  ['designCurrentField', '设计当前字段'],
  ['openSearch', '打开搜索框'],
  ['associateEntityField', '关联实体字段'],
  ['copyCellValue', '复制'],
  ['editCurrentRow', '编辑当前行'],
  ['downloadCurrentRowAttachments', '下载当前行附件'],
]) {
  assert.match(
    pageGridMenuSource,
    new RegExp(`code: '${code}'`),
    `Page grid menu action ${code} must be stable.`
  );
  assert.match(
    pageGridMenuSource,
    new RegExp(`name: '${label}'`),
    `Page grid menu action ${code} must be visible.`
  );
}

assert.match(
  gridSource,
  /menuType === 'body'[\s\S]*\? 'bodyMenuClick'/,
  'Body menu clicks must remain available to the low-code runtime for later implementation.'
);
assert.match(
  gridSource,
  /\.\.\.\(row \? \{ row \} : \{\}\)/,
  'Body menu clicks must preserve the current row context.'
);
assert.match(
  pageGridSource,
  /'headerMenuClick'[\s\S]*'bodyMenuClick'/,
  'Page grid menu clicks must be published even when the page configures other grid events.'
);
assert.match(
  pageGridSource,
  /payload\.key === 'headerMenuClick'[\s\S]*payload\.actionCode === 'tableInfoDesign'[\s\S]*openRuntimeGridDesigner\(props\.block, runtimeBlockEditor, serviceApi\)/,
  'Clicking table information design must open the existing grid designer with the host service API.'
);
assert.match(
  gridSource,
  /const column = readColumn\(payload\);[\s\S]*const columnIndex = readColumnIndex\(payload\);[\s\S]*\{ column \}[\s\S]*\{ columnIndex \}/,
  'Header menu clicks must preserve the VXE column and its runtime index.'
);
assert.match(
  pageGridSource,
  /payload\.key === 'headerMenuClick'[\s\S]*payload\.actionCode === 'designCurrentField'[\s\S]*resolveMenuColumnIndex\(payload, columns\)[\s\S]*openRuntimeGridFieldEditor/,
  'Clicking design current field must target the right-clicked table column.'
);
assert.match(
  pageGridSource,
  /const column = columnIndex >= 0 \? columns\[columnIndex\] : undefined;[\s\S]*typeof column\.field === 'string'[\s\S]*column\.field\.trim\(\)[\s\S]*openRuntimeGridFieldEditor/,
  'Design current field must ignore sequence and action columns without a field code.'
);
assert.match(
  pageGridSource,
  /const field = menuColumn[\s\S]*return columns\.findIndex\(\(column\) => column\.field === field\)[\s\S]*typeof payload\.columnIndex === 'number'/,
  'Column resolution must prefer the stable field code before a visible runtime index.'
);
assert.match(
  runtimeGridFieldEditorSource,
  /const fieldName = readString\(column\.field\);[\s\S]*if \(!fieldName\) return undefined;/,
  'The grid field adapter must safely ignore columns without a usable field code.'
);
assert.match(
  runtimeGridFieldEditorSource,
  /openRuntimeFormFieldEditor\(formBlock, field, editorProxy\)/,
  'Table field design must reuse the existing form field editor and its database schema.'
);
assert.match(
  runtimeGridFieldEditorSource,
  /readGridEditRules[\s\S]*createFormField[\s\S]*createUpdatedColumn[\s\S]*createUpdatedEditRules[\s\S]*runtimeBlockEditor\.updateBlock/,
  'The table adapter must round-trip current column rendering and validation settings.'
);
assert.match(
  runtimeGridFieldEditorSource,
  /GRID_RENDERER_NAME_KEY = 'gridRendererName'[\s\S]*VxeDatePicker: 'vxe-input'[\s\S]*rendererToFieldComponent\[preservedRendererName\] === name[\s\S]*editRender\.name = resolveRendererName\(field\)/,
  'Unsupported date-picker editor values must preserve their original grid renderer on save.'
);
assert.match(
  gridSource,
  /gridFieldOptionsCodes[\s\S]*lowCodeOptionSourceRegistry\.subscribe[\s\S]*hydrateRuntimeGridColumn[\s\S]*codeOptionSources\[optionsCode\]/,
  'Table fields must resolve the same optionsCode data used by form fields.'
);
assert.match(
  gridSource,
  /const configuredFormatter = updated\.formatter[\s\S]*Array\.isArray\(options\)[\s\S]*formatGridOptionLabel\([\s\S]*typeof optionLabel === 'string'[\s\S]*formatLowCodeGridValue\([\s\S]*configuredFormatter/,
  'Table fields linked to optionsCode must prefer option labels and retain the configured formatter as a fallback.'
);
assert.match(
  gridSource,
  /hasOwnProperty\.call\(candidate, 'rawValue'\)[\s\S]*candidate\[valueKey\][\s\S]*sameGridOptionValue/,
  'Option label formatting must match persisted raw values and custom option value keys.'
);
assert.match(
  pageGridSource,
  /createRuntimeGridEditRules[\s\S]*validationScript[\s\S]*grid\.fieldValidate[\s\S]*payload\.key === 'editClosed'[\s\S]*executeGridFieldUpdateScript[\s\S]*grid\.fieldChange/,
  'Table fields must execute the configured validation and update scripts.'
);
assert.match(
  pageDataControllerSource,
  /resolveGridDynamicDefaults[\s\S]*grid\.fieldDefaultValue[\s\S]*executeDefaultValueProcedure[\s\S]*executeIsolatedScript[\s\S]*normalizeDynamicDefaultValue/,
  'Table fields must resolve function and procedure defaults through the page runtime.'
);
assert.match(
  pageDataControllerSource,
  /for \(const block of pageBlocks\)[\s\S]*block\.kind === 'grid'[\s\S]*await this\.resolveGridDynamicDefaults\(block\)/,
  'Grid dynamic defaults must be resolved while page data is loaded.'
);
assert.match(
  runtimeGridConverterSource,
  /gridDesignerUpdatedAt[\s\S]*props\.gridDesignerUpdatedAt/,
  'Visual-to-runtime conversion must retain the grid remount revision after field design.'
);
assert.match(
  runtimeFormFieldEditorSource,
  /RUNTIME_FORM_FIELD_EDITOR_CODE = 'runtime-form-field-editor'/,
  'The reused editor must continue loading the form-owned runtime field schema.'
);
assert.match(
  runtimeGridDesignerSource,
  /const \{ \$\$gridDesigner \} = await import\([\s\S]*grid-designer\.service'/,
  'The runtime action must reuse the existing grid designer service.'
);
assert.match(
  runtimeGridDesignerSource,
  /columns: cloneValue\(columns\),[\s\S]*gridOptions: cloneValue\(gridOptions\),[\s\S]*gridEvents: createDesignerEvents\(block\)/,
  'The designer must receive the current table columns, options, and events.'
);
assert.match(
  runtimeGridDesignerSource,
  /onConfirm: async \(result\) => \{[\s\S]*runtimeBlockEditor\.updateBlock\(\{[\s\S]*schema: createRuntimeGridSchema\(block, result\)[\s\S]*dataSources:/,
  'Confirming table design must persist both the grid block and its data source.'
);
assert.match(
  runtimeGridDesignerSource,
  /menuConfig: _menuConfig,[\s\S]*\.\.\.gridOptions/,
  'The built-in runtime context menu must not leak into editable VXE grid options.'
);
assert.match(
  runtimeGridDesignerSource,
  /rowActions\?\.edit === true[\s\S]*rowActions\?\.delete === true/,
  'An explicitly disabled row-action configuration must remain disabled in the designer.'
);
assert.match(
  gridDesignerServiceSource,
  /onClick: async \(\) =>[\s\S]*await handler\.onConfirm\(\)/,
  'The grid designer must wait for runtime persistence before closing.'
);
assert.match(
  gridDesignerServiceSource,
  /await state\.option\.onConfirm\?\.\(\{[\s\S]*gridOptions: buildGridOptions/,
  'The grid designer confirmation callback must support asynchronous persistence.'
);
assert.match(
  pageGridSource,
  /payload\.key === 'bodyMenuClick'[\s\S]*payload\.actionCode === 'editCurrentRow'[\s\S]*emit\('gridEdit', \{ block: props\.block, row: payload\.row \}\)/,
  'Editing the current row from the body context menu must enter the grid edit flow.'
);
assert.match(
  pageGridSource,
  /function isMainGrid\(\)[\s\S]*props\.block\.tableType === 'main' \|\| !props\.block\.tableType[\s\S]*payload\.actionCode === 'editCurrentRow'[\s\S]*isMainGrid\(\)/,
  'The automatic edit-page flow must be limited to main and legacy list grids.'
);
assert.match(
  pageRendererSource,
  /async function handleGridEdit\([\s\S]*resolveLinkedEditPageRoute\(block, row\)[\s\S]*host\.getRouter\(\)\.push\(linkedEditRoute\)/,
  'The grid edit flow must navigate to the linked edit page.'
);
assert.match(
  pageRendererSource,
  /async function handleGridEdit\([\s\S]*catch \(error\)[\s\S]*message\.value = error instanceof Error \? error\.message[\s\S]*messageClass\.value = 'lc-error'/,
  'Grid edit failures must be visible instead of being silently ignored.'
);
assert.match(
  pageRendererSource,
  /if \(update\.dataSources\)[\s\S]*nextSchema\.dataSources = \{[\s\S]*cloneRuntimeValue\(update\.dataSources\)/,
  'Runtime table design must save data-source changes into the page schema.'
);

console.log('LowCodeGrid header context menu regression test passed.');
