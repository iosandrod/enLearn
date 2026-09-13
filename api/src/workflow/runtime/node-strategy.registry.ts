import type { WorkflowNodeSnapshot } from './runtime.types';

export type ExecutionResult =
  | { type: 'completed'; next: string[] }
  | { type: 'waiting'; waitpointId: string }
  | { type: 'fork'; branches: string[] }
  | { type: 'join'; joinKey: string }
  | { type: 'failed'; error: string };

export type NodeStrategyContext = {
  node: WorkflowNodeSnapshot;
  complete(): Promise<void>;
  waitHuman(): Promise<'continued' | 'stopped'>;
  createCc(): Promise<void>;
  executeService(): Promise<void>;
  waitTimer(): Promise<void>;
  recordSubProcess(): Promise<void>;
  next(): Promise<ExecutionResult>;
  fork(): Promise<ExecutionResult>;
  join(): Promise<ExecutionResult>;
};

export interface NodeStrategy {
  readonly type: string;
  execute(context: NodeStrategyContext): Promise<ExecutionResult>;
}

abstract class CompletingStrategy implements NodeStrategy {
  abstract readonly type: string;

  protected async completeAndContinue(context: NodeStrategyContext) {
    await context.complete();
    return context.next();
  }

  abstract execute(context: NodeStrategyContext): Promise<ExecutionResult>;
}

export class StartNodeStrategy extends CompletingStrategy {
  readonly type = 'start';
  execute(context: NodeStrategyContext) { return this.completeAndContinue(context); }
}

export class EndNodeStrategy extends CompletingStrategy {
  readonly type = 'end';
  async execute(context: NodeStrategyContext): Promise<ExecutionResult> {
    await context.complete();
    return { type: 'completed', next: [] };
  }
}

export class HumanTaskStrategy extends CompletingStrategy {
  readonly type = 'humanTask';
  async execute(context: NodeStrategyContext): Promise<ExecutionResult> {
    const result = await context.waitHuman();
    if (result === 'stopped') return { type: 'failed', error: 'Human task was stopped or rejected.' };
    return this.completeAndContinue(context);
  }
}

export class ConditionStrategy extends CompletingStrategy {
  readonly type = 'condition';
  execute(context: NodeStrategyContext) { return this.completeAndContinue(context); }
}

export class ParallelForkStrategy extends CompletingStrategy {
  readonly type = 'parallelFork';
  async execute(context: NodeStrategyContext): Promise<ExecutionResult> {
    await context.complete();
    return context.fork();
  }
}

export class ServiceTaskStrategy extends CompletingStrategy {
  readonly type: string = 'serviceTask';
  async execute(context: NodeStrategyContext): Promise<ExecutionResult> {
    await context.executeService();
    return this.completeAndContinue(context);
  }
}

export class TaskStrategy extends ServiceTaskStrategy {
  readonly type = 'task';
}

export class DataConnectorStrategy extends ServiceTaskStrategy {
  readonly type = 'dataConnector';
}

export class AgentStrategy extends ServiceTaskStrategy {
  readonly type = 'agent';
}

export class TimerStrategy extends CompletingStrategy {
  readonly type = 'timer';
  async execute(context: NodeStrategyContext): Promise<ExecutionResult> {
    await context.waitTimer();
    return this.completeAndContinue(context);
  }
}

export class CcStrategy extends CompletingStrategy {
  readonly type = 'cc';
  async execute(context: NodeStrategyContext): Promise<ExecutionResult> {
    await context.createCc();
    return this.completeAndContinue(context);
  }
}

export class SubProcessStrategy extends CompletingStrategy {
  readonly type = 'subProcess';
  async execute(context: NodeStrategyContext): Promise<ExecutionResult> {
    await context.recordSubProcess();
    return this.completeAndContinue(context);
  }
}

export class ParallelJoinStrategy extends CompletingStrategy {
  readonly type = 'parallelJoin';
  execute(context: NodeStrategyContext) { return context.join(); }
}

export class NodeStrategyRegistry {
  private readonly strategies = new Map<string, NodeStrategy>();

  register(strategy: NodeStrategy) {
    this.strategies.set(strategy.type, strategy);
    return this;
  }

  resolve(type: string) {
    return this.strategies.get(type);
  }

  require(type: string) {
    const strategy = this.resolve(type);
    if (!strategy) throw new Error(`No workflow node strategy registered for "${type}".`);
    return strategy;
  }
}

export function createDefaultNodeStrategyRegistry() {
  return new NodeStrategyRegistry()
    .register(new StartNodeStrategy())
    .register(new EndNodeStrategy())
    .register(new HumanTaskStrategy())
    .register(new ConditionStrategy())
    .register(new ParallelForkStrategy())
    .register(new ParallelJoinStrategy())
    .register(new ServiceTaskStrategy())
    .register(new TaskStrategy())
    .register(new DataConnectorStrategy())
    .register(new AgentStrategy())
    .register(new TimerStrategy())
    .register(new CcStrategy())
    .register(new SubProcessStrategy());
}
