import type { Component } from 'vue';
import type { LowCodeField, LowCodeOption } from '~/types/lowcode';

export type LowCodeResolvedOption = LowCodeOption & Record<string, unknown>;

export type LowCodeFormMaterialProps = {
  field: LowCodeField;
  modelValue: any;
  options?: LowCodeResolvedOption[];
};

export type LowCodeFormMaterial = {
  type: string;
  label?: string;
  component: Component;
  aliases?: string[];
  order?: number;
};
