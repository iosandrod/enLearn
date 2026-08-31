import type {
  LowCodeGridColumn,
  LowCodeGridSchema,
  LowCodePageDataSource,
  LowCodePageGridBlock,
  LowCodeRuntimeDirective,
} from '../../../types/lowcode';
import type { LowCodeRuntimeBlockEditor } from '../../../runtime/block-editor';
import { collectLowCodePageDataSources } from '../../../runtime/page-data-sources';
import type { LowCodeHostServiceApi } from '../../../core/host';
import type {
  GridDesignerEvent,
  GridDesignerResult,
} from '../../../visual-editor/components/grid-designer/grid-designer.service';

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

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value || '{}');
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isActionColumn(column: LowCodeGridColumn) {
  return isRecord(column.slots) && column.slots.default === 'actions';
}

function hasRuntimeRowActions(block: LowCodePageGridBlock) {
  const columns = block.schema.grid.columns ?? [];
  return columns.some(isActionColumn) || Boolean(
    block.schema.rowActions?.edit === true ||
      block.schema.rowActions?.delete === true ||
      block.schema.rowActions?.actions?.length,
  );
}

function createDesignerPostData(source?: LowCodePageDataSource) {
  const postData = cloneValue(source?.postData ?? {});

  if (source?.tableName && !readString(postData.tableName ?? postData.table_name)) {
    postData.tableName = source.tableName;
  }
  if (source?.entityCode && !readString(postData.entityCode ?? postData.entity_code)) {
    postData.entityCode = source.entityCode;
  }

  return postData;
}

function readGridTableType(
  block: LowCodePageGridBlock,
  source?: LowCodePageDataSource,
) {
  const value = readString(block.tableType);
  if (value === 'normal') return 'default';
  if (value === 'main' || value === 'detail' || value === 'default') return value;
  return 'default';
}

function readGridSourceType(
  block: LowCodePageGridBlock,
  source?: LowCodePageDataSource,
) {
  const value = readString(block.sourceType, readString(source?.sourceType));
  if (value === 'table' || value === 'view' || value === 'custom') return value;
  const legacyTableType = readString(block.tableType);
  if (legacyTableType === 'table' || legacyTableType === 'view' || legacyTableType === 'custom') {
    return legacyTableType;
  }
  if (readString(block.viewName, readString(source?.viewName))) return 'view';
  if (readString(block.tableName, readString(source?.tableName))) return 'table';
  return 'custom';
}

function createDesignerEvents(block: LowCodePageGridBlock): GridDesignerEvent[] {
  const events = block.schema.events ?? {};
  const eventNames = block.schema.eventNames ?? {};
  const keys = Array.from(new Set([...Object.keys(events), ...Object.keys(eventNames)]));

  return keys.map((key) => ({
    key,
    vxeName: key,
    nativeName: key,
    label: key,
    enabled: true,
    eventName: readString(eventNames[key]),
    directives: cloneValue(events[key] ?? []),
    directivesJson: stringifyJson(events[key] ?? []),
  }));
}

function createRuntimeEvents(
  block: LowCodePageGridBlock,
  gridEvents: GridDesignerEvent[],
) {
  const events = cloneValue(block.schema.events ?? {});
  const eventNames = cloneValue(block.schema.eventNames ?? {});

  gridEvents.forEach((event) => {
    const key = readString(event.key);
    if (!key) return;

    delete events[key];
    delete eventNames[key];

    if (!event.enabled) return;

    events[key] = Array.isArray(event.directives)
      ? cloneValue(event.directives as LowCodeRuntimeDirective[])
      : [];

    const eventName = readString(event.eventName);
    if (eventName) eventNames[key] = eventName;
  });

  return { events, eventNames };
}

function createRuntimeGridSchema(
  block: LowCodePageGridBlock,
  result: GridDesignerResult,
) {
  const originalColumns = block.schema.grid.columns ?? [];
  const actionColumns = originalColumns.filter(isActionColumn);
  const designedColumns = cloneValue(result.columns) as LowCodeGridColumn[];
  const existingRowActions = cloneValue(block.schema.rowActions);
  const hasEnabledRowAction = Boolean(
    existingRowActions?.edit === true ||
      existingRowActions?.delete === true ||
      existingRowActions?.actions?.length,
  );
  const hasExplicitRowActionConfig = Boolean(existingRowActions);
  const shouldRenderActionColumn = result.business.showRowActions && (
    actionColumns.length > 0 ||
      hasEnabledRowAction ||
      !hasExplicitRowActionConfig ||
      Boolean(readString(result.business.deleteMethod))
  );
  const columns = shouldRenderActionColumn
    ? [
        ...designedColumns,
        ...(actionColumns.length
          ? cloneValue(actionColumns)
          : [
              {
                title: '操作',
                width: 180,
                fixed: 'right' as const,
                slots: { default: 'actions' },
              },
            ]),
      ]
    : designedColumns;
  const { columns: _columns, data: _data, ...gridOptions } = result.gridOptions;
  const { events, eventNames } = createRuntimeEvents(block, result.gridEvents);
  const schema: LowCodeGridSchema = {
    ...cloneValue(block.schema),
    title: result.business.title,
    grid: {
      ...cloneValue(gridOptions),
      columns,
    },
  };

  if (shouldRenderActionColumn && !hasEnabledRowAction) {
    schema.rowActions = {
      ...existingRowActions,
      edit: true,
      delete: Boolean(readString(result.business.deleteMethod)),
    };
  } else if (!shouldRenderActionColumn) {
    schema.rowActions = {
      ...existingRowActions,
      edit: false,
      delete: false,
      actions: [],
    };
  }

  if (Object.keys(events).length) schema.events = events;
  else delete schema.events;
  if (Object.keys(eventNames).length) schema.eventNames = eventNames;
  else delete schema.eventNames;

  schema.detailConfig = cloneValue(result.detailConfig);

  return schema;
}

