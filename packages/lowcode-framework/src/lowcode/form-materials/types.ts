import type { Component } from 'vue';
import type { LowCodeField, LowCodeOption } from '../../types/lowcode';

export type LowCodeResolvedOption = LowCodeOption & Record<string, unknown>;

export type LowCodeFormMaterialPatchPayload = {
  values: Record<string, unknown>;
  row?: Record<string, unknown> | null;
};

export type LowCodeFormMaterialSelectPayload = {
  row: Record<string, unknown>;
  values: Record<string, unknown>;
};

export type LowCodeFormMaterialProps = {
  field: LowCodeField;
  modelValue: any;
  options?: LowCodeResolvedOption[];
  optionSources?: Record<string, unknown>;
  formValues?: Record<string, unknown>;
  onFieldChange?: (payload: {
    field: LowCodeField;
    value: unknown;
    previousValue: unknown;
    values: Record<string, unknown>;
  }) => void;
};

export type LowCodeFormMaterial = {
  type: string;
  label?: string;
  component: Component;
  aliases?: string[];
  order?: number;
};
