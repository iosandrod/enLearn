import type {
  LowCodeField,
  LowCodeFormSchema,
  LowCodeFormLayoutNode,
  LowCodeGridColumn,
  LowCodeGridFormatter,
  LowCodeOption,
  LowCodePageDataSource,
} from '../../types/lowcode';
import type { VisualEditorBlockData, VisualEditorModelValue } from '../../visual-editor/visual-editor.utils';
import type { VisualBlockProps } from './types';
import { normalizeVxeColumnType } from '../../utils/lowcode';

const componentMap: Record<string, LowCodeField['component']> = {
  input: 'vxe-input',
  picker: 'vxe-select',
  select: 'vxe-select',
  switch: 'vxe-switch',
  checkbox: 'vxe-checkbox-group',
  radio: 'vxe-radio-group',
  stepper: 'lc-stepper',
  rate: 'lc-rate',
  slider: 'lc-slider',
  'vxe-input': 'vxe-input',
  'vxe-textarea': 'vxe-textarea',
  'vxe-select': 'vxe-select',
  'vxe-switch': 'vxe-switch',
  'vxe-password-input': 'vxe-password-input',
  'vxe-checkbox-group': 'vxe-checkbox-group',
  'vxe-radio-group': 'vxe-radio-group',
  'vxe-tree-select': 'vxe-tree-select',
  'lc-json-editor': 'lc-json-editor',
  'lc-monaco-editor': 'lc-monaco-editor',
  'lc-number-input': 'lc-number-input',
  'lc-stepper': 'lc-stepper',
  'lc-rate': 'lc-rate',
  'lc-slider': 'lc-slider',
  'array-table': 'lc-array-table',
  'lc-array-table': 'lc-array-table',
  'lc-sub-form': 'lc-sub-form',
  'sub-form': 'lc-sub-form',
};

export function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return fallback;
}

export function readNumber(value: unknown, fallback?: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function readDimension(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && String(parsed) === trimmed ? parsed : trimmed;
  }
  return undefined;
}

