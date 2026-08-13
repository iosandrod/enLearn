import type {
  LowCodePageDataSource,
  LowCodePageGridBlock,
} from '../../types/lowcode';
import type { LowCodePageRuntimeGridState } from '../page-runtime';
import type {
  LowCodeNodeActionDataSourceRequest,
  LowCodeNodeActionRuntimeContext,
} from '../node-action-runtime';
import type {
  LowCodeNodeActionMethodDefinition,
  LowCodeNodeTypeDefinition,
} from './index';
import { isLowCodeEditPageReadonly } from '../edit-page-mode';

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

function readLoadDataOptions(options: RuntimeRecord): GridLoadDataOptions {
  return {
    ...(isRecord(options.filters) ? { filters: options.filters } : {}),
    ...(isRecord(options.postData) ? { postData: options.postData } : {}),
    ...(readString(options.mainGrid) ? { mainGrid: readString(options.mainGrid) } : {}),
    ...(isRecord(options.filterMap)
      ? { filterMap: options.filterMap as Record<string, string> }
      : {}),
  };
}

function readRowsValue(value: unknown) {
  if (Array.isArray(value)) return value.filter(isRecord).map((row) => cloneValue(row));
  if (isRecord(value) && Array.isArray(value.rows)) {
    return value.rows.filter(isRecord).map((row) => cloneValue(row));
  }
  return [];
}

function createReloadGridValue(currentValue: unknown, rows: RuntimeRecord[]) {
  return isRecord(currentValue) && Array.isArray(currentValue.rows)
    ? { ...currentValue, rows }
    : rows;
}

function getGridRowKey(block: LowCodePageGridBlock) {
  const rowConfig = isRecord(block.schema.grid.rowConfig) ? block.schema.grid.rowConfig : {};
  return readString(rowConfig.keyField, 'id');
}

function assertGridBlock(
  context: LowCodeNodeActionRuntimeContext,
  operation: string,
) {
  if (context.block.kind !== 'grid') {
    throw new Error(`节点 "${context.block.id}" 不是表格，无法${operation}。`);
  }
  return context.block;
}

function assertGridWritable(context: LowCodeNodeActionRuntimeContext) {
  if (!isLowCodeEditPageReadonly(context.editPageMode)) return;
  throw new Error('当前页面为只读状态，请先点击修改。');
}

function readGridRows(
  context: LowCodeNodeActionRuntimeContext,
  block: LowCodePageGridBlock,
) {
  const value = block.sourceKey
    ? context.getSourceValue(block.sourceKey)
    : context.grids[block.id]?.rows;
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.rows)) {
    return value.rows.filter(isRecord);
  }
  return [];
}

function replaceGridRows(
  context: LowCodeNodeActionRuntimeContext,
  block: LowCodePageGridBlock,
  rows: RuntimeRecord[],
) {
  if (block.sourceKey) {
    const sourceValue = context.getSourceValue(block.sourceKey);
    context.setSource(
      block.sourceKey,
      isRecord(sourceValue) && Array.isArray(sourceValue.rows)
        ? { ...sourceValue, rows }
        : rows,
    );
    context.syncGridStates();
  } else {
    context.setGridRows(block.id, rows, { rowKey: getGridRowKey(block) });
  }
}

function findGridRowIndex(
  rows: RuntimeRecord[],
  candidate: RuntimeRecord,
  rowKey: string,
) {
  const keyValue = candidate[rowKey];
  if (typeof keyValue !== 'undefined' && keyValue !== null) {
    const keyedIndex = rows.findIndex((row) => Object.is(row[rowKey], keyValue));
    if (keyedIndex >= 0) return keyedIndex;
  }
  return rows.findIndex((row) => row === candidate);
}

