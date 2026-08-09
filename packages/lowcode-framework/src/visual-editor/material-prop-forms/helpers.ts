import { createSubFormField } from '../../lowcode/form-schema';
import type {
  LowCodeAction,
  LowCodeField,
  LowCodeFormLayoutNode,
  LowCodeOption,
} from '../../types/lowcode';
import type {
  MaterialPropFieldTarget,
  MaterialPropFormDefinition,
  MaterialPropFormField,
  MaterialPropValueKind,
} from './types';
import type { VxeButtonProps } from 'vxe-pc-ui';

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
  toolbarButtons?: Array<
    VxeButtonProps & {
      code: string | number;
      label: string;
      command?: string;
      row?: Record<string, unknown>;
      visible?: boolean;
    }
  >;
  rowKey?: string;
  defaultRow?: Record<string, unknown>;
  valueMode?: 'object' | 'primitive';
  valueField?: string;
  valueTitle?: string;
};

type SubFormFieldInput = FieldInput & {
  fields: MaterialPropFormField[];
  columns?: number;
  layout?: LowCodeFormLayoutNode[];
  actions?: LowCodeAction[];
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
  toolbarButtons = [
    {
      code: 'add',
      label: '新增',
      command: 'add',
      status: 'primary',
    },
  ],
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
      toolbarButtons,
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
  columns,
  layout,
  actions,
  props,
  ...field
}: SubFormFieldInput): MaterialPropFormField {
  return createSubFormField({
    target: 'props',
    valueKind: 'raw',
    defaultValue: {},
    fields,
    columns,
    layout,
    actions,
    props,
    ...field,
  }) as MaterialPropFormField;
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