export function readJsonObject(value: unknown, fallback: Record<string, unknown> = {}) {
  if (isPlainRecord(value)) return cloneJson(value);
  if (typeof value !== 'string' || !value.trim()) return fallback;

  try {
    const parsed = JSON.parse(value);
    return isPlainRecord(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function readJsonArray<T = unknown>(value: unknown) {
  if (Array.isArray(value)) return cloneJson(value) as T[];
  if (typeof value !== 'string' || !value.trim()) return undefined;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : undefined;
  } catch {
    return undefined;
  }
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeRows(value: unknown) {
  return Array.isArray(value) ? value.filter(isPlainRecord) : [];
}

export function readLowCodeFormSchema(value: unknown): LowCodeFormSchema | undefined {
  if (!isPlainRecord(value) || !Array.isArray(value.fields)) return undefined;

  return {
    ...(cloneJson(value) as LowCodeFormSchema),
    fields: normalizeRows(value.fields).map((field) => cloneJson(field) as LowCodeField),
    layout: Array.isArray(value.layout)
      ? (cloneJson(value.layout) as LowCodeFormLayoutNode[])
      : undefined,
    actions: Array.isArray(value.actions)
      ? (cloneJson(value.actions) as LowCodeFormSchema['actions'])
      : [],
  };
}

export function createLowCodeFormSchema(
  fields: unknown,
  designerModel?: unknown,
  fallbackSchema?: unknown,
): LowCodeFormSchema {
  const preservedSchema = readLowCodeFormSchema(fallbackSchema);
  const preservedByField = new Map(
    (preservedSchema?.fields ?? []).map((field) => [field.field, field]),
  );
  const normalizedFields = normalizeRows(fields)
    .map(normalizeField)
    .filter(isDefined)
    .map((field) => {
      const preserved = preservedByField.get(field.field);
      if (!preserved) return field;
      const requiredRules = field.rules?.filter((rule) => rule.required === true) ?? [];
      const unrelatedRules = preserved.rules?.filter((rule) => rule.required !== true) ?? [];
      const rules = [...unrelatedRules, ...requiredRules];
      const merged: LowCodeField = {
        ...cloneJson(preserved),
        ...field,
        ...(rules.length ? { rules } : {}),
      };
      if (!rules.length) delete merged.rules;
      return merged;
    });
  const layout = readFormDesignerLayout(designerModel);

  return {
    ...(preservedSchema ?? {}),
    fields: normalizedFields,
    ...(layout ? { layout } : {}),
    actions: preservedSchema?.actions ?? [],
  };
}

const defaultArrayTableColumns = [
  { field: 'name', title: '名称', minWidth: 120, placeholder: '请输入名称' },
  { field: 'quantity', title: '数量', width: 88, placeholder: '0' },
  { field: 'remark', title: '备注', minWidth: 140, placeholder: '备注' },
];

function normalizeArrayTableColumns(value: unknown) {
  const rows = normalizeRows(value);
  const sourceRows = rows.length ? rows : defaultArrayTableColumns;

  return sourceRows.map((column, index) => {
    const field = readString(column.field, `field${index + 1}`);
    const title = readString(column.title, field);
    const component = readString(column.component);
    const width = readDimension(column.width);
    const minWidth = readDimension(column.minWidth);
    const optionsCode = readString(column.optionsCode);
    const options = Array.isArray(column.options)
      ? cloneJson(column.options)
      : readJsonArray<LowCodeOption>(column.optionsJson);
    const props = {
      ...(isPlainRecord(column.props) ? cloneJson(column.props) : {}),
      ...readJsonObject(column.propsJson, {}),
    };

    return {
      field,
      title,
      ...(component ? { component } : {}),
      ...(width ? { width } : {}),
      ...(minWidth ? { minWidth } : {}),
      ...(readString(column.placeholder) ? { placeholder: readString(column.placeholder) } : {}),
      ...(typeof column.defaultValue !== 'undefined'
        ? { defaultValue: cloneJson(column.defaultValue) }
        : {}),
      ...(optionsCode ? { optionsCode } : {}),
      ...(options?.length ? { options } : {}),
      ...(Object.keys(props).length ? { props } : {}),
    };
  });
}

function normalizeArrayTableProps(rawProps: Record<string, unknown>) {
  const rowConfig = isPlainRecord(rawProps.rowConfig) ? cloneJson(rawProps.rowConfig) : {};
  const keyField = readString(rowConfig.keyField, readString(rawProps.rowKey, '__rowKey'));
  const { rowKey: _rowKey, rowConfig: _rowConfig, ...restProps } = rawProps;

  return {
    ...restProps,
    columns: normalizeArrayTableColumns(rawProps.columns),
    toolbarButtons: Array.isArray(rawProps.toolbarButtons)
      ? cloneJson(rawProps.toolbarButtons)
      : [
          {
            code: 'add',
            label: '新增行',
            command: 'add',
            status: 'primary',
          },
        ],
    rowConfig: {
      ...rowConfig,
      keyField,
    },
    ...(isPlainRecord(rawProps.defaultRow)
      ? { defaultRow: cloneJson(rawProps.defaultRow) }
      : {}),
  };
}

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function normalizeField(row: Record<string, unknown>): LowCodeField | null {
  const field = readString(row.field);
  const label = readString(row.label, field);
  if (!field || !label) return null;

  const componentName = readString(row.component, 'vxe-input');
  const component = componentMap[componentName] ?? 'vxe-input';
  const options = readJsonArray<LowCodeOption>(row.optionsJson);
  const optionsCode = readString(row.optionsCode);
  const optionsSourceKey = readString(row.optionsSourceKey);
  const optionLabel = readString(row.optionLabel);
  const optionValue = readString(row.optionValue);
  const optionChildren = readString(row.optionChildren);
  const optionProps = {
    ...(isPlainRecord(row.optionProps) ? cloneJson(row.optionProps) : {}),
    ...(optionLabel ? { label: optionLabel } : {}),
    ...(optionValue ? { value: optionValue } : {}),
    ...(optionChildren ? { children: optionChildren } : {}),
  };
  const required = readBoolean(row.required, false);
  const defaultValueType = readString(row.defaultValueType);
  const defaultValue = row.defaultValue;
  const defaultValueProcedure = readString(row.defaultValueProcedure);
  const validationScript = readString(row.validationScript);
  const validationMessage = readString(row.validationMessage);
  const placeholder = readString(row.placeholder);
  const help = readString(row.help);
  const span = readNumber(row.span);
  const rawProps = {
    ...(isPlainRecord(row.props) ? cloneJson(row.props) : {}),
    ...readJsonObject(row.propsJson, {}),
  };
  const onChange = readString(rawProps.onChange);
  delete rawProps.onChange;
  const updateScript = readString(row.updateScript, onChange);
  const props: Record<string, unknown> = {
    ...rawProps,
    ...(placeholder ? { placeholder, clearable: true } : {}),
  };

  if (component === 'lc-sub-form') {
    const subFormSchema = readLowCodeFormSchema(rawProps.schema);
    props.schema = subFormSchema &&
      isPlainRecord(rawProps.schema) &&
      Array.isArray(rawProps.schema.actions)
      ? subFormSchema
      : undefined;
    delete props.fields;
    delete props.columns;
    delete props.layout;
    delete props.actions;
    delete props.formDesignerModel;
    delete props.subFormDesignerModel;
  }

  if (component === 'lc-array-table') {
    Object.assign(props, normalizeArrayTableProps(rawProps));
  }

  return {
    field,
    label,
    component,
    ...(Object.keys(props).length ? { props } : {}),
    ...(options ? { options } : {}),
    ...(optionsCode ? { optionsCode } : {}),
    ...(optionsSourceKey ? { optionsSourceKey } : {}),
    ...(Object.keys(optionProps).length ? { optionProps } : {}),
    ...(help ? { help } : {}),
    ...(span ? { span } : {}),
    ...(required
      ? { rules: [{ required: true, message: `${label}不能为空` }] }
      : {}),
    ...(defaultValueType === 'function' && typeof defaultValue !== 'undefined'
      ? { defaultValueType: 'function', defaultValue: cloneJson(defaultValue) }
      : {}),
    ...(defaultValueType === 'procedure' && defaultValueProcedure
      ? { defaultValueType: 'procedure', defaultValueProcedure }
      : {}),
    ...(updateScript ? { updateScript } : {}),
    ...(validationScript ? { validationScript } : {}),
    ...(validationMessage ? { validationMessage } : {}),
  };
}

function cloneJson<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

export function normalizeColumn(row: Record<string, unknown>): LowCodeGridColumn | null {
  const field = readString(row.field);
  const rawType = readString(row.type);
  const type = normalizeVxeColumnType(rawType);
  const title = readString(row.title, field || rawType);
  if (!field && !title && !rawType) return null;

  const formatter = normalizeColumnFormatter(row.formatter);
  const width = readDimension(row.width);
  const minWidth = readDimension(row.minWidth);
  const maxWidth = readDimension(row.maxWidth);
  const fixed = readColumnFixed(row.fixed);
  const align = readColumnAlign(row.align);
  const headerAlign = readColumnAlign(row.headerAlign);
  const footerAlign = readColumnAlign(row.footerAlign);
  const showOverflow = readColumnOverflow(row.showOverflow);
  const showHeaderOverflow = readColumnOverflow(row.showHeaderOverflow);
  const showFooterOverflow = readColumnOverflow(row.showFooterOverflow);
  const filters = readColumnJsonArray(row.filters);
  const cellRender = readColumnJsonObject(row.cellRender);
  const editRender = readColumnJsonObject(row.editRender);
  const params = readColumnJsonObject(row.params);

  return {
    ...(field ? { field } : {}),
    title,
    ...(type ? { type } : {}),
    ...(width ? { width } : {}),
    ...(minWidth ? { minWidth } : {}),
    ...(maxWidth ? { maxWidth } : {}),
    ...(fixed ? { fixed } : {}),
    ...(align ? { align } : {}),
    ...(headerAlign ? { headerAlign } : {}),
    ...(footerAlign ? { footerAlign } : {}),
    ...(typeof row.sortable !== 'undefined' ? { sortable: readBoolean(row.sortable) } : {}),
    ...(typeof row.treeNode !== 'undefined' ? { treeNode: readBoolean(row.treeNode) } : {}),
    ...(typeof row.resizable !== 'undefined' ? { resizable: readBoolean(row.resizable) } : {}),
    ...(typeof row.visible !== 'undefined' ? { visible: readBoolean(row.visible, true) } : {}),
    ...(typeof showOverflow !== 'undefined' ? { showOverflow } : {}),
    ...(typeof showHeaderOverflow !== 'undefined' ? { showHeaderOverflow } : {}),
    ...(typeof showFooterOverflow !== 'undefined' ? { showFooterOverflow } : {}),
    ...(typeof formatter !== 'undefined' ? { formatter } : {}),
    ...(filters ? { filters } : {}),
    ...(Object.keys(cellRender).length ? { cellRender } : {}),
    ...(Object.keys(editRender).length ? { editRender } : {}),
    ...(Object.keys(params).length ? { params } : {}),
  };
}

function readColumnFixed(value: unknown) {
  const fixed = readString(value);
  return fixed === 'left' || fixed === 'right' ? fixed : undefined;
}

function readColumnAlign(value: unknown) {
  const align = readString(value);
  return align === 'left' || align === 'center' || align === 'right' ? align : undefined;
}

function readColumnOverflow(value: unknown) {
  if (typeof value === 'boolean') return value;

  const overflow = readString(value);
  return overflow === 'ellipsis' || overflow === 'title' || overflow === 'tooltip'
    ? overflow
    : undefined;
}

function normalizeColumnFormatter(value: unknown) {
  if (isPlainRecord(value) || typeof value === 'function') {
    return value as LowCodeGridColumn['formatter'];
  }

  const textValue = readString(value);
  if (!textValue) return undefined;

  const parsed = readJsonObject(textValue, {});
  return Object.keys(parsed).length ? (parsed as LowCodeGridFormatter) : textValue;
}

function readColumnJsonObject(value: unknown) {
  if (isPlainRecord(value)) return value;
  return readJsonObject(value, {});
}

function readColumnJsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  return readJsonArray(value);
}

export function toBlockId(value: unknown, fallback: string) {
  return readString(value, fallback)
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/^-+|-+$/g, '') || fallback;
}

export function isVisualEditorModel(value: unknown): value is VisualEditorModelValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { pages?: unknown }).pages === 'object' &&
    (value as { pages?: unknown }).pages !== null
  );
}

