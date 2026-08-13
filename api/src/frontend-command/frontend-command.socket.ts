import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import type { Namespace, Socket } from 'socket.io';
import { getRedisConnectionConfig } from '../common/utils/redis';
import {
  FRONTEND_COMMAND_ACK_EVENT,
  FRONTEND_COMMAND_EVENT,
  FRONTEND_COMMAND_REDIS_CHANNEL,
  isFrontendCommandAck,
  isFrontendCommand,
  type FrontendCommand,
  type FrontendCommandDelivery
} from './frontend-command.types';

type AuthenticatedSocket = Socket & {
  data: {
    user?: { id: string };
    accountId?: string;
  };
};

export function registerFrontendCommandSocket(
  app: INestApplication,
  namespace: Namespace
) {
  const subscriber = new Redis(getRedisConnectionConfig());
  let closing = false;

  namespace.on('connection', (client: AuthenticatedSocket) => {
    client.on(FRONTEND_COMMAND_ACK_EVENT, (payload: unknown) => {
      if (!isFrontendCommandAck(payload)) return;
      console.log(
        '[frontend-command][ack]',
        JSON.stringify({
          ...payload,
          socketId: client.id,
          userId: client.data.user?.id,
          accountId: client.data.accountId
        })
      );
    });
  });

  subscriber.on('message', async (channel, raw) => {
    if (channel !== FRONTEND_COMMAND_REDIS_CHANNEL) return;

    try {
      const command = JSON.parse(raw) as unknown;
      if (!isFrontendCommand(command)) {
        console.warn('[frontend-command] Ignored an invalid command payload.');
        return;
      }
      const delivery = await deliverFrontendCommand(namespace, command);
      console.log('[frontend-command][delivery]', JSON.stringify(delivery));
    } catch (error) {
      console.error(
        '[frontend-command] Delivery failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  subscriber.on('error', (error) => {
    if (!closing) console.error('[frontend-command] Redis subscriber error:', error.message);
  });

  void subscriber.subscribe(FRONTEND_COMMAND_REDIS_CHANNEL).catch((error) => {
    if (!closing) {
      console.error(
        '[frontend-command] Redis subscription failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  app.getHttpServer().once('close', () => {
    if (closing) return;
    closing = true;
    void subscriber.quit().catch(() => subscriber.disconnect());
  });

  return subscriber;
}

export async function deliverFrontendCommand(
  namespace: Namespace,
  command: FrontendCommand
): Promise<FrontendCommandDelivery> {
  const sockets = Array.from(namespace.sockets.values()).filter((socket) => {
    const client = socket as AuthenticatedSocket;
    if (client.data.accountId !== command.target.accountId) return false;
    return 'socketId' in command.target
      ? client.id === command.target.socketId
      : client.data.user?.id === command.target.userId;
  });

  for (const socket of sockets) socket.emit(FRONTEND_COMMAND_EVENT, command);

  return {
    commandId: command.id,
    target: command.target,
    matchedSockets: sockets.length,
    deliveredAt: new Date().toISOString()
  };
}
