import { VxeUI } from 'vxe-pc-ui';
import vxeEnUS from 'vxe-pc-ui/es/language/en-US';
import {
  cloneDefaultSystemSettings,
  mergeSystemTableOptions,
  normalizeSystemSettings,
  provideSystemSettings,
  resolveSystemPagerConfig,
  type SystemSettings,
  type SystemSettingsContext,
} from '@enlearn/lowcode-framework/core';
import {
  mixThemeColors,
  resolveThemeColor,
} from '../utils/systemSettingsTheme';

const SYSTEM_CONFIG_RESOURCE = 'system_config';
const SYSTEM_SETTINGS_CHANGED_EVENT = 'enlearn:system-settings-changed';
const SUPPORTED_VXE_LANGUAGES = new Set(['zh-CN', 'en-US']);
const managedCssVariables = new Set<string>();
let context: SystemSettingsContext | null = null;
let loadPromise: Promise<SystemSettings> | null = null;
let loadPromiseUserId = '';
let loadSequence = 0;
let loadedUserId = '';
let mediaQuery: MediaQueryList | null = null;
let mediaQueryListener: (() => void) | null = null;
let listenersInstalled = false;
let pendingAuthenticatedReloadUserId = '';

export function createSystemSettingsContext(): SystemSettingsContext {
  if (context) return context;

  const settings = shallowRef<SystemSettings>(cloneDefaultSystemSettings());
  const loading = ref(false);
  const loaded = ref(false);
  const error = shallowRef<unknown>(null);

  context = {
    settings,
    loading,
    loaded,
    error,
    reload: () => loadSystemSettings(true),
    reset: resetSystemSettings,
  };

  watch(settings, (value) => applySystemSettings(value), { immediate: true });
  return context;
}

export function provideAppSystemSettings() {
  return provideSystemSettings(createSystemSettingsContext());
}

export function useAppSystemSettings() {
  return createSystemSettingsContext();
}

export async function initializeSystemSettings() {
  const auth = useAuth();
  await auth.init();

  if (!auth.user.value) {
    resetSystemSettings();
    return createSystemSettingsContext().settings.value;
  }

  return loadSystemSettings();
}

export async function loadSystemSettings(force = false) {
  const runtime = createSystemSettingsContext();
  const userId = useAuth().user.value?.id ?? '';

  if (!userId) {
    resetSystemSettings();
    return runtime.settings.value;
  }
  if (loadPromise && loadPromiseUserId === userId) {
    if (!force) return loadPromise;

    // A forced reload must not reuse a startup request that may have captured
    // the pre-save configuration. Invalidate its result and read again.
    loadSequence += 1;
    loadPromise = null;
    loadPromiseUserId = '';
  }
  if (!force && runtime.loaded.value && loadedUserId === userId) {
    return runtime.settings.value;
  }

  const requestSequence = ++loadSequence;
  let pending!: Promise<SystemSettings>;
  pending = (async () => {
    runtime.loading.value = true;
    runtime.error.value = null;

    try {
      const row = await useServiceApi().firstItem<Record<string, unknown>>('admin', {
        resource: SYSTEM_CONFIG_RESOURCE,
        tableName: SYSTEM_CONFIG_RESOURCE,//
        limit: 1,//
      });//
      if (
        requestSequence !== loadSequence ||
        useAuth().user.value?.id !== userId
      ) {
        return runtime.settings.value;
      }
      const nextSettings = normalizeSystemSettings(row);
      runtime.settings.value = nextSettings;
      runtime.loaded.value = true;
      loadedUserId = userId;
      pendingAuthenticatedReloadUserId = '';
      return nextSettings;
    } catch (caught) {
      if (requestSequence === loadSequence) {
        runtime.error.value = caught;
      }
      throw caught;
    } finally {
      if (requestSequence === loadSequence) {
        runtime.loading.value = false;
      }
    }
  })().finally(() => {
    if (loadPromise === pending) {
      loadPromise = null;
      loadPromiseUserId = '';
    }
  });

  loadPromise = pending;
  loadPromiseUserId = userId;
  return pending;
}