export function toTabsSlotKey(value: string, index: number) {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
  return `tab_${normalized || index + 1}`;
}

export function readVisualBlockProps(block: VisualEditorBlockData): VisualBlockProps {
  return isPlainRecord(block.props) ? block.props : {};
}

export function createFormDataSource(
  key: string,
  props: VisualBlockProps,
  autoLoad = false
): LowCodePageDataSource | undefined {
  if (!key) return undefined;

  const configured = isPlainRecord(props.dataSource) ? props.dataSource : {};
  const configuredPostData = readJsonObject(configured.postData, {});
  const postData = {
    ...configuredPostData,
    ...readJsonObject(props.postDataJson, {}),
  };
  const serviceName = readString(props.serviceName, readString(configured.serviceName, 'admin'));
  const serviceMethod = readString(
    props.serviceMethod,
    readString(configured.serviceMethod, readString(props.saveMethod, readString(configured.saveMethod, 'save'))),
  );
  const saveMethod = readString(props.saveMethod, readString(configured.saveMethod));
  const deleteMethod = readString(props.deleteMethod, readString(configured.deleteMethod));
  const entityCode = readString(
    props.entityCode,
    readString(configured.entityCode, readString(postData.entityCode ?? postData.entity_code)),
  );
  const tableName = readString(
    props.tableName,
    readString(
      configured.tableName,
      readString(postData.tableName ?? postData.table_name) ||
        (entityCode === 'users' ? 'profiles' : entityCode),
    ),
  );
  const viewName = readString(props.viewName, readString(configured.viewName));
  const sourceType = readString(props.sourceType, readString(configured.sourceType));
  const loadAfterSourceKeys = Array.isArray(configured.loadAfterSourceKeys)
    ? configured.loadAfterSourceKeys.filter(
        (item): item is string => typeof item === 'string' && Boolean(item.trim()),
      )
    : undefined;

  return {
    key,
    label: readString(props.title, readString(configured.label, key)),
    ...(sourceType === 'custom' || sourceType === 'table' || sourceType === 'view' ? { sourceType } : {}),
    serviceName,
    serviceMethod,
    ...(saveMethod ? { saveMethod } : {}),
    ...(deleteMethod ? { deleteMethod } : {}),
    ...(entityCode ? { entityCode } : {}),
    ...(tableName ? { tableName } : {}),
    ...(viewName ? { viewName } : {}),
    ...(Object.keys(postData).length ? { postData } : {}),
    ...(loadAfterSourceKeys?.length ? { loadAfterSourceKeys } : {}),
    autoLoad: typeof configured.autoLoad === 'boolean' ? configured.autoLoad : autoLoad,
  };
}

