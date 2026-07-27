import {
  inject,
  provide,
  unref,
  type App,
  type InjectionKey,
  type Plugin,
  type Ref,
} from 'vue';

export type LowCodeHostServiceApi = {
  invoke<T = unknown>(
    serviceName: string,
    serviceMethod: string,
    payload?: Record<string, unknown>
  ): Promise<T>;
};

export type LowCodeHostRoute = {
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  path?: string;
  fullPath?: string;
};

export type LowCodeHostRouter = {
  push(to: string | Record<string, unknown>): Promise<unknown> | unknown;
};

export type LowCodeMessageKey =
  | 'runtime.loadingDataSources'
  | 'runtime.errors.refreshDataSource'
  | 'runtime.errors.loadDataSource'
  | 'runtime.errors.loadPage'
  | 'runtime.errors.directive'
  | 'runtime.form.saved'
  | 'runtime.form.submitFailed'
  | 'runtime.grid.deleted'
  | 'runtime.grid.deleteFailed'
  | 'designer.loading'
  | 'designer.unavailable'
  | 'designer.untitledPage'
  | 'designer.actions.loadPage'
  | 'designer.actions.newPage'
  | 'designer.actions.pageInfo'
  | 'designer.actions.reload'
  | 'designer.actions.save'
  | 'designer.actions.publish'
  | 'designer.actions.back'
  | 'designer.messages.waitReady'
  | 'designer.messages.pageInfoUpdated'
  | 'designer.errors.loadPage'
  | 'designer.errors.loadPageList'
  | 'designer.errors.save'
  | 'designer.errors.requiredPageInfo';

export type LowCodeMessageMap = Partial<Record<LowCodeMessageKey, string>>;
export type LowCodeMessages =
  | LowCodeMessageMap
  | Record<string, LowCodeMessageMap>;

export type LowCodeTheme = {
  className?: string;
  variables?: Record<string, string | number>;
};

type MaybeRef<T> = T | Ref<T>;

export type LowCodePluginOptions = {
  serviceApi?: MaybeRef<LowCodeHostServiceApi | undefined>;
  router?: MaybeRef<LowCodeHostRouter | undefined>;
  route?: MaybeRef<LowCodeHostRoute | undefined>;
  locale?: MaybeRef<string | undefined>;
  messages?: MaybeRef<LowCodeMessages | undefined>;
  theme?: MaybeRef<LowCodeTheme | undefined>;
};

export type LowCodeHostRuntime = {
  getServiceApi(): LowCodeHostServiceApi;
  getRouter(): LowCodeHostRouter;
  getRoute(): LowCodeHostRoute;
  getTheme(): LowCodeTheme;
  t(key: LowCodeMessageKey, fallback?: string): string;
};

export const lowCodeHostKey: InjectionKey<LowCodePluginOptions> = Symbol('lowCodeHost');

export const lowCodeDefaultMessages: Record<LowCodeMessageKey, string> = {
  'runtime.loadingDataSources': 'Loading page data sources...',
  'runtime.errors.refreshDataSource': 'Could not refresh data source.',
  'runtime.errors.loadDataSource': 'Could not load data source.',
  'runtime.errors.loadPage': 'Could not load low code page.',
  'runtime.errors.directive': 'Could not execute low-code directive.',
  'runtime.form.saved': 'Saved successfully.',
  'runtime.form.submitFailed': 'Could not submit the form.',
  'runtime.grid.deleted': 'Deleted successfully.',
  'runtime.grid.deleteFailed': 'Could not delete the record.',
  'designer.loading': 'Loading low-code designer...',
  'designer.unavailable': 'Designer is unavailable',
  'designer.untitledPage': 'Untitled page',
  'designer.actions.loadPage': 'Load page',
  'designer.actions.newPage': 'New page',
  'designer.actions.pageInfo': 'Page info',
  'designer.actions.reload': 'Reload',
  'designer.actions.save': 'Save',
  'designer.actions.publish': 'Publish',
  'designer.actions.back': 'Back to list',
  'designer.messages.waitReady': 'Please wait until the designer is ready.',
  'designer.messages.pageInfoUpdated': 'Page info updated.',
  'designer.errors.loadPage': 'Could not load low-code page.',
  'designer.errors.loadPageList': 'Could not load page list.',
  'designer.errors.save': 'Save failed.',
  'designer.errors.requiredPageInfo': 'Page code, route, and title are required.',
};

export const lowCodeZhCNMessages: Record<LowCodeMessageKey, string> = {
  'runtime.loadingDataSources': '正在加载页面数据源...',
  'runtime.errors.refreshDataSource': '数据源刷新失败。',
  'runtime.errors.loadDataSource': '数据源加载失败。',
  'runtime.errors.loadPage': '低代码页面加载失败。',
  'runtime.errors.directive': '低代码指令执行失败。',
  'runtime.form.saved': '保存成功。',
  'runtime.form.submitFailed': '表单提交失败。',
  'runtime.grid.deleted': '删除成功。',
  'runtime.grid.deleteFailed': '记录删除失败。',
  'designer.loading': '正在加载低代码设计器...',
  'designer.unavailable': '设计器不可用',
  'designer.untitledPage': '未命名页面',
  'designer.actions.loadPage': '加载页面',
  'designer.actions.newPage': '新建页面',
  'designer.actions.pageInfo': '页面信息',
  'designer.actions.reload': '刷新当前',
  'designer.actions.save': '保存',
  'designer.actions.publish': '发布',
  'designer.actions.back': '返回列表',
  'designer.messages.waitReady': '请等待设计器初始化完成后再操作。',
  'designer.messages.pageInfoUpdated': '页面信息已更新。',
  'designer.errors.loadPage': '低代码页面加载失败。',
  'designer.errors.loadPageList': '页面列表加载失败。',
  'designer.errors.save': '保存失败。',
  'designer.errors.requiredPageInfo': '页面编码、路由和标题不能为空。',
};

