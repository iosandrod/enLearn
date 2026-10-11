import assert from 'node:assert/strict';

import {
  closeAllGlobalDialogs,
  globalDialogInstances,
  openGlobalDialog,
} from '../../packages/lowcode-framework/src/runtime/global-dialog-core.ts';

const pendingDialogs = [
  openGlobalDialog({ className: 'grid-designer-dialog' }),
  openGlobalDialog({ className: 'button-default-picker-dialog' }),
  openGlobalDialog({ props: { zIndex: 13000 } }),
  openGlobalDialog({}),
];

assert.deepEqual(
  globalDialogInstances.map((dialog) => dialog.zIndex),
  [12000, 12001, 13000, 13001],
  'Each global dialog must open above the current top layer while honoring its minimum layer.',
);

await closeAllGlobalDialogs();
await Promise.all(pendingDialogs);

const resetDialog = openGlobalDialog({});
assert.equal(
  globalDialogInstances[0]?.zIndex,
  10000,
  'An empty dialog stack must restart at the global dialog base layer.',
);
await closeAllGlobalDialogs();
await resetDialog;

console.log('Global dialog layer regression test passed.');
