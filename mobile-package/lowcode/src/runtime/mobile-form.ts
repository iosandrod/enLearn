import type {
  SharedLowCodeField,
  SharedLowCodeFormSchema,
} from './types';

export type MobileFormControlKind =
  | 'text'
  | 'password'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'switch'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'tree'
  | 'cascader'
  | 'color'
  | 'json'
  | 'array'
  | 'subform';

export type MobileFormOption = {
  label: string;
  value: unknown;
  rawValue: unknown;
  disabled: boolean;
  children: MobileFormOption[];
  source?: Record<string, unknown>;
};

export type MobileFlatOption = MobileFormOption & {
  depth: number;
  pathLabel: string;
};

export type MobileFormRow = {
  cells: Array<{
    field: SharedLowCodeField;
    span: number;
  }>;
  used: number;
};

export function isFormRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cloneFormValue<T>(value: T): T {
  if (!Array.isArray(value) && !isFormRecord(value)) return value;

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

export function readFormBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return fallback;
}

export function readFormNumber(value: unknown, fallback?: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallback;
}

export function readInputEventValue(event: unknown) {
  if (event && typeof event === 'object') {
    if ('value' in event) {
      return String((event as { value?: unknown }).value ?? '');
    }
    const target = (event as { target?: unknown; currentTarget?: unknown }).target
      ?? (event as { currentTarget?: unknown }).currentTarget;
    if (target && typeof target === 'object' && 'value' in target) {
      return String((target as { value?: unknown }).value ?? '');
    }
  }
  return '';
}

export function formControlKind(component: string): MobileFormControlKind {
  switch (component) {
    case 'vxe-password-input':
      return 'password';
    case 'vxe-textarea':
      return 'textarea';
    case 'lc-number-input':
      return 'number';
    case 'vxe-switch':
      return 'switch';
    case 'lc-checkbox':
      return 'boolean';
    case 'vxe-select':
    case 'lc-option-select':
      return 'select';
    case 'vxe-radio-group':
      return 'radio';
    case 'vxe-checkbox-group':
      return 'checkbox';
    case 'vxe-tree-select':
      return 'tree';
    case 'lc-cascader':
      return 'cascader';
    case 'lc-color-picker':
      return 'color';
    case 'lc-json-editor':
      return 'json';
    case 'lc-array-table':
      return 'array';
    case 'lc-sub-form':
      return 'subform';
    default:
      return 'text';
  }
}

export function isWideMobileFormField(field: SharedLowCodeField) {
  return ['lc-array-table', 'lc-sub-form', 'lc-json-editor', 'vxe-textarea'].includes(
    field.component,
  );
}

export function isEmptyFormValue(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (isFormRecord(value)) return Object.keys(value).length === 0;
  return false;
}

function unwrapOptionSource(source: unknown): unknown[] {
  if (Array.isArray(source)) return source;
  if (!isFormRecord(source)) return [];

  for (const key of ['rows', 'data', 'options', 'items']) {
    if (Array.isArray(source[key])) return source[key] as unknown[];
  }
  return [];
}

