import { getRuntimeConfig } from '../config';
import type { MobilePageRecord, SharedLowCodePageDataSource } from './types';
import type { MobileNavigationRow } from './navigation-model';
import { refreshMobileSession } from './session';
import {
  normalizeMobileServiceRequest,
  shouldReturnEmptyMobileList,
} from './service-request';

type ServiceEnvelope<T> = {
  success: boolean;
  serviceName: string;
  serviceMethod: string;
  data: T;
};

export type MobileServiceInvokeOptions = {
  requestId?: string;
};

export type MobileServiceRequest = {
  serviceName: string;
  serviceMethod: string;
  postData: Record<string, unknown>;
  requestId: string;
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

function randomRequestId() {
  const cryptoValue = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `mobile-${cryptoValue}`;
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
    postData: Record<string, unknown> = {},
    options: MobileServiceInvokeOptions = {},
  ): Promise<T> {
    const request = normalizeMobileServiceRequest(serviceName, serviceMethod, postData);
    const requestId = options.requestId?.trim() || randomRequestId();

    async function send() {
      const config = getRuntimeConfig();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
      };

      if (config.accessToken) headers.Authorization = `Bearer ${config.accessToken}`;
      if (config.accountId) headers['X-Account-Id'] = config.accountId;

      const response = await fetch(joinUrl(config.apiBaseUrl, 'service'), {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
      return { response, payload: await parseResponse(response) };
    }

    let result = await send();
    if (result.response.status === 401) {
      try {
        await refreshMobileSession();
        result = await send();
      } catch {
        // Keep the original service response as the authentication failure.
      }
    }

    const { response, payload } = result;

    if (!response.ok) {
      throw new MobileServiceError(
        readErrorMessage(payload, `Request failed with ${response.status}.`),
        response.status
      );
    }

    return (isServiceEnvelope<T>(payload) ? payload.data : payload) as T;
  }

  async function replay(request: MobileServiceRequest) {
    return invoke(
      request.serviceName,
      request.serviceMethod,
      request.postData,
      { requestId: request.requestId },
    );
  }

  async function getPage(code: string, fromPage = '') {
    return invoke<MobilePageRecord>('lowcode', 'getRuntimePage', {
      code,
      ...(fromPage ? { fromPage } : {}),
    });
  }

  async function getPageByRoute(route: string, fromPage = '') {
    return invoke<MobilePageRecord>('lowcode', 'getRuntimePage', {
      route,
      ...(fromPage ? { fromPage } : {}),
    });
  }

  async function getPageById(id: string, fromPage = '') {
    return invoke<MobilePageRecord>('lowcode', 'getRuntimePage', {
      id,
      ...(fromPage ? { fromPage } : {}),
    });
  }

  async function listNavigationRoutes() {
    const rows = await invoke<MobileNavigationRow[]>('admin', 'listNavigationRoutes');
    return Array.isArray(rows) ? rows : [];
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

    try {
      return await invoke(serviceName, serviceMethod, {
        ...(source.postData ?? {}),
        ...postDataOverride,
        ...(tableName ? { tableName } : {}),
        ...(entityCode ? { entityCode } : {}),
      });
    } catch (error) {
      if (shouldReturnEmptyMobileList(error, serviceMethod)) return [];
      throw error;
    }
  }

  function dataSourceTarget(source: SharedLowCodePageDataSource) {
    const tableName = source.tableName ?? source.table_name;
    const entityCode = source.entityCode ?? source.entity_code;
    return {
      tableName,
      entityCode,
      serviceName: source.serviceName || (tableName || entityCode ? 'admin' : ''),
    };
  }

  async function saveDataSource(
    source: SharedLowCodePageDataSource,
    values: Record<string, unknown>,
  ) {
    return replay(prepareSaveDataSource(source, values));
  }

  function prepareSaveDataSource(
    source: SharedLowCodePageDataSource,
    values: Record<string, unknown>,
  ): MobileServiceRequest {
    const target = dataSourceTarget(source);
    const serviceMethod = source.saveMethod
      || (source.serviceMethod && source.serviceMethod !== 'listItems' ? source.serviceMethod : '');
    if (!target.serviceName || !serviceMethod) {
      throw new Error(`Data source "${source.key}" has no save service.`);
    }
    const targetFields = {
      ...(target.tableName ? { tableName: target.tableName } : {}),
      ...(target.entityCode ? { entityCode: target.entityCode } : {}),
      ...(target.entityCode ? { resource: target.entityCode } : target.tableName
        ? { resource: target.tableName }
        : {}),
    };
    const request = serviceMethod === 'saveItem' || serviceMethod === 'createItem' || serviceMethod === 'updateItem'
      ? {
          ...targetFields,
          ...(values.id ? { id: values.id } : {}),
          data: values,
        }
      : { ...values, ...targetFields };
    return {
      serviceName: target.serviceName,
      serviceMethod,
      postData: request,
      requestId: randomRequestId(),
    };
  }

  async function deleteDataSource(
    source: SharedLowCodePageDataSource,
    row: Record<string, unknown>,
  ) {
    const target = dataSourceTarget(source);
    const serviceMethod = source.deleteMethod
      || (source.serviceMethod && source.serviceMethod !== 'listItems' ? source.serviceMethod : '');
    if (!target.serviceName || !serviceMethod) {
      throw new Error(`Data source "${source.key}" has no delete service.`);
    }
    const targetFields = {
      ...(target.tableName ? { tableName: target.tableName } : {}),
      ...(target.entityCode ? { entityCode: target.entityCode } : {}),
      ...(target.entityCode ? { resource: target.entityCode } : target.tableName
        ? { resource: target.tableName }
        : {}),
    };
    if (serviceMethod === 'deleteItem') {
      return invoke(target.serviceName, serviceMethod, {
        ...targetFields,
        ...(row.id ? { id: row.id } : {}),
        data: row,
      });
    }
    return invoke(target.serviceName, serviceMethod, {
      ...row,
      ...targetFields,
    });
  }

  return {
    invoke,
    replay,
    getPage,
    getPageByRoute,
    getPageById,
    listNavigationRoutes,
    loadDataSource,
    saveDataSource,
    prepareSaveDataSource,
    deleteDataSource,
  };
}