function isDesignerFieldBlock(block: VisualEditorBlockData) {
  return [
    'input',
    'picker',
    'switch',
    'radio',
    'checkbox',
    'array-table',
    'sub-form',
  ].includes(block.componentKey);
}

function normalizeSlotItems(slots: unknown) {
  if (!isPlainRecord(slots)) return [];

  return Object.values(slots).filter(
    (slot): slot is Record<string, unknown> =>
      isPlainRecord(slot) && Array.isArray(slot.children)
  );
}

function convertDesignedBlockToLayoutNode(
  block: VisualEditorBlockData
): LowCodeFormLayoutNode | null {
  if (isDesignerFieldBlock(block)) {
    const field = readString(block.props?.name);
    return field ? { kind: 'field', field } : null;
  }

  if (block.componentKey === 'layout') {
    const columns = normalizeSlotItems(block.props?.slots)
      .map((slot) => ({
        span: readNumber(slot.span),
        blocks: convertDesignedBlocksToLayout(slot.children as VisualEditorBlockData[]),
      }));

    return columns.some((column) => column.blocks.length > 0)
      ? {
          kind: 'row',
          gutter: readNumber(block.props?.gutter),
          columns,
        }
      : null;
  }

  if (block.componentKey === 'vxe-tabs') {
    const props = isPlainRecord(block.props) ? block.props : {};
    const panes = normalizeRows(props.panes);
    const slots = isPlainRecord(props.slots) ? props.slots : {};
    const usedSlotKeys = new Set<string>();
    const tabs = panes.map((pane, index) => {
      const key = readString(pane.name, `tab${index + 1}`);
      let slotKey = toTabsSlotKey(key, index);

      if (usedSlotKeys.has(slotKey)) {
        slotKey = `${slotKey}_${index + 1}`;
      }
      usedSlotKeys.add(slotKey);

      const rawSlot = slots[slotKey];
      const slot = isPlainRecord(rawSlot) ? rawSlot : {};

      return {
        key,
        label: readString(pane.title, `页签 ${index + 1}`),
        blocks: convertDesignedBlocksToLayout(
          Array.isArray(slot.children) ? slot.children as VisualEditorBlockData[] : []
        ),
      };
    });

    return tabs.length
      ? {
          kind: 'tabs',
          defaultKey: readString(props.modelValue, tabs[0]?.key),
          tabs,
        }
      : null;
  }

  const nestedBlocks = normalizeSlotItems(block.props?.slots).flatMap((slot) =>
    convertDesignedBlocksToLayout(slot.children as VisualEditorBlockData[])
  );

  return nestedBlocks.length ? { kind: 'stack', blocks: nestedBlocks } : null;
}

function convertDesignedBlocksToLayout(blocks: VisualEditorBlockData[] = []) {
  return blocks
    .map((block) => convertDesignedBlockToLayoutNode(block))
    .filter(Boolean) as LowCodeFormLayoutNode[];
}

export function readFormDesignerLayout(value: unknown) {
  if (!isVisualEditorModel(value)) return undefined;

  const blocks = value.pages?.['/']?.blocks;
  if (!Array.isArray(blocks)) return undefined;

  const layout = convertDesignedBlocksToLayout(blocks);
  return layout.length ? layout : undefined;
}
