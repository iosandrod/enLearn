import type {
  LowCodePageBlock,
  LowCodePageGridBlock,
  LowCodePageRecord,
} from '../types/lowcode';
import type { LowCodeRuntimeBlockUpdate } from './block-editor';
import { cloneRuntimeValue, isRecord, readString } from './renderer-value-utils';

const VISUAL_GRID_OPTION_KEYS = [
  'border', 'stripe', 'showOverflow', 'showHeaderOverflow', 'showFooterOverflow',
  'height', 'minHeight', 'maxHeight', 'mobileDisplay', 'rowHeight', 'headerHeight',
  'overscanRowCount', 'overscanColumnCount', 'size', 'loading', 'round',
  'showHeader', 'showFooter', 'autoResize', 'syncResize', 'rowConfig',
  'columnConfig', 'sortConfig', 'filterConfig', 'pagerConfig', 'toolbarConfig',
  'proxyConfig', 'editConfig', 'checkboxConfig', 'radioConfig', 'treeConfig',
  'expandConfig',
] as const;

/** Converts runtime blocks to the visual designer's persisted prop model. */
export class RuntimeBlockMapper {
  constructor(private readonly getPage: () => LowCodePageRecord) {}

  readonly updateVisualBlocks = (
    value: unknown,
    targetBlock: LowCodePageBlock,
    update: LowCodeRuntimeBlockUpdate,
  ) => {
    if (!Array.isArray(value)) return;

    value.forEach((candidate) => {
      if (!isRecord(candidate)) return;

      const visualProps = isRecord(candidate.props) ? candidate.props : {};
      if (candidate.componentKey === 'lowcode-button-group' && visualProps.blockId === update.blockId) {
        const changes = update.changes;
        const actions = Array.isArray(changes.actions) ? changes.actions : [];
        visualProps.blockId = changes.id ?? visualProps.blockId;
        visualProps.title = changes.title ?? '';
        visualProps.description = changes.description ?? '';
        visualProps.align = changes.align ?? 'left';
        visualProps.gap = changes.gap ?? 8;
        visualProps.buttons = actions.map(this.runtimeButtonToVisualButton);
        candidate.props = visualProps;
      }

      if (
        (targetBlock.kind === 'form' || targetBlock.kind === 'searchForm') &&
        visualProps.blockId === update.blockId &&
        ['form', 'lowcode-edit-form', 'lowcode-search-form'].includes(String(candidate.componentKey))
      ) {
        const schema = isRecord(update.changes.schema) ? update.changes.schema : {};
        const fields = Array.isArray(schema.fields) ? schema.fields : [];
        visualProps.fields = fields.map(this.runtimeFormFieldToVisualField);
        visualProps.initialValuesJson = JSON.stringify(
          isRecord(update.changes.initialValues)
            ? update.changes.initialValues
            : targetBlock.initialValues ?? {},
        );
        visualProps.formDesignerModel = cloneRuntimeValue(
          'formDesignerModel' in update.changes ? update.changes.formDesignerModel : null,
        );
        visualProps.formDesignerUpdatedAt = update.changes.formDesignerUpdatedAt ?? Date.now();
        candidate.props = visualProps;
      }

      if (
        targetBlock.kind === 'grid' &&
        visualProps.blockId === update.blockId &&
        candidate.componentKey === 'lowcode-grid'
      ) {
        this.syncRuntimeGridToVisualProps(visualProps, targetBlock, update);
        candidate.props = visualProps;
      }

      const slots = isRecord(visualProps.slots) ? visualProps.slots : {};
      Object.values(slots).forEach((slot) => {
        if (isRecord(slot)) this.updateVisualBlocks(slot.children, targetBlock, update);
      });
      this.updateVisualBlocks(visualProps.overlays, targetBlock, update);
    });
  };

  private readonly isRuntimeGridActionColumn = (value: unknown) =>
    isRecord(value) && isRecord(value.slots) && value.slots.default === 'actions';

  private readonly runtimeGridEventsToVisualRows = (events: unknown, eventNames: unknown) => {
    const eventRecord = isRecord(events) ? events : {};
    const eventNameRecord = isRecord(eventNames) ? eventNames : {};
    const keys = Array.from(new Set([
      ...Object.keys(eventRecord),
      ...Object.keys(eventNameRecord),
    ]));

    return keys.map((key) => ({
      key,
      enabled: true,
      eventName: readString(eventNameRecord[key]),
      directivesJson: JSON.stringify(Array.isArray(eventRecord[key]) ? eventRecord[key] : []),
    }));
  };

