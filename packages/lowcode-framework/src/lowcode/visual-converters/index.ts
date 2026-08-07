import type {
  LowCodeButtonGroupAction,
  LowCodeField,
  LowCodeGridColumn,
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodePageOverlayBlock,
  LowCodePageSchema,
  LowCodeRuntimeDirective,
} from '../../types/lowcode';
import type {
  ComponentModules,
  VisualEditorBlockData,
  VisualEditorModelValue,
} from '../../visual-editor/visual-editor.utils';
import { getLowCodeBlockMaterialConverters } from '../block-materials';
import buttonGroupConverter from './lowcode-button-group';
import {
  isPlainRecord,
  readBoolean,
  readString,
  toTabsSlotKey,
} from './helpers';
import type {
  VisualToLowCodeContext,
  VisualToLowCodeConverter,
  VisualToLowCodeEntry,
} from './types';

type ConverterModule =
  | { default?: VisualToLowCodeConverter | VisualToLowCodeConverter[]; converter?: VisualToLowCodeConverter }
  | VisualToLowCodeConverter
  | VisualToLowCodeConverter[];

const converterModules = import.meta.glob<ConverterModule>('./*/index.ts', { eager: true });
const converterMap: Record<string, VisualToLowCodeConverter> = {};
const converterList: VisualToLowCodeConverter[] = [];

function normalizeModule(module: ConverterModule) {
  if (Array.isArray(module)) return module;
  if ('default' in module && module.default) {
    return Array.isArray(module.default) ? module.default : [module.default];
  }
  if ('converter' in module && module.converter) return [module.converter];
  return [module as VisualToLowCodeConverter];
}

function isConverterKey(value: string | undefined): value is string {
  return Boolean(value);
}

export function registerVisualToLowCodeConverter(converter: VisualToLowCodeConverter) {
  const keys = [
    converter.type,
    converter.componentKey,
    ...(converter.componentKeys ?? []),
  ].filter(isConverterKey);

  keys.forEach((key) => {
    converterMap[key] = converter;
  });

  const existsIndex = converterList.findIndex((item) => item.type === converter.type);
  if (existsIndex >= 0) {
    converterList.splice(existsIndex, 1, converter);
  } else {
    converterList.push(converter);
  }

  converterList.sort((prev, next) => (prev.order ?? 0) - (next.order ?? 0));
}

Object.values(converterModules).forEach((module) => {
  normalizeModule(module).forEach(registerVisualToLowCodeConverter);
});
registerVisualToLowCodeConverter(buttonGroupConverter);

getLowCodeBlockMaterialConverters().forEach(registerVisualToLowCodeConverter);

export function getVisualToLowCodeConverter(block: VisualEditorBlockData) {
  return (
    converterMap[block.componentKey] ??
    converterList.find((converter) => converter.match?.(block))
  );
}

export function convertVisualBlock(
  block: VisualEditorBlockData,
  context: VisualToLowCodeContext
) {
  const converter = getVisualToLowCodeConverter(block);
  const runtimeBlock =
    (converter?.toRuntimeBlock ?? converter?.convert)?.(block, context) ?? null;
  const fillRemaining =
    isPlainRecord(block.layout) && readBoolean(block.layout.fillRemaining, false);

  if (!runtimeBlock || !fillRemaining) {
    return runtimeBlock;
  }

  return {
    ...runtimeBlock,
    layout: {
      ...(runtimeBlock.layout ?? {}),
      fillRemaining: true,
    },
  } as LowCodePageBlock;
}

export function convertVisualBlocks(
  blocks: VisualEditorBlockData[] = [],
  dataSources: Record<string, LowCodePageDataSource>
) {
  if (!Array.isArray(blocks)) return [];

  const context: VisualToLowCodeContext = {
    dataSources,
    convertBlocks: (children = []) => convertVisualBlocks(children, dataSources),
    convertOverlays: (children = []) => convertVisualOverlayBlocks(children, dataSources),
  };

  return blocks
    .map((block) => convertVisualBlock(block, context))
    .filter(Boolean) as LowCodePageBlock[];
}

export function convertVisualOverlayBlocks(
  blocks: VisualEditorBlockData[] = [],
  dataSources: Record<string, LowCodePageDataSource>
) {
  return convertVisualBlocks(blocks, dataSources).filter(
    (block): block is LowCodePageOverlayBlock =>
      block.kind === 'modal' || block.kind === 'drawer'
  );
}

