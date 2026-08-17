import {
  computed,
  createApp,
  defineComponent,
  getCurrentInstance,
  nextTick,
  onMounted,
  PropType,
  provide,
  reactive,
  ref,
} from 'vue';
import DesignerUI, { ElButton, ElDialog, ElMessage } from '../common/designer-ui';
import { cloneDeep } from 'lodash-es';
import VisualEditorProvider from '../../../components/VisualEditorProvider.vue';
import { visualConfig } from '../../../visual.config';
import type {
  LowCodeField,
  LowCodeFormLayoutNode,
  LowCodeOption,
  LowCodePageRecord,
  LowCodeFormSchema,
} from '../../../types/lowcode';
import type { LowCodeHostServiceApi } from '../../../core/host';
import { readFormDesignerLayout } from '../../../lowcode/visual-converters/helpers';
import {
  createNewBlock,
  type VisualEditorBlockData,
  type VisualEditorModelValue,
  type VisualEditorPage,
} from '../../visual-editor.utils';
import { defer } from '../../utils/defer';
import {
  formDesignerPageDataKey,
  formDesignerModeKey,
  formDesignerTableFieldOptionsKey,
  type FormDesignerMode,
} from '../../form-designer-context';
import {
  collectPageTableFieldOptions,
  loadFormDesignerTableFieldOptions,
  mergeTableFieldOptions,
} from '../../material-prop-forms/table-field-options';

export type FormDesignerField = {
  field: string;
  label: string;
  component: string;
  placeholder?: string;
  required?: boolean | string;
  span?: number | string;
  help?: string;
  optionsCode?: string;
  optionsJson?: string;
  propsJson?: string;
  props?: Record<string, unknown>;
};

export type FormDesignerResult = {
  fields: FormDesignerField[];
  designerModel: VisualEditorModelValue;
};

interface FormDesignerServiceOption {
  title?: string;
  mode?: FormDesignerMode;
  fields?: FormDesignerField[];
  layout?: LowCodeFormLayoutNode[];
  columns?: number;
  designerModel?: VisualEditorModelValue | null;
  pageData?: unknown;
  pageRecord?: LowCodePageRecord | null;
  serviceApi?: LowCodeHostServiceApi;
  onConfirm: (value: FormDesignerResult) => Promise<void> | void;
  onCancel?: () => void;
}

type FormProviderInstance = {
  getSnapshot: () => {
    model: VisualEditorModelValue;
    currentPath: string;
    currentPage: VisualEditorPage;
  };
};

const defaultActions: VisualEditorModelValue['actions'] = {
  fetch: {
    name: '接口请求',
    apis: [],
  },
  dialog: {
    name: '对话框',
    handlers: [],
  },
};

const runtimeToEditorComponent: Record<string, string> = {
  'vxe-input': 'input',
  'vxe-textarea': 'input',
  'vxe-password-input': 'input',
  'vxe-select': 'picker',
  'vxe-tree-select': 'picker',
  'vxe-switch': 'switch',
  'vxe-radio-group': 'radio',
  'vxe-checkbox-group': 'checkbox',
  'lc-json-editor': 'input',
  'lc-monaco-editor': 'input',
  'lc-number-input': 'input',
  'base-info': 'input',
  'lc-array-table': 'array-table',
  'lc-sub-form': 'sub-form',
};

const editorToRuntimeComponent: Record<string, string> = {
  input: 'vxe-input',
  picker: 'vxe-select',
  switch: 'vxe-switch',
  radio: 'vxe-radio-group',
  checkbox: 'vxe-checkbox-group',
  'array-table': 'lc-array-table',
  'sub-form': 'lc-sub-form',
};

const optionComponents = new Set([
  'vxe-select',
  'vxe-tree-select',
  'vxe-radio-group',
  'vxe-checkbox-group',
]);

function normalizeRequired(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase());
  }
  return false;
}

