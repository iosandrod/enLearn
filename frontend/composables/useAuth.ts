import type { AppAuthPayload } from './useAuthState';

type OAuthProvider = 'github';
export type DevTestUser = {
  id: string;
  name: string;
  role: string;
  title: string;
  email: string;
};

type AdminUserRow = {
  id?: unknown;
  user_id?: unknown;
  email?: unknown;
  full_name?: unknown;
  nickname?: unknown;
  name?: unknown;
  app_role_names?: unknown;
  role_names?: unknown;
  role?: unknown;
};

const DEV_AUTO_LOGIN_CREDENTIALS = {
  email: 'admin',
  password: '123456'
} as const;
const TEST_USER_PASSWORD = '123456';
const ADMIN_LOGIN_ALIAS = 'admin';
const ADMIN_LOGIN_EMAIL = '1151685410@qq.com';
const DEV_TEST_USER_KEY = 'enlearn_dev_test_user';
const ACCESS_TOKEN_KEY = 'enlearn_access_token';
const REFRESH_TOKEN_KEY = 'enlearn_refresh_token';
const ACTIVE_ACCOUNT_KEY = 'enlearn_active_account_id';
const DEV_AUTO_LOGIN_DISABLED_KEY = 'enlearn_dev_auto_login_disabled';

let initPromise: Promise<void> | null = null;

function shouldUseDevAutoLogin() {
  if (!import.meta.env.DEV) return false;
  if (!import.meta.server && window.sessionStorage.getItem(DEV_AUTO_LOGIN_DISABLED_KEY) === '1') return false;
  return import.meta.env.DEV;
}

function normalizeLoginEmail(email: string) {
  return email.trim().toLowerCase() === ADMIN_LOGIN_ALIAS ? ADMIN_LOGIN_EMAIL : email.trim();
}

function getApiBaseUrl() {
  if (import.meta.env.DEV) return '/api';
  return String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002/api').replace(/\/+$/, '');
}

function readSessionTokens(payload: AppAuthPayload) {
  const session = payload.session as
    | (AppAuthPayload['session'] & { access_token?: string; refresh_token?: string })
    | null;

  return {
    accessToken: session?.access_token ?? '',
    refreshToken: session?.refresh_token ?? ''
  };
}

function persistAuthTokens(payload: AppAuthPayload) {
  const { accessToken, refreshToken } = readSessionTokens(payload);
  if (import.meta.server || !accessToken) return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

function readAuthErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return fallback;

  const record = payload as { message?: unknown; error?: unknown; statusMessage?: unknown };
  const message = Array.isArray(record.message)
    ? record.message.filter(Boolean).join(', ')
    : record.message;

  return String(message ?? record.statusMessage ?? record.error ?? fallback);
}

async function postAuthJson<TPayload>(
  path: string,
  body: Record<string, unknown>,
  options: { authorization?: string; accountId?: string } = {}
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.authorization) {
    headers.Authorization = `Bearer ${options.authorization}`;
  }
  if (options.accountId) {
    headers['X-Account-Id'] = options.accountId;
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    throw createError({
      statusCode: response.status,
      statusMessage: readAuthErrorMessage(payload, response.statusText),
    });
  }

  return payload as TPayload;
}

