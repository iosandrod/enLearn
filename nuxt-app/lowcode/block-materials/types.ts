import type { Component } from 'vue';
import type {
  LowCodeAction,
  LowCodePageBlock,
  LowCodePageGridBlock,
  LowCodePageSearchFormBlock,
} from '~/types/lowcode';

export type LowCodeRuntimeBlock =
  | LowCodePageBlock
  | (Record<string, any> & {
      id: string;
      kind: string;
      title?: string;
      description?: string;
    });

export type LowCodeBlockMaterialProps<T extends LowCodeRuntimeBlock = LowCodeRuntimeBlock> = {
  block: T;
  resolvedData: Record<string, unknown>;
  formModels: Record<string, Record<string, unknown>>;
  searchFilters: Record<string, Record<string, unknown>>;
  loadingBlockId?: string;
  loadingGridId?: string;
};

export type LowCodeBlockMaterialEmits = {
  formSubmit: [payload: { block: LowCodeRuntimeBlock; values: Record<string, unknown> }];
  formAction: [
    payload: {
      block: LowCodeRuntimeBlock;
      action: LowCodeAction;
      values: Record<string, unknown>;
    },
  ];
  gridEdit: [payload: { block: LowCodePageGridBlock; row: Record<string, unknown> }];
  gridDelete: [payload: { block: LowCodePageGridBlock; row: Record<string, unknown> }];
  toolbarAction: [payload: { block: LowCodeRuntimeBlock; action: LowCodeAction }];
  searchSubmit: [
    payload: { block: LowCodePageSearchFormBlock; values: Record<string, unknown> },
  ];
  searchAction: [
    payload: {
      block: LowCodePageSearchFormBlock;
      action: LowCodeAction;
      values: Record<string, unknown>;
    },
  ];
};

export type LowCodeBlockMaterial = {
  type: string;
  label?: string;
  component: Component;
  aliases?: string[];
  order?: number;
};
