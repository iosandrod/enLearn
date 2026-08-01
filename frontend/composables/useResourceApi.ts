type ResourceLookup = Record<string, unknown>;

export function useResourceApi() {
  const serviceApi = useServiceApi();

  async function list<TResponse = unknown>(
    serviceName: string,
    postData: ResourceLookup = {}
  ) {
    return serviceApi.listItems<TResponse[]>(serviceName, postData);
  }

  async function first<TResponse = unknown>(
    serviceName: string,
    postData: ResourceLookup = {}
  ) {
    return serviceApi.firstItem<TResponse>(serviceName, postData);
  }

  async function entity<TResponse = unknown>(
    tableName: string,
    postData: ResourceLookup = {}
  ) {
    return list<TResponse>('admin', {
      ...postData,
      tableName,
    });
  }

  async function firstEntity<TResponse = unknown>(
    tableName: string,
    postData: ResourceLookup = {}
  ) {
    return first<TResponse>('admin', {
      ...postData,
      tableName,
    });
  }

  return {
    list,
    first,
    entity,
    firstEntity,
  };
}
