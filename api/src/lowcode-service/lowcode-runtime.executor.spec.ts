import assert from 'node:assert/strict';

import { executeLowCodeRemoteRuntime } from './lowcode-runtime.executor';

async function main() {
  const execution = await executeLowCodeRemoteRuntime({
    sourceCode: `async function main(input) {
      return {
        sum: Number(input.args.left) + Number(input.args.right),
        pageCode: this.context.page.code,
        eventName: input.event.name,
      };
    }`,
    args: { left: 2, right: 3 },
    snapshot: {
      page: { code: 'remote-test', pageType: 'custom' },
      route: {},
      data: {},
      forms: {},
      searches: {},
      grids: {},
      event: { name: 'test.execute' },
    },
  });

  assert.deepEqual(execution, {
    value: {
      sum: 5,
      pageCode: 'remote-test',
      eventName: 'test.execute',
    },
    effects: [],
  });

  const effectExecution = await executeLowCodeRemoteRuntime({
    sourceCode: `function main(input) {
      return { effects: [{ type: input.runtimeSpec.effect, message: 'saved' }], resultEffect: 0 };
    }`,
    args: {},
    snapshot: {
      page: {}, route: {}, data: {}, forms: {}, searches: {}, grids: {}, event: {},
      runtimeSpec: { effect: 'message.show' },
    },
    allowedEffects: ['message.show'],
  });
  assert.deepEqual(effectExecution, {
    value: null,
    effects: [{ type: 'message.show', message: 'saved' }],
    resultEffect: 0,
  });

  await assert.rejects(
    () => executeLowCodeRemoteRuntime({
      sourceCode: `function main() { return { effects: [{ type: 'page.print' }] }; }`,
      args: {},
      snapshot: { page: {}, route: {}, data: {}, forms: {}, searches: {}, grids: {}, event: {} },
      allowedEffects: [],
    }),
    /未在 capabilities 中授权/,
  );

  const transitionExecution = await executeLowCodeRemoteRuntime({
    sourceCode: `function main(input) {
      const rows = input.context.event.selectedRows;
      return { effects: [
        { type: 'records.update', rows, values: { status: input.runtimeSpec.value } },
        { type: 'page.refresh' },
        { type: 'message.show', message: input.args.message, status: 'success' }
      ] };
    }`,
    args: { message: '审核成功。' },
    snapshot: {
      page: {}, route: {}, data: {}, forms: {}, searches: {}, grids: {},
      event: { selectedRows: [{ id: 'r1' }] },
      runtimeSpec: { value: 'approved' },
    },
    allowedEffects: ['records.update', 'page.refresh', 'message.show'],
  });
  assert.deepEqual(transitionExecution.effects, [
    { type: 'records.update', rows: [{ id: 'r1' }], values: { status: 'approved' } },
    { type: 'page.refresh' },
    { type: 'message.show', message: '审核成功。', status: 'success' },
  ]);

  await assert.rejects(
    () => executeLowCodeRemoteRuntime({
      sourceCode: 'async function main() { return undefined; }',
      args: {},
      snapshot: {
        page: {}, route: {}, data: {}, forms: {}, searches: {}, grids: {}, event: {},
      },
      limits: { maxPayloadBytes: 16 },
    }),
    /超过远程运行时载荷限制/,
  );

  console.log('low-code remote runtime executor tests passed');
}

void main();
