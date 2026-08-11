import { reactive } from '@vue/runtime-core';

import {
  readMobileStorageValue,
  removeMobileStorageValue,
  writeMobileStorageValue,
} from '../config';
import { isMobileAuthenticationError, type MobileServiceApi, type MobileServiceRequest } from './service-api';

const QUEUE_VERSION = 1;
const QUEUE_PREFIX = 'enlearn_mobile_offline_queue';
const MAX_QUEUE_ITEMS = 100;
const MAX_ATTEMPTS = 8;
const QUEUE_TTL_MS = 7 * 24 * 60 * 60_000;
const DEVICE_ID_KEY = 'enlearn_mobile_mes_device_id';
const LOCAL_SEQUENCE_PREFIX = 'enlearn_mobile_mes_local_sequence';

export type MobileOfflineQueueItem = {
  version: number;
  id: string;
  accountId: string;
  userId: string;
  pageId: string;
  sourceKey: string;
  request: MobileServiceRequest;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: 'pending' | 'failed' | 'conflict';
  lastError: string;
};

export const mobileOfflineQueue = reactive<{
  pending: number;
  failed: number;
  conflicts: number;
  syncing: boolean;
  lastError: string;
}>({
  pending: 0,
  failed: 0,
  conflicts: 0,
  syncing: false,
  lastError: '',
});

let flushRequest: Promise<{ completed: number; failed: number; pending: number }> | null = null;
const sequenceReservations = new Map<string, Promise<number>>();

function queueKey(accountId: string, userId: string) {
  return `${QUEUE_PREFIX}:${accountId.trim()}:${userId.trim()}`;
}

