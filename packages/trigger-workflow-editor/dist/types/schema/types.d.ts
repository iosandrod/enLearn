export declare const TRIGGER_WORKFLOW_SCHEMA_VERSION = 1;
export type TriggerWorkflowKind = 'approval' | 'dataSync' | 'aiAgent' | 'custom';
export type TriggerNodeType = 'start' | 'schedule' | 'webhook' | 'manualApproval' | 'condition' | 'parallel' | 'task' | 'triggerAndWait' | 'batchTrigger' | 'wait' | 'dataSource' | 'transform' | 'dataSink' | 'agent' | 'tool' | 'memory' | 'humanReview' | 'end' | (string & {});
export type TriggerEdgeCondition = {
    type: 'always';
} | {
    type: 'field';
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
    value?: unknown;
} | {
    type: 'expression';
    expression: string;
};
export type TriggerWorkflowPosition = {
    x: number;
    y: number;
};
export type TriggerWorkflowRetryConfig = {
    maxAttempts?: number;
    factor?: number;
    minTimeoutMs?: number;
    maxTimeoutMs?: number;
};
export type TriggerWorkflowQueueConfig = {
    name?: string;
    concurrencyLimit?: number;
};
export type TriggerWorkflowTaskRef = {
    id: string;
    importPath?: string;
    queue?: TriggerWorkflowQueueConfig;
    retry?: TriggerWorkflowRetryConfig;
    timeoutSeconds?: number;
    idempotencyKey?: string;
};
export type TriggerWorkflowNodeConfig = {
    task?: TriggerWorkflowTaskRef;
    schedule?: {
        cron?: string;
        timezone?: string;
        externalId?: string;
    };
    webhook?: {
        path?: string;
        method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        secretHeader?: string;
    };
    approval?: {
        assigneeType?: 'user' | 'role' | 'team' | 'expression';
        assigneeIds?: string[];
        timeoutSeconds?: number;
        onTimeout?: 'fail' | 'autoApprove' | 'autoReject' | 'continue';
    };
    wait?: {
        mode?: 'duration' | 'until' | 'token';
        duration?: string;
        until?: string;
        tokenKey?: string;
    };
    data?: {
        connector?: string;
        operation?: 'extract' | 'load' | 'sync' | 'query' | 'upsert';
        source?: string;
        target?: string;
        mapping?: Record<string, string>;
        batchSize?: number;
    };
    ai?: {
        provider?: 'openai' | 'anthropic' | 'custom';
        model?: string;
        prompt?: string;
        tools?: string[];
        memoryKey?: string;
        maxTurns?: number;
        requireHumanReview?: boolean;
    };
    expression?: string;
    branches?: Array<{
        label: string;
        condition: TriggerEdgeCondition;
    }>;
    metadata?: Record<string, unknown>;
};
export type TriggerWorkflowNode = {
    id: string;
    type: TriggerNodeType;
    name: string;
    description?: string;
    position?: TriggerWorkflowPosition;
    config?: TriggerWorkflowNodeConfig;
};
export type TriggerWorkflowEdge = {
    id: string;
    source: string;
    target: string;
    name?: string;
    condition?: TriggerEdgeCondition;
};
export type TriggerWorkflowVariable = {
    key: string;
    label?: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'secret';
    source?: 'payload' | 'env' | 'taskOutput' | 'manual' | 'system';
    required?: boolean;
};
export type TriggerWorkflowModel = {
    schemaVersion: number;
    id?: string;
    code: string;
    name: string;
    description?: string;
    kind: TriggerWorkflowKind;
    triggerDev?: {
        projectRef?: string;
        namespace?: string;
        sdkVersion?: string;
    };
    nodes: TriggerWorkflowNode[];
    edges: TriggerWorkflowEdge[];
    variables?: TriggerWorkflowVariable[];
    settings?: {
        defaultQueue?: TriggerWorkflowQueueConfig;
        defaultRetry?: TriggerWorkflowRetryConfig;
        defaultTimeoutSeconds?: number;
        concurrencyKey?: string;
    };
};
export type TriggerWorkflowIssueLevel = 'error' | 'warning';
export type TriggerWorkflowIssue = {
    level: TriggerWorkflowIssueLevel;
    path: string;
    message: string;
};
