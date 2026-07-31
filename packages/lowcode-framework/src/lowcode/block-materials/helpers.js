import { formatLowCodeGridValue } from '../../utils/lowcode';
export function textToneClass(tone) {
    if (!tone || tone === 'default')
        return '';
    return tone === 'muted' || tone === 'warning' ? 'muted' : 'lc-help';
}
export function containerStyle(block) {
    return {
        '--lc-container-columns': String(block.columns ?? 1),
        '--lc-container-gap': `${block.gap ?? 8}px`,
    };
}
export function widthStyle(width) {
    if (!width)
        return undefined;
    return { width: typeof width === 'number' ? `${width}px` : width };
}
export function getSourceValue(resolvedData, sourceKey) {
    if (!sourceKey)
        return undefined;
    return resolvedData[sourceKey];
}
function isSearchValueActive(value) {
    if (Array.isArray(value))
        return value.length > 0;
    return value !== undefined && value !== null && String(value).trim() !== '';
}
function matchesFilter(row, filters) {
    return Object.entries(filters).every(([field, value]) => {
        if (!isSearchValueActive(value))
            return true;
        const cell = row[field];
        if (Array.isArray(value)) {
            return value.map(String).includes(String(cell ?? ''));
        }
        return String(cell ?? '').toLowerCase().includes(String(value).toLowerCase());
    });
}
export function resolveGridRows(block, resolvedData, searchFilters) {
    const sourceValue = getSourceValue(resolvedData, block.sourceKey);
    const rows = Array.isArray(block.rows)
        ? block.rows
        : Array.isArray(sourceValue)
            ? sourceValue
            : [];
    const filters = block.sourceKey ? searchFilters[block.sourceKey] : undefined;
    return filters ? rows.filter((row) => matchesFilter(row, filters)) : rows;
}
export function resolveDetailRecord(block, resolvedData) {
    if (block.record)
        return block.record;
    const sourceValue = getSourceValue(resolvedData, block.sourceKey);
    if (Array.isArray(sourceValue))
        return sourceValue[0];
    return typeof sourceValue === 'object' && sourceValue !== null
        ? sourceValue
        : undefined;
}
export function formatDetailValue(value, formatter) {
    return formatLowCodeGridValue(value, formatter);
}
function resolveStatSource(block, resolvedData) {
    const sourceValue = getSourceValue(resolvedData, block.sourceKey);
    if (Array.isArray(sourceValue)) {
        return { count: sourceValue.length };
    }
    return typeof sourceValue === 'object' && sourceValue !== null
        ? sourceValue
        : {};
}
export function resolveStatValue(block, item, resolvedData) {
    if (typeof item.value !== 'undefined')
        return item.value;
    const source = resolveStatSource(block, resolvedData);
    return formatLowCodeGridValue(source[item.field ?? 'count'], item.formatter);
}
export function resolveTreeRows(rows, sourceKey, resolvedData) {
    if (Array.isArray(rows))
        return rows;
    const sourceValue = getSourceValue(resolvedData, sourceKey);
    return Array.isArray(sourceValue) ? sourceValue : [];
}
