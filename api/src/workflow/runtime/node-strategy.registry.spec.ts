import assert from 'node:assert/strict';
import {
  createDefaultNodeStrategyRegistry,
  type ExecutionResult
} from './node-strategy.registry';

async function main() {
  const registry = createDefaultNodeStrategyRegistry();
  assert.equal(registry.require('humanTask').type, 'humanTask');
  assert.equal(registry.require('parallelFork').type, 'parallelFork');
  assert.equal(registry.require('timer').type, 'timer');

  const calls: string[] = [];
  const result: ExecutionResult = await registry.require('parallelFork').execute({
    node: { id: 'fork', type: 'parallelFork', name: 'Fork' },
    complete: async () => { calls.push('complete'); },
    waitHuman: async () => 'continued',
    createCc: async () => { calls.push('cc'); },
    executeService: async () => { calls.push('service'); },
    waitTimer: async () => { calls.push('timer'); },
    recordSubProcess: async () => { calls.push('subprocess'); },
    next: async () => ({ type: 'completed', next: ['end'] }),
    fork: async () => ({ type: 'fork', branches: ['a', 'b'] }),
    join: async () => ({ type: 'join', joinKey: 'fork' })
  });

  assert.deepEqual(result, { type: 'fork', branches: ['a', 'b'] });
  assert.deepEqual(calls, ['complete']);
  console.log('workflow node strategy registry tests passed');
}

void main();
