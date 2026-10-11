export * from './global-dialog-core';

export async function confirmLowCodePage(
  ...args: Parameters<typeof import('./page-reference-dialog').openLowCodePageConfirmDialog>
) {
  const { openLowCodePageConfirmDialog } = await import('./page-reference-dialog');
  return openLowCodePageConfirmDialog(...args);
}

/** Opens a database-backed low-code form by formCode. */
export async function confirmForm(
  config: import('./page-reference-dialog').LowCodePageConfirmDialogConfig,
) {
  const { openLowCodePageConfirmDialog } = await import('./page-reference-dialog');
  if (!config.formCode?.trim()) throw new Error('confirmForm requires formCode.');
  return openLowCodePageConfirmDialog({
    ...config,
    className: [
      'lowcode-confirm-form-dialog',
      ...(Array.isArray(config.className) ? config.className : [config.className]),
    ].filter(Boolean).join(' '),
  });
}
