import assert from 'node:assert/strict';
import {
  isFrontendCommandAck,
  type FrontendCommand
} from '../../frontend-command/frontend-command.types';
import { runFrontendCommandLoop } from './frontend-command.task';

async function main() {
  const commands: FrontendCommand[] = [];
  const waits: number[] = [];
  let tick = 0;

  const result = await runFrontendCommandLoop(
    {
      accountId: 'account-1',
      userId: 'user-1',
      intervalSeconds: 10,
      repeatCount: 3,
      message: '接受指令成功',
      requestId: 'request-1'
    },
    {
      publish: async (command) => {
        commands.push(command);
        return { subscriberCount: 1 };
      },
      sleep: async (seconds) => {
        waits.push(seconds);
      },
      now: () => new Date(Date.UTC(2026, 7, 13, 0, 0, tick++ * 10))
    }
  );

  assert.equal(result.repeatCount, 3);
  assert.deepEqual(waits, [10, 10, 10]);
  assert.equal(commands.length, 3);
  assert.deepEqual(commands.map((command) => command.target), [
    { accountId: 'account-1', userId: 'user-1' },
    { accountId: 'account-1', userId: 'user-1' },
    { accountId: 'account-1', userId: 'user-1' }
  ]);
  assert.ok(commands.every((command) => command.code === 'message.show'));
  assert.ok(commands.every((command) => command.params.type === 'success'));
  assert.ok(commands.every((command) => command.params.message === '接受指令成功'));

  const socketCommands: FrontendCommand[] = [];
  await runFrontendCommandLoop(
    { accountId: 'account-1', socketId: 'socket-1', repeatCount: 1 },
    {
      publish: async (command) => {
        socketCommands.push(command);
        return { subscriberCount: 1 };
      },
      sleep: async () => undefined
    }
  );
  assert.deepEqual(socketCommands[0]?.target, { accountId: 'account-1', socketId: 'socket-1' });

  await assert.rejects(
    () => runFrontendCommandLoop(
      { accountId: 'account-1', repeatCount: 1 },
      { publish: async () => ({ subscriberCount: 0 }) }
    ),
    /requires userId or socketId/
  );

  await assert.rejects(
    () => runFrontendCommandLoop(
      {
        accountId: 'account-1',
        userId: 'user-1',
        intervalSeconds: 3600,
        repeatCount: 2
      },
      { publish: async () => ({ subscriberCount: 0 }) }
    ),
    /must not exceed 3600 seconds/
  );

  assert.equal(isFrontendCommandAck({
    commandId: 'command-1',
    status: 'executed',
    executedAt: '2026-08-13T00:00:00.000Z'
  }), true);
  assert.equal(isFrontendCommandAck({
    commandId: 'command-1',
    status: 'unknown',
    executedAt: '2026-08-13T00:00:00.000Z'
  }), false);

  console.log('frontend command Trigger.dev task tests passed');
}

void main();
