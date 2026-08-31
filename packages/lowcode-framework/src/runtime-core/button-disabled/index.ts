import type { LowCodePageRuntimeContext } from '../page-runtime';
import {
  isLowCodeEditPageModifyAction,
  isLowCodeEditPageSaveAction,
  normalizeLowCodeEditPageActionCode,
} from '../edit-page-mode.ts';

export {
  isLowCodeEditPageModifyAction,
  isLowCodeEditPageSaveAction,
  normalizeLowCodeEditPageActionCode,
};

export type LowCodeButtonDisabledAction = { code?: string; disabled?: unknown };
export type LowCodeButtonDisabledOptions = { enabled?: boolean };

export function isLowCodeButtonDisabled(
  action: LowCodeButtonDisabledAction,
  context: LowCodePageRuntimeContext | null | undefined,
  options: LowCodeButtonDisabledOptions = {},
) {
  if (action.disabled === true) return true;
  if (context?.state.status.mesCommandExecuting === true) return true;
  if (!context || options.enabled === false) return false;

  const code = normalizeLowCodeEditPageActionCode(action.code);
  const rule = (context.runtimeFunctions ?? [])
    .filter((item) =>
      item.function_type === 'button_rule' &&
      item.function_name === code &&
      item.enabled !== false &&
      (!item.page_type || item.page_type === context.pageType),
    )
    .sort((left, right) => Number(right.page_id !== null) - Number(left.page_id !== null))[0];
  if (!rule) return false;

  const spec = rule.runtime_spec;
  if (spec.alwaysDisabled === true) return true;
  const condition = spec.disabledWhen;
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return false;
  const predicate = condition as Record<string, unknown>;
  const field = typeof predicate.field === 'string' ? predicate.field : '';
  const value = field ? (context.state.status as Record<string, unknown>)[field] : undefined;
  if (Object.prototype.hasOwnProperty.call(predicate, 'eq')) return value === predicate.eq;
  if (Object.prototype.hasOwnProperty.call(predicate, 'neq')) return value !== predicate.neq;
  return false;
}
