type ServiceEnvelope<T> = {
  success: boolean;
  serviceName: string;
  serviceMethod: string;
  data: T;
};

export type ServiceInvokeOptions = {
  requestId?: string;
};

export type PublicLowCodeCatalog<TMaterial = unknown, TFormDefinition = unknown> = {
  materials: TMaterial[];
  formDefinitions: TFormDefinition[];
};

type LowCodeDefinitionTable = 'lowcode_form_definitions' | 'lowcode_pages';

type LowCodeListCacheEntry = {
  value: unknown;
};

const lowCodeListCache = new Map<string, LowCodeListCacheEntry>();
const lowCodeListRequests = new Map<string, Promise<unknown>>();

function readLowCodeTable(postData: Record<string, unknown>) {
  const table = postData.resource ?? postData.tableName ?? postData.table_name;
  return table === 'lowcode_form_definitions' || table === 'lowcode_pages'
    ? table
    : undefined;
}

function readCodeValues(postData: Record<string, unknown>) {
  const filters = postData.filters;
  const code = typeof postData.code === 'string'
    ? postData.code
    : typeof filters === 'object' && filters !== null && !Array.isArray(filters)
      ? (filters as Record<string, unknown>).code
      : undefined;

  if (typeof code === 'string' && code.trim()) return [code.trim()];
  if (Array.isArray(code)) {
    return [...new Set(code.filter((value): value is string =>
      typeof value === 'string' && value.trim().length > 0,
    ).map((value) => value.trim()))];
  }
  return [];
}

function readIncludeData(postData: Record<string, unknown>) {
  return postData.includeData === false ? '0' : '1';
}

function lowCodeCacheKey(table: LowCodeDefinitionTable, code: string, postData: Record<string, unknown>) {
  return `${table}:${readIncludeData(postData)}:${code}`;
}

function readRows<T>(value: unknown) {
  if (Array.isArray(value)) return value as T[];
  if (
    typeof value === 'object' &&
    value !== null &&
    'rows' in value &&
    Array.isArray((value as { rows?: unknown }).rows)
  ) {
    return (value as { rows: T[] }).rows;
  }

  return [] as T[];
}

function withCachedLowCodeRows(
  postData: Record<string, unknown>,
  rows: unknown[],
  table: LowCodeDefinitionTable,
) {
  rows.forEach((row) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return;
    const code = (row as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) {
      lowCodeListCache.set(lowCodeCacheKey(table, code.trim(), postData), { value: row });
    }
  });
}

function readCachedLowCodeRows(
  postData: Record<string, unknown>,
  table: LowCodeDefinitionTable,
) {
  const codes = readCodeValues(postData);
  if (!codes.length) return undefined;
  const rows = codes.map((code) => {
    const key = lowCodeCacheKey(table, code, postData);
    return lowCodeListCache.has(key) ? lowCodeListCache.get(key)?.value : undefined;
  });
  return rows.every((_, index) =>
    lowCodeListCache.has(lowCodeCacheKey(table, codes[index], postData)),
  ) ? rows : undefined;
}

// Keep the cache in memory for the current page session; writes invalidate it
// after the write succeeds so subsequent reads see the updated definition.
function invalidateLowCodeListCache(table: LowCodeDefinitionTable) {
  for (const key of lowCodeListCache.keys()) {
    if (key.startsWith(`${table}:`)) lowCodeListCache.delete(key);
  }
}

function isServiceEnvelope<T>(value: unknown): value is ServiceEnvelope<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'success' in value &&
    'serviceName' in value &&
    'serviceMethod' in value &&
    'data' in value
  );
}

