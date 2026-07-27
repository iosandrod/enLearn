import {
  createError,
  deleteCookie,
  getCookie,
  getHeader,
  setCookie,
  type H3Event
} from 'h3';

const ACCESS_TOKEN_COOKIE = 'enlearn_access_token';
const REFRESH_TOKEN_COOKIE = 'enlearn_refresh_token';
const EXPIRES_AT_COOKIE = 'enlearn_expires_at';

type BackendRequestOptions = {
  method?:
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE'
    | 'HEAD'
    | 'OPTIONS'
    | 'get'
    | 'post'
    | 'put'
    | 'patch'
    | 'delete'
    | 'head'
    | 'options';
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
};

type BackendSession = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
};

export type PublicAuthPayload = {
  user: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  permissions: string[];
  accounts: Record<string, unknown>[];
  session: {
    expiresAt: number | null;
  } | null;
};

export type BackendAuthPayload = {
  user?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  permissions?: string[] | null;
  accounts?: Record<string, unknown>[] | null;
  session?: BackendSession | null;
};

type ServiceGatewayResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  serviceName?: string;
  serviceMethod?: string;
};

function getBackendBaseUrl() {
  const config = useRuntimeConfig();
  return String(config.apiBaseUrl || 'http://localhost:3002/api').replace(/\/+$/, '');
}

function shouldUseSecureCookies() {
  return process.env.NODE_ENV === 'production';
}

function getErrorStatus(error: unknown) {
  const fetchError = error as {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
    data?: { statusCode?: number };
  };

  return (
    fetchError.data?.statusCode ??
    fetchError.statusCode ??
    fetchError.status ??
    fetchError.response?.status ??
    500
  );
}

function getErrorMessage(error: unknown) {
  const fetchError = error as {
    statusMessage?: string;
    message?: string;
    data?: { message?: string; error?: string };
  };

  return (
    fetchError.data?.message ??
    fetchError.statusMessage ??
    fetchError.message ??
    'Backend service unavailable'
  );
}

function toNuxtError(error: unknown) {
  return createError({
    statusCode: getErrorStatus(error),
    statusMessage: getErrorMessage(error)
  });
}

async function rawBackendFetch<T>(
  path: string,
  options: BackendRequestOptions = {}
) {
  return $fetch<T>(`${getBackendBaseUrl()}${path}`, {
    ...options,
    headers: options.headers
  });
}

export function getBackendAuthorization(event: H3Event) {
  const accessToken = getCookie(event, ACCESS_TOKEN_COOKIE);
  const authorization = getHeader(event, 'authorization');

  if (accessToken) {
    return `Bearer ${accessToken}`;
  }

  return authorization;
}

export function hasBackendAuth(event: H3Event) {
  return Boolean(
    getCookie(event, ACCESS_TOKEN_COOKIE) || getCookie(event, REFRESH_TOKEN_COOKIE)
  );
}

export function setBackendSessionCookies(
  event: H3Event,
  session: BackendSession | null | undefined
) {
  if (!session?.access_token) return;

  const secure = shouldUseSecureCookies();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const accessMaxAge = session.expires_at
    ? Math.max(session.expires_at - nowSeconds, 60)
    : 60 * 60;

  setCookie(event, ACCESS_TOKEN_COOKIE, session.access_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: accessMaxAge
  });

  if (session.refresh_token) {
    setCookie(event, REFRESH_TOKEN_COOKIE, session.refresh_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 60 * 60 * 24 * 60
    });
  }

  if (session.expires_at) {
    setCookie(event, EXPIRES_AT_COOKIE, String(session.expires_at), {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: accessMaxAge
    });
  }
}

export function clearBackendSessionCookies(event: H3Event) {
  const options = {
    path: '/',
    secure: shouldUseSecureCookies(),
    sameSite: 'lax' as const
  };

  deleteCookie(event, ACCESS_TOKEN_COOKIE, options);
  deleteCookie(event, REFRESH_TOKEN_COOKIE, options);
  deleteCookie(event, EXPIRES_AT_COOKIE, options);
}

export function toPublicAuthPayload(payload: BackendAuthPayload): PublicAuthPayload {
  return {
    user: payload.user ?? null,
    profile: payload.profile ?? null,
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    accounts: Array.isArray(payload.accounts) ? payload.accounts : [],
    session: payload.session
      ? {
          expiresAt: payload.session.expires_at ?? null
        }
      : null
  };
}

export async function refreshBackendSession(event: H3Event) {
  const refreshToken = getCookie(event, REFRESH_TOKEN_COOKIE);
  if (!refreshToken) return null;

  try {
    const payload = await rawBackendFetch<BackendAuthPayload>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken }
    });
    setBackendSessionCookies(event, payload.session);
    return payload;
  } catch {
    clearBackendSessionCookies(event);
    return null;
  }
}

export async function backendFetch<T>(
  event: H3Event,
  path: string,
  options: BackendRequestOptions = {}
) {
  const headers = { ...(options.headers ?? {}) };
  const authorization = getBackendAuthorization(event);

  if (authorization && !headers.Authorization) {
    headers.Authorization = authorization;
  }

  try {
    return await rawBackendFetch<T>(path, {
      ...options,
      headers
    });
  } catch (error) {
    if (getErrorStatus(error) === 401) {
      const refreshed = await refreshBackendSession(event);
      if (refreshed?.session?.access_token) {
        try {
          return await rawBackendFetch<T>(path, {
            ...options,
            headers: {
              ...headers,
              Authorization: `Bearer ${refreshed.session.access_token}`
            }
          });
        } catch (retryError) {
          throw toNuxtError(retryError);
        }
      }
    }

    throw toNuxtError(error);
  }
}

export async function invokeBackendService<T>(
  event: H3Event,
  serviceName: string,
  serviceMethod: string,
  postData: Record<string, unknown> = {}
) {
  const response = await backendFetch<ServiceGatewayResponse<T>>(event, '/service', {
    method: 'POST',
    body: {
      serviceName,
      serviceMethod,
      postData
    }
  });

  if (response.success === false) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Service gateway request failed'
    });
  }

  return response.data as T;
}
