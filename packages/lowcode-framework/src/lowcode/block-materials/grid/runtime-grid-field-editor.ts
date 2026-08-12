import type { LowCodeRuntimeBlockEditor } from '../../../runtime/block-editor';
import type {
  LowCodeField,
  LowCodeGridColumn,
  LowCodePageFormBlock,
  LowCodePageGridBlock,
  LowCodeRule,
} from '../../../types/lowcode';
import { openRuntimeFormFieldEditor } from '../runtime-form-field-editor';

const GRID_FIELD_METADATA_KEY = 'lowcodeField';

const rendererToFieldComponent: Record<string, LowCodeField['component']> = {
  VxeInput: 'vxe-input',
  VxeTextarea: 'vxe-textarea',
  VxeSelect: 'vxe-select',
  VxeSwitch: 'vxe-switch',
  VxeNumberInput: 'lc-number-input',
  VxeDatePicker: 'vxe-date-picker',
  VxeTreeSelect: 'vxe-tree-select',
};

const fieldComponentToRenderer: Record<string, string> = {
  'vxe-input': 'VxeInput',
  'vxe-textarea': 'VxeTextarea',
  'vxe-select': 'VxeSelect',
  'vxe-switch': 'VxeSwitch',
  'lc-number-input': 'VxeNumberInput',
  'vxe-date-picker': 'VxeDatePicker',
  'vxe-tree-select': 'VxeTreeSelect',
};

function cloneValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function cloneValueWithFunctions<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValueWithFunctions(item)) as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValueWithFunctions(item)]),
    ) as T;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readColumnMetadata(column: LowCodeGridColumn) {
  const params = isRecord(column.params) ? column.params : {};
  return isRecord(params[GRID_FIELD_METADATA_KEY])
    ? cloneValue(params[GRID_FIELD_METADATA_KEY])
    : {};
}

function readGridEditRules(block: LowCodePageGridBlock, field: string) {
  const editRules = isRecord(block.schema.grid.editRules)
    ? block.schema.grid.editRules
    : {};
  return Array.isArray(editRules[field])
    ? cloneValue(editRules[field].filter(
        (rule) => isRecord(rule) && !rule.__lowcodeFieldValidation,
      )) as LowCodeRule[]
    : [];
}

function resolveFieldComponent(
  metadata: Record<string, unknown>,
  editRender: Record<string, unknown>,
) {
  const configured = readString(metadata.component);
  if (configured) return configured;

  const rendererName = readString(editRender.name);
  return rendererToFieldComponent[rendererName] ?? 'vxe-input';
}

function createFormField(
  block: LowCodePageGridBlock,
  column: LowCodeGridColumn,
): LowCodeField {
  const field = readString(column.field);
  const editRender = isRecord(column.editRender) ? cloneValue(column.editRender) : {};
  const metadata = readColumnMetadata(column);
  const metadataProps = isRecord(metadata.props) ? metadata.props : {};
  const renderProps = isRecord(editRender.props) ? editRender.props : {};
  const options = Array.isArray(editRender.options)
    ? cloneValue(editRender.options)
    : Array.isArray(metadata.options)
      ? cloneValue(metadata.options)
      : undefined;
  const rules = readGridEditRules(block, field);
  const configuredRequiredRule = rules.find((rule) => rule.required === true);
  const metadataRules = Array.isArray(metadata.rules)
    ? metadata.rules.filter(isRecord) as LowCodeRule[]
    : [];
  const mergedRules = configuredRequiredRule
    ? [
        ...metadataRules.filter((rule) => rule.required !== true),
        configuredRequiredRule,
      ]
    : metadataRules;
  const formField: LowCodeField = {
    ...metadata,
    field,
    label: readString(column.title, field),
    component: resolveFieldComponent(metadata, editRender),
    props: {
      ...cloneValue(renderProps),
      ...cloneValue(metadataProps),
    },
    ...(options ? { options } : {}),
    ...(mergedRules.length ? { rules: mergedRules } : {}),
  } as LowCodeField;

  if (!Object.keys(formField.props ?? {}).length) delete formField.props;
  return formField;
}

function createFormBlock(
  block: LowCodePageGridBlock,
  field: LowCodeField,
  column: LowCodeGridColumn,
): LowCodePageFormBlock {
  const editRender = isRecord(column.editRender) ? column.editRender : {};
  const hasDefaultValue = Object.prototype.hasOwnProperty.call(editRender, 'defaultValue');

  return {
    id: block.id,
    kind: 'form',
    title: block.title ?? block.schema.title ?? '表格',
    schema: {
      fields: [field],
      actions: [],
    },
    initialValues: hasDefaultValue
      ? { [field.field]: cloneValue(editRender.defaultValue) }
      : {},
  };
}

function resolveRendererName(component: LowCodeField['component']) {
  const name = readString(component);
  if (fieldComponentToRenderer[name]) return fieldComponentToRenderer[name];
  if (/^Vxe[A-Z]/.test(name)) return name;
  return 'VxeInput';
}

function createStoredMetadata(field: LowCodeField) {
  const metadata = cloneValue(field) as Record<string, unknown>;
  const props = isRecord(metadata.props) ? metadata.props : {};
  const relateInfoConfig = props.relateInfoConfig;

  delete metadata.field;
  delete metadata.label;
  if (Array.isArray(metadata.rules)) {
    metadata.rules = metadata.rules.filter(
      (rule) => isRecord(rule) && rule.required !== true,
    );
    if (!(metadata.rules as unknown[]).length) delete metadata.rules;
  }
  delete metadata.options;
  metadata.props = isRecord(relateInfoConfig)
    ? { relateInfoConfig: cloneValue(relateInfoConfig) }
    : {};

  if (!Object.keys(metadata.props as Record<string, unknown>).length) {
    delete metadata.props;
  }
  return metadata;
}

