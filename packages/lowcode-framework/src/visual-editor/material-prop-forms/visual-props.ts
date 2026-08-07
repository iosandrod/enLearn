import { cloneDeep } from 'lodash-es';
import type { LowCodeField, LowCodeOption } from '../../types/lowcode';
import { VisualEditorPropsType, type VisualEditorProps } from '../visual-editor.props';
import type {
  VisualEditorBlockData,
  VisualEditorComponent,
} from '../visual-editor.utils';
import { useDotProp } from '../hooks/useDotProp';
import { getMaterialPropFormDefinition } from './registry';
import type {
  MaterialPropFieldTarget,
  MaterialPropFormDefinition,
  MaterialPropFormField,
  MaterialPropFormSchema,
} from './types';

const visualModelsSourceKey = '__visualModels';
const layoutGridSpan = 24;
const minLayoutSpan = 1;

const nodeMetaFields: MaterialPropFormField[] = [
  {
    field: '__block._vid',
    target: 'block',
    path: '_vid',
    label: '组件 ID',
    component: 'vxe-input',
    valueKind: 'string',
    props: {
      disabled: true,
      clearable: false,
    },
  },
];

const styleFields: MaterialPropFormField[] = [
  {
    field: '__styles.justifyContent',
    target: 'styles',
    path: 'justifyContent',
    label: '组件对齐',
    component: 'lc-option-select',
    valueKind: 'raw',
    defaultValue: 'flex-start',
    options: [
      toRawOption('左对齐', 'flex-start', 'flex-start'),
      toRawOption('居中', 'center', 'center'),
      toRawOption('右对齐', 'flex-end', 'flex-end'),
    ],
  },
  {
    field: '__styles.tempPadding',
    target: 'styles',
    path: 'tempPadding',
    label: '统一内边距',
    component: 'vxe-input',
    valueKind: 'string',
    defaultValue: '0',
    syncTo: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  },
  {
    field: '__styles.paddingTop',
    target: 'styles',
    path: 'paddingTop',
    label: '上内边距',
    component: 'vxe-input',
    valueKind: 'string',
    defaultValue: '0',
  },
  {
    field: '__styles.paddingRight',
    target: 'styles',
    path: 'paddingRight',
    label: '右内边距',
    component: 'vxe-input',
    valueKind: 'string',
    defaultValue: '0',
  },
  {
    field: '__styles.paddingBottom',
    target: 'styles',
    path: 'paddingBottom',
    label: '下内边距',
    component: 'vxe-input',
    valueKind: 'string',
    defaultValue: '0',
  },
  {
    field: '__styles.paddingLeft',
    target: 'styles',
    path: 'paddingLeft',
    label: '左内边距',
    component: 'vxe-input',
    valueKind: 'string',
    defaultValue: '0',
  },
];

export function getVisualModelsSourceKey() {
  return visualModelsSourceKey;
}

export function createMaterialPropForm(
  component: VisualEditorComponent | undefined,
  block: VisualEditorBlockData,
): MaterialPropFormSchema {
  const definition = getMaterialPropFormDefinition(component?.key);
  const generatedFields =
    definition?.extendsVisualProps === false ? [] : createFieldsFromVisualProps(component);
  const componentFields = mergeFields(generatedFields, definition?.fields ?? []);
  const fields = [
    ...nodeMetaFields,
    ...componentFields,
    ...(block.showStyleConfig ? styleFields : []),
  ];

  ensureDefaultValues(block, fields);

  return {
    title: definition?.title ?? component?.label ?? block.label,
    fields,
    layout: definition?.layout,
    actions: definition?.actions ?? [],
  };
}

export function createMaterialPropModel(
  block: VisualEditorBlockData,
  fields: MaterialPropFormField[],
) {
  ensureDefaultValues(block, fields);

  return fields.reduce<Record<string, unknown>>((model, field) => {
    model[field.field] = cloneDeep(readFieldValue(block, field));
    return model;
  }, {});
}

export function createMaterialPropOptionSources(models: readonly unknown[]) {
  return {
    [visualModelsSourceKey]: cloneDeep(models),
  };
}

