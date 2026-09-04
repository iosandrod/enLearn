import type { LowCodeField } from '../../types/lowcode';
import type { VxeButtonProps } from 'vxe-pc-ui';

export type ArrayTableToolbarButton = VxeButtonProps & {
  code: string | number;
  label: string;
  command?: string;
  row?: Record<string, unknown>;
  visible?: boolean;
  execute?: ArrayTableToolbarExecute;
};

export type ArrayTableToolbarClickParams = {
  name?: string | number;
  option?: VxeButtonProps & Record<string, unknown>;
};

export type ArrayTableToolbarExecutionContext = {
  action: ArrayTableToolbarButton;
  actionCode: string | number;
  command?: string;
  click: ArrayTableToolbarClickParams;
  rows: Record<string, unknown>[];
  field: LowCodeField;
  addRow: (row?: Record<string, unknown>) => Record<string, unknown>;
};

export type ArrayTableToolbarExecute = (
  context: ArrayTableToolbarExecutionContext,
) => unknown | Promise<unknown>;