function findGridRow(
  rows: RuntimeRecord[],
  candidate: RuntimeRecord,
  rowKey: string,
) {
  const index = findGridRowIndex(rows, candidate, rowKey);
  return index >= 0 ? rows[index] : null;
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
      runtimeContext.setSource(sourceKey, value, { resetGridBaseline: true });
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

export function executeGridReloadDataNodeAction(
  context: LowCodeNodeActionRuntimeContext,
) {
  const block = assertGridBlock(context, '覆盖数据');

  const rows = readRowsValue(context.options.data);
  if (block.sourceKey) {
    context.setSource(
      block.sourceKey,
      createReloadGridValue(context.getSourceValue(block.sourceKey), rows),
    );
    context.syncGridStates();
  } else {
    replaceGridRows(context, block, rows);
  }
  return rows;
}

export function executeGridGetChangesNodeAction(
  context: LowCodeNodeActionRuntimeContext,
) {
  const block = assertGridBlock(context, '读取变更');
  return context.getGridChanges(block.id);
}

export function executeGridValidateNodeAction(
  context: LowCodeNodeActionRuntimeContext,
) {
  const block = assertGridBlock(context, '校验数据');
  return context.validateGrid(block.id);
}

export async function executeGridAddRowNodeAction(
  context: LowCodeNodeActionRuntimeContext,
) {
  const block = assertGridBlock(context, '新增行');
  assertGridWritable(context);
  const input = context.options.data;
  if (typeof input !== 'undefined' && !isRecord(input)) {
    throw new Error('Grid addRow 的 data 必须是对象。');
  }

  const rows = readGridRows(context, block);
  const row = cloneValue(isRecord(input) ? input : {});
  const rowKey = getGridRowKey(block);
  replaceGridRows(context, block, [...rows, row]);

  const runtimeRows = context.grids[block.id]?.rows ?? [];
  const currentRow = findGridRow(runtimeRows, row, rowKey);
  await context.setGridCurrentRow(block.id, currentRow);
  return cloneValue(currentRow ?? runtimeRows.at(-1) ?? row);
}

export async function executeGridDeleteCurrentRowNodeAction(
  context: LowCodeNodeActionRuntimeContext,
) {
  const block = assertGridBlock(context, '删除当前行');
  assertGridWritable(context);
  const grid = context.grids[block.id];
  const currentRow = currentGridRow(grid);
  if (!currentRow) return null;

  const rows = readGridRows(context, block);
  const rowKey = grid?.rowKey || getGridRowKey(block);
  const rowIndex = findGridRowIndex(rows, currentRow, rowKey);
  if (rowIndex < 0) return null;

  const deletedRow = cloneValue(rows[rowIndex]);
  replaceGridRows(context, block, [
    ...rows.slice(0, rowIndex),
    ...rows.slice(rowIndex + 1),
  ]);
  await context.setGridCurrentRow(block.id, null);
  return deletedRow;
}

function createLoadDataInsertText(nodeId: string) {
  return `const rows = await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "loadData",\n  filters: {},\n});`;
}

function createReloadDataInsertText(nodeId: string) {
  return `await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "reloadData",\n  data: [],\n});`;
}

function createValidateInsertText(nodeId: string) {
  return `const valid = await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "validate",\n});`;
}

function createGetChangesInsertText(nodeId: string) {
  return `const changes = await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "getChanges",\n});`;
}

function createAddRowInsertText(nodeId: string) {
  return `const row = await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "addRow",\n  data: {},\n});`;
}

function createDeleteCurrentRowInsertText(nodeId: string) {
  return `const deleted = await this.executeAction({\n  node: ${JSON.stringify(nodeId)},\n  method: "deleteCurrentRow",\n});`;
}

export const gridLoadDataNodeAction: LowCodeNodeActionMethodDefinition = {
  method: 'loadData',
  label: '获取表格数据',
  description: '按表格类型获取数据；主表使用查询条件，明细表使用主表当前行生成关联条件。',
  executor: 'grid.loadData',
  dataSourceLoader: true,
  parameters: [
    {
      name: 'filters',
      type: 'object',
      description: '附加过滤条件，会覆盖数据源中的同名过滤条件。',
    },
    {
      name: 'postData',
      type: 'object',
      description: '附加请求参数。',
    },
    {
      name: 'mainGrid',
      type: 'string',
      description: '明细表关联的主表节点 ID；未填写时自动查找 tableType=main 的表格。',
    },
    {
      name: 'filterMap',
      type: 'Record<string, string>',
      description: '明细字段到主表字段的映射，例如 { order_id: "id" }。',
    },
  ],
  returns: '返回服务端获取的数据；缺少明细关联主表行时返回空数组。',
  createInsertText: createLoadDataInsertText,
  execute: executeGridLoadDataNodeAction,
};

export const gridReloadDataNodeAction: LowCodeNodeActionMethodDefinition = {
  method: 'reloadData',
  label: '覆盖表格数据',
  description: '使用 data 数组覆盖表格当前绑定的数据。',
  executor: 'grid.reloadData',
  parameters: [
    {
      name: 'data',
      type: 'object[] | { rows: object[] }',
      required: true,
      description: '新的表格行数据。',
    },
  ],
  returns: '返回规范化后的表格行数组。',
  createInsertText: createReloadDataInsertText,
  execute: executeGridReloadDataNodeAction,
};

export const gridGetChangesNodeAction: LowCodeNodeActionMethodDefinition = {
  method: 'getChanges',
  label: '获取表格变更',
  description: '按行主键比较加载基线与当前数据，返回新增、更新和删除的行。',
  executor: 'grid.getChanges',
  parameters: [],
  returns: '返回 { created, updated, deleted } 变更集。',
  createInsertText: createGetChangesInsertText,
  execute: executeGridGetChangesNodeAction,
};

export const gridValidateNodeAction: LowCodeNodeActionMethodDefinition = {
  method: 'validate',
  label: '校验表格数据',
  description: '使用表格 editRules 校验当前全部行，并显示单元格校验状态。',
  executor: 'grid.validate',
  parameters: [],
  returns: '校验通过返回 true，否则返回 false。',
  createInsertText: createValidateInsertText,
  execute: executeGridValidateNodeAction,
};

export const gridAddRowNodeAction: LowCodeNodeActionMethodDefinition = {
  method: 'addRow',
  label: '新增一行数据',
  description: '在当前表格数据末尾追加一行，并将新增行设为当前行。',
  executor: 'grid.addRow',
  parameters: [
    {
      name: 'data',
      type: 'object',
      description: '新行的初始数据；省略时使用空对象。',
    },
  ],
  returns: '返回新增行数据的深拷贝。',
  createInsertText: createAddRowInsertText,
  execute: executeGridAddRowNodeAction,
};

export const gridDeleteCurrentRowNodeAction: LowCodeNodeActionMethodDefinition = {
  method: 'deleteCurrentRow',
  label: '删除当前行数据',
  description: '从表格当前绑定数据中删除当前行；没有当前行时不修改数据。',
  executor: 'grid.deleteCurrentRow',
  parameters: [],
  returns: '返回被删除行数据的深拷贝；没有当前行时返回 null。',
  createInsertText: createDeleteCurrentRowInsertText,
  execute: executeGridDeleteCurrentRowNodeAction,
};

export const gridNodeActionDefinition = {
  kind: 'grid',
  label: '表格',
  icon: 'ri-table-2',
  methods: {
    loadData: gridLoadDataNodeAction,
    reloadData: gridReloadDataNodeAction,
    getChanges: gridGetChangesNodeAction,
    validate: gridValidateNodeAction,
    addRow: gridAddRowNodeAction,
    deleteCurrentRow: gridDeleteCurrentRowNodeAction,
  },
} satisfies LowCodeNodeTypeDefinition;
