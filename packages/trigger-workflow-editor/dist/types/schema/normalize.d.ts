import { type TriggerWorkflowModel } from './types';
export declare function normalizeTriggerWorkflow(value: unknown): TriggerWorkflowModel;
export declare function cloneTriggerWorkflow(model: TriggerWorkflowModel): TriggerWorkflowModel;
export declare function isRecord(value: unknown): value is Record<string, any>;
