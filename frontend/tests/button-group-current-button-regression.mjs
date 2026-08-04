import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL(
  '../../packages/lowcode-framework/src/',
  import.meta.url,
);

const [buttonGroupSource, serviceSource, compRenderSource, simulatorSource, slotSource] =
  await Promise.all([
    readFile(
      new URL('packages/business-component/lowcode-button-group/index.tsx', frameworkRoot),
      'utf8',
    ),
    readFile(
      new URL(
        'visual-editor/components/button-group-designer/button-group-designer.service.tsx',
        frameworkRoot,
      ),
      'utf8',
    ),
    readFile(
      new URL('visual-editor/components/simulator-editor/comp-render.tsx', frameworkRoot),
      'utf8',
    ),
    readFile(
      new URL('visual-editor/components/simulator-editor/simulator-editor.vue', frameworkRoot),
      'utf8',
    ),
    readFile(
      new URL('visual-editor/components/simulator-editor/slot-item.vue', frameworkRoot),
      'utf8',
    ),
  ]);

assert.match(
  buttonGroupSource,
  /onButtonContextmenu\(event, index\)/,
  'Each rendered root button must report its index on right click.',
);
assert.match(
  simulatorSource,
  /code: 'design-current-button'/,
  'The component context menu must expose the current-button design action.',
);
assert.match(
  simulatorSource,
  /disabled: !currentButton/,
  'The current-button action must remain disabled when the group container is clicked.',
);
assert.match(
  simulatorSource,
  /isButtonGroupDesignBlock\(outElement\)[\s\S]*?\? 'auto'/,
  'Button groups must accept pointer events so their individual buttons can receive right clicks.',
);
assert.match(
  compRenderSource,
  /props\.onButtonContextmenu\?\.\(event, props\.element, buttonIndex\)/,
  'Nested designed blocks must preserve the button-group block identity.',
);
assert.match(
  slotSource,
  /isButtonGroupBlock\(innerElement\)[\s\S]*?\? 'auto'/,
  'Button groups inside slots must also accept pointer events.',
);
assert.match(
  serviceSource,
  /export function \$\$buttonGroupCurrentButtonDesigner/,
  'The focused button designer must be exposed as a reusable service.',
);
assert.match(
  serviceSource,
  /showToolbar: false,[\s\S]*?showActions: false/,
  'The focused designer must render one fixed button row without collection actions.',
);
assert.match(
  simulatorSource,
  /currentButtons\.splice\(currentIndex, 1, cloneDeep\(result\)\)/,
  'Confirming the dialog must replace only the button that opened it.',
);

console.log('Button-group current-button designer regression test passed.');
