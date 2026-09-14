export type MobileTableBlock = Record<string, any> & {
  id: string;
  kind: string;
  title?: string;
  description?: string;
  schema?: Record<string, any>;
  sourceKey?: string;
  rows?: Record<string, unknown>[];
};

export type MobileTableMaterialProps = {
  block: MobileTableBlock;
  resolvedData: Record<string, unknown>;
  formModels?: Record<string, Record<string, unknown>>;
  activeActionCodes?: Record<string, string>;
  executingActionKeys: Set<string>;
  editPageMode?: 'add' | 'edit' | 'scan';
  gridStates: Record<string, {
    rows: Record<string, unknown>[];
    currentRow: Record<string, unknown> | null;
    selectedRows: Record<string, unknown>[];
  }>;
};

export type MobileTableRuntimeEvent = {
  name: string;
  blockId?: string;
  blockKind?: string;
  timestamp: number;
  payload?: Record<string, unknown>;
};

export type MobileTableMaterialEmits = {
  runtimeEvent: [event: MobileTableRuntimeEvent];
};

// Compatibility aliases used by the component implementation.  They remain
// table-local so this package can be published independently of the low-code
// runtime package.
export type MobileMaterialProps = MobileTableMaterialProps;
export type MobileMaterialEmits = MobileTableMaterialEmits;
export type MobileRuntimeEvent = MobileTableRuntimeEvent;
import type { RowActionPredicate } from './row-action-state';

export type SharedLowCodeAction = Record<string, any> & {
  code: string;
  label?: string;
  visible?: RowActionPredicate;
  when?: RowActionPredicate;
  disabled?: RowActionPredicate;
  status?: string;
};
