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
  formValues?: Record<string, unknown>;
};

export type LowCodeFormMaterial = {
  type: string;
  label?: string;
  component: Component;
  aliases?: string[];
  order?: number;
};
