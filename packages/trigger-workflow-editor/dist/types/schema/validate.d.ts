import { type TriggerWorkflowIssue, type TriggerWorkflowModel } from './types';
export declare class TriggerWorkflowValidationError extends Error {
    readonly issues: TriggerWorkflowIssue[];
    constructor(issues: TriggerWorkflowIssue[]);
}
export declare function validateTriggerWorkflow(model: TriggerWorkflowModel): TriggerWorkflowIssue[];
export declare function assertValidTriggerWorkflow(model: TriggerWorkflowModel): TriggerWorkflowIssue[];
