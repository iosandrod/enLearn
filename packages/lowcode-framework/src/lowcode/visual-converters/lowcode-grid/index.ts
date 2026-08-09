import type {
  LowCodeGridRowAction,
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodeRuntimeDirective,
} from '../../../types/lowcode';
import type { VisualToLowCodeConverter } from '../types';
import {
  isDefined,
  isPlainRecord,
  normalizeColumn,
  normalizeRows,
  readBoolean,
  readJsonObject,
  readJsonArray,
  readString,
  readVisualBlockProps,
  toBlockId,
} from '../helpers';

function normalizeGridOptions(value: unknown) {
  return isPlainRecord(value) ? value : {};
}

const vxeGridOptionKeys = [
  'border',
  'stripe',
  'showOverflow',
  'showHeaderOverflow',
  'showFooterOverflow',
  'height',
  'mobileDisplay',
  'rowHeight',
  'headerHeight',
  'overscanRowCount',
  'overscanColumnCount',
  'maxHeight',
  'size',
  'loading',
  'round',
  'showHeader',
  'showFooter',
  'autoResize',
  'syncResize',
  'rowConfig',
  'columnConfig',
  'sortConfig',
  'filterConfig',
  'pagerConfig',
  'toolbarConfig',
  'proxyConfig',
  'editConfig',
  'checkboxConfig',
  'radioConfig',
  'treeConfig',
  'expandConfig',
] as const;

function normalizeVisualGridProps(props: Record<string, unknown>) {
  const legacyOptions = normalizeGridOptions(props.gridOptions);
  const gridProps: Record<string, unknown> = { ...legacyOptions };

  vxeGridOptionKeys.forEach((key) => {
    if (typeof props[key] !== 'undefined') {
      gridProps[key] = props[key];
    }
  });

  gridProps.columns = props.columns ?? legacyOptions.columns ?? [];

  return gridProps;
}

function toRuntimeGridOptions(gridProps: Record<string, unknown>) {
  const { columns: _columns, data: _data, gridOptions: _gridOptions, ...options } = gridProps;
  return options;
}

type GridTableType = 'custom' | 'table' | 'view';

function normalizeGridTableType(value: unknown): GridTableType | '' {
  const tableType = readString(value);
  return tableType === 'table' || tableType === 'view' || tableType === 'custom'
    ? tableType
    : '';
}

function resolveGridSourceAssociation(
  props: Record<string, unknown>,
  postData: Record<string, unknown>,
) {
  const explicitTableName = readString(props.tableName);
  const explicitViewName = readString(props.viewName);
  const postDataTableName = readString(postData.tableName ?? postData.table_name);
  const entityCode = readString(
    props.entityCode,
    readString(postData.entityCode ?? postData.entity_code),
  );
  const requestedType = normalizeGridTableType(props.tableType);
  const tableType: GridTableType = requestedType || (
    explicitViewName
      ? 'view'
      : explicitTableName || postDataTableName || entityCode
        ? 'table'
        : 'custom'
  );
  const tableName = tableType === 'table'
    ? explicitTableName || postDataTableName || (entityCode === 'users' ? 'profiles' : entityCode)
    : '';
  const viewName = tableType === 'view'
    ? explicitViewName || postDataTableName
    : '';
  const targetName = tableName || viewName;
  const normalizedPostData = { ...postData };

  if (tableType !== 'custom') {
    delete normalizedPostData.tableName;
    delete normalizedPostData.table_name;
    delete normalizedPostData.entityCode;
    delete normalizedPostData.entity_code;
    delete normalizedPostData.viewName;
    delete normalizedPostData.view_name;
    if (targetName) delete normalizedPostData.resource;
    if (targetName) normalizedPostData.tableName = targetName;
  }

  return { tableType, tableName, viewName, targetName, postData: normalizedPostData };
}

function normalizeRuntimeDirectives(value: unknown): LowCodeRuntimeDirective[] {
  const rows = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? readJsonArray<LowCodeRuntimeDirective>(value) ?? []
      : [];

  return rows.filter(
    (item): item is LowCodeRuntimeDirective =>
      isPlainRecord(item) && typeof item.type === 'string' && item.type.trim().length > 0,
  );
}

function normalizeGridEvents(value: unknown) {
  const events: Record<string, LowCodeRuntimeDirective[]> = {};
  const eventNames: Record<string, string> = {};
  const rows = Array.isArray(value) ? value.filter(isPlainRecord) : [];

  rows.forEach((row) => {
    const key = readString(row.key);
    if (!key || !readBoolean(row.enabled, false)) return;

    events[key] = normalizeRuntimeDirectives(row.directivesJson ?? row.directives);

    const eventName = readString(row.eventName);
    if (eventName) {
      eventNames[key] = eventName;
    }
  });

  return { events, eventNames };
}

function normalizeActionStatus(value: unknown): LowCodeGridRowAction['status'] {
  const status = readString(value);
  return ['primary', 'success', 'warning', 'danger', 'info'].includes(status)
    ? (status as LowCodeGridRowAction['status'])
    : undefined;
}

