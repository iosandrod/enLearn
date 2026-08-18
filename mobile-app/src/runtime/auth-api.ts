import { getRuntimeConfig } from '../config';

export type MobileAccountOption = {
  account_id: string;
  code?: string | null;
  name?: string | null;
  base_currency?: string | null;
  status?: string | null;
  is_default?: boolean;
  is_last_used?: boolean;
};

export type MobileAuthPayload = {
  user: {
    id: string;
    email?: string;
  } | null;
  accounts: MobileAccountOption[];
  permissions?: string[];
  profile?: Record<string, unknown> | null;
  activeAccount?: MobileAccountOption | null;
  accountRequired?: boolean;
  session: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
  } | null;
};

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

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(joinUrl(getRuntimeConfig().apiBaseUrl, path), init);
  const payload = await parseResponse(response);

  if (!response.ok) {
    const error = new Error(readErrorMessage(payload, `Request failed with ${response.status}.`));
    Object.assign(error, { status: response.status });
    throw error;
  }

  return payload as T;
}

export function createMobileAuthApi() {
  async function listAccountOptions(login: string) {
    const query = `login=${encodeURIComponent(login.trim())}`;
    const payload = await request<{ accounts?: MobileAccountOption[] }>(
      `auth/account-options?${query}`
    );
    return Array.isArray(payload.accounts) ? payload.accounts : [];
  }

  async function signIn(input: {
    email: string;
    password: string;
    accountId: string;
    setDefault?: boolean;
  }) {
    return request<MobileAuthPayload>('auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async function signOut() {
    const config = getRuntimeConfig();
    return request<{ success?: boolean }>('auth/signout', {
      method: 'POST',
      headers: config.accessToken
        ? { Authorization: `Bearer ${config.accessToken}` }
        : undefined,
    });
  }

  async function getCurrentSession() {
    const config = getRuntimeConfig();
    return request<MobileAuthPayload>('auth/me', {
      headers: {
        ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
        ...(config.accountId ? { 'X-Account-Id': config.accountId } : {}),
      },
    });
  }

  async function refreshSession(refreshToken: string) {
    return request<MobileAuthPayload>('auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  }

  async function selectAccount(accountId: string, setDefault = false) {
    const config = getRuntimeConfig();
    return request<MobileAuthPayload>('auth/select-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
      },
      body: JSON.stringify({ accountId, setDefault }),
    });
  }

  return {
    listAccountOptions,
    signIn,
    signOut,
    getCurrentSession,
    refreshSession,
    selectAccount,
  };
}
