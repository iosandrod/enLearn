type ServiceEnvelope<T> = {
  success: boolean;
  serviceName: string;
  serviceMethod: string;
  data: T;
};

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

export function useServiceApi() {
  const { request } = useAuthenticatedFetch();

  async function invoke<TResponse = unknown>(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown> = {}
  ) {
    const response = await request<TResponse | ServiceEnvelope<TResponse>>('/api/service', {
      method: 'POST',
      body: {
        serviceName,
        serviceMethod,
        postData
      }
    });

    return isServiceEnvelope<TResponse>(response) ? response.data : response;
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

  return { invoke, listItems, firstItem };
}
