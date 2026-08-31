import type { LowCodeHostServiceApi } from '../core/host';

export type LowCodeOptionSourceItems = unknown[];

export type LowCodeOptionSourceBatchEntry = {
  options: LowCodeOptionSourceItems;
  cacheTtlSeconds: number;
};

export type LowCodeOptionSourceBatchResponse = Record<
  string,
  LowCodeOptionSourceBatchEntry | LowCodeOptionSourceItems
>;

export type LowCodeOptionSourceListener = (
  code: string,
  options: LowCodeOptionSourceItems,
) => void;

type ServiceApiProvider = () => LowCodeHostServiceApi | undefined;

type OptionCacheEntry = {
  options: LowCodeOptionSourceItems;
  expiresAt: number;
};

export type LowCodeOptionSourceRegistry = {
  readonly version: 2;
  readonly cache: Map<string, OptionCacheEntry>;
  readonly inFlight: Map<string, Promise<LowCodeOptionSourceBatchResponse>>;
  readonly subscribers: Map<string, Set<LowCodeOptionSourceListener>>;
  request(codes: string[], getServiceApi: ServiceApiProvider): void;
  subscribe(
    codes: string[],
    listener: LowCodeOptionSourceListener,
    getServiceApi: ServiceApiProvider,
  ): () => void;
  refresh(
    codes: string[],
    getServiceApi: ServiceApiProvider,
  ): Promise<Record<string, LowCodeOptionSourceItems>>;
  peek(code: string): LowCodeOptionSourceItems | undefined;
  invalidate(code?: string): void;
};

type RegistryState = {
  pendingCodes: Set<string>;
  serviceApiProviders: Set<ServiceApiProvider>;
  timer?: ReturnType<typeof globalThis.setTimeout>;
};

const GLOBAL_REGISTRY_KEY = '__ENLEARN_LOW_CODE_OPTION_SOURCE_REGISTRY__';
const BATCH_WINDOW_MS = 24;

function normalizeCode(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeCodes(codes: string[]) {
  return [...new Set(codes.map(normalizeCode).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBatchEntry(value: unknown): LowCodeOptionSourceBatchEntry {
  if (Array.isArray(value)) {
    return { options: value, cacheTtlSeconds: 0 };
  }

  if (!isRecord(value)) {
    return { options: [], cacheTtlSeconds: 0 };
  }

  return {
    options: Array.isArray(value.options)
      ? value.options
      : Array.isArray(value.items)
        ? value.items
        : [],
    cacheTtlSeconds: Math.max(
      0,
      readFiniteNumber(value.cacheTtlSeconds ?? value.cache_ttl_seconds),
    ),
  };
}

function createRegistry(): LowCodeOptionSourceRegistry {
  const cache = new Map<string, OptionCacheEntry>();
  const inFlight = new Map<string, Promise<LowCodeOptionSourceBatchResponse>>();
  const subscribers = new Map<string, Set<LowCodeOptionSourceListener>>();
  const state: RegistryState = {
    pendingCodes: new Set(),
    serviceApiProviders: new Set(),
  };

  const readFreshCache = (code: string) => {
    const entry = cache.get(code);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(code);
      return undefined;
    }
    return entry.options;
  };

  const publish = (code: string, options: LowCodeOptionSourceItems) => {
    subscribers.get(code)?.forEach((listener) => listener(code, options));
  };

  const readServiceApi = () => {
    for (const provider of state.serviceApiProviders) {
      try {
        const serviceApi = provider();
        if (serviceApi) return serviceApi;
      } catch {
        // Another registered form may still provide the host API.
      }
    }
    return undefined;
  };

  const loadCodes = async (
    codes: string[],
    serviceApi: LowCodeHostServiceApi,
  ) => {
    const request = serviceApi.invoke<LowCodeOptionSourceBatchResponse>(
      'admin',
      'resolveOptionItemsBatch',
      { sourceCodes: codes },
    );
    codes.forEach((code) => inFlight.set(code, request));

    try {
      const response = await request;
      const resolved: Record<string, LowCodeOptionSourceItems> = {};
      codes.forEach((code) => {
        if (inFlight.get(code) !== request) return;
        const entry = readBatchEntry(response?.[code]);
        cache.set(code, {
          options: entry.options,
          expiresAt: entry.cacheTtlSeconds > 0
            ? Date.now() + entry.cacheTtlSeconds * 1000
            : Number.POSITIVE_INFINITY,
        });
        resolved[code] = entry.options;
        publish(code, entry.options);
      });
      return resolved;
    } finally {
      codes.forEach((code) => {
        if (inFlight.get(code) === request) inFlight.delete(code);
      });
    }
  };

  const flush = async () => {
    state.timer = undefined;
    const requestedCodes = [...state.pendingCodes];
    const codes = requestedCodes.filter((code) => !readFreshCache(code) && !inFlight.has(code));
    state.pendingCodes.clear();

    const serviceApi = readServiceApi();
    state.serviceApiProviders.clear();
    if (!codes.length) return;
    if (!serviceApi) {
      requestedCodes.forEach((code) => state.pendingCodes.add(code));
      return;
    }

    await loadCodes(codes, serviceApi);
  };

  const schedule = () => {
    if (state.timer) return;
    state.timer = globalThis.setTimeout(() => {
      void flush().catch(() => undefined);
    }, BATCH_WINDOW_MS);
  };

  const registry: LowCodeOptionSourceRegistry = {
    version: 2,
    cache,
    inFlight,
    subscribers,
    request(codes, getServiceApi) {
      normalizeCodes(codes).forEach((code) => {
        const cachedOptions = readFreshCache(code);
        if (cachedOptions) {
          publish(code, cachedOptions);
        } else if (!inFlight.has(code)) {
          state.pendingCodes.add(code);
        }
      });

      if (state.pendingCodes.size) {
        state.serviceApiProviders.add(getServiceApi);
        schedule();
      }
    },
    subscribe(codes, listener, getServiceApi) {
      const normalized = normalizeCodes(codes);
      normalized.forEach((code) => {
        const listeners = subscribers.get(code) ?? new Set();
        listeners.add(listener);
        subscribers.set(code, listeners);
      });
      registry.request(normalized, getServiceApi);

      return () => {
        normalized.forEach((code) => {
          const listeners = subscribers.get(code);
          listeners?.delete(listener);
          if (!listeners?.size) subscribers.delete(code);
        });
      };
    },
    async refresh(codes, getServiceApi) {
      const normalized = normalizeCodes(codes);
      if (!normalized.length) return {};

      const serviceApi = getServiceApi();
      if (!serviceApi) {
        throw new Error('下拉选项数据服务不可用。');
      }

      normalized.forEach((code) => {
        cache.delete(code);
        state.pendingCodes.delete(code);
      });
      return loadCodes(normalized, serviceApi);
    },
    peek(code) {
      return readFreshCache(normalizeCode(code));
    },
    invalidate(code) {
      const normalized = normalizeCode(code);
      if (normalized) cache.delete(normalized);
      else cache.clear();
    },
  };

  return registry;
}

type GlobalOptionRegistryScope = typeof globalThis & {
  [GLOBAL_REGISTRY_KEY]?: LowCodeOptionSourceRegistry;
};

const globalScope = globalThis as GlobalOptionRegistryScope;
const existingRegistry = globalScope[GLOBAL_REGISTRY_KEY];

export const lowCodeOptionSourceRegistry =
  existingRegistry?.version === 2 ? existingRegistry : createRegistry();

globalScope[GLOBAL_REGISTRY_KEY] = lowCodeOptionSourceRegistry;
