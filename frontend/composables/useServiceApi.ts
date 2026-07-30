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

  return { invoke };
}