export function resetSystemSettings() {
  const runtime = createSystemSettingsContext();
  loadSequence += 1;
  loadPromise = null;
  loadPromiseUserId = '';
  loadedUserId = '';
  pendingAuthenticatedReloadUserId = '';
  runtime.settings.value = cloneDefaultSystemSettings();
  runtime.loaded.value = false;
  runtime.loading.value = false;
  runtime.error.value = null;
}

export function notifySystemSettingsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYSTEM_SETTINGS_CHANGED_EVENT));
}

export function installSystemSettingsListeners() {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  window.addEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, () => {
    void loadSystemSettings(true).catch((error) => {
      console.warn('System settings reload failed.', error);
    });
  });
  window.addEventListener('enlearn:auth-user-changed', handleAuthenticatedScopeChange);
  window.addEventListener('enlearn:account-changed', handleAuthenticatedScopeChange);
}

function handleAuthenticatedScopeChange() {
  const auth = useAuth();
  const userId = auth.user.value?.id ?? '';
  if (!userId) {
    resetSystemSettings();
    return;
  }

  if (
    loadedUserId === userId ||
    pendingAuthenticatedReloadUserId === userId
  ) {
    return;
  }

  pendingAuthenticatedReloadUserId = userId;
  void loadSystemSettings(true).catch((error) => {
    if (pendingAuthenticatedReloadUserId === userId) {
      pendingAuthenticatedReloadUserId = '';
    }
    console.warn('System settings initialization failed.', error);
  });
}

function applySystemSettings(settings: SystemSettings) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const colors = settings.theme_config.colors ?? {};
  const primary = resolveThemeColor(settings.primary_color, colors.primary, '#2563eb');
  const success = resolveThemeColor(colors.success, '#16a34a');
  const warning = resolveThemeColor(colors.warning, '#d97706');
  const danger = resolveThemeColor(colors.danger, '#dc2626');
  const info = resolveThemeColor(colors.info, '#0891b2');
  const background = resolveThemeColor(colors.background, '#ffffff');
  const surface = resolveThemeColor(colors.surface, '#f8fafc');
  const text = resolveThemeColor(colors.text, '#0f172a');
  const radius = readNumber(settings.theme_config.radius, 6);
  const customVariables = readCssVariables(settings.theme_config.variables);
  const primaryLighten = mixThemeColors(primary, '#ffffff', 0.28);
  const primaryDarken = mixThemeColors(primary, '#000000', 0.18);
  const primaryDisabled = mixThemeColors(primary, '#ffffff', 0.58);
  const primaryTinge = mixThemeColors(primary, background, 0.88);
  const currentRowBackground = primaryTinge;
  const currentRowHoverBackground = mixThemeColors(primary, background, 0.8);
  const border = mixThemeColors(text, background, 0.82);
  const borderSoft = mixThemeColors(text, background, 0.9);
  const textMuted = mixThemeColors(text, background, 0.42);

  clearManagedCssVariables(root);
  setCssVariables(root, {
    '--app-primary-color': primary,
    '--app-background-color': background,
    '--app-surface-color': surface,
    '--app-text-color': text,
    '--app-radius': `${radius}px`,
    '--lc-color-primary': primary,
    '--lc-color-primary-hover': mixThemeColors(primary, '#000000', 0.16),
    '--lc-color-success': success,
    '--lc-color-warning': warning,
    '--lc-color-danger': danger,
    '--lc-color-info': info,
    '--lc-color-background': background,
    '--lc-color-surface': surface,
    '--lc-color-text': text,
    '--lc-color-text-strong': text,
    '--lc-color-text-muted': textMuted,
    '--lc-color-border': border,
    '--lc-color-border-soft': borderSoft,
    '--lc-color-subtle': surface,
    '--lc-radius-control': `${radius}px`,
    '--lc-radius-panel': `${Math.min(radius + 2, 24)}px`,
    '--vxe-ui-font-primary-color': primary,
    '--vxe-ui-font-primary-lighten-color': primaryLighten,
    '--vxe-ui-font-primary-darken-color': primaryDarken,
    '--vxe-ui-font-primary-disabled-color': primaryDisabled,
    '--vxe-ui-font-primary-tinge-color': primaryTinge,
    '--vxe-ui-table-row-current-background-color': currentRowBackground,
    '--vxe-ui-table-row-hover-current-background-color': currentRowHoverBackground,
    '--vxe-primary-color': primary,
    ...createVxeStatusVariables('success', success, background),
    ...createVxeStatusVariables('info', info, background),
    ...createVxeStatusVariables('warning', warning, background),
    ...createVxeStatusVariables('danger', danger, background),
    ...createVxeStatusVariables('error', danger, background),
    '--vxe-ui-layout-background-color': background,
    '--vxe-ui-font-color': text,
    '--vxe-ui-base-border-radius': `${radius}px`,
    '--vxe-ui-border-radius': `${radius}px`,
    ...customVariables,
  });

  root.lang = settings.language || 'zh-CN';
  root.dataset.theme = settings.theme_mode;
  root.style.colorScheme = resolveColorScheme(settings.theme_mode);
  root.dataset.systemSettingsReady = 'true';

  const language = resolveVxeLanguage(settings.language);
  if (language === 'en-US' && !VxeUI.hasLanguage(language)) {
    VxeUI.setI18n(language, vxeEnUS);
  }
  VxeUI.setLanguage(language as Parameters<typeof VxeUI.setLanguage>[0]);
  VxeUI.setTheme(resolveVxeTheme(settings.theme_mode));
  const tableOptions = mergeSystemTableOptions({}, settings.table_config);
  VxeUI.setConfig({
    table: tableOptions,
    grid: tableOptions,
    pager: resolveSystemPagerConfig(settings.table_config),
  });
  watchSystemTheme(settings.theme_mode);
}