export function applyMaterialPropFieldValue(
  block: VisualEditorBlockData,
  field: MaterialPropFormField,
  value: unknown,
) {
  const target = getTargetObject(block, field.target);
  const path = field.path ?? field.field;
  const { propObj, prop } = useDotProp(target, path);
  const nextValue = normalizeFieldValue(field, value, propObj[prop]);

  propObj[prop] = nextValue;

  field.syncTo?.forEach((syncPath) => {
    const syncTarget = useDotProp(target, syncPath);
    syncTarget.propObj[syncTarget.prop] = nextValue;
  });
}

function createFieldsFromVisualProps(component?: VisualEditorComponent): MaterialPropFormField[] {
  return Object.entries(component?.props ?? {}).map(([propName, propConfig]) =>
    createFieldFromVisualProp(propName, propConfig),
  );
}

function createFieldFromVisualProp(
  propName: string,
  propConfig: VisualEditorProps,
): MaterialPropFormField {
  const baseField: MaterialPropFormField = {
    field: propName,
    target: 'props',
    path: propName,
    label: propConfig.label,
    component: 'vxe-input',
    help: propConfig.tips,
    defaultValue: propConfig.defaultValue,
    valueKind: 'string',
  };

  if (propConfig.type === VisualEditorPropsType.inputNumber) {
    return {
      ...baseField,
      component: 'lc-number-input',
      valueKind: 'number',
      props: {
        min: propConfig.min,
        max: propConfig.max,
      },
    };
  }

  if (propConfig.type === VisualEditorPropsType.input && propName.endsWith('Json')) {
    return {
      ...baseField,
      component: 'lc-json-editor',
      valueKind: 'raw',
      props: {
        rows: 6,
        resize: 'vertical',
      },
    };
  }

  if (propConfig.type === VisualEditorPropsType.json) {
    return {
      ...baseField,
      component: 'lc-json-editor',
      valueKind: 'raw',
      props: {
        rows: 8,
        resize: 'vertical',
        jsonRootType: propConfig.jsonRootType,
        jsonValueMode: propConfig.jsonValueMode,
      },
    };
  }

  if (propConfig.type === VisualEditorPropsType.switch) {
    return {
      ...baseField,
      component: 'vxe-switch',
      valueKind: 'boolean',
    };
  }

  if (propConfig.type === VisualEditorPropsType.color) {
    return {
      ...baseField,
      component: 'lc-color-picker',
    };
  }

  if (propConfig.type === VisualEditorPropsType.select) {
    return {
      ...baseField,
      component: 'lc-option-select',
      valueKind: 'raw',
      options: (propConfig.options ?? []).map((item, index) =>
        toRawOption(item.label, item.value, String(index)),
      ),
      props: {
        multiple: propConfig.multiple,
      },
    };
  }

  if (propConfig.type === VisualEditorPropsType.modelBind) {
    return {
      ...baseField,
      component: 'lc-cascader',
      optionsSourceKey: visualModelsSourceKey,
      optionProps: {
        label: 'name',
        value: 'key',
        children: 'entitys',
      },
      props: {
        clearable: true,
        cascaderProps: {
          checkStrictly: true,
          children: 'children',
          expandTrigger: 'hover',
        },
      },
      valueKind: 'raw',
    };
  }

  if (propConfig.type === VisualEditorPropsType.table) {
    return createTableMaterialField(baseField, propConfig);
  }

  if (propConfig.type === VisualEditorPropsType.crossSortable) {
    return createCrossSortableMaterialField(baseField, propConfig);
  }

  return baseField;
}

type ArrayTableColumnOption = {
  field: string;
  title: string;
  component?: LowCodeField['component'];
  width?: number | string;
  minWidth?: number | string;
  placeholder?: string;
  defaultValue?: unknown;
  props?: Record<string, unknown>;
  options?: LowCodeOption[];
};

const booleanColumnFields = new Set([
  'disabled',
  'circle',
  'plain',
  'preload',
  'required',
  'resizable',
  'round',
  'showDropdownIcon',
  'sortable',
  'text',
  'visible',
]);

