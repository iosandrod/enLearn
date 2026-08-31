import type {
  LowCodeGridDetailConfig,
  LowCodePageDataSource,
  LowCodePageGridBlock,
} from '../types/lowcode';
import type {
  LowCodeGridChangeSet,
  LowCodeRuntimeRecord,
} from './page-runtime';

export type LowCodeGridDetailSubmission = {
  resource: string;
  foreignKey: string;
  parentKey: string;
  inheritFields: string[];
  updateMode: 'replace' | 'changes';
  mode?: 'replace' | 'changes';
  rows?: LowCodeRuntimeRecord[];
  created?: LowCodeRuntimeRecord[];
  updated?: LowCodeRuntimeRecord[];
  deleted?: Array<string | number>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => readString(item)).filter(Boolean))];
}

function readSourceResource(source?: LowCodePageDataSource) {
  const postData = isRecord(source?.postData) ? source.postData : {};
  return readString(
    postData.resource,
    readString(source?.tableName ?? source?.table_name, readString(postData.tableName ?? postData.table_name)),
  );
}

export function normalizeLowCodeGridDetailConfig(
  value: unknown,
  source?: LowCodePageDataSource,
): LowCodeGridDetailConfig | undefined {
  if (!isRecord(value) || value.enabled === false) return undefined;

  const parentSourceKey = readString(value.parentSourceKey ?? value.parent_source_key);
  const resource = readString(value.resource, readSourceResource(source));
  const foreignKey = readString(value.foreignKey ?? value.foreign_key);
  if (!parentSourceKey || !resource || !foreignKey) return undefined;

  const updateMode = readString(value.updateMode ?? value.update_mode) === 'replace'
    ? 'replace'
    : 'changes';
  return {
    enabled: true,
    parentSourceKey,
    resource,
    foreignKey,
    parentKey: readString(value.parentKey ?? value.parent_key, 'id'),
    inheritFields: readStrings(value.inheritFields ?? value.inherit_fields),
    updateMode,
    defaults: isRecord(value.defaults) ? cloneValue(value.defaults) : {},
    stripCreatedKey: value.stripCreatedKey !== false,
  };
}

function stripRuntimeFields(row: LowCodeRuntimeRecord) {
  return Object.fromEntries(
    Object.entries(cloneValue(row)).filter(([field]) => ![
      '_X_ROW_KEY',
      '__rowStatus',
      '__rowState',
    ].includes(field)),
  );
}

function prepareCreatedRow(
  row: LowCodeRuntimeRecord,
  config: LowCodeGridDetailConfig,
  rowKey: string,
) {
  const prepared = {
    ...(config.defaults ?? {}),
    ...stripRuntimeFields(row),
  };
  if (config.stripCreatedKey !== false && rowKey) delete prepared[rowKey];
  delete prepared[config.foreignKey];
  for (const field of config.inheritFields ?? []) delete prepared[field];
  return prepared;
}

function prepareUpdatedRow(
  row: LowCodeRuntimeRecord,
  config: LowCodeGridDetailConfig,
) {
  const prepared = stripRuntimeFields(row);
  delete prepared[config.foreignKey];
  for (const field of config.inheritFields ?? []) delete prepared[field];
  return prepared;
}

export function buildLowCodeGridDetailSubmission(options: {
  block: LowCodePageGridBlock;
  source?: LowCodePageDataSource;
  rows: LowCodeRuntimeRecord[];
  changes: LowCodeGridChangeSet;
  creating: boolean;
}): LowCodeGridDetailSubmission | undefined {
  const config = normalizeLowCodeGridDetailConfig(
    options.block.schema.detailConfig,
    options.source,
  );
  if (!config) return undefined;

  const rowConfig = isRecord(options.block.schema.grid.rowConfig)
    ? options.block.schema.grid.rowConfig
    : {};
  const rowKey = readString(rowConfig.keyField, 'id');
  const relation = {
    resource: config.resource,
    foreignKey: config.foreignKey,
    parentKey: config.parentKey ?? 'id',
    inheritFields: config.inheritFields ?? [],
    updateMode: config.updateMode ?? 'changes',
  } as const;

  if (options.creating) {
    return {
      ...relation,
      rows: options.rows.map((row) => prepareCreatedRow(row, config, rowKey)),
    };
  }

  if (config.updateMode === 'replace') {
    return {
      ...relation,
      mode: 'replace',
      rows: options.rows.map((row) => prepareCreatedRow(row, config, rowKey)),
    };
  }

  return {
    ...relation,
    mode: 'changes',
    created: options.changes.created.map((row) => prepareCreatedRow(row, config, rowKey)),
    updated: options.changes.updated.map((row) => prepareUpdatedRow(row, config)),
    deleted: options.changes.deleted
      .map((row) => row[rowKey])
      .filter((value): value is string | number =>
        (typeof value === 'string' && Boolean(value.trim())) ||
        (typeof value === 'number' && Number.isFinite(value)),
      ),
  };
}
