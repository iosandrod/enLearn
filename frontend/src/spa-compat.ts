import { computed, ref, type Ref } from 'vue';
import { getContentResponse } from './spa-content';

type AsyncDataOptions<T> = {
  default?: () => T;
};

export type FetchOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  query?: Record<string, unknown>;
};

const stateStore = new Map<string, Ref<unknown>>();
const ACCESS_TOKEN_KEY = 'enlearn_access_token';
const REFRESH_TOKEN_KEY = 'enlearn_refresh_token';
const ACTIVE_ACCOUNT_KEY = 'enlearn_active_account_id';
let refreshSessionPromise: Promise<boolean> | null = null;

type HttpCacheEntry = {
  value: unknown;
  expiresAt: number;
};

const LOW_CODE_HTTP_CACHE_TTL_MS = 5 * 60 * 1000;
const lowCodeHttpResponseCache = new Map<string, HttpCacheEntry>();
const lowCodeHttpResponseRequests = new Map<string, Promise<unknown>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneHttpCacheValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }
}

function getLowCodeHttpCacheScope() {
  // The token/account scope prevents a page definition fetched by one session
  // from being reused after account switching in the same browser tab.
  return `${getStoredAccountId()}::${getStoredAccessToken()}`;
}

function readLowCodeHttpCacheKey(
  apiPath: string,
  method: RequestInit['method'] | undefined,
  body: unknown,
) {
  if (apiPath !== '/service' || String(method ?? '').toUpperCase() !== 'POST' || !isRecord(body)) {
    return undefined;
  }

  if (body.serviceName !== 'lowcode' || body.serviceMethod !== 'listItems' || !isRecord(body.postData)) {
    return undefined;
  }

  const table = body.postData.tableName ?? body.postData.resource;
  if (table !== 'lowcode_pages' && table !== 'lowcode_form_definitions') return undefined;

  const filters = body.postData.filters;
  const rawCode = body.postData.code ?? (isRecord(filters) ? filters.code : undefined);
  const codes = Array.isArray(rawCode)
    ? rawCode.filter((value): value is string => typeof value === 'string' && value.trim())
      .map((value) => value.trim())
    : typeof rawCode === 'string' && rawCode.trim()
      ? [rawCode.trim()]
      : [];
  if (!codes.length) return undefined;

  // Page code is the identity of a low-code definition. Ignore request-only
  // fields such as limit/sorts so equivalent lookups share one HTTP cache.
  const includeData = body.postData.includeData === false ? '0' : '1';
  return `lowcode:${getLowCodeHttpCacheScope()}:${table}:${includeData}:${[...new Set(codes)].sort().join(',')}`;
}

function readLowCodeHttpCache<T>(key: string) {
  const entry = lowCodeHttpResponseCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    lowCodeHttpResponseCache.delete(key);
    return undefined;
  }
  return cloneHttpCacheValue(entry.value as T);
}

function readRowsFromLowCodeResponse(value: unknown) {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  if (Array.isArray(value.rows)) return value.rows;
  if (isRecord(value.data)) {
    if (Array.isArray(value.data)) return value.data;
    if (isRecord(value.data) && Array.isArray(value.data.rows)) return value.data.rows;
  }
  return [];
}

function cacheLowCodeResponseAliases(body: unknown, value: unknown) {
  if (!isRecord(body) || body.serviceName !== 'lowcode' || body.serviceMethod !== 'listItems') return;
  if (!isRecord(body.postData)) return;
  const table = body.postData.tableName ?? body.postData.resource;
  if (table !== 'lowcode_pages' && table !== 'lowcode_form_definitions') return;

  const includeData = body.postData.includeData === false ? '0' : '1';
  for (const row of readRowsFromLowCodeResponse(value)) {
    if (!isRecord(row) || typeof row.code !== 'string' || !row.code.trim()) continue;
    const key = `lowcode:${getLowCodeHttpCacheScope()}:${table}:${includeData}:${row.code.trim()}`;
    lowCodeHttpResponseCache.set(key, {
      value: cloneHttpCacheValue(value),
      expiresAt: Date.now() + LOW_CODE_HTTP_CACHE_TTL_MS,
    });
  }
}