function createRuntimeDataSource(
  result: GridDesignerResult,
  original?: LowCodePageDataSource,
): LowCodePageDataSource {
  const sourceKey = readString(result.business.sourceKey, original?.key ?? 'records');
  const postData = parseJsonObject(result.business.postDataJson);
  const sourceType = result.business.sourceType;
  const linkedTableName = readString(result.business.tableName);
  const linkedViewName = readString(result.business.viewName);
  const readTarget = sourceType === 'view'
    ? linkedViewName || linkedTableName
    : linkedTableName;
  if (sourceType !== 'custom') {
    delete postData.tableName;
    delete postData.table_name;
    delete postData.entityCode;
    delete postData.entity_code;
    delete postData.viewName;
    delete postData.view_name;
    if (readTarget) delete postData.resource;
    if (readTarget) postData.tableName = readTarget;
  }
  const source: LowCodePageDataSource = {
    ...cloneValue(original ?? { key: sourceKey }),
    key: sourceKey,
    label: readString(result.business.title, original?.label ?? sourceKey),
    sourceType,
    serviceName: readString(result.business.serviceName, original?.serviceName ?? 'admin'),
    serviceMethod: readString(
      result.business.serviceMethod,
      original?.serviceMethod ?? 'listItems',
    ),
    postData,
    autoLoad: original?.autoLoad ?? true,
  };

  delete source.saveMethod;
  delete source.deleteMethod;
  delete source.tableName;
  delete source.table_name;
  delete source.entityCode;
  delete source.entity_code;
  delete source.viewName;

  const saveMethod = readString(result.business.saveMethod);
  const deleteMethod = readString(result.business.deleteMethod);
  if (saveMethod) source.saveMethod = saveMethod;
  if (deleteMethod) source.deleteMethod = deleteMethod;
  if (linkedTableName && sourceType !== 'custom') source.tableName = linkedTableName;
  if (linkedViewName) source.viewName = linkedViewName;

  return source;
}

export async function openRuntimeGridDesigner(
  block: LowCodePageGridBlock,
  runtimeBlockEditor: LowCodeRuntimeBlockEditor,
  serviceApi?: LowCodeHostServiceApi,
) {
  const source = block.sourceKey
    ? runtimeBlockEditor.getDataSource?.(block.sourceKey)
    : undefined;
  const columns = (block.schema.grid.columns ?? []).filter((column) => !isActionColumn(column));
  const {
    columns: _columns,
    data: _data,
    menuConfig: _menuConfig,
    ...gridOptions
  } = block.schema.grid;
  const { $$gridDesigner } = await import(
    '../../../visual-editor/components/grid-designer/grid-designer.service'
  );
  const tableType = readGridTableType(block, source);
  const sourceType = readGridSourceType(block, source);
  const pageSchema = runtimeBlockEditor.getPageSchema?.();

  void $$gridDesigner({
    title: `${block.title || block.schema.title || '表格'}设计`,
    serviceApi,
    dataSources: pageSchema ? collectLowCodePageDataSources(pageSchema) : undefined,
    business: {
      blockId: block.id,
      title: block.title ?? block.schema.title ?? source?.label ?? '数据表格',
      tableType,
      sourceType,
      tableName: readString(block.tableName, source?.tableName),
      viewName: readString(block.viewName, source?.viewName),
      categoryField: readString(block.categoryField),
      sourceKey: block.sourceKey ?? source?.key ?? 'records',
      serviceName: source?.serviceName ?? 'admin',
      serviceMethod: source?.serviceMethod ?? 'listItems',
      saveMethod: source?.saveMethod ?? '',
      deleteMethod: source?.deleteMethod ?? '',
      postDataJson: stringifyJson(createDesignerPostData(source)),
      showRowActions: hasRuntimeRowActions(block),
    },
    detailConfig: cloneValue(block.schema.detailConfig ?? {}),
    columns: cloneValue(columns),
    gridOptions: cloneValue(gridOptions),
    gridEvents: createDesignerEvents(block),
    onConfirm: async (result) => {
      const sourceKey = readString(result.business.sourceKey, block.sourceKey ?? 'records');
      const currentSource = runtimeBlockEditor.getDataSource?.(sourceKey) ?? source;
      const dataSource = createRuntimeDataSource(result, currentSource);

      const updatedBlock = await runtimeBlockEditor.updateBlock({
        blockId: block.id,
        changes: {
          id: readString(result.business.blockId, block.id),
          title: result.business.title,
          sourceKey,
          tableType: result.business.tableType,
          sourceType: result.business.sourceType,
          tableName: readString(result.business.tableName),
          viewName: readString(result.business.viewName),
          categoryField: readString(result.business.categoryField),
          schema: createRuntimeGridSchema(block, result),
          gridDesignerUpdatedAt: Date.now(),
        },
        dataSources: {
          [sourceKey]: dataSource,
        },
      });
      Object.assign(block, cloneValue(updatedBlock));
    },
  });
}