function normalizeGridRowActions(value: unknown) {
  return normalizeRows(value)
    .map((row, index) => {
      const code = readString(row.code, `row_action_${index + 1}`);
      const label = readString(row.label, code);
      if (!code || !label) return null;

      const status = normalizeActionStatus(row.status);
      const icon = readString(row.icon);
      const eventName = readString(row.eventName);
      const directives = normalizeRuntimeDirectives(row.directivesJson ?? row.directives);

      return {
        code,
        label,
        ...(status ? { status } : {}),
        ...(icon ? { icon } : {}),
        ...(eventName ? { eventName } : {}),
        ...(readBoolean(row.disabled, false) ? { disabled: true } : {}),
        ...(readBoolean(row.plain, false) ? { plain: true } : {}),
        ...(readBoolean(row.text, false) ? { text: true } : {}),
        ...(directives.length ? { directives } : {}),
      } as LowCodeGridRowAction;
    })
    .filter(Boolean) as LowCodeGridRowAction[];
}

const converter: VisualToLowCodeConverter = {
  type: 'lowcode-grid',
  componentKey: 'lowcode-grid',
  order: 30,
  defaultProps: {
    blockId: 'records-grid',
    title: '数据列表',
    tableType: 'table',
    tableName: 'profiles',
    viewName: '',
    sourceKey: 'records',
    serviceName: 'admin',
    serviceMethod: 'listItems',
    postDataJson: '{\n  "tableName": "profiles"\n}',
    showRowActions: true,
    columns: [],
    border: true,
    stripe: true,
    showOverflow: true,
    height: 360,
    gridEvents: [],
    rowActions: [],
  },
  validate(block) {
    const props = readVisualBlockProps(block);
    const gridProps = normalizeVisualGridProps(props);
    return normalizeRows(gridProps.columns).length ? [] : ['grid requires at least one column'];
  },
  toRuntimeBlock(block, context) {
    const props = readVisualBlockProps(block);
    const gridProps = normalizeVisualGridProps(props);
    const sourceKey = readString(props.sourceKey, 'records');
    const serviceName = readString(props.serviceName, 'admin');
    const serviceMethod = readString(props.serviceMethod, 'listItems');
    const saveMethod = readString(props.saveMethod);
    const deleteMethod = readString(props.deleteMethod);
    const association = resolveGridSourceAssociation(
      props,
      readJsonObject(props.postDataJson, {}),
    );
    const columns = normalizeRows(gridProps.columns).map(normalizeColumn).filter(isDefined);
    const showRowActions = readBoolean(props.showRowActions, true);
    const rowActions = normalizeGridRowActions(props.rowActions);
    const gridOptions = toRuntimeGridOptions(gridProps);
    const rowConfig = isPlainRecord(gridOptions.rowConfig) ? gridOptions.rowConfig : {};
    const columnConfig = isPlainRecord(gridOptions.columnConfig) ? gridOptions.columnConfig : {};
    const { events, eventNames } = normalizeGridEvents(props.gridEvents);
    const rowKeyField = readString(
      rowConfig.keyField,
      columns.find((column) => Boolean(column.field))?.field ?? 'id',
    );

    const dataSource: LowCodePageDataSource = {
      key: sourceKey,
      label: readString(props.title, sourceKey),
      sourceType: association.tableType,
      serviceName,
      serviceMethod,
      ...(saveMethod ? { saveMethod } : {}),
      ...(deleteMethod ? { deleteMethod } : {}),
      ...(association.targetName ? { tableName: association.targetName } : {}),
      ...(association.viewName ? { viewName: association.viewName } : {}),
      ...(Object.keys(association.postData).length ? { postData: association.postData } : {}),
      autoLoad: true,
    };
    context.dataSources[sourceKey] = dataSource;

    return {
      id: toBlockId(props.blockId, block._vid),
      kind: 'grid',
      title: readString(props.title, 'Records'),
      sourceKey,
      tableType: association.tableType,
      tableName: association.tableName,
      viewName: association.viewName,
      schema: {
        title: readString(props.title, 'Records'),
        grid: {
          border: true,
          stripe: true,
          showOverflow: true,
          ...gridOptions,
          rowConfig: {
            ...rowConfig,
            keyField: rowKeyField,
          },
          ...(Object.keys(columnConfig).length
            ? {
                columnConfig,
              }
            : {}),
          columns: [
            ...columns,
            ...(showRowActions || rowActions.length
              ? [
                  {
                    title: '操作',
                    width: 180,
                    fixed: 'right' as const,
                    slots: { default: 'actions' },
                  },
                ]
              : []),
          ],
        },
        rowActions: rowActions.length
          ? {
              edit: false,
              delete: false,
              actions: rowActions,
            }
          : showRowActions
            ? {
                edit: true,
                editLabel: '编辑',
                delete: Boolean(deleteMethod),
                deleteLabel: '删除',
              }
            : undefined,
        ...(Object.keys(events).length ? { events } : {}),
        ...(Object.keys(eventNames).length ? { eventNames } : {}),
      },
    } as LowCodePageBlock;
  },
};

export default converter;
