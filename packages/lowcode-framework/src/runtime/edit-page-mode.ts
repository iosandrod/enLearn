import type {
  LowCodeEditPageMode,
  LowCodeField,
} from '../types/lowcode';

type ModeAwareAction = {
  code?: string;
  disabled?: unknown;
};

const SAVE_ACTION_CODES = new Set(['save', 'submit', 'saveandclose', 'saveandnew']);

export function resolveLowCodeEditPageMode(recordId: unknown): LowCodeEditPageMode {
  const value = Array.isArray(recordId) ? recordId[0] : recordId;
  if (typeof value === 'number') return Number.isFinite(value) ? 'scan' : 'add';
  return typeof value === 'string' && value.trim() ? 'scan' : 'add';
}

export function isLowCodeEditPageReadonly(mode: LowCodeEditPageMode | undefined) {
  return mode === 'scan';
}

export function isLowCodeEditPageFieldDisabled(
  field: Pick<LowCodeField, 'createDisabled' | 'editDisabled'>,
  mode: LowCodeEditPageMode | undefined,
) {
  if (mode === 'scan') return true;
  if (mode === 'add') return field.createDisabled === true;
  if (mode === 'edit') return field.editDisabled === true;
  return false;
}

export function normalizeLowCodeEditPageActionCode(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s_-]+/g, '')
    : '';
}

export function isLowCodeEditPageSaveAction(action: Pick<ModeAwareAction, 'code'>) {
  const code = normalizeLowCodeEditPageActionCode(action.code);
  return SAVE_ACTION_CODES.has(code);
}

export function isLowCodeEditPageModifyAction(action: Pick<ModeAwareAction, 'code'>) {
  return normalizeLowCodeEditPageActionCode(action.code) === 'modify';
}

function isInlineWriteAction(code: string) {
  return /^(?:add|delete|remove|move|copy)(?:detail|line|row)$/.test(code) ||
    /^(?:detail|line|row)(?:add|delete|remove|move|copy)$/.test(code);
}

export function isLowCodeEditPageActionDisabled(
  action: ModeAwareAction,
  mode: LowCodeEditPageMode | undefined,
) {
  if (action.disabled === true) return true;

  const code = normalizeLowCodeEditPageActionCode(action.code);
  if (!code || !mode) return false;
  if (isLowCodeEditPageModifyAction(action)) return mode !== 'scan';
  if (isLowCodeEditPageSaveAction(action)) return mode === 'scan';
  if (isInlineWriteAction(code)) return mode === 'scan';
  if (code === 'create' || code === 'copy') return mode === 'add';

  return false;
}