function createStableId(prefix: string) {
  const value = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

export async function getMobileMesDeviceId() {
  const existing = (await readMobileStorageValue(DEVICE_ID_KEY)).trim();
  if (existing) return existing;
  const deviceId = createStableId('mes-mobile');
  await writeMobileStorageValue(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export async function nextMobileMesLocalSequence(accountId: string, userId: string) {
  const key = `${LOCAL_SEQUENCE_PREFIX}:${accountId.trim()}:${userId.trim()}`;
  const previous = sequenceReservations.get(key) ?? Promise.resolve(0);
  const reservation = previous.catch(() => 0).then(async () => {
    const current = Number(await readMobileStorageValue(key));
    const next = Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
    await writeMobileStorageValue(key, String(next));
    return next;
  });
  sequenceReservations.set(key, reservation);
  try {
    return await reservation;
  } finally {
    if (sequenceReservations.get(key) === reservation) sequenceReservations.delete(key);
  }
}

export async function enrichMobileMesCommandRequest(
  request: MobileServiceRequest,
  accountId: string,
  userId: string,
) {
  const deviceId = typeof request.postData.deviceId === 'string'
    ? request.postData.deviceId.trim()
    : '';
  const rawLocalSequence = request.postData.localSequence;
  const localSequence = rawLocalSequence === undefined
    || rawLocalSequence === null
    || rawLocalSequence === ''
    ? Number.NaN
    : Number(rawLocalSequence);
  const suppliedCommandId = typeof request.postData.commandId === 'string'
    ? request.postData.commandId.trim()
    : '';
  if (
    suppliedCommandId
    && suppliedCommandId !== request.requestId
  ) {
    throw new Error('MES commandId must match the stable mobile request id.');
  }
  if (deviceId && Number.isSafeInteger(localSequence) && localSequence >= 0) {
    return suppliedCommandId
      ? request
      : {
          ...request,
          postData: { ...request.postData, commandId: request.requestId },
        };
  }

  const resolvedDeviceId = deviceId || await getMobileMesDeviceId();
  const resolvedLocalSequence = Number.isSafeInteger(localSequence) && localSequence >= 0
    ? localSequence
    : await nextMobileMesLocalSequence(accountId, userId);

  return {
    ...request,
    postData: {
      ...request.postData,
      commandId: request.requestId,
      deviceId: resolvedDeviceId,
      localSequence: resolvedLocalSequence,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isQueueItem(value: unknown): value is MobileOfflineQueueItem {
  if (!isRecord(value) || !isRecord(value.request)) return false;
  return value.version === QUEUE_VERSION
    && typeof value.id === 'string'
    && typeof value.accountId === 'string'
    && typeof value.userId === 'string'
    && typeof value.request.serviceName === 'string'
    && typeof value.request.serviceMethod === 'string'
    && isRecord(value.request.postData)
    && typeof value.request.requestId === 'string'
    && typeof value.createdAt === 'number'
    && typeof value.expiresAt === 'number';
}

function normalizeItems(value: unknown, accountId: string, userId: string) {
  const now = Date.now();
  return (Array.isArray(value) ? value : [])
    .filter(isQueueItem)
    .filter((item) => (
      item.accountId === accountId
      && item.userId === userId
      && item.expiresAt > now
    ))
    .slice(-MAX_QUEUE_ITEMS);
}

async function readQueue(accountId: string, userId: string) {
  if (!accountId.trim() || !userId.trim()) return [] as MobileOfflineQueueItem[];
  const key = queueKey(accountId, userId);
  const value = await readMobileStorageValue(key);
  if (!value) return [] as MobileOfflineQueueItem[];
  try {
    const parsed = JSON.parse(value) as unknown;
    const items = normalizeItems(parsed, accountId, userId);
    if (!items.length) await removeMobileStorageValue(key);
    return items;
  } catch {
    await removeMobileStorageValue(key);
    return [] as MobileOfflineQueueItem[];
  }
}

async function writeQueue(accountId: string, userId: string, items: MobileOfflineQueueItem[]) {
  const key = queueKey(accountId, userId);
  if (!items.length) {
    await removeMobileStorageValue(key);
    return;
  }
  await writeMobileStorageValue(key, JSON.stringify(items.slice(-MAX_QUEUE_ITEMS)));
}

function updateQueueState(items: MobileOfflineQueueItem[]) {
  mobileOfflineQueue.pending = items.filter((item) => item.status === 'pending').length;
  mobileOfflineQueue.failed = items.filter((item) => item.status === 'failed').length;
  mobileOfflineQueue.conflicts = items.filter((item) => item.status === 'conflict').length;
}

function retryDelay(attempts: number) {
  return Math.min(5 * 60_000, 2 ** Math.max(0, attempts - 1) * 2_000);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '同步请求失败';
}

export function isTransientMobileWriteError(error: unknown) {
  if (isMobileAuthenticationError(error)) return false;
  const status = Number((error as { status?: unknown })?.status ?? 0);
  const message = errorMessage(error).toLowerCase();
  return !status
    || status === 408
    || status === 425
    || status === 429
    || status >= 500
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('timeout')
    || message.includes('already in progress');
}

export function isMobileWriteConflict(error: unknown) {
  const status = Number((error as { status?: unknown })?.status ?? 0);
  return status === 409 || status === 412;
}

export async function refreshOfflineQueueState(accountId: string, userId: string) {
  const items = await readQueue(accountId, userId);
  updateQueueState(items);
  return items;
}

export async function enqueueOfflineRequest(input: {
  accountId: string;
  userId: string;
  pageId: string;
  sourceKey: string;
  request: MobileServiceRequest;
}) {
  const accountId = input.accountId.trim();
  const userId = input.userId.trim();
  if (!accountId || !userId) throw new Error('离线写入需要有效的用户和账套。');
  const items = await readQueue(accountId, userId);
  const duplicate = items.find((item) => item.request.requestId === input.request.requestId);
  if (duplicate) return duplicate;
  if (items.length >= MAX_QUEUE_ITEMS) {
    throw new Error(`离线队列已达到 ${MAX_QUEUE_ITEMS} 条上限，请联网同步后再继续。`);
  }

  const now = Date.now();
  const item: MobileOfflineQueueItem = {
    version: QUEUE_VERSION,
    id: input.request.requestId,
    accountId,
    userId,
    pageId: input.pageId,
    sourceKey: input.sourceKey,
    request: input.request,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + QUEUE_TTL_MS,
    attempts: 0,
    nextAttemptAt: now,
    status: 'pending',
    lastError: '',
  };
  items.push(item);
  await writeQueue(accountId, userId, items);
  updateQueueState(items);
  return item;
}

export async function retryFailedOfflineRequests(accountId: string, userId: string) {
  const items = await readQueue(accountId, userId);
  const now = Date.now();
  items.forEach((item) => {
    if (item.status !== 'failed') return;
    item.status = 'pending';
    item.attempts = 0;
    item.nextAttemptAt = now;
    item.lastError = '';
    item.updatedAt = now;
  });
  await writeQueue(accountId, userId, items);
  updateQueueState(items);
}

export async function discardConflictedOfflineRequests(accountId: string, userId: string) {
  const items = await readQueue(accountId, userId);
  const remaining = items.filter((item) => item.status !== 'conflict');
  await writeQueue(accountId, userId, remaining);
  updateQueueState(remaining);
  return items.length - remaining.length;
}

export async function clearOfflineQueue(accountId: string, userId: string) {
  await removeMobileStorageValue(queueKey(accountId, userId));
  updateQueueState([]);
}

export async function flushOfflineQueue(
  serviceApi: MobileServiceApi,
  accountId: string,
  userId: string,
  force = false,
) {
  if (flushRequest) return flushRequest;
  flushRequest = (async () => {
    const items = await readQueue(accountId, userId);
    mobileOfflineQueue.syncing = true;
    mobileOfflineQueue.lastError = '';
    let completed = 0;
    const now = Date.now();

    for (const item of items) {
      if (item.status === 'failed' || item.status === 'conflict' || (!force && item.nextAttemptAt > now)) continue;
      try {
        await serviceApi.replay(item.request);
        const index = items.findIndex((candidate) => candidate.id === item.id);
        if (index >= 0) items.splice(index, 1);
        completed += 1;
        await writeQueue(accountId, userId, items);
      } catch (error) {
        if (isMobileAuthenticationError(error)) throw error;
        item.attempts += 1;
        item.updatedAt = Date.now();
        item.lastError = errorMessage(error);
        item.nextAttemptAt = item.updatedAt + retryDelay(item.attempts);
        if (isMobileWriteConflict(error)) {
          item.status = 'conflict';
        } else if (!isTransientMobileWriteError(error) || item.attempts >= MAX_ATTEMPTS) {
          item.status = 'failed';
        }
        mobileOfflineQueue.lastError = item.lastError;
        await writeQueue(accountId, userId, items);
        if (isTransientMobileWriteError(error)) break;
      }
    }

    updateQueueState(items);
    return {
      completed,
      failed: mobileOfflineQueue.failed,
      pending: mobileOfflineQueue.pending,
      conflicts: mobileOfflineQueue.conflicts,
    };
  })().finally(() => {
    mobileOfflineQueue.syncing = false;
    flushRequest = null;
  });
  return flushRequest;
}
