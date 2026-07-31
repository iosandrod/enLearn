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
};

const DEV_AUTO_LOGIN_CREDENTIALS = {
  email: 'admin',
  password: '123456'
} as const;
const ADMIN_LOGIN_ALIAS = 'admin';
const ADMIN_LOGIN_EMAIL = '1151685410@qq.com';
const DEV_TEST_USER_KEY = 'enlearn_dev_test_user';

let initPromise: Promise<void> | null = null;

function shouldUseDevAutoLogin() {
  return import.meta.env.DEV;
}

function normalizeLoginEmail(email: string) {
  return email.trim().toLowerCase() === ADMIN_LOGIN_ALIAS ? ADMIN_LOGIN_EMAIL : email.trim();
}

function isDevAutoLoginUser(email?: string | null) {
  return email?.trim().toLowerCase() === ADMIN_LOGIN_EMAIL;
}

function applyAuthPayload(payload: AppAuthPayload) {
  const { user, profile, permissions, accounts, session, ready } = useAuthState();
  user.value = payload.user;
  profile.value = payload.profile;
  permissions.value = Array.isArray(payload.permissions) ? payload.permissions : [];
  accounts.value = Array.isArray(payload.accounts) ? payload.accounts : [];
  session.value = payload.session;
  ready.value = true;
  ensureCurrentUserTestOption();
}

function applyDevTestUser(testUser: DevTestUser) {
  const { user, profile, ready } = useAuthState();
  user.value = {
    ...(user.value ?? {}),
    id: testUser.id,
    email: testUser.email,
    role: testUser.role,
    user_metadata: {
      ...(user.value?.user_metadata ?? {}),
      name: testUser.name,
      title: testUser.title,
      devTestUser: true
    }
  };
  profile.value = {
    ...(profile.value ?? {}),
    id: testUser.id,
    name: testUser.name,
    title: testUser.title,
    role: testUser.role,
    email: testUser.email,
    devTestUser: true
  };
  ready.value = true;
}

function toDevTestUser(row: AdminUserRow, index: number): DevTestUser | null {
  const id = readOptionalString(row.user_id ?? row.id);
  if (!isUuid(id)) return null;

  const email = readOptionalString(row.email);
  const name =
    readOptionalString(row.full_name ?? row.nickname ?? row.name) ||
    (email ? email.split('@')[0] : `用户 ${index + 1}`);
  const role = readOptionalString(row.role_names ?? row.app_role_names) || '审批用户';

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
  const testUser = devTestUsers.value.find((item) => item.id === savedUserId);
  if (testUser) applyDevTestUser(testUser);
}

function clearAuthPayload() {
  const { user, profile, permissions, accounts, session, ready } = useAuthState();
  user.value = null;
  profile.value = null;
  permissions.value = [];
  accounts.value = [];
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
  const { user, profile, permissions, accounts, session, ready } = useAuthState();
  const devTestUsers = useState<DevTestUser[]>('auth-dev-test-users', () => []);

  async function runInit(force = false) {
    if (import.meta.server) return;
    if (ready.value && !force) {
      if (!shouldUseDevAutoLogin() && user.value) return;
      if (shouldUseDevAutoLogin() && isDevAutoLoginUser(user.value?.email)) return;
    }

    if (shouldUseDevAutoLogin() && !isDevAutoLoginUser(user.value?.email)) {
      try {
        await signInWithPassword(DEV_AUTO_LOGIN_CREDENTIALS);
        restoreDevTestUser();
        return;
      } catch (error) {
        console.warn('Dev auto login failed.', error);
      }
    }

    try {
      const payload = await $fetch<AppAuthPayload>('/api/auth/me');
      applyAuthPayload(payload);
      restoreDevTestUser();
    } catch (error) {
      if (!isUnauthenticatedError(error)) {
        console.warn('Auth session check failed.', error);
      }
      clearAuthPayload();
    }

    if (!user.value && shouldUseDevAutoLogin()) {
      try {
        await signInWithPassword(DEV_AUTO_LOGIN_CREDENTIALS);
        restoreDevTestUser();
      } catch (error) {
        console.warn('Dev auto login failed.', error);
      }
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
  }) {
    const payload = await $fetch<AppAuthPayload>('/api/auth/signin', {
      method: 'POST',
      body: {
        ...credentials,
        email: normalizeLoginEmail(credentials.email)
      }
    });
    applyAuthPayload(payload);
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

  function switchDevTestUser(userId: string) {
    if (!shouldUseDevAutoLogin()) return;
    const testUser = devTestUsers.value.find((item) => item.id === userId);
    if (!testUser) return;
    window.localStorage.setItem(DEV_TEST_USER_KEY, testUser.id);
    applyDevTestUser(testUser);
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
    if (savedUser) applyDevTestUser(savedUser);
  }

  async function signOut() {
    await $fetch('/api/auth/signout', { method: 'POST' });
    window.localStorage.removeItem(DEV_TEST_USER_KEY);
    user.value = null;
    profile.value = null;
    permissions.value = [];
    accounts.value = [];
    session.value = null;
    ready.value = true;
    await navigateTo('/signin');
  }

  return {
    user,
    profile,
    permissions,
    accounts,
    session,
    ready,
    init,
    signInWithPassword,
    signUp,
    signInWithOAuth,
    completeOAuthRedirect,
    devTestUsers,
    setDevTestUsers,
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
