import type { LowCodeField, LowCodeFormLayoutNode, LowCodeOption } from '~/types/lowcode';
import type {
  MaterialPropFieldTarget,
  MaterialPropFormDefinition,
  MaterialPropFormField,
  MaterialPropValueKind,
} from './types';

type FieldInput = Partial<Omit<MaterialPropFormField, 'target' | 'valueKind'>> &
  Pick<MaterialPropFormField, 'field' | 'label'> & {
  target?: MaterialPropFieldTarget;
  valueKind?: MaterialPropValueKind;
};

type ArrayTableColumnInput = {
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

type ArrayTableFieldInput = FieldInput & {
  columns: ArrayTableColumnInput[];
  addText?: string;
  rowKey?: string;
  defaultRow?: Record<string, unknown>;
  valueMode?: 'object' | 'primitive';
  valueField?: string;
  valueTitle?: string;
};

type SubFormFieldInput = FieldInput & {
  fields: MaterialPropFormField[];
  layout?: LowCodeFormLayoutNode[];
};

export function defineMaterialPropForm(definition: MaterialPropFormDefinition) {
  return definition;
}

export function defineMaterialPropForms(definitions: MaterialPropFormDefinition[]) {
  return definitions;
}

export function propField(field: FieldInput): MaterialPropFormField {
  return {
    target: 'props',
    valueKind: 'string',
    component: field.component ?? 'vxe-input',
    ...field,
  };
}

export function jsonPropField(field: FieldInput): MaterialPropFormField {
  return propField({
    component: 'lc-json-editor',
    valueKind: 'json',
    props: {
      rows: 8,
      resize: 'vertical',
      ...(field.props ?? {}),
    },
    ...field,
  });
}

export function arrayTablePropField({
  columns,
  addText = '新增',
  rowKey = '__rowKey',
  defaultRow,
  valueMode,
  valueField,
  valueTitle,
  props,
  ...field
}: ArrayTableFieldInput): MaterialPropFormField {
  return propField({
    component: 'lc-array-table',
    valueKind: 'raw',
    defaultValue: [],
    props: {
      addText,
      rowKey,
      columns,
      ...(defaultRow ? { defaultRow } : {}),
      ...(valueMode ? { valueMode } : {}),
      ...(valueField ? { valueField } : {}),
      ...(valueTitle ? { valueTitle } : {}),
      ...(props ?? {}),
    },
    ...field,
  });
}

export function subFormPropField({
  fields,
  layout,
  props,
  ...field
}: SubFormFieldInput): MaterialPropFormField {
  return propField({
    component: 'lc-sub-form',
    valueKind: 'raw',
    defaultValue: {},
    props: {
      fields,
      ...(layout?.length ? { layout } : {}),
      ...(props ?? {}),
    },
    ...field,
  });
}

export function switchPropField(field: FieldInput): MaterialPropFormField {
  return propField({
    component: 'vxe-switch',
    valueKind: 'boolean',
    ...field,
  });
}

export function option(
  label: string,
  rawValue: unknown,
  value: string | number = String(rawValue),
): LowCodeOption {
  return {
    label,
    value,
    rawValue,
  };
}
