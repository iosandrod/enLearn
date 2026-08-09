import type {
  LowCodePageDataSource,
  LowCodePageGridBlock,
} from '../types/lowcode';
import type { LowCodePageRuntimeGridState } from './page-runtime';
import type {
  LowCodeNodeActionDataSourceRequest,
  LowCodeNodeActionRuntimeContext,
} from './node-action-runtime';

type RuntimeRecord = Record<string, unknown>;

export type GridLoadDataOptions = {
  filters?: RuntimeRecord;
  postData?: RuntimeRecord;
  mainGrid?: string;
  filterMap?: Record<string, string>;
};

export type GridLoadDataRequest = LowCodeNodeActionDataSourceRequest;

export type GridLoadDataActionContext = {
  block: LowCodePageGridBlock;
  source: LowCodePageDataSource;
  configuredPostData?: RuntimeRecord;
  options: GridLoadDataOptions;
  searchFilters: Record<string, RuntimeRecord>;
  grids: Record<string, LowCodePageRuntimeGridState>;
  gridBlocks: LowCodePageGridBlock[];
  resolveRequest(
    sourceKey: string,
    source: LowCodePageDataSource,
    postData: RuntimeRecord,
  ): GridLoadDataRequest;
  invoke(request: GridLoadDataRequest): Promise<unknown>;
  setData(value: unknown): void;
  setLoading(loading: boolean): void;
};

function isRecord(value: unknown): value is RuntimeRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean)
    : [];
}

function hasFilterValue(value: unknown) {
  if (value === undefined || value === null || value === '' || value === '__none__') {
    return false;
  }
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return hasFilterValue(value.value);
  return true;
}

function isRelationPlaceholder(value: unknown) {
  return value === '__none__' ||
    (typeof value === 'string' && /\{\{[\s\S]*?\}\}/.test(value));
}

function currentGridRow(grid?: LowCodePageRuntimeGridState) {
  return grid?.currentRow ?? grid?.selectedRows[0] ?? grid?.contextRow ?? null;
}

function findMainGrid(context: GridLoadDataActionContext) {
  const requestedId = readString(context.options.mainGrid);
  if (requestedId) {
    return context.gridBlocks.find((block) => block.id === requestedId);
  }

  return context.gridBlocks.find((block) => block.tableType === 'main');
}

