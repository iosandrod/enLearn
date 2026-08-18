import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AiStreamEvent, AiStreamEventType } from './ai.types';

type EventSubscriber = (event: AiStreamEvent) => void;

export type AiRunEntry = {
  id: string;
  requestId: string;
  accountId: string;
  userId: string;
  sessionId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  abortController: AbortController;
  events: AiStreamEvent[];
  createdAt: number;
  completedAt?: number;
  completion: Promise<void>;
};

type InternalRunEntry = AiRunEntry & {
  subscribers: Set<EventSubscriber>;
  resolveCompletion: () => void;
};

const MAX_EVENTS_PER_RUN = 500;
const RUN_RETENTION_MS = 10 * 60_000;
const MAX_ACTIVE_RUNS_PER_USER = 3;
const MAX_TOTAL_RUNS = 2_000;
const RUN_RATE_WINDOW_MS = 60_000;
const MAX_RUNS_PER_USER_PER_WINDOW = 12;

@Injectable()
export class AiRunRegistryService {
  private readonly runs = new Map<string, InternalRunEntry>();
  private readonly requestIndex = new Map<string, string>();
  private readonly recentRequests = new Map<string, number[]>();

  createOrGet(input: {
    requestId: string;
    accountId: string;
    userId: string;
    sessionId: string;
  }) {
    this.cleanup();
    const requestKey = `${input.accountId}:${input.userId}:${input.requestId}`;
    const existingId = this.requestIndex.get(requestKey);
    const existing = existingId ? this.runs.get(existingId) : undefined;
    if (existing) return { run: existing as AiRunEntry, created: false };

    const userKey = `${input.accountId}:${input.userId}`;
    const cutoff = Date.now() - RUN_RATE_WINDOW_MS;
    const recent = (this.recentRequests.get(userKey) ?? []).filter((startedAt) => startedAt > cutoff);
    if (recent.length >= MAX_RUNS_PER_USER_PER_WINDOW) {
      throw new HttpException(
        `A user cannot start more than ${MAX_RUNS_PER_USER_PER_WINDOW} AI requests per minute.`,
        429
      );
    }

    const activeForUser = [...this.runs.values()].filter((run) =>
      run.accountId === input.accountId &&
      run.userId === input.userId &&
      run.status === 'running'
    ).length;
    if (activeForUser >= MAX_ACTIVE_RUNS_PER_USER) {
      throw new HttpException(
        `A user cannot run more than ${MAX_ACTIVE_RUNS_PER_USER} AI requests at once.`,
        429
      );
    }
    if (this.runs.size >= MAX_TOTAL_RUNS) {
      throw new HttpException('AI run capacity is temporarily full.', 503);
    }

    let resolveCompletion: () => void = () => {};
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    const run: InternalRunEntry = {
      id: randomUUID(),
      requestId: input.requestId,
      accountId: input.accountId,
      userId: input.userId,
      sessionId: input.sessionId,
      status: 'running',
      abortController: new AbortController(),
      events: [],
      subscribers: new Set(),
      createdAt: Date.now(),
      completion,
      resolveCompletion
    };
    this.runs.set(run.id, run);
    this.requestIndex.set(requestKey, run.id);
    recent.push(run.createdAt);
    this.recentRequests.set(userKey, recent);
    return { run: run as AiRunEntry, created: true };
  }

  get(runId: string) {
    const run = this.runs.get(runId);
    if (!run) throw new NotFoundException('AI run was not found or its recovery window expired.');
    return run as AiRunEntry;
  }

  discard(runId: string) {
    const run = this.runs.get(runId);
    if (!run) return;
    this.runs.delete(runId);
    this.requestIndex.delete(`${run.accountId}:${run.userId}:${run.requestId}`);
    if (run.status === 'running') run.resolveCompletion();
  }

  emit(runId: string, type: AiStreamEventType, payload: Record<string, unknown>) {
    const run = this.runs.get(runId);
    if (!run) return;
    const sequence = (run.events.at(-1)?.sequence ?? 0) + 1;
    const event: AiStreamEvent = {
      eventId: `${run.id}:${sequence}`,
      requestId: run.requestId,
      sessionId: run.sessionId,
      runId: run.id,
      sequence,
      timestamp: new Date().toISOString(),
      type,
      payload
    };
    run.events.push(event);
    if (run.events.length > MAX_EVENTS_PER_RUN) run.events.shift();
    run.subscribers.forEach((subscriber) => subscriber(event));
    return event;
  }

  subscribe(runId: string, afterSequence: number, subscriber: EventSubscriber) {
    const run = this.runs.get(runId);
    if (!run) throw new NotFoundException('AI run was not found or its recovery window expired.');
    run.events.filter((event) => event.sequence > afterSequence).forEach(subscriber);
    run.subscribers.add(subscriber);
    return () => run.subscribers.delete(subscriber);
  }

  finish(runId: string, status: Exclude<AiRunEntry['status'], 'running'>) {
    const run = this.runs.get(runId);
    if (!run || run.status !== 'running') return;
    run.status = status;
    run.completedAt = Date.now();
    run.resolveCompletion();
  }

  cancel(runId: string) {
    const run = this.runs.get(runId);
    if (!run) throw new NotFoundException('AI run was not found or its recovery window expired.');
    if (run.status !== 'running') return run as AiRunEntry;
    run.abortController.abort(new Error('AI run cancelled.'));
    this.emit(runId, 'assistant.status', { status: 'cancelled', message: '已取消生成。' });
    this.emit(runId, 'done', { status: 'cancelled' });
    this.finish(runId, 'cancelled');
    return run as AiRunEntry;
  }

  private cleanup() {
    const requestCutoff = Date.now() - RUN_RATE_WINDOW_MS;
    for (const [userKey, startedAt] of this.recentRequests) {
      const recent = startedAt.filter((value) => value > requestCutoff);
      if (recent.length) this.recentRequests.set(userKey, recent);
      else this.recentRequests.delete(userKey);
    }
    const cutoff = Date.now() - RUN_RETENTION_MS;
    for (const [runId, run] of this.runs) {
      if (!run.completedAt || run.completedAt > cutoff) continue;
      this.runs.delete(runId);
      this.requestIndex.delete(`${run.accountId}:${run.userId}:${run.requestId}`);
    }
  }
}

export function readAiEventSequence(lastEventId?: string) {
  if (!lastEventId) return 0;
  const sequence = Number(lastEventId.split(':').at(-1));
  return Number.isInteger(sequence) && sequence > 0 ? sequence : 0;
}