function createUpdatedColumn(
  column: LowCodeGridColumn,
  field: LowCodeField,
  initialValues: Record<string, unknown>,
) {
  const updated = cloneValue(column);
  const editRender = isRecord(updated.editRender) ? updated.editRender : {};
  const previousMetadata = readColumnMetadata(column);
  const fieldProps = cloneValue(field.props ?? {});
  delete fieldProps.relateInfoConfig;

  editRender.name = resolveRendererName(field.component);
  if (Object.keys(fieldProps).length) editRender.props = fieldProps;
  else delete editRender.props;
  if (Array.isArray(field.options) && field.options.length) {
    editRender.options = cloneValue(field.options);
  } else {
    delete editRender.options;
  }
  if (Object.prototype.hasOwnProperty.call(initialValues, field.field)) {
    editRender.defaultValue = cloneValue(initialValues[field.field]);
  } else if (
    (field.defaultValueType === 'function' || field.defaultValueType === 'procedure') &&
    previousMetadata.defaultValueType === field.defaultValueType &&
    previousMetadata.defaultValueScript === field.defaultValueScript &&
    previousMetadata.defaultValueProcedure === field.defaultValueProcedure &&
    Object.prototype.hasOwnProperty.call(editRender, 'defaultValue')
  ) {
    // Keep the last resolved dynamic value until the runtime resolves a new one.
  } else {
    delete editRender.defaultValue;
  }

  const params = isRecord(updated.params) ? updated.params : {};
  params[GRID_FIELD_METADATA_KEY] = createStoredMetadata(field);

  updated.title = field.label;
  updated.editRender = editRender;
  updated.params = params;
  return updated;
}

function createUpdatedEditRules(
  grid: Record<string, unknown>,
  field: LowCodeField,
) {
  const editRules = isRecord(grid.editRules) ? cloneValue(grid.editRules) : {};
  const configuredRules = editRules[field.field];
  const currentRules = Array.isArray(configuredRules)
    ? configuredRules.filter(isRecord)
    : [];
  const unrelatedRules = currentRules.filter(
    (rule) => rule.required !== true && !rule.__lowcodeFieldValidation,
  );
  const requiredRule = field.rules?.find((rule) => rule.required === true);
  const nextRules = requiredRule
    ? [...unrelatedRules, cloneValue(requiredRule)]
    : unrelatedRules;

  if (nextRules.length) editRules[field.field] = nextRules;
  else delete editRules[field.field];
  return editRules;
}

function createGridEditorProxy(
  block: LowCodePageGridBlock,
  columnIndex: number,
  runtimeBlockEditor: LowCodeRuntimeBlockEditor,
): LowCodeRuntimeBlockEditor {
  return {
    getDataSource: (sourceKey) => runtimeBlockEditor.getDataSource?.(sourceKey),
    getPageSchema: () => runtimeBlockEditor.getPageSchema?.(),
    getPageRecord: () => runtimeBlockEditor.getPageRecord?.(),
    getServiceApi: () => runtimeBlockEditor.getServiceApi?.(),
    getScriptContextSource: () => runtimeBlockEditor.getScriptContextSource?.(),
    executeFieldScript: (script, event) => {
      return runtimeBlockEditor.executeFieldScript?.(script, event) ?? Promise.resolve(undefined);
    },
    updateBlock: async (update) => {
      const schema = isRecord(update.changes.schema) ? update.changes.schema : {};
      const fields = Array.isArray(schema.fields) ? schema.fields.filter(isRecord) : [];
      const field = fields[0] as LowCodeField | undefined;
      if (!field) throw new Error('字段设计结果中未找到当前字段。');

      const initialValues = isRecord(update.changes.initialValues)
        ? update.changes.initialValues
        : {};
      const grid = cloneValueWithFunctions(block.schema.grid);
      const columns = Array.isArray(grid.columns)
        ? cloneValueWithFunctions(grid.columns)
        : [];
      if (!columns[columnIndex]) throw new Error(`未找到表格第 ${columnIndex + 1} 列。`);

      columns[columnIndex] = createUpdatedColumn(columns[columnIndex], field, initialValues);
      grid.columns = columns;
      const editRules = createUpdatedEditRules(grid, field);
      if (Object.keys(editRules).length) grid.editRules = editRules;
      else delete grid.editRules;

      return runtimeBlockEditor.updateBlock({
        blockId: block.id,
        changes: {
          schema: {
            ...cloneValue(block.schema),
            grid,
          },
          gridDesignerUpdatedAt: Date.now(),
        },
      });
    },
  };
}

export async function openRuntimeGridFieldEditor(
  block: LowCodePageGridBlock,
  column: LowCodeGridColumn,
  columnIndex: number,
  runtimeBlockEditor: LowCodeRuntimeBlockEditor,
) {
  const fieldName = readString(column.field);
  if (!fieldName) throw new Error('当前列没有字段编码，无法设计字段。');

  const field = createFormField(block, column);
  const formBlock = createFormBlock(block, field, column);
  const editorProxy = createGridEditorProxy(block, columnIndex, runtimeBlockEditor);
  return openRuntimeFormFieldEditor(formBlock, field, editorProxy);
}