async function invokeDevService<TPayload>(
  serviceName: string,
  serviceMethod: string,
  postData: Record<string, unknown>,
  options: { authorization: string; accountId: string }
) {
  const response = await fetch(`${getApiBaseUrl()}/service`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.authorization}`,
      'X-Account-Id': options.accountId
    },
    body: JSON.stringify({ serviceName, serviceMethod, postData })
  });
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    throw createError({
      statusCode: response.status,
      statusMessage: readAuthErrorMessage(payload, response.statusText)
    });
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    'success' in payload
  ) {
    return (payload as { data: TPayload }).data;
  }

  return payload as TPayload;
}

function enableDevAutoLogin() {
  if (import.meta.server || !import.meta.env.DEV) return;
  window.sessionStorage.removeItem(DEV_AUTO_LOGIN_DISABLED_KEY);
}

function disableDevAutoLogin() {
  if (import.meta.server || !import.meta.env.DEV) return;
  window.sessionStorage.setItem(DEV_AUTO_LOGIN_DISABLED_KEY, '1');
}

function applyAuthPayload(payload: AppAuthPayload, options: { activateFallback?: boolean } = {}) {
  const {
    user,
    profile,
    permissions,
    accounts,
    activeAccount,
    accountRequired,
    accountEpoch,
    session,
    ready
  } = useAuthState();
  user.value = payload.user;
  profile.value = payload.profile;
  permissions.value = Array.isArray(payload.permissions) ? payload.permissions : [];
  accounts.value = Array.isArray(payload.accounts) ? payload.accounts : [];
  const savedAccountId = import.meta.server
    ? ''
    : window.localStorage.getItem(ACTIVE_ACCOUNT_KEY) ?? '';
  const selectedAccount = payload.activeAccount ?? (
    options.activateFallback
      ? accounts.value.find((account) => account.account_id === savedAccountId) ??
        accounts.value.find((account) => account.is_last_used) ??
        accounts.value.find((account) => account.is_default) ??
        accounts.value.find(
          (account) => account.status !== 'inactive' && account.status !== 'archived'
        ) ?? null
      : null
  );

  const previousAccountId = activeAccount.value?.account_id ?? '';
  const nextAccountId = selectedAccount?.account_id ?? '';
  activeAccount.value = selectedAccount;
  accountRequired.value = Boolean(payload.user) && !selectedAccount;
  if (previousAccountId !== nextAccountId) accountEpoch.value += 1;
  if (!import.meta.server) {
    if (selectedAccount) {
      window.localStorage.setItem(ACTIVE_ACCOUNT_KEY, selectedAccount.account_id);
    } else if (!payload.user) {
      window.localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    }
  }
  session.value = payload.session;
  ready.value = true;
  ensureCurrentUserTestOption();
}

function toDevTestUser(row: AdminUserRow, index: number): DevTestUser | null {
  const id = readOptionalString(row.user_id ?? row.id);
  if (!isUuid(id)) return null;

  const email = readOptionalString(row.email);
  const name =
    readOptionalString(row.full_name) ||
    readOptionalString(row.nickname) ||
    readOptionalString(row.name) ||
    (email ? email.split('@')[0] : `用户 ${index + 1}`);
  const rawRole =
    readOptionalString(row.role_names) ||
    readOptionalString(row.app_role_names) ||
    readOptionalString(row.role);
  const role = rawRole === 'admin' ? '管理员' : rawRole === 'student' ? '审批用户' : rawRole || '审批用户';

  return {
    id,
    name,
    role,
    title: role,
    email: email || `${id}@local`
  };
}

function currentUserAsTestOption(): DevTestUser | null {
  const { user, profile } = useAuthState();
  if (!user.value?.id || !isUuid(user.value.id)) return null;

  const profileRecord = profile.value ?? {};
  const email = user.value.email ?? readOptionalString(profileRecord.email);
  const name =
    readOptionalString(profileRecord.name ?? profileRecord.full_name ?? user.value.user_metadata?.name) ||
    (email ? email.split('@')[0] : '当前用户');
  const title =
    readOptionalString(profileRecord.title ?? profileRecord.role ?? user.value.role) ||
    '当前登录用户';

  return {
    id: user.value.id,
    name,
    role: title,
    title,
    email: email || `${user.value.id}@local`
  };
}

function ensureCurrentUserTestOption() {
  if (import.meta.server || !shouldUseDevAutoLogin()) return;
  const devTestUsers = useState<DevTestUser[]>('auth-dev-test-users', () => []);
  const current = currentUserAsTestOption();
  if (!current) return;
  if (devTestUsers.value.some((item) => item.id === current.id)) return;
  devTestUsers.value = [current, ...devTestUsers.value];
}

function restoreDevTestUser() {
  if (import.meta.server || !shouldUseDevAutoLogin()) return;
  const savedUserId = window.localStorage.getItem(DEV_TEST_USER_KEY);
  const devTestUsers = useState<DevTestUser[]>('auth-dev-test-users', () => []);
  const activeDevTestUserId = useState<string>('auth-active-dev-test-user-id', () => '');
  activeDevTestUserId.value = devTestUsers.value.some((item) => item.id === savedUserId)
    ? savedUserId ?? ''
    : currentUserAsTestOption()?.id ?? '';
}

function clearAuthPayload() {
  const {
    user,
    profile,
    permissions,
    accounts,
    activeAccount,
    accountRequired,
    accountEpoch,
    session,
    ready
  } = useAuthState();
  user.value = null;
  profile.value = null;
  permissions.value = [];
  accounts.value = [];
  if (activeAccount.value) accountEpoch.value += 1;
  activeAccount.value = null;
  accountRequired.value = false;
  if (!import.meta.server) window.localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  session.value = null;
  ready.value = true;
}

function isUnauthenticatedError(error: unknown) {
  const authError = error as { statusCode?: number; statusMessage?: string; message?: string };
  const message = `${authError.statusMessage ?? ''} ${authError.message ?? ''}`.toLowerCase();

  return (
    authError.statusCode === 401 ||
    message.includes('authentication required') ||
    message.includes('jwt expired') ||
    message.includes('invalid jwt') ||
    message.includes('invalid token')
  );
}

function readOAuthHash() {
  if (import.meta.server || !window.location.hash) return null;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get('access_token');
  if (!accessToken) return null;

  const expiresAt = params.get('expires_at');

  return {
    accessToken,
    refreshToken: params.get('refresh_token') ?? undefined,
    expiresAt: expiresAt ? Number(expiresAt) : undefined
  };
}

export function useAuth() {
  const {
    user,
    profile,
    permissions,
    accounts,
    activeAccount,
    accountRequired,
    accountEpoch,
    session,
    ready
  } = useAuthState();
  const devTestUsers = useState<DevTestUser[]>('auth-dev-test-users', () => []);
  const activeDevTestUserId = useState<string>('auth-active-dev-test-user-id', () => '');
  const activeDevTestUser = computed(
    () =>
      devTestUsers.value.find((item) => item.id === activeDevTestUserId.value) ??
      currentUserAsTestOption()
  );

  async function runInit(force = false) {
    if (import.meta.server) return;
    if (ready.value && !force && user.value && activeAccount.value) return;

    const hasStoredSession = Boolean(
      window.localStorage.getItem(ACCESS_TOKEN_KEY) ||
      window.localStorage.getItem(REFRESH_TOKEN_KEY)
    );

    if (hasStoredSession) {
      try {
        const payload = await $fetch<AppAuthPayload>('/api/auth/me');
        applyAuthPayload(payload);
        restoreDevTestUser();
        return;
      } catch (error) {
        if (isUnauthenticatedError(error)) {
          clearAuthPayload();
        } else {
          console.warn('Auth session check failed.', error);
          ready.value = true;
          return;
        }
      }
    }

    if (!user.value && shouldUseDevAutoLogin()) {
      try {
        await signInWithPassword(DEV_AUTO_LOGIN_CREDENTIALS, { devAutoLogin: true });
        restoreDevTestUser();
      } catch (error) {
        console.warn('Dev auto login failed.', error);
      }
    } else if (!user.value) {
      clearAuthPayload();
    }
  }

  async function init(force = false) {
    if (!force && initPromise) return initPromise;

    initPromise = runInit(force).finally(() => {
      initPromise = null;
    });

    return initPromise;
  }

  async function signInWithPassword(credentials: {
    email: string;
    password: string;
    accountId?: string;
    setDefault?: boolean;
  }, options: { devAutoLogin?: boolean } = {}) {
    if (options.devAutoLogin) enableDevAutoLogin();
    const payload = await postAuthJson<AppAuthPayload>('/auth/signin', {
      ...credentials,
      email: normalizeLoginEmail(credentials.email)
    });
    persistAuthTokens(payload);
    applyAuthPayload(payload);
    if (options.devAutoLogin && shouldUseDevAutoLogin()) {
      const savedAccountId = window.localStorage.getItem(ACTIVE_ACCOUNT_KEY) ?? '';
      const preferred = payload.accounts.find((item) => item.account_id === savedAccountId) ??
        payload.accounts.find((item) => item.is_last_used) ??
        payload.accounts.find((item) => item.is_default) ??
        payload.accounts.find(
          (item) => item.status !== 'inactive' && item.status !== 'archived'
        );
      if (preferred) await selectAccount(preferred.account_id);
    }
    restoreDevTestUser();
  }

  async function signUp(credentials: { email: string; password: string }) {
    const payload = await $fetch<AppAuthPayload>('/api/auth/signup', {
      method: 'POST',
      body: credentials
    });
    applyAuthPayload(
      payload.session
        ? payload
        : { user: null, profile: null, permissions: [], accounts: [], session: null }
    );
  }

  async function signInWithOAuth(provider: OAuthProvider) {
    const { url } = await $fetch<{ url: string }>('/api/auth/oauth', {
      method: 'POST',
      body: {
        provider,
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    window.location.href = url;
  }

  async function completeOAuthRedirect() {
    const hashSession = readOAuthHash();

    if (hashSession) {
      const payload = await $fetch<AppAuthPayload>('/api/auth/session', {
        method: 'POST',
        body: hashSession
      });
      applyAuthPayload(payload);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    await init(true);
  }

  async function selectAccount(accountId: string, options: { setDefault?: boolean } = {}) {
    const selected = accounts.value.find((account) => account.account_id === accountId);
    if (!selected) {
      throw createError({ statusCode: 400, statusMessage: 'Selected account is unavailable.' });
    }

    window.localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
    try {
      const payload = await $fetch<AppAuthPayload>('/api/auth/select-account', {
        method: 'POST',
        body: { accountId, setDefault: options.setDefault === true }
      });
      const previousAccountId = activeAccount.value?.account_id ?? '';
      applyAuthPayload(payload);
      if (previousAccountId !== accountId) {
        window.dispatchEvent(new CustomEvent('enlearn:account-changed', {
          detail: { previousAccountId, accountId }
        }));
      }
    } catch (error) {
      if (activeAccount.value) {
        window.localStorage.setItem(ACTIVE_ACCOUNT_KEY, activeAccount.value.account_id);
      } else {
        window.localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
      }
      throw error;
    }
  }

  function clearActiveAccount() {
    if (activeAccount.value) accountEpoch.value += 1;
    activeAccount.value = null;
    accountRequired.value = Boolean(user.value);
    window.localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  }

  async function loadDevTestUsers() {
    if (!shouldUseDevAutoLogin()) return [] as DevTestUser[];
    const accountId = activeAccount.value?.account_id;
    const authorization = window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? '';
    if (!accountId || !authorization) return [] as DevTestUser[];

    const rows = await invokeDevService<AdminUserRow[]>(
      'admin',
      'listAccountLoginUsers',
      {},
      { authorization, accountId }
    );
    setDevTestUsers(Array.isArray(rows) ? rows : []);
    return devTestUsers.value;
  }

  async function switchDevTestUser(userId: string) {
    if (!shouldUseDevAutoLogin()) return false;
    const testUser = devTestUsers.value.find((item) => item.id === userId);
    const accountId = activeAccount.value?.account_id;
    if (!testUser || !accountId) return false;

    const currentUserId = user.value?.id ?? '';
    if (testUser.id === currentUserId) {
      window.localStorage.setItem(DEV_TEST_USER_KEY, testUser.id);
      activeDevTestUserId.value = testUser.id;
      return false;
    }

    if (!testUser.email || testUser.email.endsWith('@local')) {
      throw createError({
        statusCode: 400,
        statusMessage: '该测试用户没有可用于登录的邮箱。'
      });
    }

    const payload = await postAuthJson<AppAuthPayload>('/auth/signin', {
      email: testUser.email,
      password: TEST_USER_PASSWORD,
      accountId
    });
    if (payload.user?.id !== testUser.id) {
      throw createError({
        statusCode: 401,
        statusMessage: '登录结果与所选测试用户不一致。'
      });
    }
    persistAuthTokens(payload);
    applyAuthPayload(payload);
    window.localStorage.setItem(DEV_TEST_USER_KEY, testUser.id);
    activeDevTestUserId.value = testUser.id;
    window.dispatchEvent(new CustomEvent('enlearn:auth-user-changed', {
      detail: { userId: testUser.id, accountId }
    }));
    return true;
  }

  function setDevTestUsers(rows: AdminUserRow[]) {
    if (!shouldUseDevAutoLogin()) return;
    const normalized = rows
      .map((row, index) => toDevTestUser(row, index))
      .filter((row): row is DevTestUser => Boolean(row));
    const current = currentUserAsTestOption();
    const byId = new Map<string, DevTestUser>();
    for (const item of [...(current ? [current] : []), ...normalized]) {
      byId.set(item.id, item);
    }

    devTestUsers.value = Array.from(byId.values());
    const savedUserId = import.meta.server ? '' : window.localStorage.getItem(DEV_TEST_USER_KEY);
    const savedUser = devTestUsers.value.find((item) => item.id === savedUserId);
    activeDevTestUserId.value =
      savedUser?.id ??
      (activeDevTestUserId.value && byId.has(activeDevTestUserId.value)
        ? activeDevTestUserId.value
        : current?.id ?? devTestUsers.value[0]?.id ?? '');
  }

  async function signOut() {
    disableDevAutoLogin();
    await $fetch('/api/auth/signout', { method: 'POST' });
    window.localStorage.removeItem(DEV_TEST_USER_KEY);
    window.localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    activeDevTestUserId.value = '';
    devTestUsers.value = [];
    user.value = null;
    profile.value = null;
    permissions.value = [];
    accounts.value = [];
    if (activeAccount.value) accountEpoch.value += 1;
    activeAccount.value = null;
    accountRequired.value = false;
    session.value = null;
    ready.value = true;
    await navigateTo('/signin');
  }

  return {
    user,
    profile,
    permissions,
    accounts,
    activeAccount,
    accountRequired,
    accountEpoch,
    session,
    ready,
    init,
    signInWithPassword,
    signUp,
    signInWithOAuth,
    completeOAuthRedirect,
    selectAccount,
    clearActiveAccount,
    devTestUsers,
    activeDevTestUser,
    activeDevTestUserId,
    setDevTestUsers,
    loadDevTestUsers,
    switchDevTestUser,
    signOut
  };
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
