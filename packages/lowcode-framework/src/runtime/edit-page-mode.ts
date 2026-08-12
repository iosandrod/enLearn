import type {
  LowCodeEditPageMode,
  LowCodeField,
} from '../types/lowcode';

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
