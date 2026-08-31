export type LowCodeRowActionCondition = {
  field: string;
  operator?: 'eq' | 'neq' | 'in' | 'notIn' | 'gt' | 'gte' | 'lt' | 'lte' | 'truthy' | 'falsy';
  value?: unknown;
};

export type LowCodeRowActionPredicate =
  | boolean
  | string
  | LowCodeRowActionCondition
  | LowCodeRowActionCondition[];

export type LowCodeRowActionState = {
  visible?: LowCodeRowActionPredicate;
  when?: LowCodeRowActionPredicate;
  disabled?: LowCodeRowActionPredicate;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPath(source: Record<string, unknown>, path: string) {
  return path.split('.').filter(Boolean).reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, source);
}

function isTruthy(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return Boolean(normalized) && !['false', '0', 'no', 'off', 'null', 'undefined'].includes(normalized);
  }
  return Boolean(value);
}

function valuesEqual(left: unknown, right: unknown) {
  return Object.is(left, right) || String(left ?? '') === String(right ?? '');
}

function compareNumbers(left: unknown, right: unknown, operator: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
  if (operator === 'gt') return leftNumber > rightNumber;
  if (operator === 'gte') return leftNumber >= rightNumber;
  if (operator === 'lt') return leftNumber < rightNumber;
  return leftNumber <= rightNumber;
}

function matchesCondition(
  condition: LowCodeRowActionCondition,
  row: Record<string, unknown>,
) {
  const actual = readPath(row, condition.field.trim());
  const operator = condition.operator ?? 'eq';

  if (operator === 'truthy') return isTruthy(actual);
  if (operator === 'falsy') return !isTruthy(actual);
  if (operator === 'in' || operator === 'notIn') {
    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    const included = values.some((value) => valuesEqual(actual, value));
    return operator === 'in' ? included : !included;
  }
  if (operator === 'neq') return !valuesEqual(actual, condition.value);
  if (['gt', 'gte', 'lt', 'lte'].includes(operator)) {
    return compareNumbers(actual, condition.value, operator);
  }
  return valuesEqual(actual, condition.value);
}

export function matchesLowCodeRowActionPredicate(
  predicate: LowCodeRowActionPredicate | undefined,
  row: Record<string, unknown>,
  fallback: boolean,
) {
  if (typeof predicate === 'undefined') return fallback;
  if (typeof predicate === 'boolean') return predicate;
  if (typeof predicate === 'string') {
    const expression = predicate.trim();
    if (!expression) return fallback;
    if (expression === 'true' || expression === 'false') return expression === 'true';
    return isTruthy(readPath(row, expression.replace(/^row\./, '')));
  }
  if (Array.isArray(predicate)) {
    return predicate.every((condition) => matchesCondition(condition, row));
  }
  return isRecord(predicate) && typeof predicate.field === 'string'
    ? matchesCondition(predicate as LowCodeRowActionCondition, row)
    : fallback;
}

export function visibleLowCodeRowActions<TAction extends LowCodeRowActionState>(
  actions: TAction[],
  row: Record<string, unknown>,
) {
  return actions.filter((action) =>
    matchesLowCodeRowActionPredicate(action.visible ?? action.when, row, true),
  );
}

export function isLowCodeRowActionDisabled(
  action: LowCodeRowActionState,
  row: Record<string, unknown>,
) {
  return matchesLowCodeRowActionPredicate(action.disabled, row, false);
}
