function toDateValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value);
    }
    if (typeof value === 'string' && value.trim()) {
        return new Date(value);
    }
    return null;
}
export function formatLowCodeGridValue(value, formatter) {
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
                ? new Intl.DateTimeFormat(formatter.locale ?? 'en', formatter.options).format(date)
                : formatter.emptyText ?? String(value);
        }
        case 'datetime': {
            const date = toDateValue(value);
            return date
                ? new Intl.DateTimeFormat(formatter.locale ?? 'en', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    ...formatter.options
                }).format(date)
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
            return new Intl.NumberFormat(formatter.locale ?? 'en', formatter.options).format(numericValue);
        }
        case 'enum':
            return formatter.map[String(value)] ?? formatter.emptyText ?? String(value);
        default:
            return value ?? '';
    }
}
export function normalizeLowCodeGridColumns(columns) {
    return columns.map((column) => {
        if (!column.formatter ||
            typeof column.formatter === 'function' ||
            typeof column.formatter === 'string') {
            return column;
        }
        return {
            ...column,
            formatter: ({ cellValue }) => formatLowCodeGridValue(cellValue, column.formatter)
        };
    });
}
