import type {
  LowCodeAction,
  LowCodeField,
  LowCodeFormLayoutNode,
  LowCodeFormSchema,
  LowCodeSubFormProps,
} from '../types/lowcode';

export type CreateSubFormSchemaInput = {
  fields: LowCodeField[];
  columns?: number;
  layout?: LowCodeFormLayoutNode[];
  actions?: LowCodeAction[];
};

type CanonicalSubFormExtraProps = Record<string, unknown> & {
  schema?: never;
  fields?: never;
  columns?: never;
  layout?: never;
  actions?: never;
};

export type CreateSubFormFieldInput = Omit<LowCodeField, 'component' | 'props'> &
  CreateSubFormSchemaInput & {
    props?: CanonicalSubFormExtraProps;
    [key: string]: unknown;
  };

type SubFormSchemaInputKey = keyof CreateSubFormSchemaInput | 'props';
type CreatedSubFormField<T extends CreateSubFormFieldInput> = Omit<
  T,
  SubFormSchemaInputKey
> & {
  component: 'lc-sub-form';
  props: LowCodeSubFormProps;
};

export function createSubFormSchema({
  fields,
  columns = 1,
  layout = [],
  actions = [],
}: CreateSubFormSchemaInput): LowCodeFormSchema {
  return {
    columns,
    fields,
    layout,
    actions,
  };
}

export function createSubFormField<T extends CreateSubFormFieldInput>({
  fields,
  columns,
  layout,
  actions,
  props = {},
  ...field
}: T): CreatedSubFormField<T> {
  return {
    ...field,
    component: 'lc-sub-form',
    props: {
      ...props,
      schema: createSubFormSchema({ fields, columns, layout, actions }),
    },
  } as CreatedSubFormField<T>;
}

export function isLowCodeFormSchema(value: unknown): value is LowCodeFormSchema {
  if (!isRecord(value) || !Array.isArray(value.fields) || !Array.isArray(value.actions)) {
    return false;
  }
  if (value.layout !== undefined && !Array.isArray(value.layout)) return false;
  if (
    value.columns !== undefined &&
    (typeof value.columns !== 'number' || !Number.isFinite(value.columns) || value.columns < 1)
  ) {
    return false;
  }

  return value.fields.every((field) =>
    isRecord(field) &&
    typeof field.field === 'string' &&
    typeof field.label === 'string' &&
    typeof field.component === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
