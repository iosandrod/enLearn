import type {
  LowCodeSearchQueryOperator,
  LowCodeSearchQueryRule,
} from '../types/lowcode';

const operators = new Set<LowCodeSearchQueryOperator>([
  'eq', 'ne', 'like', 'ilike', 'notLike', 'notIlike',
  'gt', 'gte', 'lt', 'lte', 'between', 'in', 'notIn',
  'startsWith', 'endsWith', 'isNull', 'isNotNull',
  'contains', 'containedBy', 'overlaps',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isActiveSearchValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function normalizeLowCodeSearchQueryLogic(value: unknown): LowCodeSearchQueryRule[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((row): LowCodeSearchQueryRule => {
    const inputField = readString(row.inputField ?? row.sourceField ?? row.field);
    const field = readString(row.field) || inputField;
    const rawOperator = readString(row.op ?? row.operator) as LowCodeSearchQueryOperator;
    return {
      inputField,
      field,
      logic: readString(row.logic).toLowerCase() === 'or' ? 'or' : 'and',
      op: operators.has(rawOperator) ? rawOperator : 'eq',
      enabled: row.enabled !== false,
    };
  }).filter((row) => row.inputField && row.field);
}

export function createLowCodeSearchFilters(
  values: Record<string, unknown>,
  queryLogic: unknown,
) {
  const rules = normalizeLowCodeSearchQueryLogic(queryLogic);
  if (!rules.length) return values;

  const conditions = rules.flatMap((rule) => {
    if (rule.enabled === false) return [];
    const value = values[rule.inputField];
    if (!['isNull', 'isNotNull'].includes(rule.op ?? '') && !isActiveSearchValue(value)) return [];
    return [{
      field: rule.field || rule.inputField,
      op: rule.op ?? 'eq',
      ...(!['isNull', 'isNotNull'].includes(rule.op ?? '') ? { value } : {}),
      logic: rule.logic ?? 'and',
    }];
  });
  if (!conditions.length) return {};

  let expression: Record<string, unknown> = {
    field: conditions[0].field,
    op: conditions[0].op,
    ...('value' in conditions[0] ? { value: conditions[0].value } : {}),
  };
  conditions.slice(1).forEach((condition) => {
    expression = {
      logic: condition.logic,
      conditions: [
        expression,
        {
          field: condition.field,
          op: condition.op,
          ...('value' in condition ? { value: condition.value } : {}),
        },
      ],
    };
  });
  return isRecord(expression) && Array.isArray(expression.conditions)
    ? expression
    : { logic: 'and', conditions: [expression] };
}

export function reconcileLowCodeSearchQueryLogic(
  value: unknown,
  fields: Array<{ field: string }>,
): LowCodeSearchQueryRule[] {
  const rules = normalizeLowCodeSearchQueryLogic(value);
  if (!rules.length) return [];
  const byInput = new Map(rules.map((rule) => [rule.inputField, rule]));
  return fields.filter((field) => field.field).map(({ field }) =>
    byInput.get(field) ?? { inputField: field, field, logic: 'and', op: 'eq', enabled: true },
  );
}

function compare(actual: unknown, expected: unknown, operator: string) {
  const left = String(actual ?? '');
  const right = String(expected ?? '');
  const normalized = operator.replace(/_/g, '').toLowerCase();
  if (normalized === 'isnull') return actual === null || actual === undefined;
  if (normalized === 'isnotnull') return actual !== null && actual !== undefined;
  if (actual === null || actual === undefined) return false;
  if (normalized === 'ne') return actual !== expected;
  if (['like', 'ilike', 'notlike', 'notilike'].includes(normalized)) {
    const insensitive = normalized.includes('ilike');
    const pattern = right.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
    const matches = new RegExp(pattern, insensitive ? 'is' : 's').test(left);
    return normalized.startsWith('not') ? !matches : matches;
  }
  if (normalized === 'startswith') return left.startsWith(right);
  if (normalized === 'endswith') return left.endsWith(right);
  if (normalized === 'in' || normalized === 'notin') {
    const included = (Array.isArray(expected) ? expected : [expected]).map(String).includes(left);
    return normalized === 'in' ? included : !included;
  }
  const numeric = actual !== null && expected !== null && !Number.isNaN(Number(actual)) && !Number.isNaN(Number(expected));
  const leftValue = numeric ? Number(actual) : left;
  const rightValue = numeric ? Number(expected) : right;
  if (normalized === 'gt') return actual != null && leftValue > rightValue;
  if (normalized === 'gte') return actual != null && leftValue >= rightValue;
  if (normalized === 'lt') return actual != null && leftValue < rightValue;
  if (normalized === 'lte') return actual != null && leftValue <= rightValue;
  if (normalized === 'between') {
    const range = Array.isArray(expected) ? expected : [];
    return range.length >= 2 && compare(actual, range[0], 'gte') && compare(actual, range[1], 'lte');
  }
  if (['contains', 'containedby', 'overlaps'].includes(normalized)) {
    const items = Array.isArray(actual) ? actual : [];
    const expectedItems = Array.isArray(expected) ? expected : [];
    if (normalized === 'contains') return expectedItems.every((item) => items.includes(item));
    if (normalized === 'containedby') return items.every((item) => expectedItems.includes(item));
    return items.some((item) => expectedItems.includes(item));
  }
  return actual === expected || left === right;
}

export function matchesLowCodeSearchFilters(
  row: Record<string, unknown>,
  filters: Record<string, unknown>,
): boolean {
  if (Array.isArray(filters.conditions)) {
    const results = filters.conditions
      .filter(isRecord)
      .map((condition) => matchesLowCodeSearchFilters(row, condition));
    return filters.logic === 'or' ? results.some(Boolean) : results.every(Boolean);
  }
  const field = readString(filters.field);
  if (field) {
    const actual = Object.prototype.hasOwnProperty.call(row, field)
      ? row[field]
      : field.split('.').reduce<unknown>((value, key) => isRecord(value) ? value[key] : undefined, row);
    return compare(actual, filters.value, readString(filters.op) || 'eq');
  }
  return Object.entries(filters).every(([key, value]) => {
    if (!isActiveSearchValue(value)) return true;
    if (Array.isArray(value)) return value.map(String).includes(String(row[key] ?? ''));
    if (isRecord(value) && typeof value.op === 'string') return compare(row[key], value.value, value.op);
    return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
  });
}
