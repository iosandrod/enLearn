import assert from 'node:assert/strict';
import {
  createFrontendCommandRuntime,
  isFrontendCommand,
} from '../utils/frontendCommandRuntime.ts';

const shown = [];
const runtime = createFrontendCommandRuntime({
  accountId: () => 'account-1',
  showMessage: async (options) => shown.push(options),
  now: () => new Date('2026-08-13T00:00:10.000Z'),
});

const command = {
  id: 'command-1',
  runtimeVersion: 1,
  code: 'message.show',
  params: {
    type: 'success',
    message: '接受指令成功',
    duration: 8000,
  },
  target: {
    accountId: 'account-1',
    userId: 'user-1',
  },
  issuedAt: '2026-08-13T00:00:00.000Z',
  expiresAt: '2026-08-13T00:00:20.000Z',
};

assert.equal(isFrontendCommand(command), true);
assert.equal((await runtime.execute(command)).status, 'executed');
assert.deepEqual(shown, [{ type: 'success', message: '接受指令成功', duration: 8000 }]);
assert.equal((await runtime.execute(command)).status, 'ignored', 'Duplicate commands must be ignored.');
assert.equal(shown.length, 1);

assert.equal((await runtime.execute({
  ...command,
  id: 'command-2',
  target: { accountId: 'account-2', userId: 'user-1' },
})).status, 'ignored');

assert.equal((await runtime.execute({
  ...command,
  id: 'command-3',
  expiresAt: '2026-08-13T00:00:09.000Z',
})).status, 'ignored');

assert.equal((await runtime.execute({ id: 'invalid-command' })).status, 'ignored');

const failed = await createFrontendCommandRuntime({
  accountId: () => 'account-1',
  showMessage: async () => {
    throw new Error('presenter failed');
  },
  now: () => new Date('2026-08-13T00:00:10.000Z'),
}).execute({ ...command, id: 'command-4' });
assert.equal(failed.status, 'failed');
assert.equal(failed.message, 'presenter failed');

console.log('frontend command runtime tests passed');
