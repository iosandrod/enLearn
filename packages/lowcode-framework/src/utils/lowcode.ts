import type { LowCodeGridColumn, LowCodeGridFormatter } from '../types/lowcode';

const DEFAULT_TIMEZONE = 'UTC';

function toDateValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value);
  }

  if (typeof value === 'string' && value.trim()) {
    return new Date(value);
  }

  return null;
}

function withTimeZone(
  options: Intl.DateTimeFormatOptions | undefined,
  timeZone: string,
) {
  if (options?.timeZone || !timeZone) return options;
  return { ...options, timeZone };
}

function hasDateTimeFields(options?: Intl.DateTimeFormatOptions) {
  if (!options) return false;
  return Object.entries(options).some(([key, value]) => key !== 'timeZone' && value !== undefined);
}

function resolveDateTimeOptions(
  options: Intl.DateTimeFormatOptions | undefined,
  timeZone: string,
) {
  if (hasDateTimeFields(options)) return withTimeZone(options, timeZone);
  return withTimeZone(
    {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...options,
    },
    timeZone,
  );
}

export function formatLowCodeGridValue(
  value: unknown,
  formatter?:
    | LowCodeGridFormatter
    | string
    | ((params: { cellValue: unknown }) => string),
  timeZone = DEFAULT_TIMEZONE,
) {
  if (!formatter) {
    return value ?? '';
  }

  if (typeof formatter === 'function') {
    return formatter({ cellValue: value });
  }

  if (typeof formatter === 'string') {
    return value ?? '';
  }

  if (value === null || value === undefined || value === '') {
    return formatter.emptyText ?? '';
  }

  switch (formatter.type) {
    case 'text':
      return String(value);
    case 'date': {
      const date = toDateValue(value);
      return date
        ? new Intl.DateTimeFormat(
            formatter.locale ?? 'en',
            withTimeZone(formatter.options, timeZone),
          ).format(date)
        : formatter.emptyText ?? String(value);
    }
    case 'datetime': {
      const date = toDateValue(value);
      return date
        ? new Intl.DateTimeFormat(
            formatter.locale ?? 'en',
            resolveDateTimeOptions(formatter.options, timeZone),
          ).format(date)
        : formatter.emptyText ?? String(value);
    }
    case 'currency': {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return formatter.emptyText ?? String(value);
      }

      return new Intl.NumberFormat(formatter.locale ?? 'en', {
        style: 'currency',
        currency: formatter.currency ?? 'USD',
        ...formatter.options
      }).format(numericValue);
    }
    case 'number': {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return formatter.emptyText ?? String(value);
      }

      return new Intl.NumberFormat(formatter.locale ?? 'en', formatter.options).format(
        numericValue
      );
    }
    case 'enum':
      return formatter.map[String(value)] ?? formatter.emptyText ?? String(value);
    default:
      return value ?? '';
  }
}

export function normalizeLowCodeGridColumns(
  columns: LowCodeGridColumn[],
  timeZone = DEFAULT_TIMEZONE,
) {
  return columns.map((column) => {
    if (
      !column.formatter ||
      typeof column.formatter === 'function' ||
      typeof column.formatter === 'string'
    ) {
      return column;
    }

    return {
      ...column,
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        formatLowCodeGridValue(cellValue, column.formatter, timeZone)
    };
  });
}
