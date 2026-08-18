import type {
  LowCodeAction,
  LowCodeButtonGroupAction,
  LowCodeEditPageMode,
  LowCodeField,
  LowCodeFormSchema,
  LowCodePageDataSource,
  LowCodePageRecord,
  LowCodePageSchema,
  LowCodeGridRowAction,
  LowCodeRuntimeDirective,
  LowCodeRuntimeEvent,
} from '../../../packages/lowcode-framework/src/types/lowcode';

export type SharedLowCodePageSchema = LowCodePageSchema;
export type SharedLowCodePageDataSource = LowCodePageDataSource;
export type SharedLowCodeFormSchema = LowCodeFormSchema;
export type SharedLowCodeField = LowCodeField;
export type SharedLowCodeAction = Omit<LowCodeAction, 'disabled'> &
  Pick<LowCodeGridRowAction, 'visible' | 'when' | 'disabled'>;
export type SharedLowCodeButtonAction = LowCodeButtonGroupAction;
export type SharedLowCodeDirective = LowCodeRuntimeDirective;
export type SharedLowCodeEvent = LowCodeRuntimeEvent;

export type MobileRuntimeBlock = Record<string, any> & {
  id: string;
  kind: string;
  title?: string;
  description?: string;
  blocks?: MobileRuntimeBlock[];
  overlays?: MobileRuntimeBlock[];
  tabs?: Array<{
    key: string;
    label: string;
    blocks?: MobileRuntimeBlock[];
  }>;
};

export type MobilePageSchema = Omit<SharedLowCodePageSchema, 'blocks'> & {
  blocks: MobileRuntimeBlock[];
  overlays?: MobileRuntimeBlock[];
};

export type MobilePageRecord = Omit<LowCodePageRecord, 'schema'> & {
  schema: MobilePageSchema;
  overlays?: MobileRuntimeBlock[];
  resolvedData?: Record<string, unknown>;
};

export type MobileFormModels = Record<string, Record<string, unknown>>;

export type MobileGridRuntimeState = {
  rows: Record<string, unknown>[];
  currentRow: Record<string, unknown> | null;
  selectedRows: Record<string, unknown>[];
};

export type MobileGridRuntimeStates = Record<string, MobileGridRuntimeState>;

export type MobileRuntimeEvent = SharedLowCodeEvent & {
  payload?: Record<string, unknown> & {
    action?: SharedLowCodeAction | SharedLowCodeButtonAction;
    actionCode?: string;
    directives?: SharedLowCodeDirective[];
    values?: Record<string, unknown>;
    row?: Record<string, unknown>;
  };
};

export type MobileMaterialProps = {
  block: MobileRuntimeBlock;
  resolvedData: Record<string, unknown>;
  formModels: MobileFormModels;
  activeActionCodes: Record<string, string>;
  executingActionKeys: Set<string>;
  editPageMode?: LowCodeEditPageMode;
  gridStates: MobileGridRuntimeStates;
  serviceApi?: import('./service-api').MobileServiceApi;
};

export type MobileRuntimeRendererProps = Omit<MobileMaterialProps, 'serviceApi'> & {
  serviceApi: import('./service-api').MobileServiceApi;
};

export type MobileMaterialEmits = {
  runtimeEvent: [event: MobileRuntimeEvent];
};
