import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [
  designerSource,
  adapterSource,
  dialogCoreSource,
  dialogHostSource,
  drawerHostSource,
  popupStyleSource,
] = await Promise.all([
    readFile(
      new URL(
        '../../packages/lowcode-framework/src/visual-editor/components/form-designer/form-designer.service.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../../packages/lowcode-framework/src/visual-editor/components/common/designer-ui/index.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL('../../packages/lowcode-framework/src/runtime/global-dialog-core.ts', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../../packages/lowcode-framework/src/components/GlobalDialogHost.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../../packages/lowcode-framework/src/components/GlobalDrawerHost.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../../packages/lowcode-framework/src/styles/global-dialog.scss', import.meta.url),
      'utf8',
    ),
  ]);

function readLayer(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `${label} layer must remain discoverable.`);
  return Number(match[1]);
}

const dialogLayer = readLayer(
  dialogCoreSource,
  /GLOBAL_DIALOG_BASE_Z_INDEX = (\d+);/,
  'Global dialog',
);
const drawerLayer = readLayer(
  drawerHostSource,
  /zIndex:\s*(\d+)\s*\+\s*globalDrawerInstances\.indexOf/,
  'Global drawer',
);
const designerLayer = readLayer(
  designerSource,
  /const FORM_DESIGNER_Z_INDEX = (\d+);/,
  'Form designer',
);
const popupLayer = readLayer(
  popupStyleSource,
  /body\.lc-global-dialog-open[\s\S]*?z-index:\s*(\d+)\s*!important/,
  'Transferred popup',
);

assert.ok(dialogLayer < drawerLayer, 'Global drawers must render above global dialogs.');
assert.ok(drawerLayer < designerLayer, 'The form designer must render above its parent designer.');
assert.ok(designerLayer < popupLayer, 'Transferred form controls must render above the form designer.');
assert.match(
  dialogCoreSource,
  /currentTopZIndex[\s\S]*?Math\.max\(minimumZIndex, currentTopZIndex \+ 1\)/,
  'Every newly opened global dialog must be allocated above the current dialog stack.',
);
assert.match(
  dialogHostSource,
  /zIndex:\s*instance\.zIndex/,
  'The global dialog host must use the stable layer allocated by the dialog core.',
);
assert.match(
  designerSource,
  /<ElDialog[\s\S]*?zIndex=\{state\.option\.zIndex \?\? FORM_DESIGNER_Z_INDEX\}/,
  'The form designer must apply its allocated layer to the dialog.',
);
assert.match(
  designerSource,
  /const formDesignerLayers = new Set<number>\(\)[\s\S]*?acquireFormDesignerLayer[\s\S]*?formDesignerLayers\.add\(zIndex\)/,
  'Nested form designers must allocate distinct layers.',
);
assert.match(
  adapterSource,
  /zIndex:\s*\[String, Number\][\s\S]*?zIndex:\s*props\.zIndex/,
  'The shared dialog adapter must pass the configured layer to VXE Modal.',
);
assert.match(
  popupStyleSource,
  /body\.lc-global-dialog-open,[\s\S]*?body:has\(\.form-designer-dialog\)[\s\S]*?vxe-ico-picker--panel/,
  'Transferred form controls must stay above standalone form designers.',
);

console.log('Form designer layer regression test passed.');
