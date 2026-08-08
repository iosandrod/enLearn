import type { LowCodeHostServiceApi } from '../../core/host';
import type {
  LowCodeOption,
  LowCodePageDataSource,
  LowCodePageRecord,
  LowCodePageSchema,
} from '../../types/lowcode';

const visualGridComponentKeys = new Set(['lowcode-grid', 'grid', 'table', 'vxe-grid']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function readColumns(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readPostData(value: unknown) {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolveGridColumns(node: Record<string, unknown>) {
  if (node.kind === 'grid') {
    const schema = isRecord(node.schema) ? node.schema : {};
    const grid = isRecord(schema.grid) ? schema.grid : {};
    const gridColumns = readColumns(grid.columns);
    const nodeColumns = readColumns(node.columns);
    return gridColumns.length
      ? gridColumns
      : nodeColumns.length
        ? nodeColumns
        : readColumns(schema.columns);
  }

  const componentKey = readString(node.componentKey);
  if (!visualGridComponentKeys.has(componentKey)) return [];

  const props = isRecord(node.props) ? node.props : {};
  const gridOptions = isRecord(props.gridOptions) ? props.gridOptions : {};
  const propColumns = readColumns(props.columns);
  return propColumns.length ? propColumns : readColumns(gridOptions.columns);
}

function isGridNode(value: unknown) {
  return (
    isRecord(value) &&
    (value.kind === 'grid' || visualGridComponentKeys.has(readString(value.componentKey)))
  );
}

function isActionColumn(column: Record<string, unknown>) {
  const slots = isRecord(column.slots) ? column.slots : {};
  const type = readString(column.type).toLowerCase();
  return slots.default === 'actions' || type === 'action' || type === 'actions';
}

function addColumnOptions(
  options: Map<string, LowCodeOption>,
  columns: Record<string, unknown>[],
) {
  columns.forEach((column) => {
    if (isActionColumn(column)) return;

    const field = readString(column.field);
    if (!field) return;

    const title = readString(column.title) || readString(column.label) || field;
    const label = title === field ? field : `${title} (${field})`;
    const existing = options.get(field);

    if (!existing) {
      options.set(field, { label, value: field });
    } else if (existing.label === field && label !== field) {
      existing.label = label;
    }
  });
}

function visitPageData(
  value: unknown,
  options: Map<string, LowCodeOption>,
  visited: WeakSet<object>,
) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitPageData(item, options, visited));
    return;
  }

  if (!isRecord(value) || visited.has(value)) return;
  visited.add(value);

  addColumnOptions(options, resolveGridColumns(value));

  if (isRecord(value.pages)) {
    Object.values(value.pages).forEach((page) => visitPageData(page, options, visited));
  }

  if (isRecord(value.schema)) {
    const schema = value.schema;
    if (
      Array.isArray(schema.blocks) ||
      Array.isArray(schema.overlays) ||
      isRecord(schema.visualEditor)
    ) {
      visitPageData(schema, options, visited);
    }
  }

  if (isRecord(value.visualEditor)) {
    visitPageData(value.visualEditor, options, visited);
  }

  visitPageData(value.blocks, options, visited);
  visitPageData(value.overlays, options, visited);

  if (Array.isArray(value.tabs)) {
    value.tabs.forEach((tab) => {
      if (isRecord(tab)) visitPageData(tab.blocks, options, visited);
    });
  }

  const props = isRecord(value.props) ? value.props : {};
  const slots = isRecord(props.slots) ? props.slots : {};
  Object.values(slots).forEach((slot) => {
    if (isRecord(slot)) visitPageData(slot.children, options, visited);
  });
  visitPageData(props.overlays, options, visited);
}

export function collectPageTableFieldOptions(pageData: unknown): LowCodeOption[] {
  const options = new Map<string, LowCodeOption>();
  visitPageData(pageData, options, new WeakSet());
  return [...options.values()];
}

function findMainGrid(value: unknown, visited = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    const directGrid = value.find(isGridNode);
    if (directGrid) return directGrid;

    for (const item of value) {
      const grid = findMainGrid(item, visited);
      if (grid) return grid;
    }
    return undefined;
  }

  if (!isRecord(value) || visited.has(value)) return undefined;
  visited.add(value);

  if (isGridNode(value)) {
    return value;
  }

  const candidates = [
    value.blocks,
    ...(Array.isArray(value.tabs)
      ? value.tabs.map((tab) => (isRecord(tab) ? tab.blocks : undefined))
      : []),
    isRecord(value.schema) ? value.schema : undefined,
    isRecord(value.visualEditor) ? value.visualEditor : undefined,
  ];

  for (const candidate of candidates) {
    const grid = findMainGrid(candidate, visited);
    if (grid) return grid;
  }

  if (isRecord(value.pages)) {
    return findMainGrid(Object.values(value.pages), visited);
  }

  const props = isRecord(value.props) ? value.props : {};
  const slots = isRecord(props.slots) ? props.slots : {};
  return findMainGrid(
    Object.values(slots).map((slot) => (isRecord(slot) ? slot.children : undefined)),
    visited,
  );
}

