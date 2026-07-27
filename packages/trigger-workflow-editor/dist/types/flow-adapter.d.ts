import { Position, type Connection } from '@vue-flow/core';
import type { TriggerNodeType, TriggerWorkflowEdge, TriggerWorkflowModel, TriggerWorkflowNode } from './schema/types';
export declare const TRIGGER_FLOW_NODE_RENDER_TYPE = "trigger-workflow-node";
export type TriggerFlowNodeData = {
    workflowType: TriggerNodeType;
    label: string;
    category: string;
    description: string;
    icon: string;
    accent: string;
    accentSoft: string;
    accentBorder: string;
    summary: string;
    isEntry: boolean;
    isEnd: boolean;
};
export type TriggerFlowNode = {
    id: string;
    label?: string;
    position: {
        x: number;
        y: number;
    };
    type: string;
    data: TriggerFlowNodeData;
    draggable: boolean;
    deletable: boolean;
    selectable: boolean;
    connectable: boolean;
    sourcePosition: Position;
    targetPosition: Position;
};
export type TriggerFlowEdge = {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    label?: string;
    type?: string;
    markerEnd?: string;
    animated?: boolean;
    style?: Record<string, string | number>;
    labelStyle?: Record<string, string | number>;
    labelBgStyle?: Record<string, string | number>;
    labelBgPadding?: [number, number];
    labelBgBorderRadius?: number;
    data?: {
        condition?: TriggerWorkflowEdge['condition'];
    };
};
export declare function triggerWorkflowToFlowNodes(model: TriggerWorkflowModel): TriggerFlowNode[];
export declare function triggerWorkflowToFlowEdges(model: TriggerWorkflowModel): TriggerFlowEdge[];
export declare function flowToTriggerWorkflow(model: TriggerWorkflowModel, nodes: TriggerFlowNode[], edges: TriggerFlowEdge[]): TriggerWorkflowModel;
export declare function connectionToTriggerFlowEdge(connection: Connection, id: string): TriggerFlowEdge;
export declare function autoLayoutTriggerFlowNodes(nodes: TriggerFlowNode[], edges: TriggerFlowEdge[]): {
    position: {
        x: number;
        y: number;
    };
    id: string;
    label?: string;
    type: string;
    data: TriggerFlowNodeData;
    draggable: boolean;
    deletable: boolean;
    selectable: boolean;
    connectable: boolean;
    sourcePosition: Position;
    targetPosition: Position;
}[];
export declare function getTriggerNodePresentation(node: TriggerWorkflowNode): TriggerFlowNodeData;
