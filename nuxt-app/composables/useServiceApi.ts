export function useServiceApi() {
  const { request } = useAuthenticatedFetch();

  async function invoke<TResponse = unknown>(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown> = {}
  ) {
    return request<TResponse>('/api/service', {
      method: 'POST',
      body: {
        serviceName,
        serviceMethod,
        postData
      }
    });
  }

  return { invoke };
}
