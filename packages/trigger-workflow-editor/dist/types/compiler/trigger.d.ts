import type { TriggerEdgeCondition, TriggerWorkflowModel, TriggerWorkflowTaskRef } from '../schema/types';
export type TriggerWorkflowOperationType = 'entry' | 'schedule' | 'webhook' | 'task.trigger' | 'task.triggerAndWait' | 'task.batchTriggerAndWait' | 'wait.for' | 'wait.until' | 'wait.forToken' | 'condition' | 'parallel' | 'human.approval' | 'ai.agent' | 'data.connector' | 'complete';
export type TriggerWorkflowOperation = {
    id: string;
    nodeId: string;
    type: TriggerWorkflowOperationType;
    label: string;
    task?: TriggerWorkflowTaskRef;
    condition?: TriggerEdgeCondition;
    dependsOn: string[];
    next: string[];
    options: Record<string, unknown>;
};
export type TriggerWorkflowExecutionPlan = {
    workflowId: string;
    workflowCode: string;
    workflowName: string;
    kind: TriggerWorkflowModel['kind'];
    entryNodeId: string;
    operations: TriggerWorkflowOperation[];
    taskIds: string[];
    schedule?: {
        nodeId: string;
        cron: string;
        timezone?: string;
        externalId?: string;
    };
};
export declare function compileTriggerWorkflow(model: TriggerWorkflowModel): TriggerWorkflowExecutionPlan;
