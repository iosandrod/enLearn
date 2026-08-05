export * from './global-dialog-core';

export async function confirmLowCodePage(
  ...args: Parameters<typeof import('./page-reference-dialog').openLowCodePageConfirmDialog>
) {
  const { openLowCodePageConfirmDialog } = await import('./page-reference-dialog');
  return openLowCodePageConfirmDialog(...args);
}