function clearLowCodeHttpResponseCache() {
  lowCodeHttpResponseCache.clear();
}

function isLowCodeWriteRequest(apiPath: string, method: RequestInit['method'] | undefined, body: unknown) {
  if (apiPath !== '/service' || String(method ?? '').toUpperCase() !== 'POST' || !isRecord(body)) {
    return false;
  }

  if (body.serviceName === 'lowcode') {
    return body.serviceMethod !== 'listItems';
  }

  if (body.serviceName !== 'admin' || !isRecord(body.postData)) return false;
  if (!['saveItem', 'createItem', 'updateItem', 'deleteItem'].includes(String(body.serviceMethod))) {
    return false;
  }

  const resource = body.postData.resource ?? body.postData.tableName;
  return resource === 'lowcode_pages' || resource === 'lowcode_form_definitions';
}

function getApiBaseUrl() {
  return String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:3300/api').replace(/\/+$/, '');
}

function normalizeApiPath(url: string) {
  return url.replace(/^\/api/, '');
}

function getStoredAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || '';
}

function getStoredAccountId() {
  return localStorage.getItem(ACTIVE_ACCOUNT_KEY) || '';
}

function persistAuthSession(payload: unknown) {
  const session = (payload as { session?: { access_token?: string; refresh_token?: string } | null })?.session;
  if (!session?.access_token) return;
  clearLowCodeHttpResponseCache();
  localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
  if (session.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
}

function clearAuthSession() {
  clearLowCodeHttpResponseCache();
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}

function withQuery(url: string, query?: Record<string, unknown>) {
  if (!query) return url;
  const target = new URL(url, window.location.origin);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
  }
  return target.pathname + target.search + target.hash;
}

function parseResponsePayload(text: string) {
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function readPayloadMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return fallback;

  const record = payload as {
    message?: unknown;
    error?: unknown;
    statusMessage?: unknown;
  };
  const message = Array.isArray(record.message)
    ? record.message.filter(Boolean).join(', ')
    : record.message;

  return String(message ?? record.statusMessage ?? record.error ?? fallback);
}

function isAuthFailure(statusCode: number, message: string) {
  const normalized = message.toLowerCase();
  return (
    statusCode === 401 ||
    normalized.includes('jwt expired') ||
    normalized.includes('invalid jwt') ||
    normalized.includes('invalid token') ||
    normalized.includes('authentication required')
  );
}

function canRefreshForPath(apiPath: string) {
  return !apiPath.startsWith('/auth/refresh') &&
    !apiPath.startsWith('/auth/signin') &&
    !apiPath.startsWith('/auth/signup') &&
    !apiPath.startsWith('/auth/account-options') &&
    !apiPath.startsWith('/auth/lowcode-materials') &&
    !apiPath.startsWith('/auth/lowcode-catalog');
}

function resolveRequestMethod(
  apiPath: string,
  method: RequestInit['method'],
  body: unknown
) {
  if (method) return method;

  if (
    body !== undefined &&
    (
      apiPath.startsWith('/auth/signin') ||
      apiPath.startsWith('/auth/signup') ||
      apiPath.startsWith('/auth/session') ||
      apiPath.startsWith('/auth/signout') ||
      apiPath.startsWith('/auth/refresh') ||
      apiPath.startsWith('/service')
    )
  ) {
    return 'POST';
  }

  return undefined;
}

function redirectToSignIn() {
  if (window.location.pathname === '/signin') return;
  void navigateTo('/signin').catch(() => {
    window.location.href = '/signin';
  });
}

function clearExpiredAuthSession() {
  const hadSession = Boolean(getStoredAccessToken() || getStoredRefreshToken());
  clearAuthSession();

  if (hadSession || window.location.pathname.startsWith('/dashboard')) {
    redirectToSignIn();
  }
}

