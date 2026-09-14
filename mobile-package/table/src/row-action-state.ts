export type RowActionPredicate = boolean | string | { field: string; operator?: string; value?: unknown } | Array<{ field: string; operator?: string; value?: unknown }>;

function truthy(value: unknown) {
  if (typeof value === 'string') return Boolean(value.trim()) && !['false', '0', 'no', 'off', 'null', 'undefined'].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function equal(left: unknown, right: unknown) { return Object.is(left, right) || String(left ?? '') === String(right ?? ''); }
function path(row: Record<string, unknown>, value: string) { return value.split('.').filter(Boolean).reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, row); }
function match(condition: { field: string; operator?: string; value?: unknown }, row: Record<string, unknown>) {
  const actual = path(row, condition.field.replace(/^row\./, ''));
  switch (condition.operator ?? 'eq') {
    case 'truthy': return truthy(actual);
    case 'falsy': return !truthy(actual);
    case 'neq': return !equal(actual, condition.value);
    case 'in': return (Array.isArray(condition.value) ? condition.value : [condition.value]).some((v) => equal(actual, v));
    case 'notIn': return !(Array.isArray(condition.value) ? condition.value : [condition.value]).some((v) => equal(actual, v));
    case 'gt': return Number(actual) > Number(condition.value);
    case 'gte': return Number(actual) >= Number(condition.value);
    case 'lt': return Number(actual) < Number(condition.value);
    case 'lte': return Number(actual) <= Number(condition.value);
    default: return equal(actual, condition.value);
  }
}
export function matchesRowActionPredicate(predicate: RowActionPredicate | undefined, row: Record<string, unknown>, fallback: boolean) {
  if (predicate === undefined) return fallback;
  if (typeof predicate === 'boolean') return predicate;
  if (typeof predicate === 'string') return predicate === 'true' ? true : predicate === 'false' ? false : truthy(path(row, predicate.replace(/^row\./, '')));
  return Array.isArray(predicate) ? predicate.every((item) => match(item, row)) : match(predicate, row);
}
export function visibleRowActions<T extends { visible?: RowActionPredicate; when?: RowActionPredicate }>(actions: T[], row: Record<string, unknown>) { return actions.filter((action) => matchesRowActionPredicate(action.visible ?? action.when, row, true)); }
export function isRowActionDisabled(action: { disabled?: RowActionPredicate }, row: Record<string, unknown>) { return matchesRowActionPredicate(action.disabled, row, false); }