function normalizeSpan(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function readString(value: unknown, fallback = '') {
  if (Array.isArray(value)) {
    return readString(value[value.length - 1], fallback);
  }

  if (typeof value === 'string') {
    return value.trim() || fallback;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFieldName(label: string, index = 0) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  return normalized || `field_${index + 1}`;
}

function isVisualEditorModel(value: unknown): value is VisualEditorModelValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { pages?: unknown }).pages === 'object' &&
    (value as { pages?: unknown }).pages !== null
  );
}

function parseJsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonObject(value: unknown) {
  if (isRecord(value)) return cloneDeep(value);
  if (typeof value !== 'string' || !value.trim()) return undefined;

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stringifyOptions(value: unknown) {
  const options = parseJsonArray(value);
  return options?.length ? JSON.stringify(options) : '';
}

function stringifyFieldProps(value: unknown) {
  if (!isRecord(value) || !Object.keys(value).length) return '';
  return JSON.stringify(value);
}

function createDefaultField(index = 0): FormDesignerField {
  return {
    field: `field_${index + 1}`,
    label: `字段${index + 1}`,
    component: 'vxe-input',
    placeholder: '请输入',
    required: false,
    span: 1,
    help: '',
    optionsJson: '',
    propsJson: '',
  };
}

function createDefaultSubFormFields(): FormDesignerField[] {
  return [
    {
      field: 'name',
      label: '名称',
      component: 'vxe-input',
      placeholder: '请输入名称',
      required: false,
      span: 1,
      help: '',
      optionsJson: '',
      propsJson: '',
    },
    {
      field: 'remark',
      label: '备注',
      component: 'vxe-textarea',
      placeholder: '请输入备注',
      required: false,
      span: 1,
      help: '',
      optionsJson: '',
      propsJson: '',
    },
  ];
}

function createDefaultArrayTableColumns() {
  return [
    { field: 'name', title: '名称', minWidth: 120, placeholder: '请输入名称' },
    { field: 'quantity', title: '数量', width: 88, placeholder: '0' },
    { field: 'remark', title: '备注', minWidth: 140, placeholder: '备注' },
  ];
}

function normalizeArrayTableColumns(value: unknown) {
  const rows = Array.isArray(value)
    ? value.filter(isRecord).map((column) => cloneDeep(column))
    : [];

  return rows.length ? rows : createDefaultArrayTableColumns();
}

function readArrayTableProps(value: unknown) {
  return isRecord(value) ? value : {};
}

function readArrayTableRowConfig(props: Record<string, unknown>) {
  const rowConfig = isRecord(props.rowConfig) ? cloneDeep(props.rowConfig) : {};
  const keyField = readString(rowConfig.keyField, readString(props.rowKey, '__rowKey'));

  return {
    ...rowConfig,
    keyField,
  };
}

function readFieldProps(row: Record<string, unknown>) {
  const objectProps = isRecord(row.props) ? cloneDeep(row.props) : {};
  const jsonProps = parseJsonObject(row.propsJson) ?? {};
  const props = {
    ...objectProps,
    ...jsonProps,
  };

  return Object.keys(props).length ? props : undefined;
}

function readLowCodeFormSchema(value: unknown): LowCodeFormSchema | undefined {
  if (!isRecord(value) || !Array.isArray(value.fields)) return undefined;

  return {
    ...(cloneDeep(value) as LowCodeFormSchema),
    fields: (value.fields as unknown[]).filter(isRecord).map((field) => cloneDeep(field) as LowCodeField),
    actions: Array.isArray(value.actions)
      ? cloneDeep(value.actions as LowCodeFormSchema['actions'])
      : [],
  };
}

function createLowCodeFormSchema(
  fields: unknown,
  designerModel?: unknown,
): LowCodeFormSchema {
  const normalizedFields = normalizeFields(fields)
    .map((field, index) => designerFieldToLowCodeField(field, index))
    .filter(Boolean) as LowCodeField[];
  const layout = readFormDesignerLayout(designerModel);

  return {
    fields: normalizedFields,
    ...(layout ? { layout } : {}),
    actions: [],
  };
}

export function createLowCodeFormSchemaFromDesignerResult(
  result: FormDesignerResult,
): LowCodeFormSchema {
  return createLowCodeFormSchema(result.fields, result.designerModel);
}

function normalizeSubFormProps(props: Record<string, unknown>) {
  const schema = readLowCodeFormSchema(props.schema);
  const restProps = cloneDeep(props);
  delete restProps.fields;
  delete restProps.columns;
  delete restProps.layout;
  delete restProps.actions;
  delete restProps.formDesignerModel;
  delete restProps.subFormDesignerModel;

  return {
    ...restProps,
    ...(schema ? { schema } : {}),
  };
}

function designerFieldToLowCodeField(field: FormDesignerField, index: number): LowCodeField | null {
  const fieldName = readString(field.field, normalizeFieldName(field.label || '', index));
  const label = readString(field.label, fieldName || `字段${index + 1}`);
  if (!fieldName || !label) return null;

  const component = readString(field.component, 'vxe-input') as LowCodeField['component'];
  const rawProps = readFieldProps(field as unknown as Record<string, unknown>) ?? {};
  const placeholder = readString(field.placeholder || rawProps.placeholder);
  const fieldProps = {
    ...rawProps,
    ...(placeholder ? { placeholder } : {}),
  };
  const normalizedProps =
    component === 'lc-sub-form'
      ? normalizeSubFormProps(fieldProps)
      : fieldProps;
  const options = parseJsonArray(field.optionsJson);
  const optionsCode = readString(field.optionsCode);
  const required = normalizeRequired(field.required);
  const span = normalizeSpan(field.span);

  return {
    field: fieldName,
    label,
    component,
    ...(Object.keys(normalizedProps).length ? { props: normalizedProps } : {}),
    ...(options?.length ? { options: cloneDeep(options) as LowCodeField['options'] } : {}),
    ...(optionsCode ? { optionsCode } : {}),
    ...(readString(field.help) ? { help: readString(field.help) } : {}),
    ...(span ? { span } : {}),
    ...(required
      ? { rules: [{ required: true, message: `${label}不能为空` }] }
      : {}),
  };
}

function applyCommonFieldProps(block: VisualEditorBlockData, field: FormDesignerField, index: number) {
  const fieldName = readString(field.field, normalizeFieldName(field.label || '', index));
  const label = readString(field.label, fieldName || `字段${index + 1}`);

  block.props.name = fieldName;
  block.props.label = label;
  block.props.placeholder = readString(field.placeholder, '请输入');
  block.props.required = normalizeRequired(field.required);
  block.props.__formSpan = normalizeSpan(field.span) || 1;
  block.props.__formHelp = readString(field.help);
  block.props.__lowcodeOptionsCode = readString(field.optionsCode);
}

function createFieldBlock(field: FormDesignerField, index: number) {
  const runtimeComponent = readString(field.component, 'vxe-input');
  const componentKey = runtimeToEditorComponent[runtimeComponent] || 'input';
  const component = visualConfig.componentMap[componentKey];

  if (!component) return null;

  const block = createNewBlock(cloneDeep(component));
  block.focus = index === 0;
  applyCommonFieldProps(block, field, index);

  if (runtimeComponent === 'vxe-textarea') {
    block.props.type = 'textarea';
  }

  if (runtimeComponent === 'vxe-password-input') {
    block.props.type = 'password';
  }

  if (
    !['vxe-textarea', 'vxe-password-input'].includes(runtimeComponent) &&
    editorToRuntimeComponent[componentKey] !== runtimeComponent
  ) {
    block.props.__lowcodeComponent = runtimeComponent;
  }

  if (runtimeComponent === 'lc-sub-form') {
    const fieldProps = isRecord(field.props) ? field.props : {};
    const schema = readLowCodeFormSchema(fieldProps.schema);
    const subFields = normalizeFields(schema?.fields);
    const subFormDesignerModel = fieldProps.formDesignerModel;

    block.props.__lowcodeComponent = 'lc-sub-form';
    if (schema) block.props.schema = schema;
    else delete block.props.schema;
    block.props.subFormDesignerModel = isVisualEditorModel(subFormDesignerModel)
      ? cloneDeep(subFormDesignerModel)
      : createFormModel(
          subFields.length ? subFields : createDefaultSubFormFields(),
          `${block.props.label || '子表单'}设计`,
        );
  }

  if (runtimeComponent === 'lc-array-table') {
    const fieldProps = readArrayTableProps(field.props);

    block.props.__lowcodeComponent = 'lc-array-table';
    block.props.columns = normalizeArrayTableColumns(fieldProps.columns);
    block.props.toolbarButtons = Array.isArray(fieldProps.toolbarButtons)
      ? cloneDeep(fieldProps.toolbarButtons)
      : [{ code: 'add', label: '新增行', command: 'add', status: 'primary' }];
    block.props.rowConfig = readArrayTableRowConfig(fieldProps);

    if (isRecord(fieldProps.defaultRow)) {
      block.props.defaultRow = cloneDeep(fieldProps.defaultRow);
    }
  }

  if (runtimeComponent === 'base-info') {
    const fieldProps = isRecord(field.props) ? field.props : {};
    Object.assign(block.props, cloneDeep(fieldProps));
    block.props.__lowcodeComponent = 'base-info';
  }

  const options = parseJsonArray(field.optionsJson);
  if (options?.length) {
    if (componentKey === 'picker') {
      block.props.columns = options;
    }

    if (componentKey === 'radio' || componentKey === 'checkbox') {
      block.props.options = options;
    }

    if (!['picker', 'radio', 'checkbox'].includes(componentKey)) {
      block.props.__lowcodeOptions = options;
    }
  }

  return block;
}

function normalizeFields(fields: unknown): FormDesignerField[] {
  if (!Array.isArray(fields)) return [];

  return fields.map((field, index) => {
    const row = typeof field === 'object' && field !== null ? (field as Record<string, unknown>) : {};
    const fallback = createDefaultField(index);
    const props = readFieldProps(row);

    return {
      field: readString(row.field, fallback.field),
      label: readString(row.label, fallback.label),
      component: readString(row.component, fallback.component),
      placeholder: readString(row.placeholder, readString(props?.placeholder, fallback.placeholder)),
      required: normalizeRequired(row.required),
      span: normalizeSpan(row.span) || 1,
      help: readString(row.help, readString(props?.help)),
      optionsCode: readString(row.optionsCode),
      optionsJson:
        stringifyOptions(row.optionsJson) ||
        stringifyOptions(row.options) ||
        readString(row.optionsJson),
      propsJson: stringifyFieldProps(props) || readString(row.propsJson),
      props,
    };
  });
}

function createLayoutSlots(
  columns: Array<{ span?: number | string; blocks: LowCodeFormLayoutNode[] }>,
  fieldBlocks: Map<string, VisualEditorBlockData>,
) {
  const weights = columns.map((column) => normalizeSpan(column.span) || 1);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const normalizedSpans = weights.map((weight) =>
    Math.max(1, Math.round((24 * weight) / totalWeight)),
  );
  const spanDelta = 24 - normalizedSpans.reduce((total, span) => total + span, 0);
  normalizedSpans[normalizedSpans.length - 1] += spanDelta;
  const slots = columns.reduce<Record<string, unknown>>((result, column, index) => {
    const span = normalizedSpans[index];
    result[`slot${index}`] = {
      key: `slot${index}`,
      span,
      children: layoutNodesToBlocks(column.blocks, fieldBlocks),
    };
    return result;
  }, {});

  return {
    value: normalizedSpans.join(':'),
    ...slots,
  };
}

function layoutNodesToBlocks(
  nodes: LowCodeFormLayoutNode[],
  fieldBlocks: Map<string, VisualEditorBlockData>,
): VisualEditorBlockData[] {
  return nodes.flatMap((node) => {
    if (node.kind === 'field') {
      const block = fieldBlocks.get(node.field);
      if (!block) return [];
      fieldBlocks.delete(node.field);
      return [block];
    }

    if (node.kind === 'stack') {
      return layoutNodesToBlocks(node.blocks, fieldBlocks);
    }

    if (node.kind === 'tabs') {
      const component = visualConfig.componentMap['vxe-tabs'];
      if (!component || !node.tabs.length) return [];
      const block = createNewBlock(cloneDeep(component));
      const usedSlotKeys = new Set<string>();
      block.props.panes = node.tabs.map((tab) => ({
        title: tab.label,
        name: tab.key,
      }));
      block.props.modelValue = node.defaultKey || node.tabs[0]?.key || '';
      block.props.slots = node.tabs.reduce<Record<string, unknown>>((slots, tab, index) => {
        const normalizedKey = tab.key
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .replace(/^_+|_+$/g, '');
        let slotKey = `tab_${normalizedKey || index + 1}`;
        if (usedSlotKeys.has(slotKey)) slotKey = `${slotKey}_${index + 1}`;
        usedSlotKeys.add(slotKey);
        slots[slotKey] = {
          key: slotKey,
          label: tab.label,
          children: layoutNodesToBlocks(tab.blocks, fieldBlocks),
        };
        return slots;
      }, {});
      return [block];
    }

    const component = visualConfig.componentMap.layout;
    if (!component || !node.columns.length) return [];
    const block = createNewBlock(cloneDeep(component));
    block.props.gutter = node.gutter ?? '';
    block.props.slots = createLayoutSlots(node.columns, fieldBlocks);
    return [block];
  });
}

function createColumnLayout(fields: FormDesignerField[], columns: number): LowCodeFormLayoutNode[] {
  const columnCount = Math.min(24, Math.max(1, Math.round(columns)));
  const rows: LowCodeFormLayoutNode[] = [];
  let currentColumns: Array<{ span: number; blocks: LowCodeFormLayoutNode[] }> = [];
  let occupiedColumns = 0;

  fields.forEach((field) => {
    const fieldSpan = Math.min(columnCount, Math.max(1, Math.round(Number(field.span) || 1)));
    if (currentColumns.length && occupiedColumns + fieldSpan > columnCount) {
      if (occupiedColumns < columnCount) {
        currentColumns.push({
          span: Math.max(1, Math.round((24 * (columnCount - occupiedColumns)) / columnCount)),
          blocks: [],
        });
      }
      rows.push({ kind: 'row', columns: currentColumns });
      currentColumns = [];
      occupiedColumns = 0;
    }

    currentColumns.push({
      span: Math.max(1, Math.round((24 * fieldSpan) / columnCount)),
      blocks: [{ kind: 'field', field: field.field }],
    });
    occupiedColumns += fieldSpan;

    if (occupiedColumns >= columnCount) {
      rows.push({ kind: 'row', columns: currentColumns });
      currentColumns = [];
      occupiedColumns = 0;
    }
  });

  if (currentColumns.length) {
    if (occupiedColumns < columnCount) {
      currentColumns.push({
        span: Math.max(1, Math.round((24 * (columnCount - occupiedColumns)) / columnCount)),
        blocks: [],
      });
    }
    rows.push({ kind: 'row', columns: currentColumns });
  }
  return rows;
}

function createFormModel(
  fields: FormDesignerField[],
  title = '表单设计',
  layout?: LowCodeFormLayoutNode[],
  columns?: number,
): VisualEditorModelValue {
  const normalizedFields = fields;
  const fieldBlocks = normalizedFields
    .map((field, index) => createFieldBlock(field, index))
    .filter(Boolean) as VisualEditorBlockData[];
  const fieldBlockMap = new Map(
    fieldBlocks.map((block) => [readString(block.props?.name), block]),
  );
  const initialLayout = Array.isArray(layout) && layout.length
    ? layout
    : Number(columns) > 1
      ? createColumnLayout(normalizedFields, Number(columns))
      : [];
  const laidOutBlocks = initialLayout.length
    ? layoutNodesToBlocks(cloneDeep(initialLayout), fieldBlockMap)
    : [];
  const blocks = [...laidOutBlocks, ...fieldBlockMap.values()];

  return {
    pages: {
      '/': {
        title,
        path: '/',
        config: {
          bgColor: '',
          bgImage: '',
          keepAlive: false,
        },
        blocks,
      },
    },
    models: [],
    actions: cloneDeep(defaultActions),
  };
}

function resolveInitialModel(option: FormDesignerServiceOption) {
  const normalizedFields = normalizeFields(cloneDeep(option.fields));

  if (
    isVisualEditorModel(option.designerModel) &&
    isDesignerModelCompatible(option.designerModel, normalizedFields)
  ) {
    return cloneDeep(option.designerModel);
  }

  return createFormModel(
    normalizedFields,
    option.title || '表单设计',
    cloneDeep(option.layout),
    option.columns,
  );
}

function flattenBlocks(blocks: VisualEditorBlockData[] = []) {
  const result: VisualEditorBlockData[] = [];

  blocks.forEach((block) => {
    result.push(block);
    const slots = block.props?.slots || {};
    Object.keys(slots).forEach((slotKey) => {
      result.push(...flattenBlocks(slots[slotKey]?.children || []));
    });
  });

  return result;
}

function getRuntimeComponent(block: VisualEditorBlockData) {
  const overrideComponent = readString(block.props?.__lowcodeComponent);
  if (overrideComponent) return overrideComponent;

  if (block.componentKey === 'input') {
    if (block.props?.type === 'textarea') return 'vxe-textarea';
    if (block.props?.type === 'password') return 'vxe-password-input';
  }

  return editorToRuntimeComponent[block.componentKey] || '';
}

function getOptionsJson(block: VisualEditorBlockData, runtimeComponent: string) {
  const preservedOptions = stringifyOptions(block.props?.__lowcodeOptions);
  if (preservedOptions) return preservedOptions;
  if (!optionComponents.has(runtimeComponent)) return '';

  if (block.componentKey === 'picker') {
    return stringifyOptions(block.props?.columns);
  }

  return stringifyOptions(block.props?.options);
}

function blockToField(block: VisualEditorBlockData, index: number): FormDesignerField | null {
  const runtimeComponent = getRuntimeComponent(block);
  if (!runtimeComponent) return null;

  const label = readString(block.props?.label, block.label || `字段${index + 1}`);
  const field = readString(block.props?.name, normalizeFieldName(label, index));

  if (!field || !label) return null;

  const result: FormDesignerField = {
    field,
    label,
    component: runtimeComponent,
    placeholder: readString(block.props?.placeholder),
    required: normalizeRequired(block.props?.required),
    span: normalizeSpan(block.props?.__formSpan) || normalizeSpan(block.props?.span),
    help: readString(block.props?.__formHelp || block.props?.help),
    optionsCode: readString(block.props?.__lowcodeOptionsCode),
    optionsJson: getOptionsJson(block, runtimeComponent),
  };

  if (runtimeComponent === 'base-info') {
    const {
      __formSpan: _formSpan,
      __formHelp: _formHelp,
      __lowcodeComponent: _lowcodeComponent,
      __lowcodeOptionsCode: _lowcodeOptionsCode,
      __lowcodeOptions: _lowcodeOptions,
      name: _name,
      label: _label,
      required: _required,
      type: _type,
      ...props
    } = block.props ?? {};
    result.props = cloneDeep(props);
    result.propsJson = stringifyFieldProps(result.props);
  }

  if (runtimeComponent === 'lc-sub-form') {
    const schema = readLowCodeFormSchema(block.props?.schema);
    const subFormDesignerModel = block.props?.subFormDesignerModel;

    result.props = schema ? { schema } : {};
    if (isVisualEditorModel(subFormDesignerModel)) {
      result.props.formDesignerModel = cloneDeep(subFormDesignerModel);
    }
    result.propsJson = stringifyFieldProps(result.props);
  }

  if (runtimeComponent === 'lc-array-table') {
    const props = readArrayTableProps(block.props);

    result.props = {
      columns: normalizeArrayTableColumns(props.columns),
      toolbarButtons: Array.isArray(props.toolbarButtons)
        ? cloneDeep(props.toolbarButtons)
        : [{ code: 'add', label: '新增行', command: 'add', status: 'primary' }],
      rowConfig: readArrayTableRowConfig(props),
      ...(isRecord(props.defaultRow) ? { defaultRow: cloneDeep(props.defaultRow) } : {}),
    };
    result.propsJson = stringifyFieldProps(result.props);
  }

  return result;
}

function extractFields(page: VisualEditorPage) {
  return flattenBlocks(page.blocks)
    .map((block, index) => blockToField(block, index))
    .filter(Boolean) as FormDesignerField[];
}

function isDesignerModelCompatible(
  model: VisualEditorModelValue,
  fields: FormDesignerField[],
) {
  const page = model.pages?.['/'];
  if (!page) return false;

  const modelFields = extractFields(page);
  return (
    modelFields.length === fields.length &&
    fields.every(
      (field, index) =>
        modelFields[index]?.field === field.field &&
        modelFields[index]?.component === field.component,
    )
  );
}

function validateFields(fields: FormDesignerField[]) {
  if (!fields.length) {
    ElMessage.error('请至少拖入一个表单项控件');
    return false;
  }

  const invalidField = fields.find((field) => !field.field || !field.label);
  if (invalidField) {
    ElMessage.error('字段绑定和标签不能为空');
    return false;
  }

  const duplicateField = fields.find(
    (field, index) => fields.findIndex((item) => item.field === field.field) !== index,
  );

  if (duplicateField) {
    ElMessage.error(`字段 ${duplicateField.field} 重复`);
    return false;
  }

  return true;
}

const ServiceComponent = defineComponent({
  props: {
    option: { type: Object as PropType<FormDesignerServiceOption>, required: true },
  },
  setup(props) {
    const ctx = getCurrentInstance()!;
    const providerRef = ref<FormProviderInstance | null>(null);
    const tableFieldOptions = ref<LowCodeOption[]>(
      collectPageTableFieldOptions(props.option.pageData),
    );
    let tableFieldLoadSequence = 0;

    const state = reactive({
      option: props.option,
      showFlag: false,
      providerKey: 0,
      initialData: createFormModel([], props.option.title || '表单设计'),
      mounted: (() => {
        const dfd = defer();
        onMounted(() => setTimeout(() => dfd.resolve(), 0));
        return dfd.promise;
      })(),
    });
    provide(formDesignerPageDataKey, computed(() => state.option.pageData));
    provide(
      formDesignerModeKey,
      computed<FormDesignerMode>(() => state.option.mode || 'edit'),
    );
    provide(formDesignerTableFieldOptionsKey, tableFieldOptions);

    const loadTableFieldOptions = async () => {
      const sequence = ++tableFieldLoadSequence;
      const localOptions = collectPageTableFieldOptions(state.option.pageData);
      tableFieldOptions.value = localOptions;

      if (!state.option.serviceApi || !state.option.pageRecord?.id) return;

      try {
        const loaded = await loadFormDesignerTableFieldOptions(
          state.option.serviceApi,
          state.option.pageRecord,
        );
        if (sequence === tableFieldLoadSequence) {
          tableFieldOptions.value = mergeTableFieldOptions(localOptions, loaded);
        }
      } catch {
        // Local choices and custom field creation remain available if metadata fails.
      }
    };

    const methods = {
      service: async (option: FormDesignerServiceOption) => {
        state.option = option;
        void loadTableFieldOptions();
        state.initialData = resolveInitialModel(option);
        state.providerKey += 1;
        providerRef.value = null;
        await methods.show();
      },
      show: async () => {
        await state.mounted;
        state.showFlag = true;
        await nextTick();
      },
      hide: () => {
        state.showFlag = false;
      },
    };

    const handler = {
      onConfirm: async () => {
        const snapshot = providerRef.value?.getSnapshot();
        if (!snapshot) {
          ElMessage.error('表单设计器还未初始化完成');
          return;
        }

        const fields = extractFields(snapshot.currentPage);
        if (!validateFields(fields)) return;

        try {
          await state.option.onConfirm({
            fields,
            designerModel: snapshot.model,
          });
        } catch (error) {
          ElMessage.error(error instanceof Error ? error.message : '表单配置保存失败');
          return;
        }
        methods.hide();
      },
      onCancel: () => {
        state.option.onCancel?.();
        methods.hide();
      },
    };

    Object.assign(ctx.proxy!, methods);

    return () => (
      <ElDialog
        v-model={state.showFlag}
        title={state.option.title || '表单设计'}
        width="min(1280px, calc(100vw - 40px))"
        top="4vh"
        class="form-designer-dialog form-workbench-dialog"
        destroyOnClose={true}
      >
        {{
          default: () => (
            <div class="form-workbench">
              <div class="form-workbench-toolbar">
                <div>
                  <strong>表单拖拽设计</strong>
                  <span>拖入表单项控件，选中后在右侧配置字段绑定、标签和校验</span>
                </div>
                {false ? (
                <label>
                  <span>表单列数</span>
                  <input
                    value={1}
                    min={1}
                    max={6}
                    type="number"
                    onInput={() => undefined}
                  />
                </label>
                ) : null}
              </div>
              <VisualEditorProvider
                key={state.providerKey}
                ref={providerRef}
                initialData={state.initialData}
                initialPath="/"
                showHeader={false}
                leftExcludeLabels={['页面', '数据源']}
                leftWidth="300px"
                allowFormDesign={false}
                showPageSetting={false}
                workbenchMode="form"
                persistToSession={false}
                showGlobalDialogHost={false}
              />
            </div>
          ),
          footer: () => (
            <div class="form-workbench-footer">
              <ElButton onClick={handler.onCancel}>取消</ElButton>
              <ElButton type="primary" onClick={handler.onConfirm}>
                确定
              </ElButton>
            </div>
          ),
        }}
      </ElDialog>
    );
  },
});

export const $$formDesigner = (
  option: Omit<FormDesignerServiceOption, 'onConfirm'> & {
    onConfirm?: FormDesignerServiceOption['onConfirm'];
  },
) => {
  const dfd = defer<FormDesignerResult>();
  const el = document.createElement('div');
  document.body.appendChild(el);

  const app = createApp(ServiceComponent, {
    option: {
      ...option,
      onConfirm: () => undefined,
    },
  });
  app.use(DesignerUI);
  app.config.globalProperties.$$refs = {};

  const cleanup = () => {
    window.setTimeout(() => {
      app.unmount();
      el.remove();
    }, 0);
  };

  const ins = app.mount(el) as unknown as {
    service: (option: FormDesignerServiceOption) => Promise<void>;
  };

  ins.service({
    ...option,
    onCancel: cleanup,
    onConfirm: async (value) => {
      await option.onConfirm?.(value);
      dfd.resolve(value);
      cleanup();
    },
  });

  return dfd.promise;
};
