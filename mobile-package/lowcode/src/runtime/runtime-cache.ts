import {
  listMobileStorageKeys,
  readMobileStorageValue,
  removeMobileStorageValue,
  removeMobileStorageValues,
  writeMobileStorageValue,
} from '../config';
import type { MobileNavigationRow } from './navigation-model';
import type { MobilePageRecord } from './types';

const CACHE_VERSION = 2;
const CACHE_PREFIX = 'enlearn_mobile_runtime_cache';
const CACHE_INDEX_KEY = `${CACHE_PREFIX}:index`;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60_000;
const MAX_CACHE_ENTRIES = 80;

type RuntimeCacheEnvelope<T> = {
  version: number;
  accountId: string;
  userId: string;
  storedAt: number;
  expiresAt: number;
  data: T;
};

type RuntimeCacheIndexEntry = {
  key: string;
  accountId: string;
  userId: string;
  storedAt: number;
  expiresAt: number;
};

type RuntimeCacheIdentity = {
  accountId: string;
  userId: string;
};

function normalizeIdentity(accountId: string, userId: string): RuntimeCacheIdentity | null {
  const normalizedAccountId = accountId.trim();
  const normalizedUserId = userId.trim();
  return normalizedAccountId && normalizedUserId
    ? { accountId: normalizedAccountId, userId: normalizedUserId }
    : null;
}

function cacheKey(identity: RuntimeCacheIdentity, namespace: string) {
  return `${CACHE_PREFIX}:${identity.accountId}:${identity.userId}:${namespace}`;
}

function parseEnvelope<T>(value: string, identity: RuntimeCacheIdentity) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RuntimeCacheEnvelope<T>>;
    if (
      parsed.version !== CACHE_VERSION
      || parsed.accountId !== identity.accountId
      || parsed.userId !== identity.userId
      || typeof parsed.storedAt !== 'number'
      || typeof parsed.expiresAt !== 'number'
      || parsed.expiresAt <= Date.now()
    ) return null;
    return parsed as RuntimeCacheEnvelope<T>;
  } catch {
    return null;
  }
}

async function readIndex() {
  const value = await readMobileStorageValue(CACHE_INDEX_KEY);
  if (!value) return [] as RuntimeCacheIndexEntry[];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is RuntimeCacheIndexEntry => Boolean(
          entry
          && typeof entry === 'object'
          && typeof entry.key === 'string'
          && typeof entry.accountId === 'string'
          && typeof entry.userId === 'string'
          && typeof entry.storedAt === 'number'
          && typeof entry.expiresAt === 'number'
        ))
      : [];
  } catch {
    return [] as RuntimeCacheIndexEntry[];
  }
}

async function writeIndex(entries: RuntimeCacheIndexEntry[]) {
  if (!entries.length) {
    await removeMobileStorageValue(CACHE_INDEX_KEY);
    return;
  }
  await writeMobileStorageValue(CACHE_INDEX_KEY, JSON.stringify(entries));
}

async function trackCacheEntry(entry: RuntimeCacheIndexEntry) {
  const now = Date.now();
  const current = (await readIndex()).filter((item) => (
    item.key !== entry.key && item.expiresAt > now
  ));
  const next = [entry, ...current].sort((left, right) => right.storedAt - left.storedAt);
  const retained = next.slice(0, MAX_CACHE_ENTRIES);
  const removedKeys = next.slice(MAX_CACHE_ENTRIES).map((item) => item.key);
  await Promise.all([
    writeIndex(retained),
    removeMobileStorageValues(removedKeys),
  ]);
}

async function untrackCacheEntry(key: string) {
  const current = await readIndex();
  const next = current.filter((entry) => entry.key !== key);
  if (next.length !== current.length) await writeIndex(next);
}

async function writeCache<T>(
  accountId: string,
  userId: string,
  namespace: string,
  data: T,
  ttlMs = DEFAULT_CACHE_TTL_MS,
) {
  const identity = normalizeIdentity(accountId, userId);
  if (!identity) return;
  const key = cacheKey(identity, namespace);
  const storedAt = Date.now();
  const expiresAt = storedAt + Math.max(60_000, ttlMs);
  const envelope: RuntimeCacheEnvelope<T> = {
    version: CACHE_VERSION,
    ...identity,
    storedAt,
    expiresAt,
    data,
  };
  await writeMobileStorageValue(key, JSON.stringify(envelope));
  await trackCacheEntry({ key, ...identity, storedAt, expiresAt });
}

async function readCache<T>(accountId: string, userId: string, namespace: string) {
  const identity = normalizeIdentity(accountId, userId);
  if (!identity) return null;
  const key = cacheKey(identity, namespace);
  const envelope = parseEnvelope<T>(await readMobileStorageValue(key), identity);
  if (!envelope) {
    await Promise.all([removeMobileStorageValue(key), untrackCacheEntry(key)]);
    return null;
  }
  return envelope;
}

export function writeNavigationCache(
  accountId: string,
  userId: string,
  routes: MobileNavigationRow[],
) {
  return writeCache(accountId, userId, 'navigation', routes);
}

export function readNavigationCache(accountId: string, userId: string) {
  return readCache<MobileNavigationRow[]>(accountId, userId, 'navigation');
}

export function writePageCache(accountId: string, userId: string, page: MobilePageRecord) {
  return Promise.all([
    writeCache(accountId, userId, `page:${page.id}`, page),
    writeCache(accountId, userId, `page:${page.code}`, page),
  ]).then(() => undefined);
}

export async function readPageCache(
  accountId: string,
  userId: string,
  reference: { id?: string; code?: string },
) {
  const keys = [reference.id, reference.code].filter(Boolean) as string[];
  for (const key of keys) {
    const envelope = await readCache<MobilePageRecord>(accountId, userId, `page:${key}`);
    if (envelope?.data) return envelope;
  }
  return null;
}

export function writePageDataCache(
  accountId: string,
  userId: string,
  pageId: string,
  data: Record<string, unknown>,
) {
  return readPageDataCache(accountId, userId, pageId).then((cached) => writeCache(
    accountId,
    userId,
    `data:${pageId}`,
    { ...(cached?.data ?? {}), ...data },
  ));
}

export function readPageDataCache(accountId: string, userId: string, pageId: string) {
  return readCache<Record<string, unknown>>(accountId, userId, `data:${pageId}`);
}

export async function clearRuntimeCache(userId?: string) {
  const normalizedUserId = userId?.trim() ?? '';
  const indexed = await readIndex();
  const keysFromIndex = indexed
    .filter((entry) => !normalizedUserId || entry.userId === normalizedUserId)
    .map((entry) => entry.key);
  const discoveredKeys = normalizedUserId
    ? []
    : (await listMobileStorageKeys(`${CACHE_PREFIX}:`))
        .filter((key) => key !== CACHE_INDEX_KEY);
  await removeMobileStorageValues([...new Set([...keysFromIndex, ...discoveredKeys])]);
  await writeIndex(
    normalizedUserId ? indexed.filter((entry) => entry.userId !== normalizedUserId) : [],
  );
}
