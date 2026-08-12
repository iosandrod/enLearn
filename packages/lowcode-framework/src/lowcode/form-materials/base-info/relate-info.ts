import type {
  LowCodeGridColumn,
  LowCodePageBlock,
  LowCodePageGridBlock,
  LowCodePageSchema,
  LowCodeRelateInfoConfig,
  LowCodeRelateInfoFieldMapping,
} from '../../../types/lowcode';

export type RelateInfoRow = Record<string, unknown>;

const unsafeFieldNames = new Set(['__proto__', 'prototype', 'constructor']);
const nonBusinessColumnTypes = new Set([
  'checkbox',
  'expand',
  'html',
  'radio',
  'seq',
]);

function hasOwn(value: RelateInfoRow, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function isRelateInfoRecord(value: unknown): value is RelateInfoRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readRelateInfoString(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

export function readRelateInfoStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => readRelateInfoString(item)).filter(Boolean);
  }
  const item = readRelateInfoString(value);
  return item ? [item] : [];
}

export function readRelateInfoPath(value: unknown, path: string): unknown {
  if (!path) return undefined;

  return path.split('.').reduce<unknown>((current, key) => {
    if (!isRelateInfoRecord(current)) return undefined;
    return current[key];
  }, value);
}

export function hasRelateInfoPath(value: unknown, path: string): boolean {
  if (!path) return false;

  let current: unknown = value;
  for (const key of path.split('.')) {
    if (!isRelateInfoRecord(current) || !hasOwn(current, key)) return false;
    current = current[key];
  }
  return true;
}

function normalizeMapping(value: unknown): LowCodeRelateInfoFieldMapping | null {
  if (!isRelateInfoRecord(value)) return null;

  const sourceField = readRelateInfoString(
    value.sourceField ?? value.source ?? value.from ?? value.relateField,
  );
  const targetField = readRelateInfoString(
    value.targetField ?? value.target ?? value.to ?? value.formField,
  );

  return sourceField && targetField && !unsafeFieldNames.has(targetField)
    ? { sourceField, targetField }
    : null;
}

export function normalizeRelateInfoMappings(
  config: LowCodeRelateInfoConfig | undefined,
  currentField: string,
): LowCodeRelateInfoFieldMapping[] {
  const rawMappings = config?.fieldMappings ?? config?.mappings;
  const mappings = Array.isArray(rawMappings)
    ? rawMappings.map(normalizeMapping).filter(Boolean) as LowCodeRelateInfoFieldMapping[]
    : isRelateInfoRecord(rawMappings)
      ? Object.entries(rawMappings)
          .map(([targetField, sourceField]) => ({
            sourceField: readRelateInfoString(sourceField),
            targetField: readRelateInfoString(targetField),
          }))
          .filter(
            (mapping) =>
              mapping.sourceField &&
              mapping.targetField &&
              !unsafeFieldNames.has(mapping.targetField),
          )
      : [];

  const normalized = mappings.filter(
    (mapping, index) =>
      mappings.findIndex((candidate) => candidate.targetField === mapping.targetField) === index,
  );
  const safeCurrentField = unsafeFieldNames.has(currentField) ? '' : currentField;

  if (
    safeCurrentField &&
    !normalized.some((mapping) => mapping.targetField === safeCurrentField)
  ) {
    normalized.unshift({
      sourceField: readRelateInfoString(
        config?.valueField,
        readRelateInfoStringArray(config?.displayField)[0] ?? 'id',
      ),
      targetField: safeCurrentField,
    });
  }

  return normalized;
}

export function getRelateInfoDisplayValueTarget(
  config: LowCodeRelateInfoConfig | undefined,
  currentField: string,
) {
  return readRelateInfoString(
    config?.displayValueField,
    currentField ? `${currentField}_label` : '',
  );
}

export function mapRelateInfoRow(
  row: RelateInfoRow,
  config: LowCodeRelateInfoConfig | undefined,
  currentField: string,
) {
  const mappings = normalizeRelateInfoMappings(config, currentField);
  const values = Object.fromEntries(
    mappings.filter((mapping) => hasRelateInfoPath(row, mapping.sourceField)).map((mapping) => [
      mapping.targetField,
      readRelateInfoPath(row, mapping.sourceField),
    ]),
  );
  const displayTarget = getRelateInfoDisplayValueTarget(config, currentField);
  if (
    displayTarget &&
    !unsafeFieldNames.has(displayTarget) &&
    displayTarget !== currentField &&
    !mappings.some((mapping) => mapping.targetField === displayTarget)
  ) {
    values[displayTarget] = readRelateInfoDisplayValue(row, config, currentField);
  }

  return values;
}

export function readRelateInfoDisplayValue(
  row: RelateInfoRow,
  config: LowCodeRelateInfoConfig | undefined,
  currentField: string,
) {
  const currentMapping = normalizeRelateInfoMappings(config, currentField).find(
    (mapping) => mapping.targetField === currentField,
  );
  const displayFields = readRelateInfoStringArray(config?.displayField);
  if (!displayFields.length) {
    displayFields.push(
      currentMapping?.sourceField || readRelateInfoString(config?.valueField, 'id'),
    );
  }
  const values = displayFields
    .map((field) => readRelateInfoPath(row, field))
    .filter((value) => value !== null && typeof value !== 'undefined' && String(value) !== '');
  return values.map(String).join(' ');
}