function inferDetailFilterMap(
  filters: RuntimeRecord,
  requiredFilters: string[],
  mainRow: RuntimeRecord,
) {
  const relationFilterFields = Object.entries(filters)
    .filter(([, value]) => isRelationPlaceholder(value))
    .map(([field]) => field);
  const missingRequiredFields = requiredFilters.filter(
    (field) => !hasFilterValue(filters[field]) || isRelationPlaceholder(filters[field]),
  );
  const fields = [...new Set([...relationFilterFields, ...missingRequiredFields])];
  return Object.fromEntries(fields.map((detailField) => {
    const configuredValue = filters[detailField];
    const expressionField = typeof configuredValue === 'string'
      ? configuredValue.match(
          /\{\{\s*(?:(?:data|grids)\.[^.]+(?:\.currentRow)?|event\.row|row)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/,
        )?.[1] ?? ''
      : '';
    const directField = detailField in mainRow ? detailField : '';
    const conventionalField = detailField.endsWith('_id') && 'id' in mainRow ? 'id' : '';
    return [
      detailField,
      expressionField || directField || conventionalField || detailField,
    ];
  }));
}

function createMainPostData(context: GridLoadDataActionContext, postData: RuntimeRecord) {
  const sourceKey = readString(context.block.sourceKey, context.source.key);
  const filters = {
    ...(isRecord(postData.filters) ? postData.filters : {}),
    ...(sourceKey && isRecord(context.searchFilters[sourceKey])
      ? context.searchFilters[sourceKey]
      : {}),
    ...(isRecord(context.options.filters) ? context.options.filters : {}),
  };

  return {
    ...postData,
    ...(Object.keys(filters).length ? { filters } : {}),
  };
}

function createDetailPostData(context: GridLoadDataActionContext, postData: RuntimeRecord) {
  const configuredFilters = isRecord(postData.filters) ? postData.filters : {};
  const rawConfiguredFilters = isRecord(context.configuredPostData?.filters)
    ? context.configuredPostData.filters
    : configuredFilters;
  const requiredFilters = readStringList(
    postData.requiredFilters ?? postData.required_filters,
  );
  const relationCandidates = [...new Set([
    ...requiredFilters,
    ...Object.entries(rawConfiguredFilters)
      .filter(([, value]) => isRelationPlaceholder(value))
      .map(([field]) => field),
  ])];
  const mainGrid = findMainGrid(context);
  const mainRow = currentGridRow(mainGrid ? context.grids[mainGrid.id] : undefined);
  const explicitFilters = isRecord(context.options.filters) ? context.options.filters : {};
  const sourceKey = readString(context.block.sourceKey, context.source.key);
  const searchFilters = sourceKey && isRecord(context.searchFilters[sourceKey])
    ? context.searchFilters[sourceKey]
    : {};
  const configuredFilterMap: Record<string, string> = isRecord(context.options.filterMap)
    ? Object.fromEntries(
        Object.entries(context.options.filterMap)
          .map(([detailField, mainField]) => [detailField, readString(mainField)])
          .filter(([, mainField]) => Boolean(mainField)),
      ) as Record<string, string>
    : {};

  const filterMap = Object.keys(configuredFilterMap).length
    ? configuredFilterMap
    : inferDetailFilterMap(rawConfiguredFilters, requiredFilters, mainRow ?? {});
  const relationFilters = mainRow
    ? Object.fromEntries(
        Object.entries(filterMap).map(([detailField, mainField]) => [
          detailField,
          mainRow[mainField],
        ]),
      )
    : {};
  const filters = {
    ...configuredFilters,
    ...searchFilters,
    ...relationFilters,
    ...explicitFilters,
  };
  const relationFields = Object.keys(filterMap);
  const runtimeFilterFields = Object.entries({ ...searchFilters, ...explicitFilters })
    .filter(([, value]) => hasFilterValue(value) && !isRelationPlaceholder(value))
    .map(([field]) => field);
  const nextRequiredFilters = [...new Set([
    ...requiredFilters,
    ...relationFields,
    ...runtimeFilterFields,
  ])];
  const missingRequiredFilter = nextRequiredFilters.some(
    (field) => !hasFilterValue(filters[field]) || isRelationPlaceholder(filters[field]),
  );

  return {
    postData: {
      ...postData,
      filters,
      ...(nextRequiredFilters.length ? { requiredFilters: nextRequiredFilters } : {}),
    },
    // A detail grid must never fall back to an unguarded full-table request.
    skip: !nextRequiredFilters.length || missingRequiredFilter,
  };
}

export function createGridLoadDataPostData(context: GridLoadDataActionContext) {
  const basePostData = {
    ...(isRecord(context.source.postData) ? context.source.postData : {}),
    ...(isRecord(context.options.postData) ? context.options.postData : {}),
  };

  if (context.block.tableType !== 'detail') {
    return { postData: createMainPostData(context, basePostData), skip: false };
  }

  return createDetailPostData(context, basePostData);
}

export async function executeGridLoadDataAction(context: GridLoadDataActionContext) {
  const sourceKey = readString(context.block.sourceKey, context.source.key);
  const { postData, skip } = createGridLoadDataPostData(context);

  context.setLoading(true);
  try {
    if (skip) {
      context.setData([]);
      return [];
    }

    const request = context.resolveRequest(sourceKey, context.source, postData);
    if (!request.serviceName || !request.serviceMethod) {
      throw new Error(`数据源 "${sourceKey}" 未配置 serviceName 或 serviceMethod。`);
    }

    const value = await context.invoke(request);
    context.setData(value);
    return value;
  } finally {
    context.setLoading(false);
  }
}

function readLoadDataOptions(options: Record<string, unknown>): GridLoadDataOptions {
  return {
    ...(isRecord(options.filters) ? { filters: options.filters } : {}),
    ...(isRecord(options.postData) ? { postData: options.postData } : {}),
    ...(readString(options.mainGrid) ? { mainGrid: readString(options.mainGrid) } : {}),
    ...(isRecord(options.filterMap)
      ? { filterMap: options.filterMap as Record<string, string> }
      : {}),
  };
}

export async function executeGridLoadDataNodeAction(
  runtimeContext: LowCodeNodeActionRuntimeContext,
) {
  const block = runtimeContext.block;
  if (block.kind !== 'grid') {
    throw new Error(`节点 "${block.id}" 不是表格，无法获取数据。`);
  }

  const source = runtimeContext.getDataSource(block.sourceKey);
  if (!source) throw new Error(`表格 "${block.id}" 没有可用的数据源。`);

  const sourceKey = readString(block.sourceKey, source.key);
  let requestVersion = 0;
  return executeGridLoadDataAction({
    block,
    source: {
      ...source,
      postData: runtimeContext.resolveRuntimePostData(source.postData ?? {}),
    },
    configuredPostData: isRecord(source.postData) ? source.postData : {},
    options: readLoadDataOptions(runtimeContext.options),
    searchFilters: runtimeContext.searchFilters,
    grids: runtimeContext.grids,
    gridBlocks: runtimeContext.blocks.filter(
      (candidate): candidate is LowCodePageGridBlock => candidate.kind === 'grid',
    ),
    resolveRequest: (sourceKey, dataSource, postData) =>
      runtimeContext.resolveDataSourceRequest(
        sourceKey,
        dataSource,
        runtimeContext.resolveRuntimePostData(postData),
      ),
    invoke: (request) => runtimeContext.invokeDataSourceRequest(request, source),
    setData: (value) => {
      if (
        requestVersion &&
        !runtimeContext.isCurrentSourceRequest(sourceKey, requestVersion)
      ) return;
      runtimeContext.setSource(sourceKey, value);
      runtimeContext.syncGridStates();
    },
    setLoading: (loading) => {
      if (loading) {
        requestVersion = runtimeContext.beginSourceRequest(sourceKey);
        runtimeContext.setLoadingGrid(block.id, true);
        return;
      }
      const isCurrentRequest = requestVersion > 0 &&
        runtimeContext.isCurrentSourceRequest(sourceKey, requestVersion);
      if (requestVersion) {
        runtimeContext.finishSourceRequest(sourceKey, requestVersion);
      }
      if (isCurrentRequest) runtimeContext.setLoadingGrid(block.id, false);
    },
  });
}
