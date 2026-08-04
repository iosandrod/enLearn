import type {
  LowCodeAction,
  LowCodeButtonGroupAction,
  LowCodeField,
  LowCodeFormSchema,
  LowCodePageDataSource,
  LowCodePageRecord,
  LowCodePageSchema,
  LowCodeRuntimeDirective,
  LowCodeRuntimeEvent,
} from '../../../packages/lowcode-framework/src/types/lowcode';

export type SharedLowCodePageSchema = LowCodePageSchema;
export type SharedLowCodePageDataSource = LowCodePageDataSource;
export type SharedLowCodeFormSchema = LowCodeFormSchema;
export type SharedLowCodeField = LowCodeField;
export type SharedLowCodeAction = LowCodeAction;
export type SharedLowCodeButtonAction = LowCodeButtonGroupAction;
export type SharedLowCodeDirective = LowCodeRuntimeDirective;
export type SharedLowCodeEvent = LowCodeRuntimeEvent;

export type MobileRuntimeBlock = Record<string, any> & {
  id: string;
  kind: string;
  title?: string;
  description?: string;
  blocks?: MobileRuntimeBlock[];
};

export type MobilePageSchema = Omit<SharedLowCodePageSchema, 'blocks'> & {
  blocks: MobileRuntimeBlock[];
};

export type MobilePageRecord = Omit<LowCodePageRecord, 'schema'> & {
  schema: MobilePageSchema;
  resolvedData?: Record<string, unknown>;
};

export type MobileFormModels = Record<string, Record<string, unknown>>;

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
};

export type MobileMaterialEmits = {
  runtimeEvent: [event: MobileRuntimeEvent];
};
