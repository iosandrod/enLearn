import { computed, ref, type Ref } from 'vue';
import { useRouter } from 'vue-router';
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

function getApiBaseUrl() {
  return String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002/api').replace(/\/+$/, '');
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

function persistAuthSession(payload: unknown) {
  const session = (payload as { session?: { access_token?: string; refresh_token?: string } | null })?.session;
  if (!session?.access_token) return;
  localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
  if (session.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
}

function clearAuthSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function withQuery(url: string, query?: Record<string, unknown>) {
  if (!query) return url;
  const target = new URL(url, window.location.origin);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
  }
  return target.pathname + target.search + target.hash;
}

async function fetchBackend<T>(url: string, options: FetchOptions = {}) {
  const apiPath = normalizeApiPath(withQuery(url, options.query));
  const { query: _query, body, ...requestOptions } = options;
  const headers = new Headers(options.headers);
  const token = getStoredAccessToken();

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (body !== undefined && !(body instanceof FormData)) {
    headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
  }

  const response = await fetch(`${getApiBaseUrl()}${apiPath}`, {
    ...requestOptions,
    headers,
    body:
      body === undefined || body instanceof FormData
        ? (body as BodyInit | undefined)
        : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw createError({
      statusCode: response.status,
      statusMessage: payload?.message ?? payload?.error ?? response.statusText,
    });
  }

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
      body: { serviceName: 'posts', serviceMethod: 'list', postData: {} },
    });
  }

  if (method === 'POST' && path === '/posts') {
    return fetchBackend<T>('/api/service', {
      method: 'POST',
      body: { serviceName: 'posts', serviceMethod: 'create', postData: options.body ?? {} },
    });
  }

  if (method === 'PUT' && id) {
    return fetchBackend<T>('/api/service', {
      method: 'POST',
      body: { serviceName: 'posts', serviceMethod: 'update', postData: { id, ...(options.body as Record<string, unknown>) } },
    });
  }

  if (method === 'DELETE' && id) {
    return fetchBackend<T>('/api/service', {
      method: 'POST',
      body: { serviceName: 'posts', serviceMethod: 'delete', postData: { id } },
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
  return useRouter().push(path);
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