function collectMainGridFieldOptions(pageData: unknown) {
  const grid = findMainGrid(pageData);
  if (!isRecord(grid)) return [];

  const options = new Map<string, LowCodeOption>();
  addColumnOptions(options, resolveGridColumns(grid));
  return [...options.values()];
}

export function mergeTableFieldOptions(
  ...optionGroups: ReadonlyArray<readonly LowCodeOption[]>
) {
  const options = new Map<string, LowCodeOption>();

  optionGroups.flat().forEach((option) => {
    const field = readString(option.value);
    if (!field) return;

    const label = readString(option.label) || field;
    const existing = options.get(field);
    if (!existing) {
      options.set(field, { label, value: field });
    } else if (existing.label === field && label !== field) {
      existing.label = label;
    }
  });

  return [...options.values()];
}

function readPageSchema(pageData: unknown): LowCodePageSchema | undefined {
  if (!isRecord(pageData)) return undefined;
  if (isRecord(pageData.schema)) return pageData.schema as LowCodePageSchema;
  if (Array.isArray(pageData.blocks)) return pageData as LowCodePageSchema;
  return undefined;
}

function collectGridSourceKeys(value: unknown) {
  const keys: string[] = [];
  const visited = new WeakSet<object>();

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isRecord(node) || visited.has(node)) return;
    visited.add(node);

    if (isGridNode(node)) {
      const props = isRecord(node.props) ? node.props : {};
      const sourceKey = readString(node.sourceKey ?? props.sourceKey);
      if (sourceKey) keys.push(sourceKey);
    }

    visit(node.blocks);
    visit(node.overlays);
    if (Array.isArray(node.tabs)) {
      node.tabs.forEach((tab) => {
        if (isRecord(tab)) visit(tab.blocks);
      });
    }
  };

  visit(value);
  return [...new Set(keys)];
}

function resolveMainDataSource(pageData: unknown): LowCodePageDataSource | undefined {
  const schema = readPageSchema(pageData);
  if (!schema || !isRecord(schema.dataSources)) return undefined;

  const dataSources = schema.dataSources as Record<string, LowCodePageDataSource>;
  const mainGrid = findMainGrid(schema);
  const mainSourceKey = isRecord(mainGrid)
    ? readString(
        mainGrid.sourceKey ??
          (isRecord(mainGrid.props) ? mainGrid.props.sourceKey : undefined),
      )
    : '';
  const sourceKeys = [mainSourceKey, ...collectGridSourceKeys(schema)].filter(Boolean);
  for (const key of sourceKeys) {
    if (isRecord(dataSources[key])) return dataSources[key];
  }

  return Object.values(dataSources).find((source) => {
    if (!isRecord(source)) return false;
    const postData = readPostData(source.postData);
    return Boolean(
      readString(source.entityCode ?? source.entity_code) ||
        readString(source.tableName ?? source.table_name) ||
        readString(postData.entityCode ?? postData.entity_code) ||
        readString(postData.tableName ?? postData.table_name),
    );
  });
}

type MainTableSource = {
  entityCode: string;
  tableName: string;
};

function resolveMainTableSource(pageData: unknown): MainTableSource {
  const source = resolveMainDataSource(pageData);
  const postData = readPostData(source?.postData);
  const mainGrid = findMainGrid(readPageSchema(pageData) ?? pageData);
  const gridProps = isRecord(mainGrid) && isRecord(mainGrid.props) ? mainGrid.props : {};
  const gridPostData = readPostData(
    gridProps.postDataJson ??
      gridProps.postData ??
      (isRecord(mainGrid) ? mainGrid.postDataJson ?? mainGrid.postData : undefined),
  );

  return {
    entityCode: readString(
      source?.entityCode ??
        source?.entity_code ??
        postData.entityCode ??
        postData.entity_code ??
        gridProps.entityCode ??
        gridProps.entity_code ??
        gridPostData.entityCode ??
        gridPostData.entity_code,
    ),
    tableName: readString(
      source?.tableName ??
        source?.table_name ??
        postData.tableName ??
        postData.table_name ??
        gridProps.tableName ??
        gridProps.table_name ??
        gridPostData.tableName ??
        gridPostData.table_name,
    ),
  };
}

function splitTableName(value: string) {
  const parts = value.split('.').filter(Boolean);
  return {
    schemaName: parts.length > 1 ? parts[parts.length - 2] : 'public',
    tableName: parts[parts.length - 1] ?? '',
  };
}

function tableMatchesSource(table: Record<string, unknown>, source: MainTableSource) {
  const tableCode = readString(table.code);
  const tableName = readString(table.table_name ?? table.tableName);
  const schemaName = readString(table.schema_name ?? table.schemaName, 'public');
  const fullName = readString(table.full_name ?? table.fullName) || `${schemaName}.${tableName}`;
  const target = splitTableName(source.tableName);

  return Boolean(
    (source.entityCode && (tableCode === source.entityCode || tableName === source.entityCode)) ||
      (source.tableName &&
        (fullName === source.tableName ||
          tableName === source.tableName ||
          (tableName === target.tableName && schemaName === target.schemaName))),
  );
}