async function refreshStoredSession() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return false;

  if (!refreshSessionPromise) {
    refreshSessionPromise = (async () => {
      const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const payload = parseResponsePayload(await response.text());

      if (!response.ok) {
        return false;
      }

      persistAuthSession(payload);
      return Boolean((payload as { session?: { access_token?: string } } | null)?.session?.access_token);
    })()
      .catch(() => false)
      .finally(() => {
        refreshSessionPromise = null;
      });
  }

  return refreshSessionPromise;
}

export async function authenticatedFetchResponse(
  url: string,
  options: FetchOptions = {},
  didRetryAuth = false
): Promise<Response> {
  const apiPath = normalizeApiPath(withQuery(url, options.query));
  const { query: _query, body, ...requestOptions } = options;
  const headers = new Headers(options.headers);
  const token = getStoredAccessToken();
  const accountId = getStoredAccountId();

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (
    accountId &&
    !headers.has('X-Account-Id') &&
    !apiPath.startsWith('/auth/select-account') &&
    !apiPath.startsWith('/auth/account-options') &&
    !apiPath.startsWith('/auth/lowcode-materials') &&
    !apiPath.startsWith('/auth/lowcode-catalog')
  ) {
    headers.set('X-Account-Id', accountId);
  }

  if (body !== undefined && !(body instanceof FormData)) {
    headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
  }

  const response = await fetch(`${getApiBaseUrl()}${apiPath}`, {
    ...requestOptions,
    method: resolveRequestMethod(apiPath, requestOptions.method, body),
    headers,
    body:
      body === undefined || body instanceof FormData
        ? (body as BodyInit | undefined)
        : JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = parseResponsePayload(await response.clone().text());
    const statusMessage = readPayloadMessage(payload, response.statusText);

    if (!didRetryAuth && isAuthFailure(response.status, statusMessage) && canRefreshForPath(apiPath)) {
      const refreshed = await refreshStoredSession();
      if (refreshed) {
        return authenticatedFetchResponse(url, options, true);
      }
    }

    if (isAuthFailure(response.status, statusMessage)) {
      clearExpiredAuthSession();
    }

    throw createError({
      statusCode: response.status,
      statusMessage,
    });
  }

  return response;
}

async function fetchBackend<T>(url: string, options: FetchOptions = {}) {
  const apiPath = normalizeApiPath(withQuery(url, options.query));
  const method = resolveRequestMethod(apiPath, options.method, options.body);
  const cacheKey = readLowCodeHttpCacheKey(apiPath, method, options.body);

  if (cacheKey) {
    const cached = readLowCodeHttpCache<T>(cacheKey);
    if (cached !== undefined) return cached;

    const pending = lowCodeHttpResponseRequests.get(cacheKey);
    if (pending) return cloneHttpCacheValue(await pending as T);

    const requestPromise = fetchBackendUncached<T>(url, options);
    lowCodeHttpResponseRequests.set(cacheKey, requestPromise);
    try {
      const value = await requestPromise;
      lowCodeHttpResponseCache.set(cacheKey, {
        value: cloneHttpCacheValue(value),
        expiresAt: Date.now() + LOW_CODE_HTTP_CACHE_TTL_MS,
      });
      cacheLowCodeResponseAliases(options.body, value);
      return cloneHttpCacheValue(value);
    } finally {
      lowCodeHttpResponseRequests.delete(cacheKey);
    }
  }

  const value = await fetchBackendUncached<T>(url, options);
  cacheLowCodeResponseAliases(options.body, value);
  if (isLowCodeWriteRequest(apiPath, method, options.body)) {
    clearLowCodeHttpResponseCache();
  }
  return value;
}

async function fetchBackendUncached<T>(url: string, options: FetchOptions = {}) {
  const apiPath = normalizeApiPath(withQuery(url, options.query));
  const response = await authenticatedFetchResponse(url, options);
  const payload = parseResponsePayload(await response.text());

  if (apiPath.startsWith('/auth/signin') || apiPath.startsWith('/auth/signup') || apiPath.startsWith('/auth/session')) {
    persistAuthSession(payload);
  }

  if (apiPath.startsWith('/auth/signout')) {
    clearAuthSession();
  }

  return payload as T;
}

async function fetchPosts<T>(url: string, options: FetchOptions = {}) {
  const path = normalizeApiPath(url);
  const method = String(options.method ?? 'GET').toUpperCase();
  const id = path.match(/^\/posts\/([^/]+)$/)?.[1];

  if (method === 'GET' && path === '/posts') {
    return fetchBackend<T>('/api/service', {
      method: 'POST',
      body: { serviceName: 'posts', serviceMethod: 'listItems', postData: { tableName: 'posts' } },
    });
  }

  if (method === 'POST' && path === '/posts') {
    return fetchBackend<T>('/api/service', {
      method: 'POST',
      body: { serviceName: 'posts', serviceMethod: 'createItem', postData: { resource: 'posts', ...(options.body as Record<string, unknown> ?? {}) } },
    });
  }

  if (method === 'PUT' && id) {
    return fetchBackend<T>('/api/service', {
      method: 'POST',
      body: { serviceName: 'posts', serviceMethod: 'updateItem', postData: { resource: 'posts', id, ...(options.body as Record<string, unknown>) } },
    });
  }

  if (method === 'DELETE' && id) {
    return fetchBackend<T>('/api/service', {
      method: 'POST',
      body: { serviceName: 'posts', serviceMethod: 'deleteItem', postData: { resource: 'posts', id } },
    });
  }

  return fetchBackend<T>(url, options);
}

export function useState<T>(key: string, init: () => T) {
  if (!stateStore.has(key)) stateStore.set(key, ref(init()));
  return stateStore.get(key) as Ref<T>;
}

export function createError(input: { statusCode?: number; statusMessage?: string; message?: string }) {
  const error = new Error(input.statusMessage ?? input.message ?? 'Application error') as Error & {
    statusCode?: number;
    statusMessage?: string;
  };
  error.statusCode = input.statusCode;
  error.statusMessage = input.statusMessage;
  return error;
}

export async function navigateTo(path: string) {
  const { router } = await import('./router');
  return router.push(path);
}

export function useSeoMeta(meta: Record<string, unknown>) {
  const title = meta.title;
  const description = meta.description;
  const resolvedTitle = typeof title === 'function' ? computed(title as () => string).value : title;
  const resolvedDescription =
    typeof description === 'function' ? computed(description as () => string).value : description;

  if (resolvedTitle) document.title = String(resolvedTitle);

  if (resolvedDescription) {
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'description';
      document.head.appendChild(tag);
    }
    tag.content = String(resolvedDescription);
  }
}

export async function useAsyncData<T>(
  _key: string | Ref<string> | (() => string),
  handler: () => Promise<T>,
  options: AsyncDataOptions<T> = {}
) {
  const data = ref<T | null>(options.default ? options.default() : null);
  const error = ref<unknown>(null);

  try {
    data.value = await handler();
  } catch (caught) {
    error.value = caught;
  }

  return { data, error };
}

export async function $fetch<T>(url: string, options: FetchOptions = {}) {
  const fullUrl = withQuery(url, options.query);

  if (fullUrl.startsWith('/api/content/')) {
    return getContentResponse<T>(fullUrl);
  }

  if (fullUrl === '/api/auth/socket-token') {
    return {
      token: getStoredAccessToken(),
      socketBaseUrl: import.meta.env.VITE_SOCKET_BASE_URL || getApiBaseUrl().replace(/\/api$/, ''),
    } as T;
  }

  if (fullUrl.startsWith('/api/posts')) {
    return fetchPosts<T>(fullUrl, options);
  }

  return fetchBackend<T>(fullUrl, options);
}