  private readonly syncRuntimeGridToVisualProps = (
    visualProps: Record<string, unknown>,
    targetBlock: LowCodePageGridBlock,
    update: LowCodeRuntimeBlockUpdate,
  ) => {
    const schema = isRecord(update.changes.schema) ? update.changes.schema : targetBlock.schema;
    const grid = isRecord(schema.grid) ? schema.grid : {};
    const columns = Array.isArray(grid.columns) ? grid.columns : [];
    const sourceKey = readString(update.changes.sourceKey, targetBlock.sourceKey ?? 'records');
    const source = update.dataSources?.[sourceKey] ?? this.getPage().schema.dataSources?.[sourceKey];
    const rowActions = isRecord(schema.rowActions) ? schema.rowActions : {};

    VISUAL_GRID_OPTION_KEYS.forEach((key) => delete visualProps[key]);
    Object.entries(grid).forEach(([key, value]) => {
      if (key !== 'columns') visualProps[key] = cloneRuntimeValue(value);
    });

    visualProps.blockId = update.changes.id ?? visualProps.blockId;
    visualProps.title = update.changes.title ?? schema.title ?? '';
    const requestedTableType = readString(
      update.changes.tableType,
      readString(targetBlock.tableType, 'default'),
    );
    const tableType = requestedTableType === 'normal'
      ? 'default'
      : requestedTableType === 'main' || requestedTableType === 'detail'
        ? requestedTableType
        : 'default';
    const sourceType = readString(
      update.changes.sourceType,
      readString(targetBlock.sourceType, readString(source?.sourceType, 'custom')),
    );
    const sourceTarget = readString(source?.tableName ?? source?.table_name);
    visualProps.tableType = tableType;
    visualProps.sourceType = sourceType;
    visualProps.tableName = sourceType === 'view'
      ? ''
      : readString(
          update.changes.tableName,
          readString(targetBlock.tableName, sourceType === 'table' ? sourceTarget : ''),
        );
    visualProps.viewName = sourceType === 'view'
      ? readString(
          update.changes.viewName,
          readString(targetBlock.viewName, readString(source?.viewName, sourceTarget)),
        )
      : '';
    visualProps.sourceKey = sourceKey;
    visualProps.serviceName = source?.serviceName ?? '';
    visualProps.serviceMethod = source?.serviceMethod ?? '';
    visualProps.saveMethod = source?.saveMethod ?? '';
    visualProps.deleteMethod = source?.deleteMethod ?? '';
    visualProps.postDataJson = JSON.stringify(source?.postData ?? {}, null, 2);
    visualProps.showRowActions = Boolean(
      rowActions.edit === true ||
      rowActions.delete === true ||
      (Array.isArray(rowActions.actions) && rowActions.actions.length) ||
      columns.some(this.isRuntimeGridActionColumn),
    );
    visualProps.columns = cloneRuntimeValue(
      columns.filter((column) => !this.isRuntimeGridActionColumn(column)),
    );
    visualProps.gridEvents = this.runtimeGridEventsToVisualRows(schema.events, schema.eventNames);
    visualProps.gridDesignerUpdatedAt = update.changes.gridDesignerUpdatedAt ?? Date.now();
  };

  private readonly runtimeFormFieldToVisualField = (value: unknown): Record<string, unknown> => {
    const field = isRecord(value) ? value : {};
    const props = isRecord(field.props) ? cloneRuntimeValue(field.props) : {};
    const rules = Array.isArray(field.rules) ? field.rules.filter(isRecord) : [];
    const optionProps = isRecord(field.optionProps) ? field.optionProps : {};

    return {
      field: readString(field.field),
      label: readString(field.label),
      component: readString(field.component, 'vxe-input'),
      placeholder: readString(props.placeholder),
      required: rules.some((rule) => rule.required === true),
      defaultValueType: readString(field.defaultValueType),
      defaultValueScript: readString(field.defaultValueScript),
      defaultValueProcedure: readString(field.defaultValueProcedure),
      updateScript: readString(field.updateScript, readString(props.onChange)),
      validationScript: readString(field.validationScript),
      validationMessage: readString(field.validationMessage),
      span: field.span ?? '',
      help: readString(field.help),
      optionsCode: readString(field.optionsCode),
      optionsSourceKey: readString(field.optionsSourceKey),
      optionLabel: readString(optionProps.label),
      optionValue: readString(optionProps.value),
      optionChildren: readString(optionProps.children),
      optionsJson: JSON.stringify(Array.isArray(field.options) ? field.options : []),
      propsJson: JSON.stringify(props),
      ...(Object.keys(props).length ? { props } : {}),
    };
  };

  private readonly runtimeButtonToVisualButton = (value: unknown): Record<string, unknown> => {
    const action = isRecord(value) ? value : {};
    const { children, directives, ...button } = action;
    return {
      ...cloneRuntimeValue(button),
      directivesJson: JSON.stringify(Array.isArray(directives) ? directives : []),
      children: Array.isArray(children)
        ? children.map(this.runtimeButtonToVisualButton)
        : [],
    };
  };
}