const hiddenCrossSortableFields = new Set(['block', 'component']);

const buttonTypeOptions = [
  toSelectOption('普通按钮', 'button'),
  toSelectOption('提交', 'submit'),
  toSelectOption('重置', 'reset'),
];

function createTableMaterialField(
  baseField: MaterialPropFormField,
  propConfig: VisualEditorProps,
): MaterialPropFormField {
  const columns = createTableColumns(propConfig);

  return {
    ...baseField,
    component: 'lc-array-table',
    valueKind: 'raw',
    defaultValue: propConfig.defaultValue ?? [],
    props: {
      toolbarButtons: [
        { code: 'add', label: '新增', command: 'add', status: 'primary' },
      ],
      rowKey: propConfig.table?.showKey || inferRowKey(columns),
      defaultRow: createDefaultRow(columns),
      columns,
    },
  };
}

function createCrossSortableMaterialField(
  baseField: MaterialPropFormField,
  propConfig: VisualEditorProps,
): MaterialPropFormField {
  const defaultValue = Array.isArray(propConfig.defaultValue) ? propConfig.defaultValue : [];
  const primitiveMode = defaultValue.some((item) => !isRecord(item));
  const columns = primitiveMode
    ? [
        {
          field: 'value',
          title: '值',
          minWidth: 160,
          placeholder: propConfig.tips || propConfig.label,
        },
      ]
    : createCrossSortableColumns(defaultValue);

  return {
    ...baseField,
    component: 'lc-array-table',
    valueKind: 'raw',
    defaultValue,
    props: {
      toolbarButtons: [
        { code: 'add', label: '新增', command: 'add', status: 'primary' },
      ],
      rowKey: primitiveMode ? '__rowKey' : inferRowKey(columns),
      defaultRow: createDefaultRow(columns),
      ...(primitiveMode ? { valueMode: 'primitive', valueField: 'value' } : {}),
      columns,
    },
  };
}

function createTableColumns(propConfig: VisualEditorProps): ArrayTableColumnOption[] {
  const options = propConfig.table?.options ?? [];

  return options.map((option) => ({
    ...createArrayTableColumn(option.field, option.label),
    ...(option.component ? { component: option.component } : {}),
    ...(option.width ? { width: option.width } : {}),
    ...(option.minWidth ? { minWidth: option.minWidth } : {}),
    ...(option.placeholder ? { placeholder: option.placeholder } : {}),
    ...(Object.prototype.hasOwnProperty.call(option, 'defaultValue')
      ? { defaultValue: option.defaultValue }
      : {}),
    ...(option.props ? { props: option.props } : {}),
    ...(option.options ? { options: option.options.map(toLowCodeOption) } : {}),
  }));
}

function createCrossSortableColumns(defaultValue: unknown[]): ArrayTableColumnOption[] {
  const keys = new Set<string>();

  defaultValue.filter(isRecord).forEach((item) => {
    Object.keys(item).forEach((key) => {
      if (!hiddenCrossSortableFields.has(key)) {
        keys.add(key);
      }
    });
  });

  const orderedKeys = [
    ...['label', 'value'].filter((key) => keys.delete(key)),
    ...Array.from(keys),
  ].slice(0, 6);
  const finalKeys = orderedKeys.length ? orderedKeys : ['label', 'value'];

  return finalKeys.map((field) => createArrayTableColumn(field, getColumnTitle(field)));
}

function createArrayTableColumn(field: string, title: string): ArrayTableColumnOption {
  const selectOptions = getColumnOptions(field);

  return {
    field,
    title,
    component: selectOptions.length
      ? 'vxe-select'
      : booleanColumnFields.has(field)
        ? 'vxe-switch'
        : 'vxe-input',
    minWidth: getColumnMinWidth(field),
    placeholder: getColumnPlaceholder(field),
    ...(selectOptions.length ? { options: selectOptions } : {}),
  };
}

function createDefaultRow(columns: ArrayTableColumnOption[]) {
  return columns.reduce<Record<string, unknown>>((row, column) => {
    row[column.field] = column.defaultValue ?? getColumnDefaultValue(column);
    return row;
  }, {});
}

