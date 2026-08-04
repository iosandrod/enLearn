import { Native } from '@hippy/vue-next';

export type MobileRuntimeConfig = {
  apiBaseUrl: string;
  pageCode: string;
  accessToken: string;
  accountId: string;
};

type InitProps = Partial<MobileRuntimeConfig> & {
  superProps?: Partial<MobileRuntimeConfig>;
};

const buildConfig: MobileRuntimeConfig = {
  apiBaseUrl: process.env.ENLEARN_API_BASE_URL || 'http://127.0.0.1:3002/api',
  pageCode: process.env.ENLEARN_MOBILE_PAGE_CODE || 'sales-orders',
  accessToken: process.env.ENLEARN_MOBILE_ACCESS_TOKEN || '',
  accountId: process.env.ENLEARN_MOBILE_ACCOUNT_ID || '',
};

const storageKeys = {
  accessToken: 'enlearn_access_token',
  refreshToken: 'enlearn_refresh_token',
  accountId: 'enlearn_active_account_id',
  loginAccount: 'enlearn_login_account',
  loginAccountId: 'enlearn_login_account_set_id',
} as const;

export type MobileStorageKey = keyof typeof storageKeys;

let runtimeConfig = { ...buildConfig };

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

type MobileKeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): MobileKeyValueStorage | null {
  if (__PLATFORM__ !== 'web' || typeof window === 'undefined') return null;

  const preservedStorage = (window as Window & {
    __localStorage?: MobileKeyValueStorage;
  }).__localStorage;

  return preservedStorage ?? window.localStorage;
}

function nativeStorage() {
  return Native.AsyncStorage as typeof Native.AsyncStorage & {
    setItem: (key: string, value: string) => Promise<void>;
  };
}

function readBrowserStorage(key: string) {
  const storage = browserStorage();
  if (!storage) return '';

  try {
    return readString(storage.getItem(key));
  } catch {
    return '';
  }
}

export async function readMobileStorage(key: MobileStorageKey) {
  const resolvedKey = storageKeys[key];
  if (__PLATFORM__ === 'web') return readBrowserStorage(resolvedKey);

  try {
    return readString(await nativeStorage().getItem(resolvedKey));
  } catch {
    return '';
  }
}

export async function writeMobileStorage(key: MobileStorageKey, value: string) {
  const resolvedKey = storageKeys[key];
  if (__PLATFORM__ === 'web') {
    const storage = browserStorage();
    if (!storage) return;
    try {
      storage.setItem(resolvedKey, value);
    } catch {
      // Browser storage can be unavailable in private or restricted contexts.
    }
    return;
  }

  await nativeStorage().setItem(resolvedKey, value);
}

export async function removeMobileStorage(key: MobileStorageKey) {
  const resolvedKey = storageKeys[key];
  if (__PLATFORM__ === 'web') {
    const storage = browserStorage();
    if (!storage) return;
    try {
      storage.removeItem(resolvedKey);
    } catch {
      // Browser storage can be unavailable in private or restricted contexts.
    }
    return;
  }

  await nativeStorage().removeItem(resolvedKey);
}

export function getWebPreviewConfig(): Partial<MobileRuntimeConfig> {
  if (__PLATFORM__ !== 'web') return {};

  return {
    accessToken: readBrowserStorage(storageKeys.accessToken),
    accountId: readBrowserStorage(storageKeys.accountId),
  };
}

export function configureRuntime(initProps: InitProps = {}) {
  const source = initProps.superProps ?? initProps;

  runtimeConfig = {
    apiBaseUrl: readString(source.apiBaseUrl) || buildConfig.apiBaseUrl,
    pageCode: readString(source.pageCode) || buildConfig.pageCode,
    accessToken: readString(source.accessToken) || buildConfig.accessToken,
    accountId: readString(source.accountId) || buildConfig.accountId,
  };
}

export function updateRuntimeAuth(accessToken: string, accountId: string) {
  runtimeConfig = {
    ...runtimeConfig,
    accessToken: readString(accessToken),
    accountId: readString(accountId),
  };
}

export function getRuntimeConfig(): MobileRuntimeConfig {
  return runtimeConfig;
}
