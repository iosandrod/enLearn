import { getRuntimeConfig } from '../config';
import type { MobilePageRecord, SharedLowCodePageDataSource } from './types';

type ServiceEnvelope<T> = {
  success: boolean;
  serviceName: string;
  serviceMethod: string;
  data: T;
};

function isServiceEnvelope<T>(value: unknown): value is ServiceEnvelope<T> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'success' in value &&
      'data' in value
  );
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readErrorMessage(value: unknown, fallback: string) {
  if (typeof value === 'string' && value) return value;
  if (!value || typeof value !== 'object') return fallback;

  const record = value as { message?: unknown; error?: unknown; statusMessage?: unknown };
  if (Array.isArray(record.message)) return record.message.join(', ');

  return String(record.message ?? record.statusMessage ?? record.error ?? fallback);
}

export class MobileServiceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'MobileServiceError';
    this.status = status;
  }
}

export function isMobileAuthenticationError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const status = error instanceof MobileServiceError ? error.status : 0;

  return (
    status === 401 ||
    message.includes('authentication required') ||
    message.includes('jwt expired') ||
    message.includes('invalid jwt') ||
    message.includes('invalid token') ||
    message.includes('x-account-id is required')
  );
}

export type MobileServiceApi = ReturnType<typeof createMobileServiceApi>;

export function createMobileServiceApi() {
  async function invoke<T = unknown>(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown> = {}
  ): Promise<T> {
    const config = getRuntimeConfig();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.accessToken) headers.Authorization = `Bearer ${config.accessToken}`;
    if (config.accountId) headers['X-Account-Id'] = config.accountId;

    const response = await fetch(joinUrl(config.apiBaseUrl, 'service'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ serviceName, serviceMethod, postData }),
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      throw new MobileServiceError(
        readErrorMessage(payload, `Request failed with ${response.status}.`),
        response.status
      );
    }

    return (isServiceEnvelope<T>(payload) ? payload.data : payload) as T;
  }

  async function getPage(code: string) {
    const rows = await invoke<MobilePageRecord[]>('lowcode', 'listItems', {
      tableName: 'lowcode_pages',
      filters: { code },
      includeData: true,
      limit: 1,
    });

    const page = Array.isArray(rows) ? rows[0] : undefined;
    if (!page) throw new Error(`Low-code page "${code}" was not found.`);
    return page;
  }

  async function loadDataSource(
    source: SharedLowCodePageDataSource,
    postDataOverride: Record<string, unknown> = {}
  ) {
    const tableName = source.tableName ?? source.table_name;
    const entityCode = source.entityCode ?? source.entity_code;
    const hasTableTarget = Boolean(tableName || entityCode);
    const serviceName = source.serviceName || (hasTableTarget ? 'admin' : '');
    const serviceMethod = source.serviceMethod || (hasTableTarget ? 'listItems' : '');

    if (!serviceName || !serviceMethod) {
      throw new Error(`Data source "${source.key}" has no service target.`);
    }

    return invoke(serviceName, serviceMethod, {
      ...(source.postData ?? {}),
      ...postDataOverride,
      ...(tableName ? { tableName } : {}),
      ...(entityCode ? { entityCode } : {}),
    });
  }

  return {
    invoke,
    getPage,
    loadDataSource,
  };
}
