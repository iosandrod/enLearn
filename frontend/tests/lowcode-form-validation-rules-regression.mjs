import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [formSource, helpersSource, vxeRenderSource, vxeStyleSource] = await Promise.all([
  readFile(new URL('components/LowCodeForm.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/visual-converters/helpers.ts', frameworkRoot), 'utf8'),
  readFile(new URL('../node_modules/vxe-pc-ui/es/form/src/render.js', import.meta.url), 'utf8'),
  readFile(new URL('../node_modules/vxe-pc-ui/es/form/style.css', import.meta.url), 'utf8'),
]);

assert.match(
  formSource,
  /<vxe-form[\s\S]*?:data="formData"[\s\S]*?:rules="formRules"/,
  'VXE Form must validate the public business-field model.',
);
assert.match(
  formSource,
  /const formRules = computed[\s\S]*?rules\[field\.field\] = itemRules/,
  'Rule-map keys must be the same business fields used by the form data.',
);
assert.match(
  formSource,
  /prev\[field\.field\] = \{[\s\S]*?field: field\.field,[\s\S]*?rules: formRules\.value\[field\.field\]/,
  'Each VXE form item must use the same field as data and rules.',
);
assert.match(
  formSource,
  /const itemRules = \[\.\.\.schemaRules, \.\.\.scriptRules, \.\.\.externalRules\]/,
  'Schema, asynchronous script, and external rules must remain merged for each field.',
);
assert.match(
  formSource,
  /function readExternalRules\(field: string\)[\s\S]*?props\.rules\?\.\[field\][\s\S]*?Array\.isArray\(rules\)/,
  'External rules must be read from the public business-field key.',
);
assert.match(
  formSource,
  /updateStatus\(\{ field: field\.field \}, value\)/,
  'Change validation must target the public business field.',
);
assert.doesNotMatch(
  formSource,
  /__lc_field_|createVxeFieldKey|fieldKeyByName|vxeFormData|syncVxeFormData/,
  'Index-based internal field aliases must not leak into VXE validation.',
);
assert.match(
  formSource,
  /titleAsterisk:\s*\{\s*type: Boolean,\s*default: true,?\s*\}/,
  'Required asterisks must be enabled by default and remain explicitly configurable.',
);
assert.match(
  formSource,
  /const formValidConfig = computed\(\(\) => \(\{[\s\S]*?showErrorMessage: false,[\s\S]*?showErrorIcon: true,[\s\S]*?\.\.\.props\.validConfig,[\s\S]*?validConfig: formValidConfig\.value/,
  'Validation errors must default to a tooltip icon without reserving message space.',
);
assert.match(
  formSource,
  /valid-error-icon-wrapper:hover[\s\S]*?valid-error-icon-wrapper\.is--show[\s\S]*?width: max-content/,
  'The validation tooltip must open on hover as well as click.',
);
assert.match(
  helpersSource,
  /rules: \[\{ required: true, message: `\$\{label\}不能为空` \}\]/,
  'Designer-generated required messages must use the localized form wording.',
);

assert.match(
  vxeRenderSource,
  /'is--asterisk': titleAsterisk[\s\S]*?'is--required': isRequired/,
  'The installed VXE renderer must expose both classes used by required labels.',
);
assert.match(
  vxeStyleSource,
  /\.vxe-form--item\.is--asterisk\.is--required[\s\S]*?content: "\*"/,
  'The installed VXE stylesheet must render the star when both classes are present.',
);

console.log('Low-code form validation-rule regression test passed.');