export function convertVisualEditorToLowCode({ model, currentPage }: VisualToLowCodeEntry) {
  const dataSources: Record<string, LowCodePageDataSource> = {};
  const page = model.pages[currentPage.path] ?? currentPage;
  const blocks = convertVisualBlocks(page.blocks, dataSources);
  const overlays = convertVisualOverlayBlocks(page.overlays ?? [], dataSources);

  return {
    blocks,
    overlays,
    dataSources,
  };
}

const defaultVisualStyles = {
  display: 'flex',
  justifyContent: 'flex-start',
  paddingTop: '0',
  paddingRight: '0',
  paddingLeft: '0',
  paddingBottom: '0',
  tempPadding: '0',
};

type RuntimeToVisualContext = {
  dataSources: Record<string, LowCodePageDataSource>;
  convertBlocks: (blocks?: LowCodePageBlock[], path?: string[]) => VisualEditorBlockData[];
};

function cloneJson<T>(value: T): T {
  if (typeof value === 'undefined') return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function toVisualId(value: unknown, fallback: string) {
  const raw = readString(value, fallback);
  const normalized = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
  return `vid_${normalized || fallback}`;
}

function createVisualBlock(options: {
  block: LowCodePageBlock;
  componentKey: string;
  moduleName: keyof ComponentModules;
  label: string;
  props?: Record<string, unknown>;
  path: string[];
}) {
  return {
    _vid: toVisualId(options.block.id, `${options.componentKey}_${options.path.join('_')}`),
    moduleName: options.moduleName,
    componentKey: options.componentKey,
    label: options.label,
    adjustPosition: true,
    focus: false,
    styles: { ...defaultVisualStyles },
    layout: cloneJson(options.block.layout ?? {}),
    hasResize: false,
    props: options.props ?? {},
    draggable: true,
    showStyleConfig: true,
    animations: [],
    actions: [],
    events: [],
    model: {},
  } as VisualEditorBlockData;
}

function stringifyJson(value: unknown, fallback: unknown = []) {
  if (typeof value === 'undefined') return JSON.stringify(fallback);
  return JSON.stringify(value);
}

function readDataSourceEntityCode(source?: LowCodePageDataSource) {
  return readString(source?.entityCode ?? source?.entity_code ?? source?.postData?.entityCode ?? source?.postData?.entity_code);
}

function readDataSourceTableName(source?: LowCodePageDataSource) {
  return readString(source?.tableName ?? source?.table_name ?? source?.postData?.tableName ?? source?.postData?.table_name);
}

function getDataSource(
  dataSources: Record<string, LowCodePageDataSource>,
  key: unknown,
) {
  const sourceKey = readString(key);
  return sourceKey ? dataSources[sourceKey] : undefined;
}

function runtimeFieldToVisualField(field: LowCodeField) {
  const props = isPlainRecord(field.props) ? field.props : {};
  const required = Array.isArray(field.rules)
    ? field.rules.some((rule) => rule?.required)
    : false;
  const editableProps =
    field.component === 'lc-sub-form' || field.component === 'lc-array-table'
        ? cloneJson(props)
        : undefined;
  const optionProps = isPlainRecord(field.optionProps) ? field.optionProps : {};
  const propsJson = Object.keys(props).length ? stringifyJson(props, {}) : '';

  return {
    field: field.field,
    label: field.label,
    component: field.component || 'vxe-input',
    placeholder: readString(props.placeholder),
    required,
    ...(field.span ? { span: field.span } : {}),
    ...(field.help ? { help: field.help } : {}),
    ...(field.optionsSourceKey ? { optionsSourceKey: field.optionsSourceKey } : {}),
    ...(readString(optionProps.label) ? { optionLabel: readString(optionProps.label) } : {}),
    ...(readString(optionProps.value) ? { optionValue: readString(optionProps.value) } : {}),
    ...(readString(optionProps.children)
      ? { optionChildren: readString(optionProps.children) }
      : {}),
    ...(field.options ? { optionsJson: stringifyJson(field.options) } : {}),
    ...(propsJson ? { propsJson } : {}),
    ...(editableProps && Object.keys(editableProps).length
      ? {
          props: editableProps,
        }
      : {}),
  };
}

function runtimeActionToVisualButton(action: LowCodeButtonGroupAction): Record<string, unknown> {
  return {
    code: action.code,
    label: action.label,
    type: action.type ?? 'button',
    status: action.status ?? '',
    route: action.route ?? '',
    eventName: action.eventName ?? '',
    script: action.script ?? '',
    icon: action.icon ?? '',
    mode: action.mode ?? (action.text ? 'text' : 'button'),
    prefixIcon: action.prefixIcon ?? '',
    suffixIcon: action.suffixIcon ?? '',
    round: action.round ?? false,
    circle: action.circle ?? false,
    showDropdownIcon: action.showDropdownIcon ?? true,
    disabled: action.disabled ?? false,
    directivesJson: stringifyJson(action.directives),
    children: Array.isArray(action.children)
      ? action.children.map(runtimeActionToVisualButton)
      : [],
  };
}

function isActionColumn(column: LowCodeGridColumn) {
  return isPlainRecord(column.slots) && column.slots.default === 'actions';
}

function runtimeColumnsToVisualColumns(columns: LowCodeGridColumn[] = []) {
  return cloneJson(columns.filter((column) => !isActionColumn(column)));
}

function runtimeGridOptionsToVisualOptions(grid: Record<string, unknown>) {
  const { columns: _columns, ...options } = grid;
  return cloneJson(options);
}

function runtimeGridEventsToVisualRows(
  events: unknown,
  eventNames: unknown,
) {
  const eventRecord = isPlainRecord(events)
    ? (events as Record<string, LowCodeRuntimeDirective[]>)
    : {};
  const eventNameRecord = isPlainRecord(eventNames)
    ? (eventNames as Record<string, string>)
    : {};
  const keys = Array.from(new Set([...Object.keys(eventRecord), ...Object.keys(eventNameRecord)]));

  return keys.map((key) => ({
    key,
    enabled: true,
    eventName: readString(eventNameRecord[key]),
    directivesJson: stringifyJson(eventRecord[key]),
  }));
}

function runtimeGridRowActionsToVisualRows(schema: Record<string, unknown>) {
  const rowActions = isPlainRecord(schema.rowActions) ? schema.rowActions : {};
  return Array.isArray(rowActions.actions)
    ? rowActions.actions.map((action) =>
        runtimeActionToVisualButton(action as LowCodeButtonGroupAction),
      )
    : [];
}

function hasRuntimeRowActions(schema: Record<string, unknown>, columns: LowCodeGridColumn[]) {
  const rowActions = isPlainRecord(schema.rowActions) ? schema.rowActions : null;
  if (rowActions) {
    return Boolean(
      rowActions.edit !== false ||
        rowActions.delete !== false ||
        (Array.isArray(rowActions.actions) && rowActions.actions.length),
    );
  }
  return columns.some(isActionColumn);
}

function convertRuntimeBlockToVisual(
  block: LowCodePageBlock,
  context: RuntimeToVisualContext,
  path: string[],
): VisualEditorBlockData | null {
  if (block.kind === 'buttonGroup' || block.kind === 'toolbar') {
    const actions = Array.isArray(block.actions) ? block.actions : [];
    return createVisualBlock({
      block,
      componentKey: 'lowcode-button-group',
      moduleName: 'businessComponents',
      label: '按钮组',
      path,
      props: {
        blockId: block.id,
        title: readString(block.title),
        description: readString(block.description),
        align: block.kind === 'buttonGroup' ? block.align ?? 'left' : 'left',
        gap: block.kind === 'buttonGroup' ? block.gap ?? 8 : 8,
        buttons: actions.map((action) =>
          runtimeActionToVisualButton(action as LowCodeButtonGroupAction),
        ),
      },
    });
  }

  if (block.kind === 'grid') {
    const schema: Record<string, unknown> = isPlainRecord(block.schema) ? block.schema : {};
    const grid: Record<string, unknown> = isPlainRecord(schema.grid) ? schema.grid : {};
    const columns = Array.isArray(grid.columns)
      ? (grid.columns as LowCodeGridColumn[])
      : [];
    const source = getDataSource(context.dataSources, block.sourceKey);

    return createVisualBlock({
      block,
      componentKey: 'lowcode-grid',
      moduleName: 'businessComponents',
      label: '数据表格',
      path,
      props: {
        blockId: block.id,
        title: readString(block.title, readString(schema.title, source?.label ?? '数据表格')),
        sourceKey: readString(block.sourceKey, source?.key ?? 'records'),
        serviceName: source?.serviceName ?? 'admin',
        serviceMethod: source?.serviceMethod ?? 'listItems',
        saveMethod: source?.saveMethod ?? '',
        deleteMethod: source?.deleteMethod ?? '',
        entityCode: readDataSourceEntityCode(source),
        tableName: readDataSourceTableName(source),
        postDataJson: stringifyJson(source?.postData, {}),
        showRowActions: hasRuntimeRowActions(schema, columns),
        rowActions: runtimeGridRowActionsToVisualRows(schema),
        ...runtimeGridOptionsToVisualOptions(grid),
        columns: runtimeColumnsToVisualColumns(columns),
        gridEvents: runtimeGridEventsToVisualRows(schema.events, schema.eventNames),
      },
    });
  }

  if (block.kind === 'searchForm' || block.kind === 'form') {
    const schema: Record<string, unknown> = isPlainRecord(block.schema) ? block.schema : {};
    const fields = Array.isArray(schema.fields)
      ? (schema.fields as LowCodeField[]).map(runtimeFieldToVisualField)
      : [];
    const actions = Array.isArray(schema.actions) ? schema.actions : [];
    const submitAction = actions.find((action) => action?.type === 'submit');
    const resetAction = actions.find((action) => action?.type === 'reset');
    const sourceKey =
      block.kind === 'searchForm'
        ? readString(block.targetSourceKey, 'records')
        : readString(block.sourceKey, 'record');
    const source = getDataSource(context.dataSources, sourceKey);

    return createVisualBlock({
      block,
      componentKey: block.kind === 'searchForm' ? 'lowcode-search-form' : 'form',
      moduleName: 'businessComponents',
      label: block.kind === 'searchForm' ? '查询表单' : '普通表单',
      path,
      props: {
        blockId: block.id,
        title: readString(block.title, block.kind === 'searchForm' ? '查询条件' : '普通表单'),
        sourceKey,
        submitSourceKey:
          block.kind === 'form'
            ? readString(block.submitSourceKey, sourceKey)
            : undefined,
        serviceName: source?.serviceName ?? 'admin',
        serviceMethod: source?.serviceMethod ?? '',
        saveMethod: source?.saveMethod ?? '',
        entityCode: readDataSourceEntityCode(source),
        tableName: readDataSourceTableName(source),
        postDataJson: stringifyJson(source?.postData, {}),
        initialValuesJson:
          block.kind === 'form' ? stringifyJson(block.initialValues, {}) : undefined,
        submitText: readString(submitAction?.label, '保存'),
        resetText: readString(resetAction?.label, '重置'),
        formActions:
          block.kind === 'form'
            ? actions.map((action) =>
                runtimeActionToVisualButton(action as LowCodeButtonGroupAction),
              )
            : undefined,
        formDesignerModel: cloneJson(block.formDesignerModel),
        formDesignerUpdatedAt: block.formDesignerUpdatedAt,
        fields,
      },
    });
  }

  if (block.kind === 'tabs') {
    const tabs = Array.isArray(block.tabs) ? block.tabs : [];
    const usedKeys = new Set<string>();
    const panes = tabs.map((tab, index) => ({
      title: readString(tab.label, `页签 ${index + 1}`),
      name: readString(tab.key, `tab${index + 1}`),
    }));
    const slots = tabs.reduce<Record<string, unknown>>((result, tab, index) => {
      const name = readString(tab.key, `tab${index + 1}`);
      let slotKey = toTabsSlotKey(name, index);
      if (usedKeys.has(slotKey)) {
        slotKey = `${slotKey}_${index + 1}`;
      }
      usedKeys.add(slotKey);
      result[slotKey] = {
        key: slotKey,
        label: readString(tab.label, `页签 ${index + 1}`),
        children: context.convertBlocks(tab.blocks, [...path, `tab${index}`]),
      };
      return result;
    }, {});

    return createVisualBlock({
      block,
      componentKey: 'vxe-tabs',
      moduleName: 'containerComponents',
      label: 'VXE页签容器',
      path,
      props: {
        blockId: block.id,
        title: readString(block.title),
        description: readString(block.description),
        panes,
        modelValue: readString(block.defaultKey, panes[0]?.name ?? ''),
        slots,
        type: 'default',
        position: 'top',
        width: '100%',
        height: block.layout?.fillRemaining ? '100%' : '',
        padding: true,
        showBody: true,
      },
    });
  }

  if (block.kind === 'modal') {
    return createVisualBlock({
      block,
      componentKey: 'lowcode-modal',
      moduleName: 'businessComponents',
      label: '弹框',
      path,
      props: {
        blockId: block.id,
        title: readString(block.title, '弹框'),
        description: readString(block.description),
        open: block.open === true,
        width: typeof block.width === 'undefined' ? 640 : block.width,
        slots: {
          value: '24',
          slot0: {
            key: 'slot0',
            label: '弹框内容',
            span: 24,
            children: context.convertBlocks(block.blocks, [...path, 'slot0']),
          },
        },
        overlays: context.convertBlocks(block.overlays ?? [], [...path, 'overlays']),
      },
    });
  }

  if (
    block.kind === 'container' ||
    block.kind === 'section' ||
    block.kind === 'drawer'
  ) {
    const width = block.kind === 'drawer' ? block.width : undefined;
    const placement = block.kind === 'drawer' ? block.placement : undefined;

    return createVisualBlock({
      block,
      componentKey: 'layout',
      moduleName: 'containerComponents',
      label:
        block.kind === 'drawer'
          ? '抽屉'
          : block.kind === 'section'
            ? '分区'
            : '布局容器',
      path,
      props: {
        blockId: block.id,
        runtimeKind: block.kind,
        title: readString(block.title),
        description: readString(block.description),
        open: 'open' in block ? block.open === true : false,
        panel: 'panel' in block ? block.panel === true : false,
        width: typeof width === 'undefined' ? '' : width,
        placement: placement ?? 'right',
        gutter: String(block.kind === 'container' ? block.gap ?? '' : ''),
        ...(block.kind === 'drawer'
          ? { overlays: context.convertBlocks(block.overlays ?? [], [...path, 'overlays']) }
          : {}),
        slots: {
          value: '24',
          slot0: {
            key: 'slot0',
            span: 24,
            children: context.convertBlocks(block.blocks, [...path, 'slot0']),
          },
        },
      },
    });
  }

  if (block.kind === 'text') {
    return createVisualBlock({
      block,
      componentKey: 'text',
      moduleName: 'baseWidgets',
      label: '文本',
      path,
      props: {
        text: readString(block.content, readString(block.title, '文本')),
        size: 16,
      },
    });
  }

  return null;
}

export function convertLowCodeBlocksToVisualBlocks(
  blocks: LowCodePageBlock[] = [],
  dataSources: Record<string, LowCodePageDataSource> = {},
) {
  const context: RuntimeToVisualContext = {
    dataSources,
    convertBlocks: (children = [], path = []) =>
      convertLowCodeBlocksToVisualBlocks(children, dataSources).map((child, index) => ({
        ...child,
        _vid: child._vid || toVisualId(child.componentKey, [...path, String(index)].join('_')),
      })),
  };

  return blocks
    .map((block, index) => convertRuntimeBlockToVisual(block, context, [String(index)]))
    .filter(Boolean) as VisualEditorBlockData[];
}

export function convertLowCodePageSchemaToVisualEditor(
  schema: LowCodePageSchema,
): VisualEditorModelValue {
  return {
    pages: {
      '/': {
        title: readString(schema.title, '首页'),
        path: '/',
        config: {
          bgColor: schema.config?.bgColor ?? '',
          bgImage: schema.config?.bgImage ?? '',
          keepAlive: schema.keepAlive !== false,
        },
        blocks: convertLowCodeBlocksToVisualBlocks(schema.blocks, schema.dataSources ?? {}),
        overlays: convertLowCodeBlocksToVisualBlocks(
          schema.overlays ?? [],
          schema.dataSources ?? {}
        ),
      },
    },
    models: [],
    actions: {
      fetch: {
        name: '接口请求',
        apis: [],
      },
      dialog: {
        name: '对话框',
        handlers: [],
      },
    },
  };
}

export { converterMap as visualToLowCodeConverterMap };
export type {
  VisualBlockProps,
  VisualToLowCodeContext,
  VisualToLowCodeConversionResult,
  VisualToLowCodeConverter,
  VisualToLowCodeEntry,
} from './types';
