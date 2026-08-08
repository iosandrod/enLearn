import { createHash } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  Logger,
  ServiceUnavailableException
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from './utils/supabase';
import { getEnv } from './utils/env';

const ENTRY_TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 2_000;
const PERSISTED_ENTRY_TTL_SECONDS = 24 * 60 * 60;
const PERSISTENCE_REQUIRED_ENV = 'REQUEST_IDEMPOTENCY_PERSISTENCE_REQUIRED';
const logger = new Logger('RequestIdempotency');

type Entry = {
  fingerprint: string;
  expiresAt: number;
  value: Promise<unknown>;
};

const entries = new Map<string, Entry>();

export type RequestIdempotencyScope = {
  accountId: string;
  userId: string;
  requestId: string;
};

export type RequestIdempotencyClaim = {
  state: 'claimed' | 'pending' | 'completed' | 'conflict';
  response?: unknown;
};

export interface RequestIdempotencyPersistence {
  claim(
    scope: RequestIdempotencyScope,
    requestFingerprint: string
  ): Promise<RequestIdempotencyClaim>;
  complete(
    scope: RequestIdempotencyScope,
    requestFingerprint: string,
    response: unknown
  ): Promise<void>;
  release(
    scope: RequestIdempotencyScope,
    requestFingerprint: string
  ): Promise<void>;
}

class RequestIdempotencyPersistenceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestIdempotencyPersistenceUnavailableError';
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function fingerprintServiceWrite(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function persistenceIsRequired() {
  const value = String(getEnv()[PERSISTENCE_REQUIRED_ENV] ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'required';
}

function isMissingPersistenceError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? '';
  return error?.code === 'PGRST202'
    || error?.code === 'PGRST205'
    || error?.code === '42P01'
    || error?.code === '42883'
    || message.includes('could not find the function')
    || message.includes('service_request_idempotency') && (
      message.includes('does not exist') || message.includes('schema cache')
    );
}

function normalizeClaim(value: unknown): RequestIdempotencyClaim {
  const record = Array.isArray(value) ? value[0] : value;
  if (!isRecord(record)) {
    throw new ServiceUnavailableException('The request idempotency store returned an invalid claim.');
  }

  const state = String(record.state ?? '');
  if (!['claimed', 'pending', 'completed', 'conflict'].includes(state)) {
    throw new ServiceUnavailableException('The request idempotency store returned an invalid state.');
  }

  return {
    state: state as RequestIdempotencyClaim['state'],
    ...('response' in record ? { response: record.response } : {})
  };
}

export class SupabaseRequestIdempotencyPersistence
implements RequestIdempotencyPersistence {
  private client: SupabaseClient | null = null;

  private getClient() {
    if (this.client) return this.client;
    try {
      this.client = createSupabaseClient('admin');
      return this.client;
    } catch (error) {
      throw new RequestIdempotencyPersistenceUnavailableError(
        error instanceof Error ? error.message : 'Unable to create the idempotency database client.'
      );
    }
  }

  async claim(
    scope: RequestIdempotencyScope,
    requestFingerprint: string
  ): Promise<RequestIdempotencyClaim> {
    const { data, error } = await this.getClient().rpc('claim_service_request_idempotency', {
      p_account_id: scope.accountId,
      p_user_id: scope.userId,
      p_request_id: scope.requestId,
      p_fingerprint: requestFingerprint,
      p_ttl_seconds: PERSISTED_ENTRY_TTL_SECONDS
    });

    if (error) {
      if (isMissingPersistenceError(error)) {
        throw new RequestIdempotencyPersistenceUnavailableError(error.message);
      }
      throw new ServiceUnavailableException(`Unable to claim the request id: ${error.message}`);
    }
    return normalizeClaim(data);
  }

  async complete(
    scope: RequestIdempotencyScope,
    requestFingerprint: string,
    response: unknown
  ) {
    const { error } = await this.getClient().rpc('complete_service_request_idempotency', {
      p_account_id: scope.accountId,
      p_user_id: scope.userId,
      p_request_id: scope.requestId,
      p_fingerprint: requestFingerprint,
      p_response: response ?? null
    });
    if (error) {
      throw new ServiceUnavailableException(
        `The write completed, but its request id could not be finalized: ${error.message}`
      );
    }
  }

  async release(
    scope: RequestIdempotencyScope,
    requestFingerprint: string
  ) {
    const { error } = await this.getClient().rpc('release_service_request_idempotency', {
      p_account_id: scope.accountId,
      p_user_id: scope.userId,
      p_request_id: scope.requestId,
      p_fingerprint: requestFingerprint
    });
    if (error) {
      logger.warn(`Unable to release failed request id ${scope.requestId}: ${error.message}`);
    }
  }
}

const defaultPersistence = new SupabaseRequestIdempotencyPersistence();
let persistenceFallbackWarningShown = false;

function trimEntries(now = Date.now()) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (!oldest) break;
    entries.delete(oldest);
  }
}

