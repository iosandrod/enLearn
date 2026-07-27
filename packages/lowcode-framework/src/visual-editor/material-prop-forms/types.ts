import type {
  LowCodeAction,
  LowCodeField,
  LowCodeFormLayoutNode,
  LowCodeFormSchema,
} from '../../types/lowcode';

export type MaterialPropFieldTarget = 'block' | 'props' | 'styles';

export type MaterialPropValueKind =
  | 'boolean'
  | 'json'
  | 'layoutSlots'
  | 'number'
  | 'raw'
  | 'string';

export type MaterialPropFormField = LowCodeField & {
  target?: MaterialPropFieldTarget;
  path?: string;
  defaultValue?: unknown;
  valueKind?: MaterialPropValueKind;
  syncTo?: string[];
};

export type MaterialPropFormDefinition = {
  componentKey: string;
  title?: string;
  extendsVisualProps?: boolean;
  fields: MaterialPropFormField[];
  layout?: LowCodeFormLayoutNode[];
  actions?: LowCodeAction[];
};

export type MaterialPropFormSchema = LowCodeFormSchema & {
  fields: MaterialPropFormField[];
};

export type MaterialPropFormModule =
  | { default?: MaterialPropFormDefinition | MaterialPropFormDefinition[] }
  | MaterialPropFormDefinition
  | MaterialPropFormDefinition[];