function createRequestId() {
  const value = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web-${value}`;
}

export function useServiceApi() {
  const { request } = useAuthenticatedFetch();

  async function getPublicLowCodeCatalog<TMaterial = unknown, TFormDefinition = unknown>() {
    const response = await request<PublicLowCodeCatalog<TMaterial, TFormDefinition>>(
      '/api/auth/lowcode-catalog'
    );
    return {
      materials: Array.isArray(response.materials) ? response.materials : [],
      formDefinitions: Array.isArray(response.formDefinitions) ? response.formDefinitions : [],
    };
  }

  async function listPublishedLowCodeMaterials<TResponse = unknown>() {
    const response = await request<{ materials: TResponse[] }>('/api/auth/lowcode-materials');
    return Array.isArray(response.materials) ? response.materials : [];
  }

  async function invoke<TResponse = unknown>(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown> = {},
    options: ServiceInvokeOptions = {}
  ) {
    const lowCodeTable = serviceName === 'lowcode' && serviceMethod === 'listItems'
      ? readLowCodeTable(postData)
      : undefined;
    const codeValues = lowCodeTable ? readCodeValues(postData) : [];

    if (lowCodeTable && codeValues.length) {
      const cachedRows = readCachedLowCodeRows(postData, lowCodeTable);
      if (cachedRows) return cachedRows as TResponse;

      const requestKey = `${lowCodeTable}:${readIncludeData(postData)}:${[...codeValues].sort().join(',')}`;
      const pendingRequest = lowCodeListRequests.get(requestKey);
      if (pendingRequest) return await pendingRequest as TResponse;

      const requestPromise = (async () => {
        const requestId = options.requestId?.trim() || createRequestId();
        const response = await request<TResponse | ServiceEnvelope<TResponse>>('/api/service', {
          method: 'POST',
          headers: {
            'X-Request-Id': requestId
          },
          body: {
            serviceName,
            serviceMethod,
            postData
          }
        });
        const data = isServiceEnvelope<TResponse>(response) ? response.data : response;
        const rows = readRows(data);
        const rowByCode = new Map<string, unknown>();
        rows.forEach((row) => {
          if (typeof row !== 'object' || row === null || Array.isArray(row)) return;
          const code = (row as { code?: unknown }).code;
          if (typeof code === 'string' && code.trim()) rowByCode.set(code.trim(), row);
        });
        codeValues.forEach((code) => {
          lowCodeListCache.set(lowCodeCacheKey(lowCodeTable, code, postData), {
            value: rowByCode.get(code),
          });
        });
        withCachedLowCodeRows(postData, rows, lowCodeTable);
        return data;
      })();
      lowCodeListRequests.set(requestKey, requestPromise);
      try {
        return await requestPromise as TResponse;
      } finally {
        lowCodeListRequests.delete(requestKey);
      }
    }

    const requestId = options.requestId?.trim() || createRequestId();
    const response = await request<TResponse | ServiceEnvelope<TResponse>>('/api/service', {
      method: 'POST',
      headers: {
        'X-Request-Id': requestId
      },
      body: {
        serviceName,
        serviceMethod,
        postData
      }
    });

    const data = isServiceEnvelope<TResponse>(response) ? response.data : response;
    if (serviceName === 'lowcode' && serviceMethod !== 'listItems') {
      const lowCodeTable = readLowCodeTable(postData);
      if (lowCodeTable) invalidateLowCodeListCache(lowCodeTable);
    }
    return data;
  }

  async function listItems<TResponse = unknown>(
    serviceName: string,
    postData: Record<string, unknown> = {}
  ) {
    return invoke<TResponse>(serviceName, 'listItems', postData);
  }

  async function firstItem<TResponse = unknown>(
    serviceName: string,
    postData: Record<string, unknown> = {}
  ) {
    const result = await listItems<TResponse[] | { rows: TResponse[] }>(serviceName, {
      ...postData,
      limit: postData.limit ?? 1,
    });

    return readRows<TResponse>(result)[0];
  }

  return {
    invoke,
    listItems,
    firstItem,
    listPublishedLowCodeMaterials,
    getPublicLowCodeCatalog,
  };
}