export function extractRelateInfoRows(
  value: unknown,
  resultPath?: string,
): RelateInfoRow[] {
  const resolved = resultPath ? readRelateInfoPath(value, resultPath) : value;
  if (Array.isArray(resolved)) return resolved.filter(isRelateInfoRecord);
  if (!isRelateInfoRecord(resolved)) return [];

  for (const key of ['rows', 'data', 'result', 'items', 'list']) {
    const candidate = resolved[key];
    if (Array.isArray(candidate)) return candidate.filter(isRelateInfoRecord);
    if (isRelateInfoRecord(candidate)) {
      const nested = extractRelateInfoRows(candidate);
      if (nested.length) return nested;
    }
  }

  return [];
}

export function filterRelateInfoRows(
  rows: RelateInfoRow[],
  keyword: string,
  fields: string[] = [],
) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  if (!normalizedKeyword) return rows;

  return rows.filter((row) => {
    const values = fields.length
      ? fields.map((field) => readRelateInfoPath(row, field))
      : Object.values(row);

    return values.some((value) =>
      String(value ?? '').toLocaleLowerCase().includes(normalizedKeyword)
    );
  });
}

function normalizeConfiguredColumn(value: unknown): LowCodeGridColumn | null {
  if (!isRelateInfoRecord(value)) return null;
  const field = readRelateInfoString(value.field);
  const title = readRelateInfoString(value.title ?? value.label, field);
  const type = readRelateInfoString(value.type);
  if (!field || !title || value.visible === false || nonBusinessColumnTypes.has(type)) {
    return null;
  }
  return { ...value, field, title } as LowCodeGridColumn;
}

export function columnsFromRelateInfoMetadata(value: unknown): LowCodeGridColumn[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((column) => {
      if (!isRelateInfoRecord(column)) return null;
      if (readRelateInfoString(column.storage_kind, 'physical') === 'virtual') return null;
      const field = readRelateInfoString(column.name ?? column.column_name ?? column.field);
      const title = readRelateInfoString(
        column.title ?? column.label ?? column.comment,
        field,
      );
      if (!field) return null;

      return {
        field,
        title,
        minWidth: field === 'id' || field.endsWith('_id') ? 210 : 140,
        showOverflow: 'tooltip',
        align: column.align,
      } as LowCodeGridColumn;
    })
    .filter((column): column is LowCodeGridColumn => Boolean(column));
}

export function inferRelateInfoColumns(rows: RelateInfoRow[]): LowCodeGridColumn[] {
  const fields = new Map<string, unknown>();
  rows.slice(0, 10).forEach((row) => {
    Object.entries(row).forEach(([field, value]) => {
      if (!fields.has(field) && (value === null || typeof value !== 'object')) {
        fields.set(field, value);
      }
    });
  });

  return [...fields.keys()].slice(0, 12).map((field) => ({
    field,
    title: field,
    minWidth: field === 'id' || field.endsWith('_id') ? 210 : 140,
    showOverflow: 'tooltip',
  }));
}

function collectGridBlocks(
  blocks: LowCodePageBlock[] | undefined,
  grids: LowCodePageGridBlock[] = [],
) {
  for (const block of blocks ?? []) {
    if (block.kind === 'grid') grids.push(block);

    if ('blocks' in block) {
      collectGridBlocks(block.blocks, grids);
    }

    if (block.kind === 'tabs') {
      for (const tab of block.tabs) {
        collectGridBlocks(tab.blocks, grids);
      }
    }
  }

  return grids;
}

function isMainGrid(grid: LowCodePageGridBlock) {
  return grid.tableType === 'main' || grid.schema.grid.tableType === 'main';
}

export function findRelateInfoGrid(
  schema: LowCodePageSchema,
  sourceKey = '',
) {
  const grids = [
    ...collectGridBlocks(schema.blocks),
    ...collectGridBlocks(schema.overlays),
  ];

  return (
    (sourceKey ? grids.find((grid) => grid.sourceKey === sourceKey) : undefined) ??
    grids.find(isMainGrid) ??
    grids[0]
  );
}

export function resolveRelateInfoColumns(
  config: LowCodeRelateInfoConfig | undefined,
  pageGrid: LowCodePageGridBlock | undefined,
  metadata: unknown,
  rows: RelateInfoRow[],
) {
  const configured = Array.isArray(config?.columns)
    ? config.columns.map(normalizeConfiguredColumn).filter(Boolean) as LowCodeGridColumn[]
    : [];
  if (configured.length) return configured;

  const pageColumns = (pageGrid?.schema.grid.columns ?? [])
    .map(normalizeConfiguredColumn)
    .filter((column): column is LowCodeGridColumn => Boolean(column))
    .filter((column) => column.slots?.default !== 'actions');
  if (pageColumns.length) return pageColumns;

  const metadataColumns = columnsFromRelateInfoMetadata(metadata);
  return metadataColumns.length ? metadataColumns : inferRelateInfoColumns(rows);
}
