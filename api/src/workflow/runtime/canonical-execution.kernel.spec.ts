import assert from 'node:assert/strict';
import type { CanonicalWorkflow } from '@enlearn/workflow-schema';
import { CanonicalExecutionKernel } from './canonical-execution.kernel';

const workflow: CanonicalWorkflow = {
  schemaVersion: 1,
  id: 'kernel-test',
  code: 'kernel-test',
  name: 'Kernel test',
  entryNodeId: 'start',
  nodes: [
    node('start', 'start'),
    node('condition', 'condition'),
    node('fork', 'parallelFork'),
    node('left', 'task'),
    node('right', 'timer'),
    node('join', 'parallelJoin', { joinKey: 'review' }),
    node('end', 'end')
  ],
  edges: [
    edge('start', 'condition'), edge('condition', 'fork'), edge('condition', 'end'),
    edge('fork', 'left'), edge('fork', 'right'), edge('left', 'join'), edge('right', 'join'), edge('join', 'end')
  ]
};

async function main() {
  const completed: string[] = [];
  const services: string[] = [];
  const waits: string[] = [];
  const joins = new Set<string>();
  const result = await new CanonicalExecutionKernel().execute(workflow, {
    complete: async ({ node }) => { completed.push(node.id); },
    waitHuman: async () => 'continued',
    createCc: async () => undefined,
    executeService: async ({ node }) => { services.push(node.id); return { node: node.id }; },
    waitTimer: async ({ node }) => { waits.push(node.id); },
    recordSubProcess: async () => undefined,
    selectNext: async ({ node }) => {
      if (node.id === 'condition') return ['fork'];
      return workflow.edges.filter((edge) => edge.source === node.id).map((edge) => edge.target);
    },
    onJoin: async ({ token }, key, expected) => {
      joins.add(`${key}:${token.branchId}`);
      return joins.size >= expected;
    }
  });

  assert.deepEqual(services, ['left']);
  assert.deepEqual(waits, ['right']);
  assert.ok(completed.includes('fork'));
  assert.ok(completed.includes('join'));
  assert.equal(completed.filter((id) => id === 'end').length, 1);
  assert.deepEqual(result.waiting, [{ nodeId: 'join', waitpointId: 'join:review' }]);
  await testDefaultJoinClaim();
  console.log('workflow canonical execution kernel tests passed');
}

async function testDefaultJoinClaim() {
  const completed: string[] = [];
  const result = await new CanonicalExecutionKernel().execute(workflow, {
    complete: async ({ node }) => { completed.push(node.id); },
    waitHuman: async () => 'continued',
    createCc: async () => undefined,
    executeService: async () => undefined,
    waitTimer: async () => undefined,
    recordSubProcess: async () => undefined,
    selectNext: async ({ node }) => {
      if (node.id === 'condition') return ['fork'];
      return workflow.edges.filter((edge) => edge.source === node.id).map((edge) => edge.target);
    }
  });

  assert.equal(completed.filter((id) => id === 'end').length, 1);
  assert.deepEqual(result.waiting, [{ nodeId: 'join', waitpointId: 'join:review' }]);
}

function node(id: string, type: CanonicalWorkflow['nodes'][number]['type'], config: Record<string, unknown> = {}) {
  return { id, type, sourceType: type, name: id, config };
}

function edge(source: string, target: string) {
  return { id: `${source}-${target}`, source, target };
}

void main();