export const lowCodeBuiltinMessages: Record<string, Record<LowCodeMessageKey, string>> = {
  'en-US': lowCodeDefaultMessages,
  'zh-CN': lowCodeZhCNMessages,
};

function readOptions(source?: LowCodePluginOptions | (() => LowCodePluginOptions)) {
  return typeof source === 'function' ? source() : source ?? {};
}

function readServiceApiOption(
  local: LowCodePluginOptions,
  provided: LowCodePluginOptions
) {
  return unref(local.serviceApi) ?? unref(provided.serviceApi);
}

function readRouterOption(
  local: LowCodePluginOptions,
  provided: LowCodePluginOptions
) {
  return unref(local.router) ?? unref(provided.router);
}

function readRouteOption(
  local: LowCodePluginOptions,
  provided: LowCodePluginOptions
) {
  return unref(local.route) ?? unref(provided.route);
}

function readThemeOption(
  local: LowCodePluginOptions,
  provided: LowCodePluginOptions
) {
  return unref(local.theme) ?? unref(provided.theme);
}

function readLocaleOption(
  local: LowCodePluginOptions,
  provided: LowCodePluginOptions
) {
  return unref(local.locale) ?? unref(provided.locale);
}

function readMessagesOption(
  local: LowCodePluginOptions,
  provided: LowCodePluginOptions
) {
  return unref(local.messages) ?? unref(provided.messages);
}

function getGlobalServiceApi(): LowCodeHostServiceApi | undefined {
  return typeof useServiceApi === 'function' ? useServiceApi() : undefined;
}

function getGlobalRouter(): LowCodeHostRouter | undefined {
  return typeof useRouter === 'function' ? useRouter() : undefined;
}

function getGlobalRoute(): LowCodeHostRoute | undefined {
  return typeof useRoute === 'function' ? useRoute() : undefined;
}

function createMissingRouter(): LowCodeHostRouter {
  return {
    push() {
      throw new Error(
        'Low-code router is not configured. Use createLowCodePlugin({ router }) or provide a router prop.'
      );
    },
  };
}

function resolveMessage(
  messages: LowCodeMessages | undefined,
  locale: string | undefined,
  key: LowCodeMessageKey
) {
  if (!messages) return undefined;
  if (key in messages) return (messages as LowCodeMessageMap)[key];
  if (locale && locale in messages) {
    return (messages as Record<string, LowCodeMessageMap>)[locale]?.[key];
  }
  return undefined;
}

function resolveBuiltinMessage(locale: string | undefined, key: LowCodeMessageKey) {
  if (!locale) return undefined;
  const normalized = locale.trim();
  return (
    lowCodeBuiltinMessages[normalized]?.[key] ??
    (normalized.toLowerCase().startsWith('zh') ? lowCodeZhCNMessages[key] : undefined) ??
    (normalized.toLowerCase().startsWith('en') ? lowCodeDefaultMessages[key] : undefined)
  );
}

export function provideLowCodeHost(options: LowCodePluginOptions) {
  provide(lowCodeHostKey, options);
}

export function useLowCodeHost(
  overrides?: LowCodePluginOptions | (() => LowCodePluginOptions)
): LowCodeHostRuntime {
  const provided = inject(lowCodeHostKey, {});

  return {
    getServiceApi() {
      const local = readOptions(overrides);
      const serviceApi = readServiceApiOption(local, provided) ?? getGlobalServiceApi();

      if (!serviceApi) {
        throw new Error(
          'Low-code serviceApi is not configured. Use createLowCodePlugin({ serviceApi }) or provide a serviceApi prop.'
        );
      }

      return serviceApi;
    },
    getRouter() {
      const local = readOptions(overrides);
      return readRouterOption(local, provided) ?? getGlobalRouter() ?? createMissingRouter();
    },
    getRoute() {
      const local = readOptions(overrides);
      return (
        readRouteOption(local, provided) ??
        getGlobalRoute() ?? {
          query: {},
          params: {},
          path: '',
          fullPath: '',
        }
      );
    },
    getTheme() {
      const local = readOptions(overrides);
      return readThemeOption(local, provided) ?? {};
    },
    t(key, fallback) {
      const local = readOptions(overrides);
      const locale = readLocaleOption(local, provided);
      const localMessages = readMessagesOption(local, provided);
      return (
        resolveMessage(localMessages, locale, key) ??
        resolveBuiltinMessage(locale, key) ??
        lowCodeDefaultMessages[key] ??
        fallback ??
        key
      );
    },
  };
}

export function applyLowCodeTheme(theme: LowCodeTheme | undefined) {
  if (!theme || typeof document === 'undefined') return;

  if (theme.className) {
    document.documentElement.classList.add(theme.className);
  }

  Object.entries(theme.variables ?? {}).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, String(value));
  });
}

export function createLowCodePlugin(options: LowCodePluginOptions): Plugin {
  return {
    install(app: App) {
      app.provide(lowCodeHostKey, options);
      applyLowCodeTheme(unref(options.theme));
    },
  };
}