export function isIdempotentServiceWrite(serviceMethod: string, postData: Record<string, unknown>) {
  if (['createItem', 'updateItem', 'deleteItem', 'saveItem'].includes(serviceMethod)) return true;
  if (serviceMethod !== 'runAction') return false;
  return postData.idempotent === true || postData.idempotencyEnabled === true;
}

export async function executeIdempotentServiceWrite<T>(
  key: string,
  payload: unknown,
  operation: () => Promise<T>,
) {
  const normalizedKey = key.trim();
  if (!normalizedKey) return operation();
  const now = Date.now();
  trimEntries(now);
  const nextFingerprint = fingerprintServiceWrite(payload);
  const existing = entries.get(normalizedKey);
  if (existing?.expiresAt && existing.expiresAt > now) {
    if (existing.fingerprint !== nextFingerprint) {
      throw new ConflictException('The request id was reused with different write data.');
    }
    return existing.value as Promise<T>;
  }

  const value = operation().catch((error) => {
    entries.delete(normalizedKey);
    throw error;
  });
  entries.set(normalizedKey, {
    fingerprint: nextFingerprint,
    expiresAt: now + ENTRY_TTL_MS,
    value,
  });
  return value;
}

export async function executeDurableIdempotentServiceWrite<T>(
  scope: RequestIdempotencyScope,
  payload: unknown,
  operation: () => Promise<T>,
  persistence: RequestIdempotencyPersistence = defaultPersistence
) {
  const memoryKey = [scope.userId, scope.accountId, scope.requestId].join(':');
  return executeIdempotentServiceWrite(memoryKey, payload, async () => {
    const requestFingerprint = fingerprintServiceWrite(payload);
    let claim: RequestIdempotencyClaim;
    try {
      claim = await persistence.claim(scope, requestFingerprint);
    } catch (error) {
      if (!(error instanceof RequestIdempotencyPersistenceUnavailableError)) throw error;
      if (persistenceIsRequired()) {
        throw new ServiceUnavailableException(
          `Persistent request idempotency is required but unavailable: ${error.message}`
        );
      }
      if (!persistenceFallbackWarningShown) {
        persistenceFallbackWarningShown = true;
        logger.warn(
          `Persistent request idempotency is unavailable; using process-local protection: ${error.message}`
        );
      }
      return operation();
    }

    if (claim.state === 'conflict') {
      throw new ConflictException('The request id was reused with different write data.');
    }
    if (claim.state === 'completed') return claim.response as T;
    if (claim.state === 'pending') {
      throw new HttpException(
        'An identical write request is still being processed. Retry shortly.',
        425
      );
    }

    let result: T;
    try {
      result = await operation();
    } catch (error) {
      await persistence.release(scope, requestFingerprint).catch(() => undefined);
      throw error;
    }

    // A completion failure deliberately leaves the claim pending. Retrying the
    // business write would be less safe than asking the client to retry later.
    await persistence.complete(scope, requestFingerprint, result);
    return result;
  });
}

export function clearServiceIdempotencyCache() {
  entries.clear();
  persistenceFallbackWarningShown = false;
}
