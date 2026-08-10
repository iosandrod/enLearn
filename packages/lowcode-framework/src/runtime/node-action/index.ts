import type { LowCodePageBlock } from '../../types/lowcode';
import type { LowCodeNodeActionRuntimeHandler } from '../node-action-runtime';

export type LowCodeNodeKind = LowCodePageBlock['kind'];

export type LowCodeNodeActionExecutor =
  | 'overlay.open'
  | 'grid.loadData'
  | 'grid.reloadData'
  | 'grid.validate'
  | 'grid.addRow'
  | 'grid.deleteCurrentRow'
  | 'form.setData'
  | 'form.validate'
  | 'form.getData'
  | 'form.refreshOptions'
  | 'form.resetData';

export type LowCodeNodeActionParameter = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
};

export type LowCodeNodeActionMethodDefinition = {
  method: string;
  label: string;
  description: string;
  executor: LowCodeNodeActionExecutor;
  dataSourceLoader?: boolean;
  parameters: LowCodeNodeActionParameter[];
  returns: string;
  createInsertText: (nodeId: string) => string;
  execute?: LowCodeNodeActionRuntimeHandler;
};

export type LowCodeNodeTypeDefinition = {
  kind: LowCodeNodeKind;
  label: string;
  icon: string;
  methods: Record<string, LowCodeNodeActionMethodDefinition>;
};

export * from './button-group-action';
export * from './form-action';
export * from './grid-action';
