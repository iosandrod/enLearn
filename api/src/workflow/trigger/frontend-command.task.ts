import { randomUUID } from 'node:crypto';
import { task, wait } from '@trigger.dev/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../../common/utils/env';
import { publishFrontendCommand } from '../../frontend-command/frontend-command.publisher';
import {
  FRONTEND_COMMAND_RUNTIME_VERSION,
  type FrontendCommand,
  type FrontendCommandTarget
} from '../../frontend-command/frontend-command.types';
import { FRONTEND_COMMAND_LOOP_TASK_ID } from '../../frontend-command/frontend-command.service';

export type FrontendCommandLoopPayload = {
  accountId?: string;
  tenantId?: string;
  userId?: string;
  socketId?: string;
  intervalSeconds?: number;
  repeatCount?: number;
  message?: string;
  messageType?: 'success' | 'info' | 'warning' | 'error';
  requestId?: string;
  runId?: string;
};

export async function runFrontendCommandLoop(
  payload: FrontendCommandLoopPayload,
  dependencies: {
    publish?: typeof publishFrontendCommand;
    sleep?: (seconds: number, iteration: number, executionId: string) => Promise<void>;
    now?: () => Date;
    executionId?: string;
  } = {}
) {
  const target = readTarget(payload);
  const intervalSeconds = readInteger(payload.intervalSeconds, 10, 1, 3600);
  const repeatCount = readInteger(payload.repeatCount, 6, 1, 360);
  assertLoopDuration(intervalSeconds, repeatCount);
  const message = readString(payload.message) || '接受指令成功';
  const messageType = readMessageType(payload.messageType);
  const requestId = readString(payload.requestId) || randomUUID();
  const executionId = readString(dependencies.executionId) || requestId;
  const publish = dependencies.publish ?? publishFrontendCommand;
  const now = dependencies.now ?? (() => new Date());
  const sleep = dependencies.sleep ?? (async (seconds, iteration, key) => {
    await wait.for({
      seconds,
      idempotencyKey: `frontend-command-loop:${key}:wait:${iteration}`
    });
  });

  const deliveries: Array<{
    commandId: string;
    subscriberCount: number;
    publishedAt: string;
  }> = [];

  for (let iteration = 1; iteration <= repeatCount; iteration += 1) {
    await sleep(intervalSeconds, iteration, executionId);

    const publishedAt = now().toISOString();
    const command: FrontendCommand = {
      id: randomUUID(),
      runtimeVersion: FRONTEND_COMMAND_RUNTIME_VERSION,
      code: 'message.show',
      params: {
        type: messageType,
        message,
        duration: Math.min(9000, Math.max(1000, intervalSeconds * 800))
      },
      target,
      issuedAt: publishedAt,
      expiresAt: new Date(Date.parse(publishedAt) + intervalSeconds * 1000).toISOString(),
      source: {
        taskId: FRONTEND_COMMAND_LOOP_TASK_ID,
        runId: executionId
      }
    };
    const result = await publish(command);
    deliveries.push({
      commandId: command.id,
      subscriberCount: result.subscriberCount,
      publishedAt
    });
  }

  return {
    requestId,
    target,
    intervalSeconds,
    repeatCount,
    message,
    messageType,
    deliveries
  };
}

export const frontendCommandMessageLoopTask = task<
  typeof FRONTEND_COMMAND_LOOP_TASK_ID,
  FrontendCommandLoopPayload
>({
  id: FRONTEND_COMMAND_LOOP_TASK_ID,
  maxDuration: 3600,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10_000
  },
  run: async (payload, { ctx }) => {
    const jobRunId = readString(payload.runId);
    const supabase = jobRunId ? createWorkerSupabaseClient() : undefined;
    if (supabase && jobRunId) {
      const running = await workflowJobCommand(supabase, 'mark_run_running', {
        run_id: jobRunId
      });
      if (!running) throw new Error('Workflow job run not found.');
    }

    try {
      const output = await runFrontendCommandLoop(payload, {
        executionId: ctx.run.id
      });
      if (supabase && jobRunId) {
        await workflowJobCommand(supabase, 'finish_run', {
          run_id: jobRunId,
          status: 'succeeded',
          output
        });
      }
      return output;
    } catch (error) {
      if (supabase && jobRunId) {
        await finishJobRunFailedBestEffort(supabase, jobRunId, error);
      }
      throw error;
    }
  }
});

function readTarget(payload: FrontendCommandLoopPayload): FrontendCommandTarget {
  const accountId = readString(payload.accountId) || readString(payload.tenantId);
  const socketId = readString(payload.socketId);
  const userId = readString(payload.userId);
  if (!accountId) throw new Error('frontend.command.message.loop requires accountId.');
  if (socketId && userId) {
    throw new Error('frontend.command.message.loop accepts either userId or socketId, not both.');
  }
  if (socketId) return { accountId, socketId };
  if (userId) return { accountId, userId };
  throw new Error('frontend.command.message.loop requires userId or socketId.');
}

function readMessageType(value: unknown) {
  const type = readString(value) || 'success';
  if (!['success', 'info', 'warning', 'error'].includes(type)) {
    throw new Error('messageType must be success, info, warning, or error.');
  }
  return type as 'success' | 'info' | 'warning' | 'error';
}

function readInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Expected an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function assertLoopDuration(intervalSeconds: number, repeatCount: number) {
  if (intervalSeconds * repeatCount > 3600) {
    throw new Error('Frontend command loop duration must not exceed 3600 seconds.');
  }
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function createWorkerSupabaseClient() {
  const env = getEnv();
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_PROJECT_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !serviceRoleKey?.trim()) {
    throw new Error(
      `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required by ${FRONTEND_COMMAND_LOOP_TASK_ID}.`
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function workflowJobCommand(
  client: SupabaseClient,
  action: string,
  payload: Record<string, unknown>
) {
  const { data, error } = await client.rpc('workflow_job_command', {
    p_action: action,
    p_payload: payload
  });
  if (error) throw new Error(error.message);
  return data;
}

async function finishJobRunFailedBestEffort(
  client: SupabaseClient,
  runId: string,
  error: unknown
) {
  try {
    await workflowJobCommand(client, 'finish_run', {
      run_id: runId,
      status: 'failed',
      output: {},
      error_message: error instanceof Error ? error.message : String(error)
    });
  } catch {
    return;
  }
}
