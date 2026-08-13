import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { TriggerDevClient } from '../workflow/trigger/trigger-dev.client';
import type { FrontendCommandTarget } from './frontend-command.types';

export const FRONTEND_COMMAND_LOOP_TASK_ID = 'frontend.command.message.loop';

export type FrontendCommandActor = {
  accountId: string;
  userId: string;
};

type StartFrontendCommandLoopInput = {
  userId?: unknown;
  socketId?: unknown;
  intervalSeconds?: unknown;
  repeatCount?: unknown;
  message?: unknown;
  messageType?: unknown;
};

@Injectable()
export class FrontendCommandService {
  constructor(private readonly triggerClient: TriggerDevClient) {}

  async startMessageLoop(input: StartFrontendCommandLoopInput, actor: FrontendCommandActor) {
    const target = readTarget(input, actor);
    const intervalSeconds = readInteger(input.intervalSeconds, 10, 1, 3600);
    const repeatCount = readInteger(input.repeatCount, 6, 1, 360);
    assertLoopDuration(intervalSeconds, repeatCount);
    const message = readString(input.message) || '接受指令成功';
    const messageType = readMessageType(input.messageType);
    const requestId = randomUUID();

    const handle = await this.triggerClient.triggerTask(
      FRONTEND_COMMAND_LOOP_TASK_ID,
      {
        ...target,
        intervalSeconds,
        repeatCount,
        message,
        messageType,
        requestId
      },
      {
        idempotencyKey: `frontend-command-loop:${requestId}`,
        tags: [
          'frontend-command:message-loop',
          `tenant:${actor.accountId}`,
          ...('userId' in target
            ? [`user:${target.userId}`]
            : [`socket:${target.socketId}`])
        ]
      }
    );

    return {
      runId: handle.id,
      taskId: FRONTEND_COMMAND_LOOP_TASK_ID,
      requestId,
      target,
      intervalSeconds,
      repeatCount,
      message,
      messageType
    };
  }
}

function readTarget(
  input: StartFrontendCommandLoopInput,
  actor: FrontendCommandActor
): FrontendCommandTarget {
  const socketId = readString(input.socketId);
  const requestedUserId = readString(input.userId);
  if (socketId && requestedUserId) {
    throw new BadRequestException('Specify either userId or socketId, not both.');
  }
  if (socketId) return { accountId: actor.accountId, socketId };
  return { accountId: actor.accountId, userId: requestedUserId || actor.userId };
}

function readMessageType(value: unknown) {
  const type = readString(value) || 'success';
  if (!['success', 'info', 'warning', 'error'].includes(type)) {
    throw new BadRequestException('messageType must be success, info, warning, or error.');
  }
  return type as 'success' | 'info' | 'warning' | 'error';
}

function readInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = value === undefined || value === null || value === ''
    ? fallback
    : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new BadRequestException(`Expected an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function assertLoopDuration(intervalSeconds: number, repeatCount: number) {
  if (intervalSeconds * repeatCount > 3600) {
    throw new BadRequestException(
      'Frontend command loop duration must not exceed 3600 seconds.'
    );
  }
}
