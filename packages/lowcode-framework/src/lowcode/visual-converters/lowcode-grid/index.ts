import type {
  LowCodeGridRowAction,
  LowCodePageBlock,
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
    sourceKey: 'records',
    serviceName: 'admin',
    serviceMethod: 'listUsers',
    postDataJson: '{}',
    showRowActions: true,
    columns: [],
    gridOptions: {},
    gridEvents: [],
    rowActions: [],
  },
  validate(block) {
    const props = readVisualBlockProps(block);
    return normalizeRows(props.columns).length ? [] : ['grid requires at least one column'];
  },
  toRuntimeBlock(block, context) {
    const props = readVisualBlockProps(block);
    const sourceKey = readString(props.sourceKey, 'records');
    const serviceName = readString(props.serviceName, 'admin');
    const serviceMethod = readString(props.serviceMethod, 'listUsers');
    const saveMethod = readString(props.saveMethod);
    const deleteMethod = readString(props.deleteMethod);
    const postData = readJsonObject(props.postDataJson, {});
    const columns = normalizeRows(props.columns).map(normalizeColumn).filter(isDefined);
    const showRowActions = readBoolean(props.showRowActions, true);
    const rowActions = normalizeGridRowActions(props.rowActions);
    const gridOptions = normalizeGridOptions(props.gridOptions);
    const rowConfig = isPlainRecord(gridOptions.rowConfig) ? gridOptions.rowConfig : {};
    const columnConfig = isPlainRecord(gridOptions.columnConfig) ? gridOptions.columnConfig : {};
    const { events, eventNames } = normalizeGridEvents(props.gridEvents);
    const rowKeyField = readString(
      rowConfig.keyField,
      columns.find((column) => Boolean(column.field))?.field ?? 'id',
    );

    context.dataSources[sourceKey] = {
      key: sourceKey,
      label: readString(props.title, sourceKey),
      serviceName,
      serviceMethod,
      ...(saveMethod ? { saveMethod } : {}),
      ...(deleteMethod ? { deleteMethod } : {}),
      ...(Object.keys(postData).length ? { postData } : {}),
      autoLoad: true,
    };

    return {
      id: toBlockId(props.blockId, block._vid),
      kind: 'grid',
      title: readString(props.title, 'Records'),
      sourceKey,
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
