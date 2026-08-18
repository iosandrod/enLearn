import type { LowCodeOption } from '../types/lowcode';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

export function splitQualifiedTableName(value: string) {
  const parts = value.split('.').filter(Boolean);
  return {
    schemaName: parts.length > 1 ? parts[parts.length - 2] : 'public',
    tableName: parts[parts.length - 1] ?? '',
  };
}

export function metadataColumnsToOptions(value: unknown): LowCodeOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .filter((column) => readString(column.storage_kind, 'physical') !== 'virtual')
    .map((column) => {
      const field = readString(column.column_name ?? column.name);
      const title = readString(
        column.label ?? column.title ?? column.comment,
        field,
      );
      return field
        ? {
            label: title === field ? field : `${title} (${field})`,
            value: field,
          }
        : null;
    })
    .filter((option): option is { label: string; value: string } => Boolean(option));
}
