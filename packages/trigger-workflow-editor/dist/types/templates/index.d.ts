import { type TriggerWorkflowModel } from '../schema/types';
export declare function createApprovalTriggerWorkflow(): TriggerWorkflowModel;
export declare function createDataSyncTriggerWorkflow(): TriggerWorkflowModel;
export declare function createAiAgentTriggerWorkflow(): TriggerWorkflowModel;
export declare const triggerWorkflowTemplates: {
    approval: typeof createApprovalTriggerWorkflow;
    dataSync: typeof createDataSyncTriggerWorkflow;
    aiAgent: typeof createAiAgentTriggerWorkflow;
};