function getColumnDefaultValue(column: ArrayTableColumnOption) {
  if (column.component === 'vxe-switch') return false;
  if (column.field === 'label' || column.field === 'title') return `${column.title} {{index}}`;
  if (['code', 'field', 'key', 'name', 'value'].includes(column.field)) {
    return `${column.field}{{index}}`;
  }
  if (column.field === 'component') return 'vxe-input';
  return '';
}

function getColumnOptions(field: string): LowCodeOption[] {
  if (field === 'component') {
    return [
      toSelectOption('输入框', 'vxe-input'),
      toSelectOption('多行文本', 'vxe-textarea'),
      toSelectOption('下拉选择', 'vxe-select'),
      toSelectOption('开关', 'vxe-switch'),
      toSelectOption('密码框', 'vxe-password-input'),
      toSelectOption('数字输入', 'lc-number-input'),
      toSelectOption('JSON 编辑器', 'lc-json-editor'),
      toSelectOption('代码编辑器', 'lc-monaco-editor'),
      toSelectOption('表格输入', 'lc-array-table'),
      toSelectOption('子表单', 'lc-sub-form'),
    ];
  }

  if (field === 'status') {
    return [
      toSelectOption('默认', ''),
      toSelectOption('主要', 'primary'),
      toSelectOption('成功', 'success'),
      toSelectOption('警告', 'warning'),
      toSelectOption('危险', 'danger'),
      toSelectOption('信息', 'info'),
    ];
  }

  if (field === 'type') {
    return buttonTypeOptions;
  }

  return [];
}

function getColumnTitle(field: string) {
  const titleMap: Record<string, string> = {
    code: '编码',
    component: '组件',
    disabled: '禁用',
    field: '字段',
    icon: '图标',
    label: '标签',
    name: '标识',
    placeholder: '占位提示',
    required: '必填',
    span: '跨列',
    status: '状态',
    title: '标题',
    type: '类型',
    value: '值',
  };

  return titleMap[field] ?? field;
}

function getColumnMinWidth(field: string) {
  if (field === 'component') return 132;
  if (field === 'placeholder') return 150;
  if (field === 'propsJson') return 220;
  if (field === 'children') return 220;
  if (field === 'directivesJson') return 220;
  if (field.endsWith('Json')) return 180;
  if (booleanColumnFields.has(field)) return 72;
  return 110;
}

function getColumnPlaceholder(field: string) {
  if (field === 'field') return 'email';
  if (field === 'label' || field === 'title') return '标题';
  if (field === 'value') return 'value';
  if (field === 'optionsJson') return '[{"label":"A","value":"a"}]';
  if (field === 'propsJson') return '{"placeholder":"请输入"}';
  if (field === 'children') return '[]';
  if (field === 'directivesJson') return '[]';
  return '';
}

function inferRowKey(columns: ArrayTableColumnOption[]) {
  const fields = columns.map((column) => column.field);
  return ['field', 'code', 'name', 'key', 'value', 'label', 'title'].find((field) =>
    fields.includes(field),
  ) ?? '__rowKey';
}

function toSelectOption(label: string, value: string): LowCodeOption {
  return {
    label,
    value,
  };
}

