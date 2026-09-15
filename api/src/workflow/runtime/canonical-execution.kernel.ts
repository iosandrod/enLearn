import { createHash } from 'node:crypto';
import type { CanonicalNode, CanonicalWorkflow } from '@enlearn/workflow-schema';
import {
  createDefaultNodeStrategyRegistry,
  type ExecutionResult,
  type NodeStrategyContext
} from './node-strategy.registry';

export type CanonicalExecutionToken = {
  id: string;
  nodeId: string;
  branchId: string;
  previousOutput?: unknown;
};

export type CanonicalNodeExecutionContext = {
  workflow: CanonicalWorkflow;
  node: CanonicalNode;
  token: CanonicalExecutionToken;
};

export type CanonicalExecutionHandlers = {
  complete(context: CanonicalNodeExecutionContext): Promise<void>;
  waitHuman(context: CanonicalNodeExecutionContext): Promise<'continued' | 'stopped'>;
  createCc(context: CanonicalNodeExecutionContext): Promise<void>;
  executeService(context: CanonicalNodeExecutionContext): Promise<unknown>;
  waitTimer(context: CanonicalNodeExecutionContext): Promise<void>;
  recordSubProcess(context: CanonicalNodeExecutionContext): Promise<void>;
  selectNext(context: CanonicalNodeExecutionContext): Promise<string[]>;
  onFork?(context: CanonicalNodeExecutionContext, branches: string[]): Promise<void>;
  onJoin?(context: CanonicalNodeExecutionContext, joinKey: string, expectedBranches: number): Promise<boolean>;
};

export type CanonicalExecutionOutput = {
  completedNodeIds: string[];
  waiting: Array<{ nodeId: string; waitpointId: string }>;
};

/**
 * Shared node-semantic kernel. Infrastructure integrations are handlers; they do
 * not choose workflow paths or interpret node types.
 */
export class CanonicalExecutionKernel {
  private readonly strategies = createDefaultNodeStrategyRegistry();

  async execute(
    workflow: CanonicalWorkflow,
    handlers: CanonicalExecutionHandlers,
    options: { executionId?: string } = {}
  ): Promise<CanonicalExecutionOutput> {
    const nodeMap = new Map(workflow.nodes.map((node) => [node.id, node]));
    const incoming = countIncoming(workflow);
    const joinArrivals = new Map<string, Set<string>>();
    const releasedJoins = new Set<string>();
    const queue: CanonicalExecutionToken[] = [{
      id: stableTokenId(
        `token:${workflow.id}:${options.executionId ?? 'default'}:${workflow.entryNodeId}`
      ),
      nodeId: workflow.entryNodeId,
      branchId: 'root'
    }];
    const waiting: CanonicalExecutionOutput['waiting'] = [];
    const completedNodeIds: string[] = [];
    let executions = 0;

    while (queue.length) {
      const token = queue.shift()!;
      const node = nodeMap.get(token.nodeId);
      if (!node) throw new Error(`Canonical workflow node "${token.nodeId}" was not found.`);
      executions += 1;
      if (executions > Math.max(1_000, workflow.nodes.length * 100)) {
        throw new Error('Canonical workflow exceeded its execution step limit. Check for an unbounded cycle.');
      }

      const context: CanonicalNodeExecutionContext = { workflow, node, token };
      let serviceOutput: unknown = token.previousOutput;
      const strategyContext: NodeStrategyContext = {
        node: { id: node.id, type: node.type, name: node.name, config: node.config },
        complete: async () => {
          await handlers.complete(context);
          completedNodeIds.push(node.id);
        },
        waitHuman: () => handlers.waitHuman(context),
        createCc: () => handlers.createCc(context),
        executeService: async () => {
          serviceOutput = await handlers.executeService(context);
        },
        waitTimer: () => handlers.waitTimer(context),
        recordSubProcess: () => handlers.recordSubProcess(context),
        next: async () => ({ type: 'completed', next: await handlers.selectNext(context) }),
        fork: async () => {
          const branches = await handlers.selectNext(context);
          await handlers.onFork?.(context, branches);
          return { type: 'fork', branches };
        },
        join: async () => {
          const joinKey = readJoinKey(node);
          const expectedBranches = incoming.get(node.id) ?? 1;
          const ready = handlers.onJoin
            ? await handlers.onJoin(context, joinKey, expectedBranches)
            : claimInMemoryJoin(
                joinArrivals,
                releasedJoins,
                `${node.id}:${joinKey}`,
                token.branchId,
                expectedBranches
              );
          if (!ready) return { type: 'join', joinKey };
          await handlers.complete(context);
          completedNodeIds.push(node.id);
          return { type: 'completed', next: await handlers.selectNext(context) };
        }
      };

      const result = await this.strategies.require(node.type).execute(strategyContext);
      applyResult(result, token, serviceOutput, queue, waiting);
    }

    return { completedNodeIds, waiting };
  }
}

function applyResult(
  result: ExecutionResult,
  token: CanonicalExecutionToken,
  previousOutput: unknown,
  queue: CanonicalExecutionToken[],
  waiting: CanonicalExecutionOutput['waiting']
) {
  switch (result.type) {
    case 'completed':
      enqueue(result.next, token, previousOutput, queue);
      return;
    case 'fork':
      enqueue(result.branches, token, previousOutput, queue, true);
      return;
    case 'waiting':
      waiting.push({ nodeId: token.nodeId, waitpointId: result.waitpointId });
      return;
    case 'join':
      waiting.push({ nodeId: token.nodeId, waitpointId: `join:${result.joinKey}` });
      return;
    case 'failed':
      throw new Error(result.error);
  }
}

function claimInMemoryJoin(
  arrivals: Map<string, Set<string>>,
  released: Set<string>,
  joinKey: string,
  branchId: string,
  expectedBranches: number
) {
  if (released.has(joinKey)) return false;
  const branches = arrivals.get(joinKey) ?? new Set<string>();
  branches.add(branchId);
  arrivals.set(joinKey, branches);
  if (branches.size < Math.max(1, expectedBranches)) return false;
  released.add(joinKey);
  return true;
}

function enqueue(
  nodeIds: string[],
  parent: CanonicalExecutionToken,
  previousOutput: unknown,
  queue: CanonicalExecutionToken[],
  fork = false
) {
  nodeIds.forEach((nodeId, index) => queue.push({
    id: stableTokenId(`${parent.id}:${nodeId}:${index}`),
    nodeId,
    branchId: fork ? `${parent.branchId}:${nodeId}` : parent.branchId,
    ...(previousOutput !== undefined ? { previousOutput } : {})
  }));
}

function stableTokenId(seed: string) {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hex.slice(18, 20)}-${hex.slice(20)}`;
}

function countIncoming(workflow: CanonicalWorkflow) {
  const result = new Map<string, number>();
  workflow.edges.forEach((edge) => result.set(edge.target, (result.get(edge.target) ?? 0) + 1));
  return result;
}

function readJoinKey(node: CanonicalNode) {
  const value = node.config.joinKey;
  return typeof value === 'string' && value.trim() ? value.trim() : node.id;
}
