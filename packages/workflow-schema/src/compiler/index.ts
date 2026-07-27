import type { WorkflowEdge, WorkflowModel, WorkflowNode } from '../schema/types';

export type CompiledWorkflowModel = {
  model: WorkflowModel;
  nodeMap: Map<string, WorkflowNode>;
  edgeMap: Map<string, WorkflowEdge>;
  outgoingEdges: Map<string, WorkflowEdge[]>;
  incomingEdges: Map<string, WorkflowEdge[]>;
};

export function compileWorkflowModel(model: WorkflowModel): CompiledWorkflowModel {
  const nodeMap = new Map(model.nodes.map((node) => [node.id, node]));
  const edgeMap = new Map(model.edges.map((edge) => [edge.id, edge]));
  const outgoingEdges = new Map<string, WorkflowEdge[]>();
  const incomingEdges = new Map<string, WorkflowEdge[]>();

  model.nodes.forEach((node) => {
    outgoingEdges.set(node.id, []);
    incomingEdges.set(node.id, []);
  });

  model.edges.forEach((edge) => {
    const sourceEdges = outgoingEdges.get(edge.source) ?? [];
    sourceEdges.push(edge);
    outgoingEdges.set(edge.source, sourceEdges);

    const targetEdges = incomingEdges.get(edge.target) ?? [];
    targetEdges.push(edge);
    incomingEdges.set(edge.target, targetEdges);
  });

  for (const edges of outgoingEdges.values()) {
    edges.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0));
  }

  return {
    model,
    nodeMap,
    edgeMap,
    outgoingEdges,
    incomingEdges
  };
}