function toLowCodeOption(option: {
  label: string;
  value: string | number | boolean | object;
  rawValue?: unknown;
  disabled?: boolean;
}): LowCodeOption {
  const primitiveValue =
    typeof option.value === 'string' || typeof option.value === 'number'
      ? option.value
      : String(option.value);

  return {
    label: option.label,
    value: primitiveValue,
    rawValue: option.rawValue ?? option.value,
    disabled: option.disabled,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeFields(
  generatedFields: MaterialPropFormField[],
  overrideFields: MaterialPropFormDefinition['fields'],
) {
  if (!overrideFields.length) return generatedFields;

  const fieldMap = new Map(generatedFields.map((field) => [field.field, field]));

  overrideFields.forEach((field) => {
    fieldMap.set(field.field, {
      ...(fieldMap.get(field.field) ?? {}),
      ...field,
    });
  });

  const orderedFields = generatedFields.map((field) => fieldMap.get(field.field)!);
  const generatedKeys = new Set(generatedFields.map((field) => field.field));
  const appendedFields = overrideFields.filter((field) => !generatedKeys.has(field.field));

  return [...orderedFields, ...appendedFields];
}

function ensureDefaultValues(
  block: VisualEditorBlockData,
  fields: MaterialPropFormField[],
) {
  fields.forEach((field) => {
    const target = getTargetObject(block, field.target);
    const path = field.path ?? field.field;
    const { propObj, prop } = useDotProp(target, path);

    if (propObj[prop] === undefined && Object.prototype.hasOwnProperty.call(field, 'defaultValue')) {
      propObj[prop] = cloneDeep(field.defaultValue);
    }
  });
}

function readFieldValue(block: VisualEditorBlockData, field: MaterialPropFormField) {
  const target = getTargetObject(block, field.target);
  const path = field.path ?? field.field;
  const { propObj, prop } = useDotProp(target, path);

  if (field.valueKind === 'layoutSlots') {
    return stringifyLayoutSlots(propObj[prop]);
  }

  return propObj[prop];
}

function getTargetObject(
  block: VisualEditorBlockData,
  target: MaterialPropFieldTarget = 'props',
) {
  if (target === 'block') return block;
  if (target === 'styles') {
    block.styles ??= {};
    return block.styles;
  }

  block.props ??= {};
  return block.props;
}

function normalizeFieldValue(
  field: MaterialPropFormField,
  value: unknown,
  currentValue?: unknown,
) {
  if (field.valueKind === 'number') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  if (field.valueKind === 'boolean') {
    return Boolean(value);
  }

  if (field.valueKind === 'json' && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  if (field.valueKind === 'layoutSlots') {
    return createLayoutSlotsFromRatio(value, currentValue);
  }

  if (field.valueKind === 'string') {
    return value === undefined || value === null ? '' : String(value);
  }

  return value;
}

function clampLayoutSpan(value: unknown, fallback = minLayoutSpan) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(layoutGridSpan, Math.max(minLayoutSpan, Math.round(numeric)));
}

function parseLayoutRatio(value: unknown, fallback: number[] = [12, 12]) {
  const spans = String(value || '')
    .split(/[:：,\s]+/)
    .map((span) => clampLayoutSpan(span, 0))
    .filter((span) => span > 0)
    .slice(0, layoutGridSpan);

  return spans.length ? spans : fallback;
}

function readLayoutSlotItems(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];

  return Object.entries(value as Record<string, any>)
    .filter(([key, slot]) => key !== 'value' && slot && typeof slot === 'object')
    .sort(([prevKey], [nextKey]) => {
      const prevIndex = Number(prevKey.replace('slot', ''));
      const nextIndex = Number(nextKey.replace('slot', ''));
      return prevIndex - nextIndex;
    })
    .map(([key, slot], index) => ({
      ...slot,
      key: slot.key || key || `slot${index}`,
      span: clampLayoutSpan(slot.span),
      children: Array.isArray(slot.children) ? slot.children : [],
    }));
}

function stringifyLayoutSlots(value: unknown) {
  if (typeof value === 'string') return value;
  const items = readLayoutSlotItems(value);
  return items.length
    ? items.map((item) => String(clampLayoutSpan(item.span))).join(':')
    : '12:12';
}

function createLayoutSlotsFromRatio(value: unknown, currentValue?: unknown) {
  const previousItems = readLayoutSlotItems(currentValue);
  const fallback = previousItems.length ? previousItems.map((item) => item.span) : [12, 12];
  const spans = parseLayoutRatio(value, fallback);

  return spans.reduce(
    (prev, span, index) => {
      const previousItem = previousItems[index];
      prev[`slot${index}`] = {
        key: `slot${index}`,
        span,
        children: previousItem?.children || [],
      };
      return prev;
    },
    { value: spans.join(':') } as Record<string, unknown>,
  );
}

function toRawOption(
  label: string,
  rawValue: unknown,
  value: string | number,
): LowCodeOption {
  return {
    label,
    value,
    rawValue,
  };
}