function metadataColumnsToOptions(value: unknown): LowCodeOption[] {
  return readColumns(value)
    .filter((column) => readString(column.storage_kind, 'physical') !== 'virtual')
    .map((column) => {
      const field = readString(column.column_name ?? column.name);
      const title =
        readString(column.label ?? column.title ?? column.comment) || field;
      return field
        ? {
            label: title === field ? field : `${title} (${field})`,
            value: field,
          }
        : null;
    })
    .filter((option): option is { label: string; value: string } => Boolean(option));
}

async function loadMainTableMetadataOptions(
  serviceApi: Pick<LowCodeHostServiceApi, 'invoke'>,
  pageData: unknown,
) {
  const source = resolveMainTableSource(pageData);
  if (!source.entityCode && !source.tableName) return [];

  let resolvedTableName = source.tableName;
  if (!resolvedTableName && source.entityCode) {
    try {
      const tableOptions = await serviceApi.invoke<unknown[]>(
        'lowcode',
        'listTablePageOptions',
        {},
      );
      const tableOption = Array.isArray(tableOptions)
        ? tableOptions
            .filter(isRecord)
            .find(
              (candidate) =>
                readString(candidate.entityCode ?? candidate.entity_code) ===
                source.entityCode,
            )
        : undefined;
      resolvedTableName = readString(
        tableOption?.tableName ?? tableOption?.table_name ?? tableOption?.value,
      );
    } catch {
      // Entity-design metadata below can also resolve an entity code.
    }
  }

  if (resolvedTableName) {
    try {
      const columns = await serviceApi.invoke<unknown[]>('lowcode', 'listTableColumns', {
        tableName: resolvedTableName,
      });
      const tableOptions = metadataColumnsToOptions(columns);
      if (tableOptions.length) return tableOptions;
    } catch {
      // Continue with entity/view metadata for deployments without this endpoint.
    }
  }

  try {
    const graph = await serviceApi.invoke<Record<string, unknown>>(
      'entityDesign',
      'listDesign',
      {},
    );
    const tables = Array.isArray(graph?.tables) ? graph.tables.filter(isRecord) : [];
    const table = tables.find((candidate) =>
      tableMatchesSource(candidate, { ...source, tableName: resolvedTableName }),
    );
    const entityOptions = mergeTableFieldOptions(
      metadataColumnsToOptions(table?.columns),
      metadataColumnsToOptions(table?.physical_columns ?? table?.physicalColumns),
    );
    if (entityOptions.length) return entityOptions;

    resolvedTableName =
      resolvedTableName || readString(table?.full_name ?? table?.fullName);
  } catch {
    // A low-code page designer may not have entity-design permissions.
  }

  if (!resolvedTableName) return [];

  const target = splitTableName(resolvedTableName);
  try {
    const views = await serviceApi.invoke<unknown[]>('entityDesign', 'listViews', {
      schema_name: target.schemaName,
      view_name: target.tableName,
    });
    const view = Array.isArray(views) ? views.find(isRecord) : undefined;
    if (view) {
      const columns = await serviceApi.invoke<unknown[]>(
        'entityDesign',
        'listViewColumns',
        { id: readString(view.id), schema_name: target.schemaName, view_name: target.tableName },
      );
      const viewOptions = metadataColumnsToOptions(columns);
      if (viewOptions.length) return viewOptions;
    }
  } catch {
    // Fall back to the low-code schema metadata endpoint below.
  }

  const metadataSchema = await serviceApi.invoke<LowCodePageSchema>(
    'lowcode',
    'generateTableListPageSchema',
    { tableName: resolvedTableName },
  );
  return collectPageTableFieldOptions(metadataSchema);
}

export async function loadFormDesignerTableFieldOptions(
  serviceApi: Pick<LowCodeHostServiceApi, 'invoke'>,
  currentPage: Pick<LowCodePageRecord, 'id' | 'schema'>,
) {
  const localOptions = collectPageTableFieldOptions(currentPage);
  const parentPages = await serviceApi.invoke<LowCodePageRecord[]>('lowcode', 'listItems', {
    tableName: 'lowcode_pages',
    filters: { edit_page_id: currentPage.id },
    limit: 1,
  });
  const parentPage = Array.isArray(parentPages) ? parentPages[0] : undefined;
  if (!parentPage) return localOptions;

  const parentOptions = collectPageTableFieldOptions(parentPage);
  const mainGridOptions = collectMainGridFieldOptions(parentPage);
  if (mainGridOptions.length) {
    return mergeTableFieldOptions(localOptions, parentOptions);
  }

  const metadataOptions = await loadMainTableMetadataOptions(serviceApi, parentPage);
  return mergeTableFieldOptions(localOptions, parentOptions, metadataOptions);
}
