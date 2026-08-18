import type { Component } from 'vue';
import type { VisualEditorComponent } from '../../visual-editor/visual-editor.utils';
import type { VisualToLowCodeConverter } from '../visual-converters/types';
import type {
  LowCodeAction,
  LowCodeButtonGroupAction,
  LowCodePageBlock,
  LowCodePageGridBlock,
  LowCodePageSearchFormBlock,
  LowCodeRuntimeEvent,
} from '../../types/lowcode';

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
  formSubmit: [
    payload: {
      block: LowCodeRuntimeBlock;
      values: Record<string, unknown>;
      action?: LowCodeAction;
    },
  ];
  formAction: [
    payload: {
      block: LowCodeRuntimeBlock;
      action: LowCodeAction;
      values: Record<string, unknown>;
    },
  ];
  gridEdit: [payload: { block: LowCodePageGridBlock; row: Record<string, unknown> }];
  gridDelete: [payload: { block: LowCodePageGridBlock; row: Record<string, unknown> }];
  toolbarAction: [
    payload: { block: LowCodeRuntimeBlock; action: LowCodeAction | LowCodeButtonGroupAction },
  ];
  searchSubmit: [
    payload: {
      block: LowCodePageSearchFormBlock;
      values: Record<string, unknown>;
      action?: LowCodeAction;
    },
  ];
  searchAction: [
    payload: {
      block: LowCodePageSearchFormBlock;
      action: LowCodeAction;
      values: Record<string, unknown>;
    },
  ];
  runtimeEvent: [event: LowCodeRuntimeEvent];
};

export type LowCodeBlockValidationIssue = {
  path?: string;
  message: string;
};

export type LowCodeBlockMaterialDesigner =
  | VisualEditorComponent
  | (() => Promise<VisualEditorComponent>);

export type LowCodeBlockMaterial<T extends LowCodeRuntimeBlock = LowCodeRuntimeBlock> = {
  type: string;
  label?: string;
  component: Component;
  designer?: LowCodeBlockMaterialDesigner;
  propsSchema?: Record<string, unknown>;
  materialVersion?: string;
  createDefaultBlock?: (overrides?: Partial<T>) => T;
  converter?: VisualToLowCodeConverter;
  validate?: (block: T) => LowCodeBlockValidationIssue[];
  aliases?: string[];
  order?: number;
};
