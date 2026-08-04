import { getRuntimeConfig } from '../config';

export type MobileAccountOption = {
  account_id: string;
  code?: string | null;
  name?: string | null;
  base_currency?: string | null;
  status?: string | null;
};

export type MobileAuthPayload = {
  user: {
    id: string;
    email?: string;
  } | null;
  accounts: MobileAccountOption[];
  activeAccount?: MobileAccountOption | null;
  accountRequired?: boolean;
  session: {
    access_token?: string;
    refresh_token?: string;
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

  return {
    listAccountOptions,
    signIn,
  };
}
