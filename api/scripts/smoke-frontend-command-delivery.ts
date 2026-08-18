import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import {
  FRONTEND_COMMAND_ACK_EVENT,
  FRONTEND_COMMAND_EVENT,
  FRONTEND_COMMAND_RUNTIME_VERSION,
  type FrontendCommand
} from '../src/frontend-command/frontend-command.types';
import {
  closeFrontendCommandPublisher,
  publishFrontendCommand
} from '../src/frontend-command/frontend-command.publisher';

type AuthResponse = {
  user: { id: string };
  activeAccount: { account_id: string };
  session: { access_token: string };
};

type ChatConnected = {
  userId: string;
  accountId: string;
  socketId: string;
};

const apiUrl = String(process.env.API_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');
const socketUrl = String(process.env.SOCKET_URL || apiUrl).replace(/\/+$/, '');
const accountId = process.env.ACCOUNT_ID || '00000000-0000-4000-8000-000000000001';
const timeoutMs = Number(process.env.FRONTEND_COMMAND_SMOKE_TIMEOUT_MS || 15_000);

async function main() {
  const auth = await signIn();
  assert.equal(auth.activeAccount.account_id, accountId);

  const socket = io(`${socketUrl}/chat`, {
    auth: { token: auth.session.access_token, accountId },
    transports: ['websocket', 'polling'],
    withCredentials: true
  });

  try {
    const connected = await waitForEvent<ChatConnected>(socket, 'chat:connected', timeoutMs);
    assert.equal(connected.userId, auth.user.id);
    assert.equal(connected.accountId, accountId);
    assert.equal(connected.socketId, socket.id);

    const command: FrontendCommand = {
      id: `frontend-command-smoke-${Date.now()}`,
      runtimeVersion: FRONTEND_COMMAND_RUNTIME_VERSION,
      code: 'message.show',
      params: {
        type: 'success',
        message: 'Frontend command smoke test',
        duration: 1000
      },
      target: { accountId, userId: auth.user.id },
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + timeoutMs).toISOString(),
      source: { taskId: 'frontend.command.delivery.smoke' }
    };
    const commandPromise = waitForEvent<FrontendCommand>(socket, FRONTEND_COMMAND_EVENT, timeoutMs);
    const publishResult = await publishFrontendCommand(command);
    assert.ok(publishResult.subscriberCount > 0, 'No frontend-command Redis subscriber is active.');

    const received = await commandPromise;
    assert.deepEqual(received, command);
    const ackWrite = waitForSocketWrite(socket.io.engine, timeoutMs);
    socket.emit(FRONTEND_COMMAND_ACK_EVENT, {
      commandId: received.id,
      status: 'executed',
      executedAt: new Date().toISOString()
    });
    await ackWrite;

    console.log(JSON.stringify({
      ok: true,
      commandId: received.id,
      subscriberCount: publishResult.subscriberCount,
      socketId: connected.socketId,
      userId: connected.userId,
      accountId: connected.accountId
    }));
  } finally {
    socket.disconnect();
    await closeFrontendCommandPublisher();
  }
}

async function waitForSocketWrite(
  engine: { once(event: string, handler: () => void): unknown },
  timeout: number
) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for the ACK write.')),
      timeout
    );
    engine.once('flush', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function signIn() {
  const response = await fetch(`${apiUrl}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin', password: '123456', accountId })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Sign-in failed (${response.status}): ${text}`);
  return JSON.parse(text) as AuthResponse;
}

function waitForEvent<T>(
  target: { once(event: string, handler: (payload: T) => void): unknown; off(event: string, handler: (payload: T) => void): unknown },
  event: string,
  timeout: number
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      target.off(event, handleEvent);
      reject(new Error(`Timed out waiting for ${event}.`));
    }, timeout);
    const handleEvent = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    target.once(event, handleEvent);
  });
}

void main();
