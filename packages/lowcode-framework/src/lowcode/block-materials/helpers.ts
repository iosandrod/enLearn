import { formatLowCodeGridValue } from '../../utils/lowcode';
import type {
  LowCodeGridFormatter,
  LowCodePageContainerBlock,
  LowCodePageDetailBlock,
  LowCodePageGridBlock,
  LowCodePageStatCardBlock,
  LowCodeStatItem,
} from '../../types/lowcode';

export function textToneClass(tone?: 'default' | 'muted' | 'success' | 'warning') {
  if (!tone || tone === 'default') return '';
  return tone === 'muted' || tone === 'warning' ? 'muted' : 'lc-help';
}

export function containerStyle(block: LowCodePageContainerBlock) {
  return {
    '--lc-container-columns': String(block.columns ?? 1),
    '--lc-container-gap': `${block.gap ?? 8}px`,
  };
}

export function widthStyle(width?: number | string) {
  if (!width) return undefined;
  return { width: typeof width === 'number' ? `${width}px` : width };
}

export function getSourceValue(
  resolvedData: Record<string, unknown>,
  sourceKey?: string
) {
  if (!sourceKey) return undefined;
  return resolvedData[sourceKey];
}

function isSearchValueActive(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function matchesFilter(row: Record<string, unknown>, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([field, value]) => {
    if (!isSearchValueActive(value)) return true;
    const cell = row[field];

    if (Array.isArray(value)) {
      return value.map(String).includes(String(cell ?? ''));
    }

    return String(cell ?? '').toLowerCase().includes(String(value).toLowerCase());
  });
}

export function resolveGridRows(
  block: LowCodePageGridBlock,
  resolvedData: Record<string, unknown>,
  searchFilters: Record<string, Record<string, unknown>>
) {
  const sourceValue = getSourceValue(resolvedData, block.sourceKey);
  const rows = Array.isArray(block.rows)
    ? block.rows
    : Array.isArray(sourceValue)
      ? (sourceValue as Record<string, unknown>[])
      : [];
  const filters = block.sourceKey ? searchFilters[block.sourceKey] : undefined;

  return filters ? rows.filter((row) => matchesFilter(row, filters)) : rows;
}

export function resolveDetailRecord(
  block: LowCodePageDetailBlock,
  resolvedData: Record<string, unknown>
) {
  if (block.record) return block.record;
  const sourceValue = getSourceValue(resolvedData, block.sourceKey);
  if (Array.isArray(sourceValue)) return sourceValue[0] as Record<string, unknown> | undefined;
  return typeof sourceValue === 'object' && sourceValue !== null
    ? (sourceValue as Record<string, unknown>)
    : undefined;
}

export function formatDetailValue(value: unknown, formatter?: LowCodeGridFormatter) {
  return formatLowCodeGridValue(value, formatter);
}

function resolveStatSource(
  block: LowCodePageStatCardBlock,
  resolvedData: Record<string, unknown>
) {
  const sourceValue = getSourceValue(resolvedData, block.sourceKey);
  if (Array.isArray(sourceValue)) {
    return { count: sourceValue.length };
  }
  return typeof sourceValue === 'object' && sourceValue !== null
    ? (sourceValue as Record<string, unknown>)
    : {};
}

export function resolveStatValue(
  block: LowCodePageStatCardBlock,
  item: LowCodeStatItem,
  resolvedData: Record<string, unknown>
) {
  if (typeof item.value !== 'undefined') return item.value;
  const source = resolveStatSource(block, resolvedData);
  return formatLowCodeGridValue(source[item.field ?? 'count'], item.formatter);
}

export function resolveTreeRows(
  rows: Record<string, unknown>[] | undefined,
  sourceKey: string | undefined,
  resolvedData: Record<string, unknown>
) {
  if (Array.isArray(rows)) return rows;
  const sourceValue = getSourceValue(resolvedData, sourceKey);
  return Array.isArray(sourceValue) ? (sourceValue as Record<string, unknown>[]) : [];
}