function readOptionKey(field: SharedLowCodeField, key: string, fallback: string) {
  const value = field.optionProps?.[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function normalizeFormOption(
  option: unknown,
  field: SharedLowCodeField,
): MobileFormOption {
  if (!isFormRecord(option)) {
    return {
      label: String(option ?? ''),
      value: option,
      rawValue: option,
      disabled: false,
      children: [],
    };
  }

  const labelKey = readOptionKey(field, 'label', 'label');
  const valueKey = readOptionKey(field, 'value', 'value');
  const childrenKey = readOptionKey(field, 'children', 'children');
  const disabledKey = readOptionKey(field, 'disabled', 'disabled');
  const label = option[labelKey]
    ?? option.name
    ?? option.title
    ?? option.code
    ?? option.id
    ?? '';
  const value = option[valueKey]
    ?? option.code
    ?? option.id
    ?? label;
  const rawValue = Object.prototype.hasOwnProperty.call(option, 'rawValue')
    ? option.rawValue
    : option;

  return {
    label: String(label),
    value,
    rawValue,
    disabled: readFormBoolean(option[disabledKey]),
    children: unwrapOptionSource(option[childrenKey]).map((child) =>
      normalizeFormOption(child, field)
    ),
    source: option,
  };
}

export function resolveFormOptions(
  field: SharedLowCodeField,
  optionSources: Record<string, unknown>,
) {
  const source = field.optionsSourceKey
    ? optionSources[field.optionsSourceKey]
    : field.options;
  return unwrapOptionSource(source).map((option) => normalizeFormOption(option, field));
}

export function flattenFormOptions(
  options: MobileFormOption[],
  leafOnly = false,
) {
  const flattened: MobileFlatOption[] = [];

  function visit(option: MobileFormOption, parents: string[], depth: number) {
    const path = [...parents, option.label];
    if (!leafOnly || !option.children.length) {
      flattened.push({
        ...option,
        depth,
        pathLabel: path.filter(Boolean).join(' / '),
      });
    }
    option.children.forEach((child) => visit(child, path, depth + 1));
  }

  options.forEach((option) => visit(option, [], 0));
  return flattened;
}

export function sameFormValue(previous: unknown, next: unknown) {
  if (Object.is(previous, next)) return true;
  if (
    (Array.isArray(previous) || isFormRecord(previous))
    && (Array.isArray(next) || isFormRecord(next))
  ) {
    try {
      return JSON.stringify(previous) === JSON.stringify(next);
    } catch {
      return false;
    }
  }
  return false;
}

export function readStoredOptionValue(
  field: SharedLowCodeField,
  option: MobileFormOption,
) {
  return cloneFormValue(
    field.component === 'lc-option-select' ? option.rawValue : option.value,
  );
}

export function findSelectedFormOption(
  field: SharedLowCodeField,
  options: MobileFlatOption[],
  value: unknown,
) {
  return options.find((option) =>
    sameFormValue(readStoredOptionValue(field, option), value)
  );
}

export function resolveResponsiveFormColumns(columns: unknown, width: number) {
  const configured = Math.min(6, Math.max(1, Math.round(readFormNumber(columns, 1) ?? 1)));
  if (!Number.isFinite(width) || width <= 0 || width < 620) return 1;
  if (width < 920) return Math.min(2, configured);
  return configured;
}

export function buildMobileFormRows(
  fields: SharedLowCodeField[],
  columns: number,
) {
  const normalizedColumns = Math.max(1, Math.floor(columns));
  const rows: MobileFormRow[] = [];
  let row: MobileFormRow = { cells: [], used: 0 };

  fields.forEach((field) => {
    const configuredSpan = readFormNumber(field.span);
    const defaultSpan = isWideMobileFormField(field) ? normalizedColumns : 1;
    const span = Math.min(
      normalizedColumns,
      Math.max(1, Math.round(configuredSpan ?? defaultSpan)),
    );

    if (row.cells.length && row.used + span > normalizedColumns) {
      rows.push(row);
      row = { cells: [], used: 0 };
    }

    row.cells.push({ field, span });
    row.used += span;

    if (row.used >= normalizedColumns) {
      rows.push(row);
      row = { cells: [], used: 0 };
    }
  });

  if (row.cells.length) rows.push(row);
  return rows;
}

export function readNestedFormSchema(field: SharedLowCodeField) {
  const candidate = field.props?.schema;
  if (!isFormRecord(candidate) || !Array.isArray(candidate.fields)) return undefined;

  return {
    ...candidate,
    fields: candidate.fields.filter(isFormRecord) as SharedLowCodeField[],
    actions: Array.isArray(candidate.actions) ? candidate.actions : [],
  } as SharedLowCodeFormSchema;
}

export function normalizeArrayFormColumns(field: SharedLowCodeField) {
  const source = Array.isArray(field.props?.columns) ? field.props.columns : [];
  const valueMode = field.props?.valueMode === 'primitive' ? 'primitive' : 'object';
  const valueField = typeof field.props?.valueField === 'string' && field.props.valueField.trim()
    ? field.props.valueField
    : 'value';

  if (!source.length && valueMode === 'primitive') {
    return [{
      field: valueField,
      label: String(field.props?.valueTitle ?? '值'),
      component: 'vxe-input',
      props: {
        placeholder: field.props?.placeholder,
      },
    }] as SharedLowCodeField[];
  }

  return source
    .filter(isFormRecord)
    .map((column, index) => {
      const name = String(column.field ?? `field${index + 1}`);
      const columnProps = isFormRecord(column.props) ? column.props : {};
      return {
        field: name,
        label: String(column.label ?? column.title ?? name),
        component: String(column.component ?? 'vxe-input'),
        help: typeof column.help === 'string' ? column.help : undefined,
        props: {
          ...columnProps,
          ...(column.placeholder !== undefined
            ? { placeholder: column.placeholder }
            : {}),
          ...(column.readonly !== undefined ? { readonly: column.readonly } : {}),
          ...(column.disabled !== undefined ? { disabled: column.disabled } : {}),
        },
        options: Array.isArray(column.options) ? column.options : undefined,
        optionsSourceKey: typeof column.optionsSourceKey === 'string'
          ? column.optionsSourceKey
          : undefined,
        optionProps: isFormRecord(column.optionProps) ? column.optionProps : undefined,
        rules: Array.isArray(column.rules) ? column.rules : undefined,
      } as SharedLowCodeField;
    });
}

export function normalizeArrayFormRows(field: SharedLowCodeField, value: unknown) {
  const rows = Array.isArray(value) ? value : [];
  const valueMode = field.props?.valueMode === 'primitive' ? 'primitive' : 'object';
  const valueField = typeof field.props?.valueField === 'string' && field.props.valueField.trim()
    ? field.props.valueField
    : 'value';

  return rows.map((row) => {
    if (valueMode === 'primitive') return { [valueField]: cloneFormValue(row) };
    return isFormRecord(row) ? cloneFormValue(row) : {};
  });
}

export function serializeArrayFormRows(
  field: SharedLowCodeField,
  rows: Record<string, unknown>[],
) {
  if (field.props?.valueMode !== 'primitive') return cloneFormValue(rows);
  const valueField = typeof field.props?.valueField === 'string' && field.props.valueField.trim()
    ? field.props.valueField
    : 'value';
  return rows.map((row) => cloneFormValue(row[valueField]));
}

export function createArrayFormRow(field: SharedLowCodeField) {
  const row = isFormRecord(field.props?.defaultRow)
    ? cloneFormValue(field.props.defaultRow)
    : {};

  normalizeArrayFormColumns(field).forEach((column) => {
    if (!(column.field in row) && column.props?.defaultValue !== undefined) {
      row[column.field] = cloneFormValue(column.props.defaultValue);
    }
  });
  return row;
}

function valueMeasure(field: SharedLowCodeField, value: unknown) {
  if (Array.isArray(value)) return value.length;
  return String(value ?? '').length;
}

export function validateMobileFormField(
  field: SharedLowCodeField,
  value: unknown,
  depth = 0,
): string {
  if (depth > 8) return '表单嵌套层级过深';

  for (const rule of field.rules ?? []) {
    if (rule.required && isEmptyFormValue(value)) return rule.message;
    if (rule.min !== undefined && !isEmptyFormValue(value)) {
      const measure = valueMeasure(field, value);
      if (measure < rule.min) return rule.message;
    }
  }

  const kind = formControlKind(field.component);
  const empty = isEmptyFormValue(value);

  if (kind === 'subform') {
    const schema = readNestedFormSchema(field);
    const values = isFormRecord(value) ? value : {};
    if (schema) {
      for (const nestedField of schema.fields) {
        const error = validateMobileFormField(
          nestedField,
          values[nestedField.field],
          depth + 1,
        );
        if (error) return `${nestedField.label}：${error}`;
      }
    }
  }

  if (kind === 'array') {
    const rows = normalizeArrayFormRows(field, value);
    const minRows = readFormNumber(field.props?.minRows, 0) ?? 0;
    if (rows.length < minRows) return `至少需要 ${minRows} 行`;

    const columns = normalizeArrayFormColumns(field);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      for (const column of columns) {
        const error = validateMobileFormField(
          column,
          rows[rowIndex][column.field],
          depth + 1,
        );
        if (error) return `第 ${rowIndex + 1} 行 ${column.label}：${error}`;
      }
    }
  }

  if (empty) return '';

  if (kind === 'number') {
    const numeric = readFormNumber(value);
    if (numeric === undefined) return '请输入有效数字';
    const min = readFormNumber(field.props?.min);
    const max = readFormNumber(field.props?.max);
    if (min !== undefined && numeric < min) {
      return String(field.props?.minMessage ?? `不能小于 ${min}`);
    }
    if (max !== undefined && numeric > max) {
      return String(field.props?.maxMessage ?? `不能大于 ${max}`);
    }
  }

  if (kind === 'json' && typeof value === 'string') {
    try {
      JSON.parse(value);
    } catch {
      return 'JSON 格式不正确';
    }
  }

  return '';
}

export function validateMobileFormValues(
  schema: SharedLowCodeFormSchema,
  values: Record<string, unknown>,
) {
  return (Array.isArray(schema.fields) ? schema.fields : []).reduce<Record<string, string>>(
    (errors, field) => {
      const error = validateMobileFormField(field, values[field.field]);
      if (error) errors[field.field] = error;
      return errors;
    },
    {},
  );
}

export function formatJsonFormValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
