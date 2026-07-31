import type { AppAuthPayload } from './useAuthState';

type OAuthProvider = 'github';

const DEV_AUTO_LOGIN_CREDENTIALS = {
  email: '1151685410@qq.com',
  password: 'Admin123456!'
} as const;
const ACCESS_TOKEN_KEY = 'enlearn_access_token';
const DEV_TEST_USER_KEY = 'enlearn_dev_test_user';

export const DEV_TEST_USERS = [
  {
    id: 'u_alice',
    name: 'Alice',
    role: '申请人',
    title: '市场负责人',
    email: 'alice.approval.test@enlearn.local'
  },
  {
    id: 'u_ben',
    name: 'Ben',
    role: '财务',
    title: '财务审批',
    email: 'ben.approval.test@enlearn.local'
  },
  {
    id: 'u_chen',
    name: 'Chen',
    role: '经理',
    title: '部门经理',
    email: 'chen.approval.test@enlearn.local'
  },
  {
    id: 'u_dana',
    name: 'Dana',
    role: '法务',
    title: '法务复核',
    email: 'dana.approval.test@enlearn.local'
  },
  {
    id: 'u_evan',
    name: 'Evan',
    role: '运营',
    title: '运营负责人',
    email: 'evan.approval.test@enlearn.local'
  }
] as const;

export type DevTestUser = (typeof DEV_TEST_USERS)[number];

let initPromise: Promise<void> | null = null;

function shouldUseDevAutoLogin() {
  return import.meta.env.DEV;
}

function hasStoredAccessToken() {
  if (import.meta.server) return false;
  return Boolean(localStorage.getItem(ACCESS_TOKEN_KEY));
}

function applyAuthPayload(payload: AppAuthPayload) {
  const { user, profile, permissions, accounts, session, ready } = useAuthState();
  user.value = payload.user;
  profile.value = payload.profile;
  permissions.value = Array.isArray(payload.permissions) ? payload.permissions : [];
  accounts.value = Array.isArray(payload.accounts) ? payload.accounts : [];
  session.value = payload.session;
  ready.value = true;
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

function restoreDevTestUser() {
  if (import.meta.server || !shouldUseDevAutoLogin()) return;
  const savedUserId = window.localStorage.getItem(DEV_TEST_USER_KEY);
  const testUser = DEV_TEST_USERS.find((item) => item.id === savedUserId);
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

  async function runInit(force = false) {
    if (import.meta.server) return;
    if (ready.value && !force && (user.value || !shouldUseDevAutoLogin())) return;

    if (!user.value && shouldUseDevAutoLogin() && !hasStoredAccessToken()) {
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
      body: credentials
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
    const testUser = DEV_TEST_USERS.find((item) => item.id === userId);
    if (!testUser) return;
    window.localStorage.setItem(DEV_TEST_USER_KEY, testUser.id);
    applyDevTestUser(testUser);
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
    devTestUsers: DEV_TEST_USERS,
    switchDevTestUser,
    signOut
  };
}