function resolveVxeLanguage(language: string) {
  if (SUPPORTED_VXE_LANGUAGES.has(language)) return language;
  return language.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

function watchSystemTheme(mode: SystemSettings['theme_mode']) {
  mediaQueryListener?.();
  mediaQueryListener = null;
  mediaQuery = null;
  if (mode !== 'system' || typeof window.matchMedia !== 'function') return;

  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => {
    VxeUI.setTheme(mediaQuery?.matches ? 'dark' : 'light');
    document.documentElement.style.colorScheme = mediaQuery?.matches ? 'dark' : 'light';
  };
  mediaQuery.addEventListener('change', listener);
  mediaQueryListener = () => mediaQuery?.removeEventListener('change', listener);
}

function resolveColorScheme(mode: SystemSettings['theme_mode']) {
  if (mode === 'system') return 'light dark';
  return mode;
}

function resolveVxeTheme(mode: SystemSettings['theme_mode']) {
  if (mode !== 'system') return mode;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setCssVariables(root: HTMLElement, variables: Record<string, string>) {
  for (const [key, value] of Object.entries(variables)) {
    if (!key.startsWith('--') || !value) continue;
    root.style.setProperty(key, value);
    managedCssVariables.add(key);
  }
}

function clearManagedCssVariables(root: HTMLElement) {
  managedCssVariables.forEach((key) => root.style.removeProperty(key));
  managedCssVariables.clear();
}

function readCssVariables(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => key.startsWith('--') && ['string', 'number'].includes(typeof item))
      .map(([key, item]) => [key, String(item)]),
  );
}

function readNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(Math.max(numeric, 0), 24) : fallback;
}

function createVxeStatusVariables(
  status: 'success' | 'info' | 'warning' | 'danger' | 'error',
  color: string,
  background: string,
) {
  return {
    [`--vxe-ui-status-${status}-color`]: color,
    [`--vxe-ui-status-${status}-tinge-color`]: mixThemeColors(color, background, 0.9),
    [`--vxe-ui-status-${status}-lighten-color`]: mixThemeColors(color, '#ffffff', 0.24),
    [`--vxe-ui-status-${status}-darken-color`]: mixThemeColors(color, '#000000', 0.16),
    [`--vxe-ui-status-${status}-disabled-color`]: mixThemeColors(color, '#ffffff', 0.56),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
