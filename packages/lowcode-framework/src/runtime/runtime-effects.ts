import type {
  LowCodeRuntimeEffect,
  LowCodeRuntimeResult,
} from '../types/lowcode';

export type LowCodeRuntimeEffectContext = {
  navigateToEdit(row?: Record<string, unknown>): Promise<unknown>;
  deleteRecords(rows: Record<string, unknown>[]): Promise<unknown>;
  updateRecords(rows: Record<string, unknown>[], values: Record<string, unknown>): Promise<unknown>;
  invokeService(name: string, method: string, postData: Record<string, unknown>): Promise<unknown>;
  prepareForms(mode: 'create' | 'copy'): Promise<unknown>;
  patchForms(values: Record<string, unknown>): Promise<unknown>;
  submitForms(options?: { allowScan?: boolean }): Promise<boolean>;
  setMode(mode: 'scan' | 'edit' | 'add'): Promise<unknown>;
  refresh(): Promise<unknown>;
  print(): Promise<unknown>;
  exit(): Promise<unknown>;
  notify(message: string, status?: 'success' | 'info' | 'warning' | 'error'): void;
};

function record(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象。`);
  }
  return value as Record<string, unknown>;
}

function rows(effect: LowCodeRuntimeEffect) {
  return Array.isArray(effect.rows)
    ? effect.rows.filter((row): row is Record<string, unknown> =>
      !!row && typeof row === 'object' && !Array.isArray(row))
    : [];
}

/** Applies script-produced effects in one place for page, button and node entries. */
export async function applyLowCodeRuntimeEffects(
  runtimeResult: LowCodeRuntimeResult,
  context: LowCodeRuntimeEffectContext,
) {
  const effects = Array.isArray(runtimeResult.effects) ? runtimeResult.effects : [];
  if (!effects.length) return runtimeResult.value;

  const results: unknown[] = [];
  for (const effect of effects) {
    switch (effect.type) {
      case 'page.navigateToEdit':
        results.push(await context.navigateToEdit(
          effect.row && typeof effect.row === 'object' && !Array.isArray(effect.row)
            ? effect.row as Record<string, unknown>
            : undefined,
        ));
        break;
      case 'records.delete':
        results.push(await context.deleteRecords(rows(effect)));
        break;
      case 'records.update':
        results.push(await context.updateRecords(rows(effect), record(effect.values, 'records.update values')));
        break;
      case 'service.invoke':
        results.push(await context.invokeService(
          typeof effect.serviceName === 'string' ? effect.serviceName : '',
          typeof effect.serviceMethod === 'string' ? effect.serviceMethod : '',
          record(effect.postData ?? {}, 'service.invoke postData'),
        ));
        break;
      case 'form.prepare': {
        const mode = effect.mode === 'copy' ? 'copy' : effect.mode === 'create' ? 'create' : '';
        if (!mode) throw new Error(`form.prepare mode "${String(effect.mode)}" 无效。`);
        results.push(await context.prepareForms(mode));
        break;
      }
      case 'form.patch':
        results.push(await context.patchForms(record(effect.values, 'form.patch values')));
        break;
      case 'form.submit': {
        const saved = await context.submitForms({ allowScan: effect.allowScan === true });
        if (effect.required === true && !saved) throw new Error(
          typeof effect.errorMessage === 'string' ? effect.errorMessage : '保存失败。',
        );
        results.push(saved);
        break;
      }
      case 'page.setMode': {
        const mode = effect.mode === 'scan' || effect.mode === 'edit' || effect.mode === 'add' ? effect.mode : '';
        if (!mode) throw new Error(`page.setMode mode "${String(effect.mode)}" 无效。`);
        results.push(await context.setMode(mode));
        break;
      }
      case 'page.refresh': results.push(await context.refresh()); break;
      case 'page.print': results.push(await context.print()); break;
      case 'page.exit': results.push(await context.exit()); break;
      case 'message.show': {
        const status = effect.status === 'success' || effect.status === 'warning' || effect.status === 'error'
          ? effect.status : 'info';
        context.notify(typeof effect.message === 'string' ? effect.message : '', status);
        results.push(undefined);
        break;
      }
      default:
        throw new Error(`脚本运行时效果 "${effect.type}" 没有本地适配器。`);
    }
  }
  return typeof runtimeResult.resultEffect === 'number'
    ? results[runtimeResult.resultEffect]
    : runtimeResult.value;
}
